import assert from 'node:assert/strict';
import {
 MIN_OUTSTATION_KM_DAY,CUSTOMER_NIGHT_CHARGE,VENDOR_NIGHT_CHARGE,
 billableOutstationKm,customerOutstationBreakdown,vendorOutstationBreakdown,
 bookingNightCount,marginPreview
} from '../lib/cwd-pricing.mjs';

assert.equal(MIN_OUTSTATION_KM_DAY,300);
assert.equal(CUSTOMER_NIGHT_CHARGE,500);
assert.equal(VENDOR_NIGHT_CHARGE,300);

const customer=customerOutstationBreakdown({
 km:294,dutyDays:1,kmRate:12,driverAllowance:500,nightCount:0
});
assert.deepEqual(
 [customer.billableKm,customer.baseKm,customer.extraKm,customer.extraKmRate,customer.fare],
 [300,300,0,13,4100]
);
const vendor=vendorOutstationBreakdown({
 billableKm:customer.billableKm,dutyDays:1,vendorKmRate:11,driverAllowance:500
});
assert.deepEqual(
 [vendor.billableKm,vendor.kmRate,vendor.payout],[300,11,3800]
);
assert.equal(marginPreview(customer.fare,vendor.payout).grossDifference,300);
assert.equal(marginPreview(customer.fare,vendor.payout).grossMarginPercent,7.3);
assert.equal(billableOutstationKm(149.1,1),300);
assert.equal(billableOutstationKm(350,2),600);
assert.equal(customerOutstationBreakdown({
 km:440,dutyDays:2,kmRate:12,driverAllowance:500
}).fare,600*12+1000);
assert.equal(vendorOutstationBreakdown({
 billableKm:440,dutyDays:2,vendorKmRate:11,driverAllowance:500
}).payout,440*11+1000);

const ist=(day,time)=>'2026-10-'+day+'T'+time+':00+05:30';
assert.equal(bookingNightCount(ist('27','06:00'),ist('27','22:00')),0);
assert.equal(bookingNightCount(ist('27','06:00'),ist('27','22:01')),1);
assert.equal(bookingNightCount(ist('27','05:59'),ist('27','21:00')),1);
assert.equal(bookingNightCount(ist('27','04:00'),ist('27','23:00')),1);
assert.equal(bookingNightCount(ist('27','21:00'),ist('28','07:00')),0);
assert.equal(bookingNightCount(ist('27','23:00'),ist('28','02:00')),1);
assert.equal(bookingNightCount(ist('27','22:01'),ist('28','23:00')),2);

assert.equal(customerOutstationBreakdown({
 km:294,dutyDays:1,kmRate:12,driverAllowance:500,nightCount:1
}).fare,4600);
assert.equal(vendorOutstationBreakdown({
 billableKm:customer.billableKm,dutyDays:1,vendorKmRate:11,driverAllowance:500,nightCount:1
}).payout,4100);
console.log('PASS CWD test policy: customer, vendor, 300-km tiers, coupon-free and night boundaries');
