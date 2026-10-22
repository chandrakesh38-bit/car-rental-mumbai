import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {POST as checkout} from '../api/customer-checkout.mjs';
import account from '../api/customer-account.js';
import {verifyAccessToken} from '../lib/mobile-otp.mjs';
import {couponBreakdown} from '../lib/login-coupon.mjs';
import {createLocalDatabase} from './testing/postgres/local-database.mjs';
import {installFixtures,state,simulateCapture} from './testing/checkout-fixtures.mjs';
const db=await createLocalDatabase('cwd_coupon_test_'+Date.now());
installFixtures();state.databaseFetch=db.fetchDatabase;
const origin='https://coupon.testing.invalid',report=[];
let mobile=9800000000;
const record=name=>{report.push({name,passed:true});console.log('PASS '+name);};
async function proof(phone,purpose='booking'){
 const reqId=randomUUID();const token='header.'+Buffer.from(JSON.stringify({requestId:reqId,mobile:'91'+phone,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.signature';
 return (await verifyAccessToken(token,phone,purpose,origin,reqId)).proof;
}
async function call(handler,body,cookie='',token=''){
 const response=await handler(new Request(origin+'/api/customer-checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Booking '+token}:{})},body:JSON.stringify(body)}));
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(phone=String(++mobile)){
 const r=await call(account,{action:'login',phone,proof:await proof(phone,'customer')});assert.equal(r.status,200,JSON.stringify(r));return {phone,cookie:r.cookie};
}
const data=()=>({tripType:'outstation',carName:'Sedan (Dzire / Aura)',pickupAt:new Date(Date.now()+4*86400000).toISOString().slice(0,10)+'T03:30:00Z',returnAt:new Date(Date.now()+4*86400000).toISOString().slice(0,10)+'T12:30:00Z',pickupLocation:'Mumbai',pickupPlaceId:'Mumbai',destination:'Pune',destinationPlaceId:'Pune',journeyType:'round-trip',stops:[],customerAddress:'Local fixture address'});
const quote=(user,changes={})=>call(checkout,{action:'quote',couponCode:'CWDLOGIN10',phone:user.phone,bookingData:data(),...changes},user.cookie);
async function payload(user,choice=0,changes={}) {return {action:'create',name:'Coupon Test',phone:user.phone,email:'coupon@example.invalid',bookingData:data(),submissionKey:randomUUID(),otpProof:await proof(user.phone),paymentChoice:choice,couponCode:'CWDLOGIN10',expectedTotalPaise:423000,...changes};}
const create=async(user,choice=0,changes={})=>call(checkout,await payload(user,choice,changes),user.cookie);
const count=async(table,phone)=>Number((await db.setup.query('select count(*) n from '+table+' where mobile=$1',['91'+phone])).rows[0].n);
async function order(booking,user){const r=await call(checkout,{action:'order',booking_id:booking.booking_id},user.cookie,booking.access_token);assert.equal(r.status,200,JSON.stringify(r));return r.body.order;}
async function capture(booking,user,o){const payment=simulateCapture(o.razorpay_order_id);return call(checkout,{action:'verify',booking_id:booking.booking_id,...payment},user.cookie,booking.access_token);}
try {
 assert.equal(couponBreakdown(470000).discountPaise,47000);assert.equal(couponBreakdown(900000).discountPaise,50000);
 assert.equal(couponBreakdown(800000,400000).discountPaise,40000);assert.equal(couponBreakdown(800000,400000).totalPaise,760000);
 assert.throws(()=>couponBreakdown(100000,0,1));record('10%, ₹500 cap, paise rounding, deposit exclusion and no stacking');


 assert.equal(couponBreakdown(2000000,0,0,'CWD5').discountPaise,100000,'5% has no 500 rupee cap');
 assert.equal(couponBreakdown(800000,400000,0,'CWD5').discountPaise,20000);
 const firstFive=await login();
 const firstQuote=await quote(firstFive,{couponCode:'CWD5'});
 assert.equal(firstQuote.body.quote.code,'CWDLOGIN10');assert.equal(firstQuote.body.quote.discountPaise,47000);
 assert.equal((await create(firstFive,0,{couponCode:'CWD5',expectedTotalPaise:446500})).status,409);
 const firstHash=(await db.setup.query('select session_hash from cwd_customer_sessions s join cwd_customers c on c.id=s.customer_id where c.mobile=$1',['91'+firstFive.phone])).rows[0].session_hash;
 await assert.rejects(db.pool.query('select cwd_checkout_create_coupon($1,$2,now()+interval \'5 minutes\',$3,$4,0,470000,$5,$6,$7,$8)',[randomUUID(),'91'+firstFive.phone,randomUUID(),'a'.repeat(64),data(),{name:'Fixture'},firstHash,'CWD5']),/CWD_COUPON_FIRST/);
 assert.equal((await create(firstFive)).status,200);
 const repeatQuote=await quote(firstFive,{couponCode:'CWD5'});
 assert.equal(repeatQuote.body.quote.code,'CWD5');assert.equal(repeatQuote.body.quote.discountPaise,23500);
 assert.deepEqual(repeatQuote.body.quote.payments,{'0':0,'20':89300,'100':446500});
 assert.equal((await quote(firstFive,{couponCode:'CWD5',otherDiscountPaise:47000})).status,400);
 assert.equal((await quote(firstFive,{couponCode:['CWD5','CWDLOGIN10']})).status,400);
 for(const choice of [0,20,100]) {
  const b=await create(firstFive,choice,{couponCode:'CWD5',expectedTotalPaise:446500});assert.equal(b.status,200,JSON.stringify(b));
  if(choice){const o=await order(b.body,firstFive);assert.equal(Number(o.amount_paise),choice===20?89300:446500);assert.equal((await capture(b.body,firstFive,o)).status,200);}
  const saved=(await db.setup.query('select booking_data from cwd_checkout_bookings where booking_id=$1',[b.body.booking_id])).rows[0].booking_data;
  assert.equal(saved.loginCoupon.code,'CWD5');assert.equal(saved.loginCoupon.discountPaise,23500);
 }
 assert.equal(await count('cwd_login_coupon_redemptions',firstFive.phone),4);
 const duplicateFive=await payload(firstFive,0,{couponCode:'CWD5',expectedTotalPaise:446500});
 const fiveResults=await Promise.all(Array.from({length:6},()=>call(checkout,duplicateFive,firstFive.cookie)));
 assert.ok(fiveResults.every(r=>r.status===200));assert.equal(new Set(fiveResults.map(r=>r.body.booking_id)).size,1);
 assert.equal(await count('cwd_login_coupon_redemptions',firstFive.phone),5);
 assert.equal((await quote(firstFive,{couponCode:'CWDLOGIN10'})).status,409);
 const cancelFive=await create(firstFive,20,{couponCode:'CWD5',expectedTotalPaise:446500});
 assert.equal((await call(checkout,{action:'cancel-pending',booking_id:cancelFive.body.booking_id},firstFive.cookie,cancelFive.body.access_token)).status,200);
 assert.equal((await quote(firstFive,{couponCode:'CWD5'})).status,200);
 record('CWD5: first-time precedence in API and SQL, repeat uses, 0/20/full payment amounts, idempotency, cancellation, no stacking and no cap');
 const sessionUser=await login();
 const sessionBody=await payload(sessionUser,0,{otpProof:undefined});
 assert.equal((await call(checkout,sessionBody)).status,401);
 assert.equal((await call(checkout,{...sessionBody,phone:'8888888888'},sessionUser.cookie)).status,403);
 const sessionResults=await Promise.all(Array.from({length:8},()=>call(checkout,sessionBody,sessionUser.cookie)));
 assert.ok(sessionResults.every(r=>r.status===200),JSON.stringify(sessionResults));
 assert.equal(new Set(sessionResults.map(r=>r.body.booking_id)).size,1);
 assert.equal(await count('cwd_login_coupon_redemptions',sessionUser.phone),1);
 const expiredSessionUser=await login();
 await db.setup.query("update cwd_customer_sessions set created_at=now()-interval '2 days', expires_at=now()-interval '1 second' where customer_id=(select id from cwd_customers where mobile=$1)",['91'+expiredSessionUser.phone]);
 assert.equal((await call(checkout,await payload(expiredSessionUser,0,{otpProof:undefined}),expiredSessionUser.cookie)).status,401);
 record('Session booking without second OTP; guest, changed phone and expired session rejected; duplicate session submissions atomic');
 const user=await login();
 assert.equal((await quote({phone:user.phone})).status,401);
 assert.equal((await call(checkout,await payload(user))).status,401,'Booking OTP alone cannot redeem without login');
 assert.equal((await quote(user,{couponCode:'INVALID'})).status,400);
 assert.equal((await quote(user,{phone:'8888888888'})).status,403);
 assert.equal((await quote(user,{otherDiscount:1})).status,400);
 const q=await quote(user);assert.equal(q.status,200,JSON.stringify(q));assert.deepEqual(q.body.quote.payments,{'0':0,'20':84600,'100':423000});
 assert.equal(await count('cwd_login_coupon_uses',user.phone),0,'Applying is not reserving/redeeming');
 assert.equal((await create(user,0,{expectedTotalPaise:1})).status,409);
 record('Guest, wrong phone, invalid code, stacking and stale fare rejected; quote is read-only');
 const cap=await quote(user,{bookingData:{...data(),carName:'Maruti Suzuki Ertiga',totalFare:1,clientRouteKm:1}});
 assert.equal(cap.body.quote.discountPaise,50000);assert.equal(cap.body.quote.totalPaise,480000);record('Server reprices tampered client amounts and caps discount');
 const body=await payload(user);const attempts=await Promise.all(Array.from({length:8},()=>call(checkout,body,user.cookie)));
 assert.ok(attempts.every(r=>r.status===200),JSON.stringify(attempts));assert.equal(new Set(attempts.map(r=>r.body.booking_id)).size,1);
 assert.equal(await count('cwd_login_coupon_redemptions',user.phone),1);
 const booking=attempts[0].body;
 assert.equal((await quote(user)).status,409);assert.equal((await create(user)).status,409);
 const newSession=await login(user.phone);assert.equal((await quote(newSession)).status,409);
 assert.equal((await call(checkout,{action:'cancel-pending',booking_id:booking.booking_id},user.cookie,booking.access_token)).status,409);
 await db.setup.query("update inquiries set booking_status='cancelled' where booking_id=$1",[booking.booking_id]);
 assert.equal((await quote(newSession)).status,409);record('8 duplicate requests create one confirmation/redemption; re-login and post-confirmation cancellation cannot reuse');
 const racing=await login();const raceBodies=await Promise.all(Array.from({length:8},()=>payload(racing)));
 const races=await Promise.all(raceBodies.map(b=>call(checkout,b,racing.cookie)));
 assert.equal(races.filter(r=>r.status===200).length,1,JSON.stringify(races));assert.equal(await count('cwd_login_coupon_redemptions',racing.phone),1);
 record('8 distinct simultaneous submissions on real PostgreSQL: exactly one redemption');
 for(const choice of [20,100]){
  const paidUser=await login();const created=await create(paidUser,choice);assert.equal(created.status,200,JSON.stringify(created));
  assert.equal(await count('cwd_login_coupon_redemptions',paidUser.phone),0);
  assert.equal((await quote(paidUser)).status,409,'Pending coupon blocks another booking');
  const o=await order(created.body,paidUser);assert.equal(Number(o.amount_paise),choice===20?84600:423000);
  const captured=await capture(created.body,paidUser,o);assert.equal(captured.status,200,JSON.stringify(captured));
  assert.equal(await count('cwd_login_coupon_redemptions',paidUser.phone),1);assert.equal(Number(captured.body.booking.total_fare),4230);
  const replay=await db.pool.query('select cwd_checkout_capture($1,$2,$3,$4)',[o.razorpay_order_id,(await db.setup.query('select razorpay_payment_id from cwd_checkout_orders where id=$1',[o.id])).rows[0].razorpay_payment_id,o.amount_paise,'INR']);
  assert.equal(replay.rows[0].cwd_checkout_capture.duplicate,true);
 }
 record('20%/100% discounted orders, confirmation-only redemption and payment replay');
 const cancelling=await login(),pending=await create(cancelling,20);assert.equal(pending.status,200);
 const pendingOrder=await order(pending.body,cancelling);
 const cancelled=await call(checkout,{action:'cancel-pending',booking_id:pending.body.booking_id},cancelling.cookie,pending.body.access_token);assert.equal(cancelled.status,200,JSON.stringify(cancelled));
 assert.equal(await count('cwd_login_coupon_redemptions',cancelling.phone),0);assert.equal((await quote(cancelling)).status,200);
 const replacement=await create(cancelling,0);assert.equal(replacement.status,200);
 const late=await capture(pending.body,cancelling,pendingOrder);assert.equal(late.status,200,JSON.stringify(late));assert.equal(late.body.booking.booking_status,'cancelled');
 assert.equal(await count('cwd_login_coupon_redemptions',cancelling.phone),1);record('Pending cancellation releases reservation; late capture cannot revive cancelled booking or redeem twice');
 await assert.rejects(db.setup.query("update inquiries set booking_status='confirmed' where booking_id=$1",[pending.body.booking_id]));
 record('Released discounted booking cannot be re-confirmed to bypass lifetime redemption');
 for(let i=0;i<4;i++){
  const u=await login(),b=(await create(u,20)).body,o=await order(b,u);
  await Promise.all([call(checkout,{action:'cancel-pending',booking_id:b.booking_id},u.cookie,b.access_token),capture(b,u,o)]);
  const row=(await db.setup.query('select booking_status from inquiries where booking_id=$1',[b.booking_id])).rows[0];
  assert.ok(['confirmed','cancelled'].includes(row.booking_status));
  assert.equal(await count('cwd_login_coupon_redemptions',u.phone),row.booking_status==='confirmed'?1:0);
 }
 record('Concurrent cancellation and payment capture keep confirmation and redemption consistent');
 const rollback=await login(),bad=await payload(rollback);
 const session=(await db.setup.query('select session_hash from cwd_customer_sessions s join cwd_customers c on c.id=s.customer_id where c.mobile=$1',['91'+rollback.phone])).rows[0];
 await assert.rejects(db.pool.query('select cwd_checkout_create_coupon($1,$2,now()+interval \'5 minutes\',$3,$4,0,470000,$5,$6,$7,$8)',[randomUUID(),'91'+rollback.phone,bad.submissionKey,'bad',data(),{name:'x',email:'x@example.invalid'},session.session_hash,'CWDLOGIN10']));
 assert.equal(await count('cwd_login_coupon_uses',rollback.phone),0);assert.equal((await quote(rollback)).status,200);record('Failed booking transaction rolls back coupon and booking writes');
 const anonymous=await db.setup.connect();
 try {await anonymous.query('begin; set local role anon');await assert.rejects(anonymous.query('select * from cwd_login_coupon_redemptions'));}
 finally {await anonymous.query('rollback');anonymous.release();}
 const grants=await db.setup.query("select has_function_privilege('anon','cwd_checkout_create_coupon(text,text,timestamptz,uuid,text,integer,bigint,jsonb,jsonb,text,text)','execute') allowed");assert.equal(grants.rows[0].allowed,false);
 const auditGrants=await db.setup.query("select has_table_privilege('service_role','cwd_login_coupon_redemptions','UPDATE') upd,has_table_privilege('service_role','cwd_login_coupon_redemptions','DELETE') del");assert.deepEqual(auditGrants.rows[0],{upd:false,del:false});
 record('Anonymous roles cannot read coupon audit records or execute coupon RPC');
 const expired=await login();await db.setup.query('update cwd_customer_sessions set revoked_at=now() where customer_id=(select id from cwd_customers where mobile=$1)',['91'+expired.phone]);
 assert.equal((await quote(expired)).status,401);
 const revokedHash=(await db.setup.query('select session_hash from cwd_customer_sessions s join cwd_customers c on c.id=s.customer_id where c.mobile=$1',['91'+expired.phone])).rows[0].session_hash;
 await assert.rejects(db.pool.query('select cwd_checkout_create_coupon($1,$2,now()+interval \'5 minutes\',$3,$4,0,470000,$5,$6,$7,$8)',[randomUUID(),'91'+expired.phone,randomUUID(),'a'.repeat(64),data(),{name:'x',email:'x@example.invalid'},revokedHash,'CWDLOGIN10']),/CWD_COUPON_IDENTITY/);
 record('Revoked session rejected by API and rechecked inside the booking transaction');
}finally{
 await mkdir('.test-output/login-coupon',{recursive:true});await writeFile('.test-output/login-coupon/api-sql-report.json',JSON.stringify({database:db.name,engine:'PostgreSQL 18.4, actual SQL and concurrent connections',report},null,2));await db.close();
}
