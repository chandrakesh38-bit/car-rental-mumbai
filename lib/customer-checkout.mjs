import { customerConfig, customerDb, requireCustomer, hash, fail } from './customer-account.mjs';

// The new checkout is deliberately restricted to the isolated testing database.
export function checkoutConfig() {
  const cfg = customerConfig();
  if (process.env.CWD_CHECKOUT_ENABLED !== 'true' || process.env.SUPABASE_URL?.replace(/\/$/, '') !== cfg.url ||
      process.env.SUPABASE_SERVICE_ROLE_KEY !== cfg.key) fail('Checkout is not configured for the isolated testing database.', 503);
  return cfg;
}
export const rpc = (cfg, name, body) => customerDb(cfg, 'rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const moneyPaise = value => {
  const n = Number(value), paise = Math.round(n * 100);
  if (!Number.isFinite(n) || n <= 0 || !Number.isSafeInteger(paise) || paise > 100000000) fail('Invalid fare.');
  return paise;
};
export function paymentAmount(totalPaise, percent) {
  if (![0, 20, 100].includes(percent)) fail('Choose Book at ₹0, 20% advance or full payment.');
  // All calculations use integer paise; fractions smaller than a paise round once.
  return Math.round(totalPaise * percent / 100);
}
export async function ownedBooking(cfg, request, id) {
  if (!/^(?:[1-9]\d{5}|CWD-WD-\d{6}-\d{4})$/.test(id || '')) fail('Invalid booking ID.');
  const rows = await customerDb(cfg, 'cwd_checkout_bookings?booking_id=eq.' + encodeURIComponent(id) + '&select=*&limit=1');
  const booking = rows?.[0];
  if (!booking) fail('Booking not found.', 404);
  const token = request.headers.get('authorization')?.match(/^Booking ([a-f0-9]{64})$/)?.[1];
  if (token && Number.isFinite(Date.parse(booking.created_at)) && Date.now() - Date.parse(booking.created_at) < 7 * 86400000 &&
      await hash(token) === booking.access_hash) return booking;
  const customer = await requireCustomer(cfg, request);
  if (customer.mobile !== booking.mobile) fail('Booking not found.', 404);
  return booking;
}
export async function bookingView(cfg, booking) {
  const id = encodeURIComponent(booking.booking_id);
  const [rows, payments, events, allocations] = await Promise.all([
    customerDb(cfg, 'inquiries?booking_id=eq.' + id + '&select=booking_id,booking_status,payment_status,total_fare,paid_amount,car_name,route&limit=1'),
    customerDb(cfg, 'booking_payments?booking_id=eq.' + id + '&select=amount,status,payment_type,paid_at,created_at&order=created_at.desc'),
    customerDb(cfg, 'cwd_booking_events?booking_id=eq.' + id + '&select=id,event_type,created_at&order=created_at.desc'),
    customerDb(cfg, 'cwd_vendor_allocations?booking_id=eq.' + id + '&select=status,driver_name,driver_mobile,vehicle_number,revoked_at&limit=1', {}, 'cwd_vendor_allocations'),
  ]);
  const row = rows?.[0];
  if (!row) fail('Booking record is unavailable.', 503);
  const notifications = [];
  for (const event of events || []) {
    if (!event.id) continue;
    const jobs = await customerDb(cfg, 'cwd_notification_outbox?event_id=eq.' + encodeURIComponent(event.id) + '&select=channel,status,attempts,accepted_at,delivered_at');
    notifications.push(...(jobs || []).map(job => ({channel:job.channel,status:job.status,attempts:job.attempts,
      accepted_at:job.accepted_at,delivered_at:job.delivered_at,event_type:event.event_type})));
  }
  const allocation = allocations?.[0];
  const driver = allocation && !allocation.revoked_at && !['cancelled','reallocated'].includes(allocation.status) && allocation.driver_name && allocation.driver_mobile && allocation.vehicle_number
    ? {name:allocation.driver_name,mobile:allocation.driver_mobile,vehicle_number:allocation.vehicle_number,status:allocation.status} : null;
  return { ...row, payment_status: Number(row.paid_amount) <= 0 ? 'unpaid' : row.payment_status,
    outstanding: Math.max(0, Number(row.total_fare) - Number(row.paid_amount)),
    booking_data: booking.booking_data, payment_choice: booking.payment_choice, created_at: booking.created_at,
    payments: payments || [], events: events || [], notifications, driver,
    driver_status: driver ? driver.name + ' · ' + driver.mobile + ' · ' + driver.vehicle_number : 'Allocation pending' };
}
export function razorConfig() {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  // This milestone never accepts live payment credentials, even if misconfigured.
  if (!id?.startsWith('rzp_test_') || !secret) fail('Razorpay test credentials are not configured. Your booking is saved; payment remains pending.', 503);
  return { id, secret };
}
export async function razor(path, options = {}) {
  const cfg = razorConfig();
  let response;
  try {
    response = await fetch('https://api.razorpay.com/v1/' + path, { ...options, signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Basic ' + btoa(cfg.id + ':' + cfg.secret), 'Content-Type': 'application/json' } });
  } catch { fail('Payment provider response is uncertain. Your booking is saved; contact support before retrying.', 502); }
  if (!response.ok) fail('Payment provider is unavailable. Your booking is saved and unpaid.', 502);
  return response.json();
}
export async function verifyHmac(message, signature, secret) {
  if (!/^[a-f0-9]{64}$/.test(signature || '') || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g), x => parseInt(x, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(message));
}
export async function capturePayment(cfg, order, paymentId) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId || '')) fail('Invalid payment reference.');
  const payment = await razor('payments/' + encodeURIComponent(paymentId));
  if (payment.id !== paymentId || payment.order_id !== order.razorpay_order_id || payment.currency !== 'INR' ||
      payment.amount !== Number(order.amount_paise) || payment.status !== 'captured' || payment.captured !== true) {
    fail('Payment has not been captured for this booking and amount. It remains pending.', 409);
  }
  return rpc(cfg, 'cwd_checkout_capture', { p_order: order.razorpay_order_id, p_payment: payment.id,
    p_amount: payment.amount, p_currency: payment.currency });
}
