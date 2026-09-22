import { BUCKET, DOC_KINDS, db, rpc, supabase, filesFor, fail, decryptToken, config as storageConfig } from '../lib/self-drive-documents.mjs';
import { notifyDocumentEvent } from '../lib/self-drive-review-notifications.mjs';
export const config={runtime:'edge'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function requireAdmin(request) {
  const authorization=request.headers.get('authorization');
  if(!authorization?.startsWith('Bearer '))fail('Sign in through the existing admin panel.',401);
  const response=await supabase('/auth/v1/user',{method:'GET',headers:{Authorization:authorization}});
  if(!response.ok)fail('Your admin session has expired. Sign in again.',401);
  const user=await response.json();
  const allowed=(process.env.SELF_DRIVE_ADMIN_EMAILS||'carwithdriver.vikhroli@gmail.com').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!user.id||!user.email_confirmed_at||!allowed.includes(String(user.email||'').toLowerCase()))fail('This account is not authorized to review documents.',403);
  return user;
}
export default async function handler(request) {
  if(request.method!=='POST')return json({success:false,message:'Only POST requests are allowed.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({success:false,message:'Invalid request origin.'},403);
  try {
    const admin=await requireAdmin(request);
    const raw=await request.text();if(raw.length>16000)fail('Request too large.',413);
    const {bookingId,action,kind,decisions}=JSON.parse(raw);
    if(!/^CWD-WD-\d{6}-\d{4}$/.test(bookingId||''))fail('Enter a valid Booking ID.');
    const [row]=await db('self_drive_verifications',`?booking_id=eq.${bookingId}`);
    if(!row)fail('Booking not found.',404);
    const origin=new URL(request.url).origin;
    if(action==='read')return json({success:true,booking:{booking_id:row.booking_id,status:row.status,customer_name:row.customer_name,customer_email:row.customer_email,customer_phone:row.customer_phone,alternate_phone:row.alternate_phone,enquiry_details:row.enquiry_details,submitted_at:row.submitted_at,verified_at:row.verified_at,notification_pending:Boolean(row.notification_event_id&&!row.notification_sent_at)},files:await filesFor(bookingId)});
    if(action==='preview') {
      if(!DOC_KINDS.includes(kind))fail('Invalid document field.');
      const [file]=await db('self_drive_document_files',`?booking_id=eq.${bookingId}&kind=eq.${kind}&select=storage_path`);
      if(!file)fail('Document not found.',404);
      const response=await supabase(`/storage/v1/object/sign/${BUCKET}/${file.storage_path}`,{method:'POST',body:JSON.stringify({expiresIn:60})});
      if(!response.ok)fail('Unable to open preview. Please retry.',503);
      const data=await response.json(),base=storageConfig().url;
      const signedUrl=new URL(base+'/storage/v1'+data.signedURL);
      if(signedUrl.origin!==new URL(base).origin||!signedUrl.pathname.startsWith(`/storage/v1/object/sign/${BUCKET}/`))fail('Invalid preview response.',503);
      return json({success:true,preview_url:signedUrl.href,expires_in:60});
    }
    if(action==='notify')return json({success:true,email_sent:await notifyDocumentEvent(row,origin)});
    if(!['review','verify'].includes(action))fail('Invalid review action.');
    if(action==='review') {
      if(!Array.isArray(decisions)||!decisions.length||decisions.length>5||new Set(decisions.map(d=>d.kind)).size!==decisions.length)fail('Choose document review actions.');
      for(const d of decisions){
        if(!DOC_KINDS.includes(d.kind)||!['approved','reupload_required'].includes(d.status)||!Number.isInteger(d.revision)||d.revision<0)fail('Invalid document review.');
        if(d.status==='reupload_required'&&(typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>2000))fail('A reason is required for every re-upload request.');
      }
      if(decisions.some(d=>d.status==='reupload_required'))await decryptToken(row.upload_token_encrypted);
    }
    const saved=await rpc('sd_review_documents',{p_booking_id:bookingId,p_admin:admin.id,p_action:action,p_decisions:decisions||[]});
    const email_sent=await notifyDocumentEvent(saved,origin);
    return json({success:true,status:saved.status,email_sent});
  } catch(error){return json({success:false,message:error.status?error.message:'Unable to review documents. Please retry.'},error.status||503);}
}
