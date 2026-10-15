import assert from 'node:assert/strict';
import { finalVendorRateForVehicle, applyFinalVendorRate, calculateFinalOutstationVendorCost } from '../lib/cwd-vendor-costing.mjs';

const cases = [
  ['Maruti Suzuki Wagon R', 12, 400, 110, 1000, 4000],
  ['Maruti Suzuki Dzire', 14, 500, 150, 1200, 4700],
  ['Maruti Suzuki Ertiga', 16, 700, 150, 1500, 5500],
  ['Toyota Innova Crysta', 22, 700, 200, 1500, 7300],
];
for (const [name, kmRate, allowance, extraHour, night, daily] of cases) {
  const rate = finalVendorRateForVehicle(name);
  assert.ok(rate, name + ' must map to the final rate card');
  assert.equal(rate.outstation_rate_per_km, kmRate);
  assert.equal(rate.minimum_outstation_km_per_day, 300);
  assert.equal(rate.driver_allowance_per_day, allowance);
  assert.equal(rate.local_extra_hour_rate, extraHour);
  assert.equal(rate.night_charge, night);
  assert.equal(rate.local_extra_km_rate, kmRate);
  assert.equal(kmRate * 300 + allowance, daily);
  assert.equal(applyFinalVendorRate(name, {outstation_rate_per_km: 999}).outstation_rate_per_km, kmRate);
  const cost = calculateFinalOutstationVendorCost({vehicleName:name,routeKm:80,dutyDays:1,nightCount:1,toll:150,parking:50});
  assert.equal(cost.billableKm, 300);
  assert.equal(cost.kmCost, kmRate * 300);
  assert.equal(cost.driverAllowance, allowance);
  assert.equal(cost.nightCost, night);
  assert.equal(cost.toll, 150);
  assert.equal(cost.parking, 50);
  assert.equal(cost.total, daily + night + 200);
}
assert.equal(finalVendorRateForVehicle('Dzire / Aura').outstation_rate_per_km, 14);
assert.equal(finalVendorRateForVehicle('Sedan'), null, 'Generic sedan should not be guessed as Dzire');
assert.equal(finalVendorRateForVehicle('Toyota Innova Hycross'), null, 'Innova Hycross must not map to Innova Crysta');
console.log('Final vendor rate card and costing calculations: PASS');
