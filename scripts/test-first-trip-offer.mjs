import assert from 'node:assert/strict';
import { applyFirstTripOffer } from '../lib/first-trip-offer.mjs';

const validated={fare:7385,normalized:{totalFare:7385}};
let queried=false;
globalThis.fetch=async()=>{queried=true;throw new Error('Coupon checks must not query the database');};

for(const mode of ['withdriver','selfdrive']){
 const fare=await applyFirstTripOffer({serviceMode:mode,phone:'9876543210',bookingData:{},validated});
 assert.equal(fare,validated);
 for(const couponCode of ['FIRSTTRIP','firsttrip','FESTIVE','ABC123']){
  await assert.rejects(
   ()=>applyFirstTripOffer({serviceMode:mode,phone:'9876543210',bookingData:{couponCode},validated}),
   e=>e.status===400&&/no longer active/.test(e.message)
  );
 }
}
assert.equal(queried,false);
console.log('PASS expired coupon is rejected and full customer fare remains intact.');
