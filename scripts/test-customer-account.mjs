// All network calls intercepted; no SMS, email or hosted database writes.
import assert from 'node:assert/strict';
import handler from '../api/customer-account.js';
import otpHandler from '../api/mobile-otp.js';
import { verifyAccessToken } from '../lib/mobile-otp.mjs';
import { customerConfig, COOKIE, hash } from '../lib/customer-account.mjs';
const origin = 'https://preview.test';
Object.assign(process.env, { CWD_CUSTOMER_ACCOUNTS_ENABLED:'true', CWD_CUSTOMER_SUPABASE_URL:'https://customer.test',
  CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key', MSG91_AUTH_KEY:'test-only-msg91-key',
  VERCEL_ENV:'preview', VERCEL_GIT_COMMIT_REF:'testing' });
const customers = new Map(), sessions = new Map(), uses = new Set();
let calls=0, providerMobile='919999999999', offline=false;
globalThis.fetch = async (url, options={}) => {
  calls++;
  if (offline) throw Error('offline');
  const u = new URL(url), body = options.body ? JSON.parse(options.body) : null;
  if (u.hostname === 'control.msg91.com') {
    assert.equal(u.pathname,'/api/v5/widget/verifyAccessToken');
    return Response.json({type:'success',message:providerMobile});
  }
  assert.equal(u.origin,'https://customer.test','No production/external access');
  assert.equal(options.headers.Authorization,'Bearer test-only-service-key');
  if (u.pathname === '/rest/v1/rpc/cwd_customer_login_with_alert') {
    if (uses.has(body.p_nonce)) return Response.json({}, {status:409});
    uses.add(body.p_nonce);
    let account = [...customers.values()].find(x=>x.mobile===body.p_mobile);
    if (!account) { account={id:crypto.randomUUID(),mobile:body.p_mobile,display_name:'',created_at:new Date().toISOString()}; customers.set(account.id,account); }
    sessions.set(body.p_session_hash,{customer_id:account.id,expires_at:body.p_session_expires,revoked_at:null});
    return Response.json({customer:account,alert_id:crypto.randomUUID()});
  }
  if(u.pathname==='/rest/v1/cwd_customer_login_alerts')return Response.json([]);
  if (u.pathname === '/rest/v1/cwd_customer_sessions') {
    const row=sessions.get(u.searchParams.get('session_hash')?.slice(3));
    if (options.method==='PATCH') { if(row)Object.assign(row,body); return new Response(null,{status:204}); }
    return Response.json(row?[row]:[]);
  }
  if (u.pathname === '/rest/v1/cwd_customers') {
    const row=customers.get(u.searchParams.get('id')?.slice(3));
    if(options.method==='PATCH'){assert.ok(row);Object.assign(row,body);return new Response(null,{status:204});}
    return Response.json(row?[row]:[]);
  }
  throw Error('Unexpected endpoint '+u.pathname);
};
const request=(body,cookie='',extra={})=>new Request(origin+'/api/customer-account',body===undefined?{headers:{cookie}}:
  {method:'POST',headers:{origin,'content-type':'application/json',cookie,...extra},body:JSON.stringify(body)});
const token=id=>'e30.'+Buffer.from(JSON.stringify({requestId:id,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.fixture';
const proof=async(id,mobile='9999999999',purpose='customer')=>(await verifyAccessToken(token(id),mobile,purpose,origin,id)).proof;
let count=0;
function check(value,expected,label){assert.equal(value,expected,label);count++;}
for(const patch of [{CWD_CUSTOMER_ACCOUNTS_ENABLED:'false'},{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},
  {CWD_CUSTOMER_SUPABASE_URL:'https://pwciaihqkfnlenxxiown.supabase.co'},{CWD_CUSTOMER_SUPABASE_URL:'https://u:p@customer.test'},
  {CWD_CUSTOMER_SUPABASE_URL:'http://customer.test'},{CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY:''}]){
  assert.throws(()=>customerConfig({...process.env,...patch}));count++;
}
check((await handler(request())).status,401,'unauthenticated denied');
const before=calls;
check((await handler(request({action:'login'},'',{origin:'https://evil.test'}))).status,403);
check((await handler(request({action:'login'},'',{origin:''}))).status,403);
check((await handler(request({action:'login'},'',{'content-type':'text/plain'}))).status,415);
check(calls,before,'CSRF rejected before DB/provider');
check((await handler(request({action:'login',phone:'9999999999',proof:'fake'}))).status,403);
const loginProof=await proof('customer-login-0001');
check((await handler(request({action:'login',phone:'8888888888',proof:loginProof}))).status,403);
check((await handler(request({action:'login',phone:'9999999999',proof:await proof('booking-proof-0001','9999999999','booking')}))).status,403);
providerMobile='918888888888';await assert.rejects(proof('wrong-provider-0001'));count++;providerMobile='919999999999';
const loginBody={action:'login',phone:'9999999999',proof:loginProof};
const concurrent=await Promise.all([handler(request(loginBody)),handler(request(loginBody))]);
assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);count++;
const response=concurrent.find(x=>x.status===200), cookie=response.headers.get('set-cookie').split(';')[0];
assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.doesNotMatch(response.headers.get('set-cookie'),/Max-Age|Expires=/);count++;
assert.match(cookie,new RegExp('^'+COOKIE+'=[a-f0-9]{64}$'));count++;
const account=(await response.json()).customer;
check(customers.size,1);check(sessions.size,1);
assert.equal(sessions.has(await hash(cookie.split('=')[1])),true);count++;
const get=await handler(request(undefined,cookie));check(get.status,200);check(get.headers.get('cache-control'),'private, no-store');
assert.doesNotMatch(await get.text(),/service.key|session_hash|test-only/);count++;
check((await handler(request({action:'profile',display_name:'Test Customer'},cookie))).status,200);
check(customers.get(account.id).display_name,'Test Customer');
for(const payload of [{mobile:'918888888888'},{id:'another-customer'},{role:'admin'}])
  check((await handler(request({action:'profile',display_name:'Wrong',...payload},cookie))).status,400);
check((await handler(request({action:'profile',display_name:'X'},cookie))).status,400);
check((await handler(request(undefined,cookie+'; '+cookie))).status,401,'duplicate cookies denied');
// A second account must never be selected by client-supplied ID.
providerMobile='918888888888';const otherProof=await proof('other-customer-0001','8888888888');
const other=await handler(request({action:'login',phone:'8888888888',proof:otherProof}));
const otherCookie=other.headers.get('set-cookie').split(';')[0];
check((await handler(request({action:'profile',display_name:'Other Customer'},otherCookie))).status,200);
check(customers.get(account.id).display_name,'Test Customer');
check((await handler(request({action:'logout'},cookie))).status,200);
check((await handler(request(undefined,cookie))).status,401,'revoked session rejected');
check((await handler(request(undefined,otherCookie))).status,200,'other session retained');
sessions.get(await hash(otherCookie.split('=')[1])).expires_at='invalid';
check((await handler(request(undefined,otherCookie))).status,401,'invalid expiry fails closed');
sessions.get(await hash(otherCookie.split('=')[1])).expires_at=new Date(Date.now()-1000).toISOString();
check((await handler(request(undefined,otherCookie))).status,401,'expired session rejected');
offline=true;check((await handler(request(undefined,otherCookie))).status,503);offline=false;
process.env.CWD_CUSTOMER_ACCOUNTS_ENABLED='false';
const noCalls=calls;
check((await handler(request(loginBody))).status,503);
check((await otpHandler(new Request(origin+'/api/mobile-otp',{method:'POST',body:JSON.stringify({purpose:'customer'})}))).status,503);
check(calls,noCalls,'disabled feature cannot touch provider or DB');
console.log(`PASS: ${count} customer account assertions; provider identity, isolation, CSRF, replay, cookie security, ownership, expiry and revocation. No live traffic.`);
