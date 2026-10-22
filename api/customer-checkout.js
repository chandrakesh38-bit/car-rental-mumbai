import { requireMobileOtp } from '../lib/mobile-otp.mjs';
import { validateBookingData } from '../lib/booking-validation.mjs';
import { validEmail } from '../lib/notifications.mjs';
import { guardMutation, hash, fail, customerDb, sessionCookie } from '../lib/customer-account.mjs';
import { checkoutConfig, rpc, moneyPaise, paymentAmount, ownedBooking, bookingView,
  razorConfig, razor, verifyHmac, capturePayment } from '../lib/customer-checkout.mjs';
import {couponCode, couponBreakdown, couponIdentity, couponAvailability, eligibleCoupon} from '../lib/login-coupon.mjs';
export const config = { runtime: 'edge' };
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
export default async function handler(request) {
  try {
    const cfg = checkoutConfig();
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.has('config')) return json({ success: true, enabled: true, paymentMode: 'test' });
      if (url.searchParams.has('coupon')) {
        const {customer} = await couponIdentity(cfg,request);
        return json({success:true,coupon:await couponAvailability(cfg,customer)});
      }
      return json({ success: true, booking: await bookingView(cfg, await ownedBooking(cfg, request, url.searchParams.get('booking_id'))) });
    }
    if (request.method !== 'POST') return json({ success: false }, 405);
    guardMutation(request);
    const raw = await request.text();
    if (raw.length > 24000) fail('Request too large.', 413);
    const body = JSON.parse(raw);
    if (body.action === 'quote') {
      await eligibleCoupon(cfg,request,body);
      const validated = await validateBookingData('withdriver',body.bookingData);
      if (Date.parse(validated.normalized.pickupAt) <= Date.now()) fail('Pickup must be in the future.');
      // With-driver pricing contains no refundable deposit or unpriced actuals.
      // Never derive eligibility from client-supplied charge/discount fields.
      const quote = couponBreakdown(moneyPaise(validated.fare));
      return json({success:true,quote:{...quote,payments:{0:0,20:paymentAmount(quote.totalPaise,20),100:quote.totalPaise}}});
    }
    if (body.action === 'create') {
      const { name, phone, email, bookingData, otpProof, submissionKey, paymentChoice } = body;
      if (typeof phone !== 'string' || !/^(?:\+?91)?[6-9][0-9]{9}$/.test(phone)) fail('Enter a valid mobile number.');
      if (typeof name !== 'string' || name.trim().length < 2 || name.length > 200 || !validEmail(email) ||
          !/^[a-f0-9-]{36}$/.test(submissionKey || '') || !bookingData ||
          typeof bookingData.customerAddress !== 'string' || !bookingData.customerAddress.trim() || bookingData.customerAddress.length > 1000) fail('Check your contact and pickup details.');
      // Reuse only a current server-validated session matching this booking mobile.
      const session = !otpProof ? await couponIdentity(cfg, request, phone) : null;
      const proof = session ? {mobile:session.customer.mobile,
        nonce:await hash('session-booking:'+session.sessionHash+':'+submissionKey),
        expiresAt:Date.now()+60000} : await requireMobileOtp(otpProof, phone, 'booking', new URL(request.url).origin);
      paymentAmount(100, paymentChoice);
      // Deterministic capability supports retry after a lost HTTP response. Never placed in a URL.
      const token = await hash('checkout:' + (session ? session.sessionHash : otpProof) + ':' + submissionKey);
      const loginToken = session ? null : await hash('booking-customer-session:'+otpProof+':'+submissionKey);
      const loginHeaders = loginToken ? {'Set-Cookie':sessionCookie(loginToken)} : {};
      const existing = await customerDb(cfg, 'cwd_checkout_bookings?submission_key=eq.' + encodeURIComponent(submissionKey) + '&select=*&limit=1');
      if (existing?.[0]) {
        if (existing[0].access_hash !== await hash(token) || existing[0].mobile !== proof.mobile) fail('Submission key already used.', 409);
        if (existing[0].booking_data?.loginCoupon) await couponIdentity(cfg,request,phone);
        return json({ success: true, booking_id: existing[0].booking_id, access_token: token },200,loginHeaders);
      }
      const code = couponCode(body.couponCode || bookingData.couponCode);
      // The transactional RPC checks availability after resolving duplicate submissions.
      const identity = code ? await eligibleCoupon(cfg,request,{...body,couponCode:code},false) : null;
      const validated = await validateBookingData('withdriver', bookingData);
      if (new Date(validated.normalized.pickupAt).getTime() <= Date.now()) fail('Pickup must be in the future.');
      const total = moneyPaise(validated.fare);
      const quote = identity ? couponBreakdown(total) : null;
      if (identity && body.expectedTotalPaise !== quote.totalPaise) fail('Fare changed. Apply the coupon again to review the updated amount.',409);
      // Discard user-supplied coupon audit metadata; only the DB writes it.
      delete validated.normalized.loginCoupon;
      delete validated.normalized.couponCode;
      const booking = await rpc(cfg, identity ? 'cwd_checkout_create_coupon' : 'cwd_checkout_create', { p_nonce: proof.nonce, p_mobile: proof.mobile,
        p_proof_expires: new Date(proof.expiresAt).toISOString(), p_submission: submissionKey, p_access_hash: await hash(token),
        p_choice: paymentChoice, p_total: total, p_data: validated.normalized,
        p_contact: { name: name.trim(), email: email.trim(), route: validated.route, car: validated.carName, trip: validated.tripType,
          ...(loginToken ? {sessionHash:await hash(loginToken)} : {}) },
        ...(identity ? {p_session_hash:identity.sessionHash,p_code:code} : {}) });
      return json({ success: true, booking_id: booking.booking_id, access_token: token },200,loginHeaders);
    }
    const booking = await ownedBooking(cfg, request, body.booking_id);
    if (body.action === 'cancel-pending') {
      await rpc(cfg,'cwd_checkout_cancel_pending',{p_booking:booking.booking_id});
      return json({success:true,booking:await bookingView(cfg,booking)});
    }
    if (body.action === 'order') {
      const provider = razorConfig();
      const reserved = await rpc(cfg, 'cwd_checkout_reserve_order', { p_booking: booking.booking_id, p_balance: body.balance === true });
      if (reserved.razorpay_order_id) return json({ success: true, key: provider.id, order: reserved });
      if (!reserved.new_order) fail('A payment order is being prepared. Please retry shortly or contact support.', 409);
      // A timeout leaves a durable reservation for reconciliation, never blindly creates a second order.
      const order = await razor('orders', { method: 'POST', body: JSON.stringify({ amount: reserved.amount_paise,
        currency: 'INR', receipt: reserved.id, notes: { booking_id: booking.booking_id } }) });
      if (!/^order_[A-Za-z0-9]+$/.test(order.id || '') || order.amount !== Number(reserved.amount_paise) || order.currency !== 'INR') fail('Invalid provider order.', 502);
      await rpc(cfg, 'cwd_checkout_attach_order', { p_id: reserved.id, p_order: order.id });
      return json({ success: true, key: provider.id, order: { ...reserved, razorpay_order_id: order.id } });
    }
    if (body.action === 'verify') {
      const rows = await customerDb(cfg, 'cwd_checkout_orders?razorpay_order_id=eq.' + encodeURIComponent(body.razorpay_order_id || '') + '&select=*&limit=1');
      const order = rows?.[0];
      if (!order || order.booking_id !== booking.booking_id) fail('Payment order does not belong to this booking.', 403);
      if (!await verifyHmac(order.razorpay_order_id + '|' + body.razorpay_payment_id, body.razorpay_signature, razorConfig().secret)) fail('Invalid payment signature.', 403);
      await capturePayment(cfg, order, body.razorpay_payment_id);
      return json({ success: true, booking: await bookingView(cfg, booking) });
    }
    fail('Unknown checkout action.');
  } catch (error) {
    return json({ success: false, message: error.status ? error.message : 'Checkout is unavailable. Any saved booking remains accessible in My Bookings.' }, error.status || 503);
  }
}
