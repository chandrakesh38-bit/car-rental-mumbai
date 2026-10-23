import {bookingEmailData,bookingEmail} from '../lib/booking-email.mjs';
import {checkoutConfig,rpc} from '../lib/customer-checkout.mjs';
import {customerDb} from '../lib/customer-account.mjs';
import {sendEmail,validEmail} from '../lib/notifications.mjs';
export const config={runtime:'edge'};
export default async function handler(request){
 if(!['GET','POST'].includes(request.method))return Response.json({success:false},{status:405});
 const secret=request.method==='GET'?process.env.CRON_SECRET:process.env.CWD_NOTIFICATION_WORKER_SECRET;
 if(!secret||request.headers.get('authorization')!=='Bearer '+secret)return Response.json({success:false},{status:401});
 try{
  const cfg=checkoutConfig(),jobs=await rpc(cfg,'cwd_notification_claim',{});let accepted=0,failed=0;
  for(const job of jobs){
   let status='skipped',error='Channel not configured; no message sent.';
   if(job.channel==='email'&&process.env.CWD_TRANSACTIONAL_EMAIL_ENABLED==='true'){
    const events=await customerDb(cfg,'cwd_booking_events?id=eq.'+job.event_id+'&select=*&limit=1');
    const event=events?.[0],b=event?await bookingEmailData(cfg,event.booking_id):null;
    const sent=b&&validEmail(b.customer_email)&&await sendEmail(b.customer_email,bookingEmail(b,event.event_type).subject,
    bookingEmail(b,event.event_type).text,
    'checkout/'+job.id,'carwithdriver.vikhroli@gmail.com');
    if(b&&!validEmail(b.customer_email)){status='skipped';error='Customer did not provide an email address.';}
    else {status=sent?'accepted':'failed';error=sent?null:'Email provider did not accept the message.';if(sent)accepted++;else failed++;}
   }
   await customerDb(cfg,'cwd_notification_outbox?id=eq.'+job.id,{method:'PATCH',body:JSON.stringify({status,last_error:error,accepted_at:status==='accepted'?new Date().toISOString():null})});
  }
  return Response.json({success:true,accepted,failed},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({success:false,message:'Notification worker failed; queued events remain available for retry.'},{status:503});}
}
