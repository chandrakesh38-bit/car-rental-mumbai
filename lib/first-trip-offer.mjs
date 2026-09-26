import { normalizeMobile } from './mobile-otp.mjs';

const OFFER_CODE = 'FIRSTTRIP';
const OFFER_PERCENT = 20;
const PAGE_SIZE = 1000;

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

async function hasCompletedWithDriverTrip(mobile) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) fail('First Trip offer verification is temporarily unavailable. Please try again.', 503);

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      select: 'customer_phone',
      service_type: 'eq.With Driver',
      booking_status: 'eq.completed',
      order: 'booking_id.asc',
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    let response;
    try {
      response = await fetch(`${base}/rest/v1/inquiries?${params}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
    } catch {
      fail('First Trip offer verification is temporarily unavailable. Please try again.', 503);
    }
    if (!response.ok) fail('First Trip offer verification is temporarily unavailable. Please try again.', 503);
    let rows;
    try { rows = await response.json(); }
    catch { fail('First Trip offer verification is temporarily unavailable. Please try again.', 503); }
    if (!Array.isArray(rows)) fail('First Trip offer verification is temporarily unavailable. Please try again.', 503);
    if (rows.some(row => normalizeMobile(String(row.customer_phone || '')) === mobile)) return true;
    if (rows.length < PAGE_SIZE) return false;
  }
}

export async function applyFirstTripOffer({ serviceMode, phone, bookingData, validated }) {
  const code = String(bookingData?.couponCode || '').trim().toUpperCase();
  if (!code) return validated;
  if (code !== OFFER_CODE) fail('This offer code is not valid.');
  if (serviceMode !== 'withdriver') fail('The First Trip offer applies to With Driver bookings only.');

  const mobile = normalizeMobile(phone);
  if (!mobile) fail('Verify your mobile number to check First Trip offer eligibility.', 400);
  if (await hasCompletedWithDriverTrip(mobile)) {
    fail('The First Trip offer is available only when this mobile number has no completed With Driver trip.', 409);
  }

  const fareBeforeDiscount = Number(validated?.fare);
  if (!Number.isFinite(fareBeforeDiscount) || fareBeforeDiscount <= 0) {
    fail('Unable to apply the First Trip offer to this fare.', 400);
  }
  const discountAmount = Math.round(fareBeforeDiscount * OFFER_PERCENT / 100);
  const fare = Math.max(0, fareBeforeDiscount - discountAmount);

  return {
    ...validated,
    fare,
    normalized: {
      ...validated.normalized,
      couponCode: OFFER_CODE,
      couponPercent: OFFER_PERCENT,
      fareBeforeDiscount,
      couponDiscountAmount: discountAmount,
      totalFare: fare,
    },
  };
}
