import {customerDb, requireCustomer, fail, tokenFrom, hash} from './customer-account.mjs';

export const LOGIN_COUPON = 'CWDLOGIN10';
export const couponCode = value => String(value || '').trim().toUpperCase();
export function couponBreakdown(totalPaise, depositPaise = 0, otherDiscountPaise = 0) {
  if (![totalPaise,depositPaise,otherDiscountPaise].every(Number.isSafeInteger) ||
      totalPaise <= 0 || depositPaise < 0 || depositPaise > totalPaise || otherDiscountPaise !== 0) {
    fail('Coupon cannot be combined with another discount or an invalid fare.');
  }
  const eligiblePaise = totalPaise - depositPaise;
  const discountPaise = Math.min(50000, Math.round(eligiblePaise / 10));
  return {code:LOGIN_COUPON, grossPaise:totalPaise, eligiblePaise, depositPaise,
    discountPaise, totalPaise:totalPaise-discountPaise};
}
export function rejectStacking(body) {
  for (const source of [body,body.bookingData || {}]) {
    for (const key of ['otherDiscount','otherDiscountPaise','discountAmount','couponDiscountAmount','promoCode','discounts']) {
      if (source[key] && !(Array.isArray(source[key]) && source[key].length === 0)) fail('This coupon cannot be combined with other discounts.');
    }
  }
}
export async function couponIdentity(cfg, request, phone) {
  const customer = await requireCustomer(cfg,request);
  if (phone && customer.mobile !== '91'+String(phone).replace(/\D/g,'').slice(-10)) fail('Use the mobile number verified for your signed-in account.',403);
  return {customer, sessionHash:await hash(tokenFrom(request))};
}
export async function couponAvailability(cfg, customer) {
  const rows = await customerDb(cfg,'cwd_login_coupon_uses?mobile=eq.'+encodeURIComponent(customer.mobile)+'&select=status,booking_id');
  const used = rows?.find(row=>row.status==='redeemed');
  const reserved = rows?.find(row=>row.status==='reserved');
  return {eligible:!used&&!reserved, code:!used&&!reserved?LOGIN_COUPON:null,
    reason:used?'This coupon has already been used.':reserved?'Your coupon is reserved for a pending booking. Complete or cancel that booking first.':'10% off eligible fare, up to ₹500. Once per verified mobile.',
    ...(reserved?{bookingId:reserved.booking_id}:{})};
}
export async function eligibleCoupon(cfg, request, body, checkAvailability = true) {
  if (couponCode(body.couponCode) !== LOGIN_COUPON) fail('Enter a valid coupon code.');
  rejectStacking(body);
  const identity = await couponIdentity(cfg,request,body.phone);
  if (checkAvailability) {
    const availability = await couponAvailability(cfg,identity.customer);
    if (!availability.eligible) fail(availability.reason,409);
  }
  return identity;
}
