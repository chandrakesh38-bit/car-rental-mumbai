import assert from 'node:assert/strict';
import { vendorOfferAreaSummary, vendorOfferSafePricing }
  from '../lib/vendor-offer-privacy.mjs';

const input='Godrej Hill Side Colony Vikhroli West Mumbai, house 73 → '
 + 'Some Hotel, Pune, Flat 501 → Vikhroli West Mumbai, House 73';
const output=vendorOfferAreaSummary(input);
assert.equal(output.pickup_area,'Vikhroli');
assert.equal(output.destination_area,'Pune');
assert.equal(output.route,'Vikhroli → Pune');
assert.equal(JSON.stringify(output).includes('House 73'),false);
assert.equal(JSON.stringify(output).includes('Some Hotel'),false);

const unknown=vendorOfferAreaSummary('Secret Private Road 43 → Random village ABC XYZ');
assert.equal(unknown.pickup_area,'Area to be confirmed');
assert.equal(unknown.destination_area,'Area to be confirmed');
assert.equal(JSON.stringify(unknown).includes('Secret Private Road'),false);

const safe=vendorOfferSafePricing({
  vendor_km_rate:11, vendor_da:600, duty_days:2,
  local_8h_80km:2200,local_10h_100km:2700,
  local_12h_120km:3200,local_extra_km:14,local_extra_hour:150,
  customer_local_extra_km:24,
  secret_note:'Call Mr Test at 9123456789',
  customer_phone:'9123456789', customer_name:'Not Shared',
  route:'Private Road ABC'
});
assert.deepEqual(safe,{vendor_km_rate:11,vendor_da:600,duty_days:2,
 local_8h_80km:2200,local_10h_100km:2700,local_12h_120km:3200,
 local_extra_km:14,local_extra_hour:150});
console.log('Vendor offer privacy tests: PASS');
