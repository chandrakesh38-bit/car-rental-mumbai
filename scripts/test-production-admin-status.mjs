import assert from 'node:assert/strict';
import {POST} from '../api/admin-payment.js';
Object.assign(process.env,{SUPABASE_URL:'https://db.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_ANON_KEY:'fixture-public',ADMIN_EMAILS:'admin@example.invalid'});
let email='admin@example.invalid',writes=0;
globalThis.fetch=async(url,options)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({email});
 assert.match(url,/\/rest\/v1\/inquiries\?booking_id=eq\.(123456|CWD-WD-261023-1234)$/);
 assert.equal(options.method,'PATCH');assert.equal(options.headers.Authorization,'Bearer fixture-service');
 const body=JSON.parse(options.body);assert.ok(body.booking_status);assert.ok(body.updated_at);writes++;
 return Response.json([{booking_id:'123456'}]);
};
const call=(booking_id,status,token='fixture-admin')=>POST(new Request('https://site.invalid/api/admin-payment',{method:'POST',headers:{authorization:token?'Bearer '+token:'','content-type':'application/json'},body:JSON.stringify({action:'set_booking_status',booking_id,status})}));
assert.equal((await call('123456','confirmed','')).status,401);
email='outsider@example.invalid';assert.equal((await call('123456','confirmed')).status,403);assert.equal(writes,0);
email='admin@example.invalid';assert.equal((await call('invalid','confirmed')).status,400);assert.equal((await call('123456','invalid')).status,400);assert.equal(writes,0);
for(const id of ['123456','CWD-WD-261023-1234'])for(const state of ['received','availability_confirmed','confirmed','ongoing','completed','cancelled'])assert.equal((await call(id,state)).status,200);
assert.equal(writes,12);
console.log('PASS admin-only status updates for legacy/new bookings; invalid/unauthorized requests cannot write. All network calls mocked.');
