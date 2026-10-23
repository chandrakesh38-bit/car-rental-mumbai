import assert from 'node:assert/strict';
import {validateBookingData} from '../lib/booking-validation.mjs';
import {installFixtures,state} from './testing/checkout-fixtures.mjs';
installFixtures();const original=globalThis.fetch;let distance=20000;
globalThis.fetch=(url,opts)=>String(url).includes('routes.googleapis.com')?Promise.resolve(Response.json({routes:[{distanceMeters:distance,duration:'1800s'}]})):original(url,opts);
const car=state.tables.with_driver_rates[0];
const data={carName:'Sedan (Dzire / Aura)',pickupAt:'2027-01-12T06:30:00Z',pickupLocation:'Mumbai',pickupPlaceId:'Mumbai',customerPlaceId:'Mumbai',airportType:'drop',airportTerminal:'t2',tripType:'airport',includedKm:999,customerExtraKmRate:1};
for(const [meters,extra] of [[19000,0],[20000,0],[20001,1],[25000,5],[41000,21]]){
 distance=meters;const q=await validateBookingData('withdriver',data);
 assert.equal(q.fare,Number(car.airport_t2_rate)+extra*Number(car.outstation_rate_per_km));
 assert.equal(q.normalized.includedKm,20);assert.equal(q.normalized.airportExtraKm,extra);
 assert.equal(q.normalized.freeWaitingMinutes,45);assert.equal(q.normalized.customerExtraHourRate,Number(car.local_extra_hour_rate));
 assert.match(q.normalized.cancellationPolicy,/3 hours/);
}
const local=await validateBookingData('withdriver',{...data,tripType:'local',localPackage:'10hr_100km'});
assert.equal(local.normalized.includedKm,100);assert.equal(local.normalized.includedHours,10);
assert.equal(local.normalized.customerExtraKmRate,Number(car.local_extra_km_rate));
assert.equal(local.normalized.customerExtraHourRate,Number(car.local_extra_hour_rate));
console.log('PASS airport 20km boundary/excess and 45-minute waiting snapshot; local km/hour limits and rates; client cannot override saved charges.');
