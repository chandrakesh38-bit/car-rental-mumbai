import assert from 'node:assert/strict';
import {checkoutTripFallback} from '../lib/checkout-trip-fallback.mjs';
assert.deepEqual(checkoutTripFallback({includedKm:305,days:1,pickupAt:'2026-10-26T00:30:00.000Z',returnAt:'2026-10-26T16:30:00.000Z'}),{includedKm:305,days:1,start:'2026-10-26T00:30:00.000Z',end:'2026-10-26T16:30:00.000Z'});
assert.deepEqual(checkoutTripFallback({includedKm:-2,days:'bad',pickupAt:'bad'}),{includedKm:0,days:0,start:null,end:null});
assert.deepEqual(checkoutTripFallback(),{includedKm:0,days:0,start:null,end:null});
console.log('PASS: saved checkout KM, dates, duty days and invalid/missing legacy fallback');
