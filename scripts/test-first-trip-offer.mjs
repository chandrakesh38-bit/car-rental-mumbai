import assert from 'node:assert/strict';
import { applyFirstTripOffer } from '../lib/first-trip-offer.mjs';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const validated = { fare: 7385, carName: 'Ertiga', normalized: { totalFare: 7385 } };
let requestedUrl = '';
globalThis.fetch = async url => {
  requestedUrl = String(url);
  return Response.json([]);
};

const discounted = await applyFirstTripOffer({
  serviceMode: 'withdriver', phone: '+91 98765-43210',
  bookingData: { couponCode: 'FIRSTTRIP' }, validated,
});
assert.equal(discounted.fare, 5908);
assert.equal(discounted.normalized.fareBeforeDiscount, 7385);
assert.equal(discounted.normalized.couponDiscountAmount, 1477);
assert.equal(discounted.normalized.totalFare, 5908);
assert.match(requestedUrl, /service_type=eq\.With\+Driver/);
assert.match(requestedUrl, /booking_status=eq\.completed/);

globalThis.fetch = async () => Response.json([{ customer_phone: '9876543210' }]);
await assert.rejects(
  () => applyFirstTripOffer({ serviceMode: 'withdriver', phone: '9876543210', bookingData: { couponCode: 'FIRSTTRIP' }, validated }),
  error => error.status === 409 && /no completed With Driver trip/.test(error.message),
);

let queried = false;
globalThis.fetch = async () => { queried = true; throw new Error('unexpected query'); };
const unchanged = await applyFirstTripOffer({ serviceMode: 'withdriver', phone: '9876543210', bookingData: {}, validated });
assert.equal(unchanged, validated);
assert.equal(queried, false);

await assert.rejects(
  () => applyFirstTripOffer({ serviceMode: 'selfdrive', phone: '9876543210', bookingData: { couponCode: 'FIRSTTRIP' }, validated }),
  error => error.status === 400 && /With Driver/.test(error.message),
);

console.log('PASS First Trip discount is calculated from server fare, restricted to With Driver, and rejected for an existing completed trip.');
