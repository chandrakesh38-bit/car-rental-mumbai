import { createVerification } from '../lib/self-drive-documents.mjs';
import { validEmail } from '../lib/notifications.mjs';

export const config = { runtime: 'edge' };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

async function requireAdmin(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !base() || !serviceKey()) throw Object.assign(new Error('Admin authentication required.'), { status: 401 });

  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz';
  const response = await fetch(base() + '/auth/v1/user', {
    headers: { apikey: publicKey, Authorization: 'Bearer ' + token }
  });
  if (!response.ok) throw Object.assign(new Error('Admin session expired.'), { status: 401 });

  const user = await response.json();
  const allowed = String(process.env.ADMIN_EMAILS || '')
    .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) throw Object.assign(new Error('Admin allowlist is not configured.'), { status: 503 });
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) throw Object.assign(new Error('Admin access denied.'), { status: 403 });
  return user;
}

async function db(path, options = {}) {
  const response = await fetch(base() + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: serviceKey(),
      Authorization: 'Bearer ' + serviceKey(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  if (!response.ok) {
    let message = 'Database operation failed.';
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.message) message += ' ' + String(parsed.message).slice(0, 240);
    } catch {}
    throw Object.assign(new Error(message), { status: 503 });
  }
  return raw ? JSON.parse(raw) : null;
}

const cleanText = (value, max, label, required = true) => {
  const text = String(value || '').trim();
  if ((required && !text) || text.length > max) throw Object.assign(new Error('Invalid ' + label + '.'), { status: 400 });
  return text;
};
const money = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw Object.assign(new Error('Invalid custom amount.'), { status: 400 });
  return Math.round((n + Number.EPSILON) * 100) / 100;
};
const formatMoney = value => '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function randomHex(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
}
function bookingDatePart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return p.year + p.month + p.day;
}
async function generateBookingId() {
  const prefix = 'CWD-WD-' + bookingDatePart() + '-';
  for (let attempt = 0; attempt < 12; attempt++) {
    const suffix = String(1000 + Math.floor(Math.random() * 9000));
    const bookingId = prefix + suffix;
    const existing = await db('inquiries?booking_id=eq.' + encodeURIComponent(bookingId) + '&select=booking_id&limit=1');
    if (!existing?.length) return bookingId;
  }
  throw Object.assign(new Error('Could not generate a unique Booking ID. Please retry.'), { status: 503 });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ success: false, message: 'Only POST requests are allowed.' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ success: false, message: 'Invalid request origin.' }, 403);
  }

  try {
    const admin = await requireAdmin(request);
    const raw = await request.text();
    if (raw.length > 16000) return json({ success: false, message: 'Request too large.' }, 413);
    const body = JSON.parse(raw);

    const name = cleanText(body.customer_name, 200, 'customer name');
    const phone = cleanText(body.customer_phone, 30, 'mobile number');
    if (!/^[+\d\s()-]{7,30}$/.test(phone)) throw Object.assign(new Error('Enter a valid mobile number.'), { status: 400 });
    const email = cleanText(body.customer_email, 320, 'email');
    if (!validEmail(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });

    const vehicleId = cleanText(body.vehicle_id, 100, 'vehicle');
    const pickupAt = new Date(body.pickup_at);
    const returnAt = new Date(body.return_at);
    if (!Number.isFinite(pickupAt.getTime()) || !Number.isFinite(returnAt.getTime()) || returnAt <= pickupAt) {
      throw Object.assign(new Error('Return date/time must be later than pickup date/time.'), { status: 400 });
    }
    const actualHours = (returnAt - pickupAt) / 3600000;
    if (actualHours < 24) throw Object.assign(new Error('Self Drive booking must be at least 24 hours.'), { status: 400 });

    const vehicles = await db(
      'vehicles?id=eq.' + encodeURIComponent(vehicleId) +
      '&is_active=eq.true&service_type=in.(Self-Drive,Both)&select=id,brand,model,full_name,service_type&limit=1'
    );
    const vehicle = vehicles?.[0];
    if (!vehicle) throw Object.assign(new Error('Selected Self Drive vehicle is not available.'), { status: 409 });

    const rentalAmount = money(body.rental_amount);
    const securityDeposit = money(body.security_deposit);
    const deliveryCharge = money(body.delivery_charge || 0);
    const totalFare = Math.round((rentalAmount + securityDeposit + deliveryCharge + Number.EPSILON) * 100) / 100;

    const deliveryMode = body.delivery_mode === 'home' ? 'home' : body.delivery_mode === 'self' ? 'self' : null;
    if (!deliveryMode) throw Object.assign(new Error('Choose a delivery option.'), { status: 400 });
    const deliveryLocation = deliveryMode === 'home'
      ? cleanText(body.delivery_location, 500, 'delivery location')
      : 'Self Pick-up';
    const notes = cleanText(body.notes, 2000, 'notes', false);
    const carName = cleanText(vehicle.full_name || [vehicle.brand, vehicle.model].filter(Boolean).join(' '), 200, 'vehicle name');

    const bookingId = await generateBookingId();
    const hoursText = Number.isInteger(actualHours) ? String(actualHours) : actualHours.toFixed(1);
    const details = [
      'SELF DRIVE | MANUAL ADMIN BOOKING',
      'Car: ' + carName,
      'Pickup: ' + pickupAt.toISOString(),
      'Return: ' + returnAt.toISOString(),
      'Duration: ' + hoursText + ' hours',
      'Delivery Mode: ' + (deliveryMode === 'home' ? 'Home Delivery' : 'Self Pick-up'),
      'Delivery Location: ' + deliveryLocation,
      'Rental Amount: ' + formatMoney(rentalAmount),
      'Security Deposit: ' + formatMoney(securityDeposit),
      'Delivery Charge: ' + formatMoney(deliveryCharge),
      'Total Amount: ' + formatMoney(totalFare),
      'Special Rate: Admin custom rate',
      notes ? 'Notes: ' + notes : ''
    ].filter(Boolean).join('\n');

    const origin = new URL(request.url).origin;
    const uploadUrl = await createVerification({
      bookingId,
      submissionKey: randomHex(32),
      name,
      phone,
      email,
      details
    }, origin);

    const inserted = await db('inquiries', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: bookingId,
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        service_type: 'Self Drive',
        trip_type: 'Self Drive',
        car_name: carName,
        route: deliveryLocation,
        booking_details: details,
        fare_amount: totalFare,
        original_fare: totalFare,
        total_fare: totalFare,
        paid_amount: 0,
        payment_status: 'pending',
        booking_status: 'received',
        inquiry_status: 'Received'
      })
    });

    return json({
      success: true,
      booking: inserted?.[0] || { booking_id: bookingId },
      booking_id: bookingId,
      upload_url: uploadUrl,
      custom_rate: {
        rental_amount: rentalAmount,
        security_deposit: securityDeposit,
        delivery_charge: deliveryCharge,
        total_fare: totalFare
      },
      created_by: String(admin?.email || '').toLowerCase()
    });
  } catch (error) {
    return json({ success: false, message: error?.message || 'Unable to create manual booking.' }, error?.status || 500);
  }
}
