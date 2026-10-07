import assert from 'node:assert/strict';
import handler from '../api/maps-route.js';
import {validateBookingData} from '../lib/booking-validation.mjs';
import {maharashtraPickup} from '../lib/pickup-eligibility.mjs';
// Entirely synthetic Google, pricing and database responses. No real submissions.
process.env.GOOGLE_MAPS_SERVER_API_KEY='fixture';
process.env.SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
const part=(type,long_name)=>({types:[type],long_name});
const place=(city,state='Maharashtra')=>({formatted_address:city+', Maharashtra, India',address_components:[part('locality',city),...(state?[part('administrative_area_level_1',state)]:[]),part('country','India')],geometry:{location:{lat:19.2,lng:73.1}}});
const car={full_name:'Fixture car',is_active:true,local_pkg_8hr_80km:3000,local_extra_hour_rate:250,outstation_rate_per_km:14,driver_allowance_per_day:500,customer_night_charge:0,airport_t1_rate:1500};
let selected=place('Mumbai'),geocodeStatus='OK',routeMeters=20000,routeBodies=[],geocodes=0;
globalThis.fetch=async(url,opts={})=>{
 const u=String(url);
 if(u.includes('/geocode/')){geocodes++;return Response.json({status:geocodeStatus,results:geocodeStatus==='OK'?[selected]:[]});}
 if(u.includes('computeRoutes')){routeBodies.push(JSON.parse(opts.body));return Response.json({routes:[{distanceMeters:routeMeters,duration:'1200s',legs:[{distanceMeters:routeMeters,duration:'1200s'}]}]});}
 assert.equal(opts.method||'GET','GET','No database mutations');
 if(u.includes('/with_driver_rates'))return Response.json([car]);
 if(u.includes('/vehicles'))return Response.json([{id:'fixture-car',full_name:'Fixture car',is_active:true,service_type:'Self-Drive',rate_per_hour:100,refundable_deposit:5000}]);
 if(u.startsWith('https://fixture.invalid/'))return Response.json([]);
 throw Error('Unexpected network request: '+u);
};
const api=async body=>{const r=await handler(new Request('https://fixture.invalid/api/maps-route',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,...await r.json()};};
const booking=tripType=>({tripType,carName:car.full_name,pickupPlaceId:'selected',pickupLocation:'Selected address',pickupAt:'2026-12-01T04:30:00Z',returnAt:'2026-12-01T12:30:00Z',localPackage:'8hr_80km',destination:'Delhi',destinationPlaceId:'Delhi',journeyType:'one-way',stops:[]});
let count=0;
for(const city of ['Lodha Upper Thane','Mankoli','Bhiwandi','Mumbai','Thane','Navi Mumbai','Kalyan','Vasai-Virar','Pune','Nashik','Nagpur','Kolhapur','Ratnagiri','Gadchiroli','Nanded','Chhatrapati Sambhajinagar']){
 selected=place(city);
 for(const scope of ['local','outstation']){
  assert.equal((await api({action:'validate-pickup',placeId:'selected',pickupScope:scope})).allowed,true,city);
  const b=await validateBookingData('withdriver',booking(scope));assert.ok(b.fare>0);count++;
 }
}
console.log(`PASS ${count} Maharashtra API/final-booking agreement fixtures`);
const rejected=[place('Surat','Gujarat'),place('Panaji','Goa'),place('Belagavi','Karnataka'),place('Mumbai',''),place('Mumbai','Not Maharashtra'),{...place('Mumbai'),partial_match:true},{...place('Mumbai'),geometry:null},{...place('Mumbai'),address_components:[...place('Mumbai').address_components,part('administrative_area_level_1','Gujarat')]}];
for(selected of rejected){for(const scope of ['local','outstation']){const a=await api({action:'validate-pickup',placeId:'selected',pickupScope:scope});assert.equal(a.allowed,false);await assert.rejects(validateBookingData('withdriver',booking(scope)));}assert.equal((await api({action:'route',pickupPlaceId:'selected',finalDropPlaceId:'Delhi',journeyType:'one-way'})).success,false);}
for(geocodeStatus of ['ZERO_RESULTS','REQUEST_DENIED']){assert.equal((await api({action:'validate-pickup',placeId:'selected',pickupScope:'local'})).success,false);await assert.rejects(validateBookingData('withdriver',booking('local')));}
geocodeStatus='OK';selected=place('Pune');
assert.equal((await api({action:'validate-pickup',placeId:'',pickupScope:'local'})).success,false);
await assert.rejects(validateBookingData('withdriver',{...booking('local'),pickupPlaceId:''}));
console.log('PASS outside-state, missing/ambiguous state, partial match, missing geometry, lookup failure and required selection fail closed');
for(const drop of ['Delhi','Bengaluru','Goa','Surat']){routeBodies=[];assert.equal((await api({action:'route',pickupPlaceId:'selected',finalDropPlaceId:drop,journeyType:'one-way'})).success,true);assert.equal(routeBodies[0].destination.placeId,drop);await validateBookingData('withdriver',{...booking('outstation'),destinationPlaceId:drop,destination:drop});}
console.log('PASS all-India drop IDs remain accepted by route and final booking');
selected=place('Pune');assert.equal((await api({action:'validate-pickup',placeId:'selected',pickupScope:'airport'})).allowed,false);
await assert.rejects(validateBookingData('withdriver',{...booking('airport'),airportType:'drop',airportTerminal:'t1'}),/Mumbai, Thane/);
selected=place('Mumbai');assert.equal((await api({action:'validate-pickup',placeId:'selected',pickupScope:'airport'})).allowed,true);
for(const airportType of ['pickup','drop']){const b={...booking('airport'),airportType,airportTerminal:'t1'};routeMeters=30000;assert.equal((await validateBookingData('withdriver',b)).fare,1500);routeMeters=30001;await assert.rejects(validateBookingData('withdriver',b),/Airport Transfer service area/);}
const sd={vehicleId:'fixture-car',pickupAt:'2026-12-01T04:30:00Z',returnAt:'2026-12-02T04:30:00Z',deliveryMode:'home',deliveryLocation:'Selected',deliveryPlaceId:'selected'};
routeMeters=50000;const before=geocodes;assert.equal((await validateBookingData('selfdrive',sd)).fare,9775);assert.equal(geocodes,before);routeMeters=50100;await assert.rejects(validateBookingData('selfdrive',sd),/Self Drive home-delivery service area/);
console.log('PASS Airport city rules + 30km boundary and Self Drive 50km boundary/pricing unchanged');
console.log('All pickup eligibility fixtures passed; Google and database results were mocked.');
