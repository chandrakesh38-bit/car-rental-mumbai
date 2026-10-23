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
  const rows=await customerDb(cfg,'inquiries?booking_id=eq.'+encodeURIComponent(bookingId)+'&select=booking_id,customer_email,booking_status,total_fare,paid_amount&limit=1');
  const b=rows?.[0];let status='failed',error='Booking unavailable.';
  if(b&&!validEmail(b.customer_email)){status='skipped';error='Customer did not provide an email address.';}
  else if(b){
   const sent=await sendEmail(b.customer_email,'CWD '+event.event_type.replaceAll('_',' ')+' - '+b.booking_id,
    `Booking ID: ${b.booking_id}\nBooking status: ${b.booking_status}\nFare: INR ${b.total_fare}\nPaid: INR ${b.paid_amount}\nBalance: INR ${Math.max(0,b.total_fare-b.paid_amount)}\nDriver allocation is managed separately.\nFor support: +91 9702988465`,
    'checkout/'+job.id,'carwithdriver.vikhroli@gmail.com');
   status=sent?'accepted':'failed';error=sent?null:'Email provider did not accept the message.';
  }
  await customerDb(cfg,'cwd_notification_outbox?id=eq.'+encodeURIComponent(job.id),{method:'PATCH',body:JSON.stringify({status,last_error:error,accepted_at:status==='accepted'?new Date().toISOString():null})});
 }catch{console.error('Checkout email remains queued for retry');}
}
