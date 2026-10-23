import {bookingEmailData,bookingEmail} from './booking-email.mjs';
import {customerDb} from './customer-account.mjs';
import {sendEmail,validEmail} from './notifications.mjs';

// Claim the latest email atomically. The daily outbox worker retries failures.
// Notification failure must never undo a saved booking or captured payment.
export async function sendCheckoutEmail(cfg,bookingId) {
 if(process.env.VERCEL_ENV!=='production'||process.env.CWD_TRANSACTIONAL_EMAIL_ENABLED!=='true')return;
 try {
  const events=await customerDb(cfg,'cwd_booking_events?booking_id=eq.'+encodeURIComponent(bookingId)+'&select=id,event_type&order=created_at.desc&limit=1');
  const event=events?.[0];if(!event)return;
  const jobs=await customerDb(cfg,'cwd_notification_outbox?event_id=eq.'+encodeURIComponent(event.id)+'&channel=eq.email&select=*');
  const job=jobs?.find(j=>['pending','failed'].includes(j.status)&&j.attempts<5);if(!job)return;
  const claimed=await customerDb(cfg,'cwd_notification_outbox?id=eq.'+encodeURIComponent(job.id)+'&status=eq.'+job.status+'&attempts=eq.'+job.attempts,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'processing',attempts:job.attempts+1,claimed_at:new Date().toISOString()})});
  if(!claimed?.length)return;
  const b=await bookingEmailData(cfg,bookingId);let status='failed',error='Booking unavailable.';
  if(b&&!validEmail(b.customer_email)){status='skipped';error='Customer did not provide an email address.';}
  else if(b){
   const sent=await sendEmail(b.customer_email,bookingEmail(b,event.event_type).subject,
    bookingEmail(b,event.event_type).text,
    'checkout/'+job.id,'carwithdriver.vikhroli@gmail.com');
   status=sent?'accepted':'failed';error=sent?null:'Email provider did not accept the message.';
  }
  await customerDb(cfg,'cwd_notification_outbox?id=eq.'+encodeURIComponent(job.id),{method:'PATCH',body:JSON.stringify({status,last_error:error,accepted_at:status==='accepted'?new Date().toISOString():null})});
 }catch{console.error('Checkout email remains queued for retry');}
}
