import assert from 'node:assert/strict';
import {matchedCar,safeOffer,allocationSafe}
  from '../api/vendor-app-ops.js';

const fakeCar={
  id:'vehicle-id-01',vehicle_number:'MH03AB1234',
  make_model:'Maruti Suzuki Dzire',category:'Sedan',is_active:true,
};
assert.equal(matchedCar('Maruti Suzuki Dzire',fakeCar),true);
assert.equal(matchedCar('Hyundai Aura',fakeCar),false);
assert.equal(matchedCar('Sedan',fakeCar),true);
assert.equal(matchedCar('Innova Crysta',fakeCar),false);
const offer=safeOffer({
  id:'offer-id',booking_id:'CWD-TEST',status:'offered',
  vehicle_required:'Maruti Suzuki Dzire',trip_type:'outstation',
  route_summary:'123 Secret Flat, Powai, Mumbai → Nashik',
  start_at:'2026-11-01T00:00:00Z',final_drop_at:null,
  estimated_vendor_payout:5000,estimated_km:300,
  pricing_snapshot:{vendor_km_rate:11,customer_phone:'SECRET'},
},[fakeCar]);
assert.equal(offer.pickup_area,'Mumbai');
assert.equal(offer.destination_area,'Nashik');
assert.equal(offer.selectable_vehicles.length,1);
assert.equal(offer.selectable_vehicles[0].vehicle_number,'MH03AB1234');
assert.equal(JSON.stringify(offer).includes('123 Secret Flat'),false);
assert.equal(JSON.stringify(offer).includes('customer_phone'),false);
assert.equal(JSON.stringify(offer).includes('SECRET'),false);
const allocated=allocationSafe({
  id:'alloc-id',booking_id:'CWD-TEST',status:'allocated',
  vehicle_number:'MH03AB1234',driver_name:'Demo',
}, {
  trip_type:'outstation',vehicle_required:'Maruti Suzuki Dzire',
  start_at:'2026-11-01T00:00:00Z',estimated_vendor_payout:5000,
  route_summary:'Powai → Nashik',pricing_snapshot:{vendor_km_rate:11},
}, {
  customer_name:'Example Customer',customer_phone:'9876543210',
  pickup_location:'A Secret Address',destination:'Nashik',route:'A Secret Address → Nashik',
},null,null);
assert.equal(allocated.customer.customer_mobile,'9876543210');
assert.equal(allocated.final_earning,null);
const settled=allocationSafe({
  id:'alloc-id',booking_id:'CWD-TEST',status:'approved',
},null,null,null,{vendor_final_payout:6100,payout_status:'pending'});
assert.equal(settled.status,'completed');
assert.equal(settled.final_earning.vendor_final_payout,6100);
console.log('Vendor app API ownership presentation & offer PII policy: PASS');
