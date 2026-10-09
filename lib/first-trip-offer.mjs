// CWD pricing policy: no coupon is available on new bookings.
// Keeping the existing exported hook ensures every booking channel gets the same decision.
export async function applyFirstTripOffer({ bookingData, validated }) {
  const code = String(bookingData?.couponCode || '').trim();
  if (!code) return validated;
  throw Object.assign(new Error('Coupon offers are no longer active. Please check the updated fare.'), { status: 400 });
}
