import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyAccessToken, requireMobileOtp, normalizeMobile } from '../lib/mobile-otp.mjs';
process.env.MSG91_AUTH_KEY = 'private-test-msg91-key';
process.env.NEXT_PUBLIC_MSG91_WIDGET_ID = 'public-widget';
process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN = 'public-token';
process.env.SUPABASE_URL = 'https://test.supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-supabase-test-key';
const { default: handler } = await import('../api/mobile-otp.js');
const { default: booking } = await import('../api/booking-enquiry.js');
const { default: partner } = await import('../api/partner-application.js');
const origin = 'https://preview.test', token = 'provider-test-access-token';
let calls = 0, reply = {type:'success',data:{mobile:'919999999999'}}, status = 200, offline = false;
globalThis.fetch = async (url, options) => {
  calls++; assert.equal(url, 'https://control.msg91.com/api/v5/widget/verifyAccessToken');
  assert.deepEqual(JSON.parse(options.body), {authkey:'private-test-msg91-key','access-token':token});
  if (offline) throw Error('offline');
  return Response.json(reply, {status});
};
const request = body => new Request(origin + '/api/mobile-otp', {method:'POST',body:JSON.stringify(body)});
assert.equal(normalizeMobile('+91 99999 99999'),'919999999999');assert.equal(normalizeMobile('abc9999999999'),null);
let r = await handler(new Request(origin+'/api/mobile-otp'));assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/private-test-msg91-key|MSG91_AUTH_KEY/);
let result = await (await handler(request({phone:'9999999999',purpose:'booking',accessToken:token}))).json();assert.equal(result.success,true);
await requireMobileOtp(result.proof,'9999999999','booking',origin);
for (const [proof,phone,purpose,site] of [[null,'9999999999','booking',origin],[result.proof+'x','9999999999','booking',origin],[result.proof,'8888888888','booking',origin],[result.proof,'9999999999','partner',origin],[result.proof,'9999999999','booking','https://other.test']]) await assert.rejects(requireMobileOtp(proof,phone,purpose,site));
const now=Date.now;Date.now=()=>now()+601000;await assert.rejects(requireMobileOtp(result.proof,'9999999999','booking',origin));Date.now=now;
for (const data of [{type:'error',data:{mobile:'919999999999'}},{type:'success',data:{mobile:'918888888888'}},{type:'success'}, {success:true,data:{mobile:'919999999999'}}]) {reply=data;await assert.rejects(verifyAccessToken(token,'9999999999','booking',origin));}
reply={type:'success',data:{mobile:'919999999999'}};status=500;await assert.rejects(verifyAccessToken(token,'9999999999','booking',origin));status=200;offline=true;assert.equal((await handler(request({phone:'9999999999',purpose:'booking',accessToken:token}))).status,503);offline=false;
assert.equal((await handler(new Request(origin+'/api/mobile-otp',{method:'POST',headers:{origin:'https://other.test'},body:'{}'}))).status,403);
const before=calls;
const payload={bookingId:'CWD-WD-260919-1234',name:'Test',phone:'9999999999',email:'test@example.com',details:'Test trip'};
for(const serviceMode of ['withdriver','selfdrive']) {r=await booking(new Request(origin+'/api/booking-enquiry',{method:'POST',body:JSON.stringify({...payload,serviceMode})}));assert.equal(r.status,403);}
const form=new FormData();form.set('name','Test');form.set('phone','9999999999');r=await partner(new Request(origin+'/api/partner-application',{method:'POST',body:form}));assert.equal(r.status,403);assert.equal(calls,before,'No uploads, inserts or emails before verification');
delete process.env.MSG91_AUTH_KEY;assert.equal((await handler(new Request(origin+'/api/mobile-otp'))).status,503);
for(const p of ['assets/js/mobile-otp.js','assets/js/booking.js'])assert.doesNotMatch(await readFile(new URL('../'+p,import.meta.url),'utf8'),/MSG91_AUTH_KEY|private-test-msg91-key/);
console.log('PASS: provider verification, public-config secrecy, phone/purpose/origin binding, proof tampering/expiry, missing/wrong verification, provider failures and both form APIs blocked before side effects.');
