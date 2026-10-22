import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLocalDatabase} from './testing/postgres/local-database.mjs';
import {installFixtures,state} from './testing/checkout-fixtures.mjs';
import account from '../api/customer-account.js';
import admin from '../api/admin-customer-logins.js';
import {verifyAccessToken} from '../lib/mobile-otp.mjs';
installFixtures();
const db=await createLocalDatabase('cwd_coupon_alert_'+Date.now());
state.databaseFetch=db.fetchDatabase;
const fixture=globalThis.fetch;
let identity={email:'admin@example.com',email_confirmed_at:new Date().toISOString()};
process.env.ADMIN_EMAILS='admin@example.com';
globalThis.fetch=async(url,options)=>new URL(url).hostname==='pwciaihqkfnlenxxiown.supabase.co'
 ? Response.json(identity):fixture(url,options);
const origin='https://preview.test';
async function loginBody(source){
 const id=randomUUID(),mobile='919999999999';
 const token='e30.'+Buffer.from(JSON.stringify({requestId:id,mobile,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.fixture';
 return {action:'login',phone:mobile.slice(2),source,proof:(await verifyAccessToken(token,mobile.slice(2),'customer',origin,id)).proof};
}
const login=body=>account(new Request(origin+'/api/customer-account',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
const read=token=>admin(new Request(origin+'/api/admin-customer-logins',{headers:token?{authorization:'Bearer '+token}:{}}));
try{
 const body=await loginBody('coupon');
 assert.equal((await login(body)).status,200);
 assert.equal(state.mail.length,1);
 assert.match(state.mail[0].text,/919999999999/);
 assert.match(state.mail[0].text,/coupon unlock/);
 assert.equal((await login(body)).status,409);
 assert.equal(state.mail.length,1);
 state.emailFails=true;
 assert.equal((await login(await loginBody('login'))).status,200);
 const rows=(await db.pool.query('select * from cwd_customer_login_alerts order by created_at')).rows;
 assert.deepEqual(rows.map(r=>r.email_status),['accepted','failed']);
 assert.equal((await login({...body,proof:'forged'})).status,403);
 assert.equal((await db.pool.query('select count(*) from cwd_customer_login_alerts')).rows[0].count,'2');
 assert.equal((await read()).status,401);
 identity.email='customer@example.com';assert.equal((await read('customer')).status,403);
 identity.email='admin@example.com';identity.email_confirmed_at=null;assert.equal((await read('unconfirmed')).status,403);
 identity.email_confirmed_at=new Date().toISOString();
 const response=await read('admin');assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.logins.length,2);
 assert.deepEqual(Object.keys(data.logins[0]).sort(),['created_at','email_status','id','mobile','source']);
 const privileges=await db.setup.query("select has_table_privilege('anon','cwd_customer_login_alerts','SELECT') as anon,has_table_privilege('authenticated','cwd_customer_login_alerts','SELECT') as authenticated");
 assert.deepEqual(privileges.rows[0],{anon:false,authenticated:false});
 console.log('PASS: real PostgreSQL login alerts, OTP replay, email failure isolation, admin authorization, data minimization and database permissions. All external calls mocked.');
}finally{await db.close();}
