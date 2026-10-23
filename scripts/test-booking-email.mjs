import assert from 'node:assert/strict';
import {bookingEmail} from '../lib/booking-email.mjs';
import {sendCheckoutEmail} from '../lib/checkout-email.mjs';
import worker from '../api/booking-notifications.js';
const booking={booking_id:'123456',customer_email:'fixture@example.invalid',customer_name:'A <script> & "B"\nInjected',trip_type:'Outstation',route:'Mumbai → Pune',car_name:'Ertiga',booking_status:'confirmed',payment_status:'pending',total_fare:5000,paid_amount:0};
const trip={pickupLocation:'Mumbai',destination:'Pune',pickupAt:'2026-10-23T20:00:00Z',returnAt:'2026-10-25T12:30:00+05:30',access_token:'NEVER_INCLUDE'};
const formatted=bookingEmail({...booking,trip},'booking_confirmed');
assert.match(formatted.text,/24 Oct 2026, 01:30 am IST/);
assert.match(formatted.text,/25 Oct 2026, 12:30 pm IST/);
assert.match(formatted.text,/Customer: A <script> & "B" Injected/);
assert.ok(!('html' in formatted));assert.ok(!formatted.text.includes('NEVER_INCLUDE'));
assert.match(formatted.text,/Booking status: confirmed\nPayment status: unpaid/);
for(const [paid,status,balance] of [[0,'unpaid','5,000.00'],[1000,'partially paid','4,000.00'],[5000,'paid','0.00']]){
 const result=bookingEmail({...booking,paid_amount:paid},'booking_confirmed');assert.ok(result.text.includes('Payment status: '+status));assert.ok(result.text.includes('Balance: INR '+balance));
}
const missing=bookingEmail({booking_id:'123456',trip:{pickupAt:'bad',returnAt:'2026-10-23T12:30:00'}},'booking_confirmed').text;
assert.doesNotMatch(missing,/undefined|NaN|null|Pickup:|Return \/ final drop:/);assert.match(missing,/Fare: Not available/);
Object.assign(process.env,{VERCEL_ENV:'production',CWD_TRANSACTIONAL_EMAIL_ENABLED:'true',RESEND_API_KEY:'fixture',CWD_CUSTOMER_ACCOUNTS_ENABLED:'true',CWD_CHECKOUT_ENABLED:'true',CWD_CUSTOMER_SUPABASE_URL:'https://db.fixture.invalid',CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_URL:'https://db.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',CWD_NOTIFICATION_WORKER_SECRET:'fixture',VERCEL_GIT_COMMIT_REF:'testing'});
let job,mails=[],fail=false;
const reset=()=>{job={id:'job',event_id:'event',channel:'email',status:'pending',attempts:0};};reset();
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url),body=options.body?JSON.parse(options.body):null;
 if(u.hostname==='api.resend.com'){mails.push({body,key:options.headers['Idempotency-Key']});return fail?Response.json({},{status:503}):Response.json({id:'mock'});}
 assert.equal(u.hostname,'db.fixture.invalid');
 if(u.pathname.endsWith('/cwd_notification_claim')){if(!['pending','failed'].includes(job.status)||job.attempts>=5)return Response.json([]);job.status='processing';job.attempts++;return Response.json([{...job}]);}
 if(u.pathname.endsWith('/cwd_booking_events'))return Response.json([{id:'event',event_type:'booking_confirmed',booking_id:'123456'}]);
 if(u.pathname.endsWith('/inquiries'))return Response.json([booking]);
 if(u.pathname.endsWith('/cwd_checkout_bookings')){assert.equal(u.searchParams.get('select'),'booking_data');return Response.json([{booking_data:trip}]);}
 assert.ok(u.pathname.endsWith('/cwd_notification_outbox'));
 if(options.method==='PATCH'){if(u.searchParams.has('status')&&(u.searchParams.get('status')!=='eq.'+job.status||u.searchParams.get('attempts')!=='eq.'+job.attempts))return Response.json([]);Object.assign(job,body);}
 return Response.json([{...job}]);
};
await sendCheckoutEmail({url:'https://db.fixture.invalid',key:'fixture'},'123456');assert.equal(job.status,'accepted');
const immediate=mails[0];reset();process.env.VERCEL_ENV='preview';
const run=()=>worker(new Request('https://fixture.invalid/api/booking-notifications',{method:'POST',headers:{authorization:'Bearer fixture'}}));
assert.equal((await run()).status,200);assert.equal(job.status,'accepted');assert.deepEqual(mails[1],immediate);
assert.equal(immediate.body.text,formatted.text);assert.equal(immediate.key,'checkout/job');assert.ok(!immediate.body.html);
await run();assert.equal(mails.length,2);reset();fail=true;await run();assert.equal(job.status,'failed');fail=false;await run();assert.equal(job.status,'accepted');assert.equal(job.attempts,2);assert.equal(mails[2].key,mails[3].key);
reset();booking.customer_email='';const before=mails.length;await run();assert.equal(job.status,'skipped');assert.equal(mails.length,before);
assert.equal((await worker(new Request('https://fixture.invalid',{method:'POST'}))).status,401);
console.log('PASS email details, missing fields, payment states, IST, plain-text escaping, immediate/retry parity, retry and idempotency (all fetches mocked).');
