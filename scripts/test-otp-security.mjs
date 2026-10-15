import assert from 'node:assert/strict';
import { verifyAccessToken, requireMobileOtp, consumeMobileOtp } from '../lib/mobile-otp.mjs';
process.env.MSG91_AUTH_KEY='local-test-only';
process.env.NEXT_PUBLIC_MSG91_WIDGET_ID='test-widget';
process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN='test-public-token';
process.env.SUPABASE_URL='https://test.supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-only';
const {default:handler}=await import('../api/mobile-otp.js');
const {default:booking}=await import('../api/booking-enquiry.js');
const origin='https://preview.invalid',reqId='test-request-123456';
const jwt=(claims={})=>'header.'+Buffer.from(JSON.stringify({requestId:reqId,exp:Math.floor(Date.now()/1000)+600,...claims})).toString('base64url')+'.signature';
const token=jwt();
let reply={type:'success',message:'919999999999'},status=200,offline=false,providerCalls=0;
const used=new Set();
// Every external call is mocked. Unexpected traffic fails the test.
globalThis.fetch=async(url,options)=>{
  if(url==='https://control.msg91.com/api/v5/widget/verifyAccessToken'){
    providerCalls++;assert.deepEqual(JSON.parse(options.body),{authkey:'local-test-only','access-token':token});
    if(offline)throw Error('offline');return Response.json(reply,{status});
  }
  assert.equal(url,'https://test.supabase.invalid/rest/v1/otp_proof_uses');assert.equal(options.method,'POST');
  const row=JSON.parse(options.body);
  if(used.has(row.nonce))return new Response('',{status:409});
  used.add(row.nonce);return new Response('',{status:201});
};
const request=body=>new Request(origin+'/api/mobile-otp',{method:'POST',body:JSON.stringify({accessToken:token,phone:'9999999999',purpose:'booking',reqId,...body})});
const verified=await(await handler(request({}))).json();assert.equal(verified.success,true);
await requireMobileOtp(verified.proof,'+91 99999 99999','booking',origin);
assert.equal((await handler(request({phone:'8888888888'}))).status,403);
for(const response of [{type:'success'},{type:'success',message:'success'},{type:'success',message:'test@example.com'},{type:'success',data:{mobile:'919999999999'}},{type:'error',message:'919999999999'},{success:true,message:'919999999999'}]){
 reply=response;assert.equal((await handler(request({}))).status,403,'Missing or ambiguous identity must fail closed');
}
reply={type:'success',message:'919999999999'};
for(const [proof,phone,purpose,site] of [[null,'9999999999','booking',origin],[verified.proof+'x','9999999999','booking',origin],[verified.proof,'8888888888','booking',origin],[verified.proof,'9999999999','partner',origin],[verified.proof,'9999999999','booking','https://other.invalid']])await assert.rejects(requireMobileOtp(proof,phone,purpose,site));
const now=Date.now;Date.now=()=>now()+601000;
await assert.rejects(requireMobileOtp(verified.proof,'9999999999','booking',origin));Date.now=now;
const before=providerCalls;
assert.equal((await handler(request({accessToken:jwt({exp:1})}))).status,400);
assert.equal((await handler(request({reqId:'different-request'}))).status,400);
assert.equal((await handler(request({accessToken:'not-a-valid-token-at-all'}))).status,400);
assert.equal(providerCalls,before);
status=500;assert.equal((await handler(request({}))).status,403);status=200;
offline=true;assert.equal((await handler(request({}))).status,503);offline=false;
const payload=Buffer.from(JSON.stringify({mobile:'919999999999',purpose:'booking',origin,expiresAt:Date.now()+600000,nonce:'old-random-nonce-123456789'})).toString('base64url');
const oldKey=await crypto.subtle.importKey('raw',new TextEncoder().encode('cwd-mobile-otp-v1:local-test-only'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const sig=Buffer.from(await crypto.subtle.sign('HMAC',oldKey,new TextEncoder().encode(payload))).toString('base64url');
await assert.rejects(requireMobileOtp(payload+'.'+sig,'9999999999','booking',origin));
const race=await Promise.allSettled([1,2].map(()=>consumeMobileOtp(verified.proof,'9999999999','booking',origin)));
assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'Only one concurrent submission may consume proof');
const reissued=await(await handler(request({}))).json();
await assert.rejects(consumeMobileOtp(reissued.proof,'9999999999','booking',origin),/already been used/);
const partner=await verifyAccessToken(token,'9999999999','partner',origin,reqId);
await assert.rejects(consumeMobileOtp(partner.proof,'9999999999','partner',origin),/already been used/);
const b=await booking(new Request(origin+'/api/booking-enquiry',{method:'POST',body:JSON.stringify({bookingId:'CWD-WD-261015-1234',name:'Test',phone:'8888888888',email:'test@example.com',details:'Local test only',serviceMode:'withdriver',otpProof:verified.proof,bookingData:{}})}));
assert.equal(b.status,403);
// Exercise the actual booking endpoint through validation, atomic consumption,
// and persistence. Every dependency is a fixture; no live booking is written.
used.clear();
delete process.env.RESEND_API_KEY;
process.env.GOOGLE_MAPS_SERVER_API_KEY='fixture';
const otpFetch=globalThis.fetch;let savedBookings=0;
globalThis.fetch=async(url,options={})=>{
 const value=String(url);
 if(value.startsWith('https://test.supabase.invalid/rest/v1/pricing_rules?')||value.startsWith('https://test.supabase.invalid/rest/v1/site_settings?'))return Response.json([]);
 if(value.startsWith('https://test.supabase.invalid/rest/v1/with_driver_rates?'))return Response.json([{full_name:'Fixture car',segment:'Sedan',airport_t2_rate:1500}]);
 if(value==='https://routes.googleapis.com/directions/v2:computeRoutes')return Response.json({routes:[{distanceMeters:15000,duration:'1800s'}]});
 if(value==='https://test.supabase.invalid/rest/v1/inquiries'){
  assert.equal(JSON.parse(options.body).customer_phone,'9999999999');savedBookings++;return new Response('',{status:201});
 }
 return otpFetch(url,options);
};
const bookingRequest=(overrides={})=>new Request(origin+'/api/booking-enquiry',{method:'POST',body:JSON.stringify({bookingId:'CWD-WD-261015-1234',name:'Fixture Customer',phone:'9999999999',email:'fixture@example.invalid',details:'Fixture only',serviceMode:'withdriver',otpProof:verified.proof,bookingData:{tripType:'airport',carName:'Fixture car',pickupAt:'2026-10-20T09:00:00+05:30',airportType:'pickup',airportTerminal:'t2',customerPlaceId:'fixture-place',pickupLocation:'Fixture location'},...overrides})});
const results=await Promise.all([booking(bookingRequest()),booking(bookingRequest())]);
assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);assert.equal(savedBookings,1,'Concurrent duplicate produces exactly one booking');
assert.equal((await booking(bookingRequest())).status,403);assert.equal(savedBookings,1);
for(const overrides of [{phone:'8888888888'},{otpProof:'invalid'}])assert.equal((await booking(bookingRequest(overrides))).status,403);
Date.now=()=>now()+601000;assert.equal((await booking(bookingRequest())).status,403);Date.now=now;
assert.equal(savedBookings,1,'Rejected submissions never persist');
console.log('PASS booking endpoint: valid submission, concurrent duplicate, sequential replay, changed phone, invalid proof and expired proof; exactly one mocked write.');
console.log('PASS: valid/wrong/changed phone, missing identity, tampering, purpose/origin, expiry, v1 invalidation, provider errors, concurrent consumption, reminted-proof replay and booking API rejection. All traffic mocked.');
