import assert from 'node:assert/strict';
import {sendCheckoutEmail} from '../lib/checkout-email.mjs';
Object.assign(process.env,{VERCEL_ENV:'production',CWD_TRANSACTIONAL_EMAIL_ENABLED:'true',RESEND_API_KEY:'fixture'});
const cfg={url:'https://db.fixture.invalid',key:'fixture'};
let job={id:'job',status:'pending',attempts:0},emails=0,providerFails=false,email='customer@example.invalid';
globalThis.fetch=async(url,options={})=>{
 if(url==='https://api.resend.com/emails'){emails++;assert.equal(options.headers['Idempotency-Key'],'checkout/job');return providerFails?Response.json({},{status:503}):Response.json({id:'email-fixture'});}
 const u=new URL(url),body=options.body?JSON.parse(options.body):null;
 if(u.pathname.endsWith('cwd_booking_events'))return Response.json([{id:'event',event_type:'booking_confirmed'}]);
 if(u.pathname.endsWith('inquiries'))return Response.json([{booking_id:'123456',customer_email:email,booking_status:'confirmed',total_fare:5000,paid_amount:0}]);
 assert.ok(u.pathname.endsWith('cwd_notification_outbox'));
 if(options.method==='PATCH'){
  if(u.searchParams.has('status')&&(u.searchParams.get('status')!=='eq.'+job.status||u.searchParams.get('attempts')!=='eq.'+job.attempts))return Response.json([]);
  Object.assign(job,body);return Response.json([{...job}]);
 }
 return Response.json([{...job}]);
};
await Promise.all([sendCheckoutEmail(cfg,'123456'),sendCheckoutEmail(cfg,'123456')]);assert.equal(emails,1);assert.equal(job.status,'accepted');
await sendCheckoutEmail(cfg,'123456');assert.equal(emails,1);
job={id:'job',status:'pending',attempts:0};providerFails=true;await sendCheckoutEmail(cfg,'123456');assert.equal(job.status,'failed');
providerFails=false;await sendCheckoutEmail(cfg,'123456');assert.equal(job.status,'accepted');assert.equal(job.attempts,2);
job={id:'job',status:'pending',attempts:0};email='';const before=emails;await sendCheckoutEmail(cfg,'123456');assert.equal(job.status,'skipped');assert.equal(emails,before);
globalThis.fetch=async()=>{throw Error('offline')};await sendCheckoutEmail(cfg,'123456');
console.log('PASS concurrent email claims, provider idempotency, retries, optional email and failure isolation. No real emails sent.');
