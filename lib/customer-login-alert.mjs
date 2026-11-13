import {customerDb} from './customer-account.mjs';
import {sendEmail} from './notifications.mjs';
export async function sendLoginAlert(cfg,id) {
 const rows=await customerDb(cfg,'cwd_customer_login_alerts?id=eq.'+encodeURIComponent(id)+'&select=*&limit=1');
 const row=rows?.[0];
 if(!row||row.email_status==='accepted')return;
 const time=new Date(row.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
 const recipients=['carwithdriver.vikhroli@gmail.com','chandrakesh38@gmail.com'];
 const results=await Promise.all(recipients.map((recipient,index)=>sendEmail(recipient,'CWD: User logged in · +'+row.mobile,
  `A customer has successfully verified their mobile and logged in.\n\nMobile: +${row.mobile}\nLogin via: ${row.source==='coupon'?'CWD Privilege coupon unlock':'Customer login'}\nTime: ${time} IST\n\nThis is a login alert, not a booking confirmation. View Login Users in your CWD admin panel.`,
  'customer-login/'+row.id+(index===0?'':'/'+recipient),'carwithdriver.vikhroli@gmail.com')));
 const sent=results.every(Boolean);
 await customerDb(cfg,'cwd_customer_login_alerts?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({email_status:sent?'accepted':'failed',email_accepted_at:sent?new Date().toISOString():null})});
}
