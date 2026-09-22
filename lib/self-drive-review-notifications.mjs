import { sendEmail } from './notifications.mjs';
import { db, filesFor, decryptToken } from './self-drive-documents.mjs';
const ADMIN='carwithdriver.vikhroli@gmail.com';
const labels={aadhaar:'Aadhaar Card',licence_front:'Driving Licence — Front',licence_back:'Driving Licence — Back',pan:'PAN Card',address_proof:'Current Address Proof'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function notifyDocumentEvent(row, origin) {
  if (!row.notification_event_id || row.notification_sent_at) return Boolean(row.notification_sent_at);
  try {
    const reference=row.booking_id, base=row.site_origin||origin;
    let to=ADMIN, subject, text, link, button;
    if(row.notification_kind==='submitted') {
      subject=`Documents Pending Review - ${reference}`;
      text=`Booking ID: ${reference}\nStatus: Pending Review\nName: ${row.customer_name}\nEmail: ${row.customer_email}\nMobile: ${row.customer_phone}\nAlternate mobile: ${row.alternate_phone}\n\n${row.enquiry_details}\n\nDocuments received for manual verification. This does not confirm a booking.`;
      link=`${base}/self-drive-review?booking=${encodeURIComponent(reference)}`;button='Review Documents';
    } else if(row.notification_kind==='reupload') {
      to=row.customer_email;subject=`Document Re-upload Required - ${reference}`;
      const files=row.notification_payload || (await filesFor(reference)).filter(f=>f.review_status==='reupload_required');
      const reasons=files.map(f=>`${labels[f.kind]}: ${f.rejection_reason}`).join('\n');
      text=`Booking ID: ${reference}\nDocument Re-upload Required\n\n${reasons}\n\nOnly these documents need replacing. Approved documents remain unchanged. Your existing secure link is valid for 7 days from this request. Uploading documents does not confirm your booking.`;
      link=`${base}/self-drive-documents#booking=${encodeURIComponent(reference)}&token=${await decryptToken(row.upload_token_encrypted)}`;button='Re-upload Documents';
    } else if(row.notification_kind==='verified') {
      to=row.customer_email;subject=`Documents Verified - ${reference}`;
      text=`Booking ID: ${reference}\nYour documents have been verified successfully by our team.\n\nDocument verification does not confirm your booking. Our team will contact you separately about booking confirmation.`;
    } else return false;
    const html=`<p>${escape(text).replaceAll('\n','<br>')}</p>`+(link?`<p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;background:#312e81;color:white;border-radius:8px;text-decoration:none">${button}</a></p>`:'');
    const sent=await sendEmail(to,subject,text+(link?'\n\n'+button+': '+link:''),`sd-review/${row.notification_event_id}`,ADMIN,html);
    if(sent) await db('self_drive_verifications',`?booking_id=eq.${reference}&notification_event_id=eq.${row.notification_event_id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({notification_sent_at:new Date().toISOString()})});
    return sent;
  } catch {console.error('Document notification unavailable');return false;}
}
