// Reuse the existing admin panel's Supabase project/session, not a separate login system.
const client=window.supabase?.createClient('https://pwciaihqkfnlenxxiown.supabase.co','sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz');
const labels={aadhaar:'Aadhaar Card',licence_front:'Driving Licence — Front',licence_back:'Driving Licence — Back',pan:'PAN Card',address_proof:'Current Address Proof'};
const names={pending:'Pending',approved:'Approved ✓',reupload_required:'Re-upload Required',pending_verification:'Pending Review',verified:'Verified',awaiting_documents:'Awaiting Documents'};
const el=id=>document.getElementById(id),drafts=new Map();let bookingId='',busy=false,loadVersion=0;
const report=(text,error=false)=>{el('review-message').textContent=text;el('review-message').classList.toggle('error',error);};
async function api(action,data={}) {
  const requestBookingId=bookingId;
  const session=client?(await client.auth.getSession()).data.session:null;
  if(!session){el('review-login').hidden=false;throw Error('Sign in using the existing admin panel, then click Check Sign-in.');}
  const response=await fetch('/api/self-drive-review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({bookingId:requestBookingId,action,...data})});
  const result=await response.json();
  if(!response.ok||!result.success){if(response.status===401)el('review-login').hidden=false;throw Error(result.message||'Review request failed.');}
  el('review-login').hidden=true;return result;
}
async function load() {
  const version=++loadVersion;
  el('review-content').hidden=true;drafts.clear();
  try {
    const result=await api('read');if(version!==loadVersion)return;const b=result.booking;const editable=b.status==='pending_verification';
    el('review-status').textContent=`${b.booking_id} — ${names[b.status]||b.status}`;
    el('review-customer').textContent=`${b.customer_name} · ${b.customer_email} · ${b.customer_phone} · Alternate: ${b.alternate_phone||'Not provided'}`;
    el('review-details').textContent=b.enquiry_details;el('review-cards').replaceChildren();
    for(const file of result.files){
      const card=document.createElement('section');card.className='card';card.dataset.kind=file.kind;
      const heading=document.createElement('h2');heading.textContent=labels[file.kind];card.append(heading);
      const status=document.createElement('p');status.textContent=names[file.review_status]||'Pending';card.append(status);
      if(file.rejection_reason){const reason=document.createElement('p');reason.textContent=file.rejection_reason;card.append(reason);}
      const preview=document.createElement('button');preview.type='button';preview.textContent='Preview Document';card.append(preview);
      const previewBox=document.createElement('div');previewBox.className='preview';card.append(previewBox);
      preview.onclick=async()=>{preview.disabled=true;try{const r=await api('preview',{kind:file.kind});previewBox.replaceChildren();const a=document.createElement('a');a.href=r.preview_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open document (link expires in 60 seconds)';previewBox.append(a);if(file.mime_type.startsWith('image/')){const img=document.createElement('img');img.src=r.preview_url;img.alt=labels[file.kind]+' private preview';img.referrerPolicy='no-referrer';previewBox.append(img);}}catch(e){report(e.message,true);}finally{preview.disabled=false;}};
      if(editable&&file.review_status==='pending'){
        const label=document.createElement('label');label.htmlFor='reason-'+file.kind;label.textContent='Reason for re-upload';card.append(label);
        const reason=document.createElement('textarea');reason.id=label.htmlFor;reason.maxLength=2000;reason.rows=3;reason.style.width='100%';card.append(reason);
        const buttons=document.createElement('div');buttons.className='actions';card.append(buttons);
        const approve=document.createElement('button');approve.type='button';approve.textContent='Approve';buttons.append(approve);
        const reject=document.createElement('button');reject.type='button';reject.textContent='Request Re-upload';buttons.append(reject);
        approve.onclick=()=>{drafts.set(file.kind,{kind:file.kind,revision:file.upload_revision,status:'approved'});status.textContent='Approved — not saved';};
        reject.onclick=()=>{if(!reason.value.trim()){reason.focus();report('Enter a reason before requesting re-upload.',true);return;}drafts.set(file.kind,{kind:file.kind,revision:file.upload_revision,status:'reupload_required',reason:reason.value.trim()});status.textContent='Re-upload Required — not saved';};
        reason.oninput=()=>{const draft=drafts.get(file.kind);if(draft?.status==='reupload_required')draft.reason=reason.value.trim();};
      }
      el('review-cards').append(card);
    }
    el('save-review').disabled=!editable;
    el('verify-documents').disabled=!editable||result.files.length!==5||result.files.some(f=>f.review_status!=='approved');
    el('retry-notification').hidden=!b.notification_pending;el('retry-notification').disabled=false;el('review-content').hidden=false;report('');
  }catch(e){if(version===loadVersion)report(e.message,true);}
}
async function mutate(action,data={}) {
  if(busy)return;busy=true;for(const b of el('review-content').querySelectorAll('button'))b.disabled=true;
  try{const result=await api(action,data);await load();report(result.email_sent?'Saved. Notification email sent.':'Saved. If a notification is pending, use Retry Notification Email.');}
  catch(e){await load();report(e.message,true);}
  finally{busy=false;}
}
el('find-booking').onsubmit=e=>{e.preventDefault();if(busy)return;bookingId=el('review-booking-id').value.trim();report('Loading…');load();};
el('check-session').onclick=()=>load();
el('save-review').onclick=()=>{if(!drafts.size){report('Choose at least one review action.',true);return;}mutate('review',{decisions:[...drafts.values()]});};
el('verify-documents').onclick=()=>mutate('verify');
el('retry-notification').onclick=()=>mutate('notify');
bookingId=new URLSearchParams(location.search).get('booking')||'';el('review-booking-id').value=bookingId;if(bookingId)load();

client?.auth.onAuthStateChange?.((_event,session)=>{if(!session){loadVersion++;el('review-content').hidden=true;el('review-cards').replaceChildren();drafts.clear();el('review-login').hidden=false;}});
