// No network/SMS: exercise the real handler with an in-memory provider and DB.
import assert from 'node:assert/strict';
import handler from '../api/vendor-app-auth.js';
Object.assign(process.env,{
 CWD_VENDOR_APP_AUTH_ENABLED:'true',CWD_VENDOR_APP_SHARED_DB_MODE:'true',
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'testing',
 SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-db-key',
 CWD_VENDOR_APP_SESSION_SECRET:'s'.repeat(48),MSG91_AUTH_KEY:'a'.repeat(48),
 CWD_VENDOR_APP_MSG91_WIDGET_ID:'vendor-widget-demo',
 CWD_VENDOR_APP_MSG91_WIDGET_TOKEN:'vendor-token-demo',
 NEXT_PUBLIC_MSG91_WIDGET_TOKEN:'customer-must-not-be-used',
});
const mobile='9876543210', reqId='mock-request-123456';
const jwt=id=>'e30.'+Buffer.from(JSON.stringify({requestId:id})).toString('base64url')+'.mock';
let vendor, challenges, sessions, providerCalls, sendReply, verifyReply, accessReply;
function reset(){
 vendor={id:'vendor-1',status:'active',primary_whatsapp:mobile,vendor_code:'V1',owner_business_name:'Test'};
 challenges=[];sessions=[];providerCalls=[];
 sendReply={type:'success',message:reqId};
 verifyReply={type:'success',message:jwt(reqId)};
 accessReply={type:'success',message:'91'+mobile};
}
globalThis.fetch=async(url,opt={})=>{
 const u=new URL(url),body=opt.body?JSON.parse(opt.body):null;
 if(u.hostname==='api.msg91.com'){
  providerCalls.push(u.pathname);
  assert.equal(opt.method,'POST');assert.equal(u.search,'');
  assert.equal(opt.headers.token,undefined);
  assert.equal(JSON.stringify(body).includes('customer-must-not-be-used'),false);
  if(u.pathname.endsWith('/verifyAccessToken')){
   assert.equal(opt.headers.authkey,process.env.MSG91_AUTH_KEY);
   assert.deepEqual(body,{'access-token':verifyReply.message});
   return Response.json(accessReply);
  }
  assert.equal(body.tokenAuth,'vendor-token-demo');
  assert.equal(body.widgetId,'vendor-widget-demo');
  assert.equal(opt.headers.authkey,undefined);
  if(u.pathname.endsWith('/sendOtp')){
   assert.equal(body.identifier,'91'+mobile);return Response.json(sendReply);
  }
  assert.equal(body.reqId,reqId);assert.equal(body.otp,'0123');
  return Response.json(verifyReply);
 }
 assert.equal(u.hostname,'example.supabase.co','Unexpected network destination');
 const table=u.pathname.split('/').at(-1);
 if(table==='cwd_vendors')return Response.json(vendor?[vendor]:[]);
 const rows=table==='cwd_vendor_app_login_challenges'?challenges:sessions;
 const matches=row=>[...u.searchParams].every(([k,v])=>{
  if(['select','limit'].includes(k))return true;
  if(v==='is.null')return row[k]==null;
  if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
  if(v.startsWith('gte.'))return row[k]>=v.slice(4);
  if(v.startsWith('gt.'))return row[k]>v.slice(3);
  throw Error('Unknown filter');
 });
 if(opt.method==='POST'){
  rows.push({id:'row-'+rows.length,created_at:new Date().toISOString(),attempt_count:0,...body});
  return new Response(null,{status:201});
 }
 const found=rows.filter(matches);
 if(opt.method==='PATCH')found.forEach(row=>Object.assign(row,body));
 return Response.json(found);
};
const post=async body=>{
 const r=await handler(new Request('https://vendor.test/api/vendor-app-auth',{
  method:'POST',headers:{'x-forwarded-for':'192.0.2.1'},body:JSON.stringify(body),
 }));return {status:r.status,body:await r.json()};
};
const send=()=>post({action:'send_otp',mobile});
const verify=challenge=>post({action:'verify_otp',challenge,otp:'0123'});
reset();
const sent=await send();assert.equal(sent.status,200);assert.equal(sent.body.otp_length,4);
assert.equal(sent.body.challenge.length,64);
assert.equal((await send()).status,429);assert.equal(providerCalls.length,1);
const loggedIn=await verify(sent.body.challenge);assert.equal(loggedIn.status,200);
assert.equal(loggedIn.body.status,'approved');assert.equal(sessions.length,1);
assert.notEqual(sessions[0].session_hash,loggedIn.body.session_token);
assert.equal((await verify(sent.body.challenge)).status,401);assert.equal(sessions.length,1);
const restore=token=>handler(new Request('https://vendor.test/api/vendor-app-auth',{headers:{authorization:'Bearer '+token}}));
assert.equal((await restore(loggedIn.body.session_token)).status,200);
vendor.status='suspended';assert.equal((await restore(loggedIn.body.session_token)).status,403);
for(const status of ['pending','pending_review','rejected','suspended']){
 reset();vendor.status=status;assert.equal((await send()).status,403);assert.equal(providerCalls.length,0);
}
reset();vendor=null;assert.equal((await send()).status,404);assert.equal(providerCalls.length,0);
reset();sendReply={type:'error',code:'401',message:'Invalid authentication'};
assert.equal((await send()).status,503);assert.equal(challenges.length,0);assert.equal(sessions.length,0);
for(const kind of ['expired','bad-date','attempts','request-mismatch','identity-mismatch','provider-rejection','suspended']){
 reset();const c=(await send()).body.challenge;
 if(kind==='expired')challenges[0].expires_at=new Date(0).toISOString();
 if(kind==='bad-date')challenges[0].expires_at='invalid';
 if(kind==='attempts')challenges[0].attempt_count=5;
 if(kind==='request-mismatch')verifyReply.message=jwt('different-request');
 if(kind==='identity-mismatch')accessReply.message='919999999999';
 if(kind==='provider-rejection')accessReply={type:'error',message:'expired'};
 if(kind==='suspended')vendor.status='suspended';
 const result=await verify(c);
 assert.equal(sessions.length,0,kind);
 assert.equal(result.body.session_token,undefined,kind);
}
reset();const c=(await send()).body.challenge;
const concurrent=await Promise.all([verify(c),verify(c)]);
assert.equal(concurrent.filter(r=>r.body.session_token).length,1);assert.equal(sessions.length,1);
console.log('Vendor auth API: contract, admission, throttle, verification, replay, session isolation PASS');
