const MAX = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const FIELDS = [['aadhaar','Aadhaar Card'],['licence_front','Driving Licence — Front'],['licence_back','Driving Licence — Back'],['pan','PAN Card'],['address_proof','Current Address Proof']];
export async function prepareFile(file) {
  if (!TYPES.includes(file.type)) throw Error('Unsupported file format... Use JPG, PNG or PDF.');
  if (!file.size) throw Error('Please select a non-empty file.');
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b) : new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-';
  if (!valid) throw Error('Unsupported file format... File contents do not match JPG, PNG or PDF.');
  if (file.size > 30 * 1024 * 1024 || (file.type === 'application/pdf' && file.size > MAX)) throw Error('File size too large... Maximum 5 MB per file.');
  let result = file;
  // Leave small images and all PDFs untouched. Keep a high-quality, readable copy.
  if (file.type !== 'application/pdf' && file.size > 1024 * 1024) {
    const image = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext('2d');ctx.fillStyle = '#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
      if (blob && blob.size < file.size * 0.9) result = new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
    } finally { image.close(); }
  }
  if (result.size > MAX) throw Error('File size too large... Maximum 5 MB per file.');
  return result;
}

const form = document.getElementById('documents-form');
if (form) initialize();
async function initialize() {
  const params = new URLSearchParams(location.hash.slice(1));
  const bookingId = params.get('booking'), token = params.get('token');
  const message = document.getElementById('page-message'), submit = document.getElementById('submit-documents');
  const states = new Map();let busy = false, preparing = 0;
  const report = (text,error=false)=>{message.textContent=text;message.classList.toggle('error',error);};
  const sizeText = size=>size>=1024*1024?(size/1024/1024).toFixed(2)+' MB':Math.ceil(size/1024)+' KB';
  async function api(action, data={}) {
    const response = await fetch('/api/self-drive-documents',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({bookingId,action,...data})});
    const result = await response.json();
    if (!response.ok || !result.success) throw Error(result.message || 'Unable to process documents. Please retry.');
    return result;
  }
  function render(state) {
    state.preview.replaceChildren();
    if (state.url) {URL.revokeObjectURL(state.url);state.url=null;}
    if (state.file?.type.startsWith('image/')) {const img=document.createElement('img');state.url=URL.createObjectURL(state.file);img.src=state.url;img.alt=state.label+' preview';state.preview.append(img);}
    else if (state.file || state.saved) {const card=document.createElement('div');card.className='pdf';card.textContent=state.file?.type==='application/pdf'||state.saved?.mime_type==='application/pdf'?'PDF document ready':'Document uploaded';state.preview.append(card);}
    const file=state.file||state.saved;state.info.textContent=file?`${file.name||file.filename} · ${sizeText(file.size||file.size_bytes)}`:'';
    state.reason.textContent=state.rejectionReason ? 'Re-upload Required: '+state.rejectionReason : '';
    state.reason.hidden=!state.rejectionReason;
    state.status.textContent=state.saved?(state.saved.review_status==='approved'?'Approved ✓':'Uploaded — Pending Review'):state.error?'Failed — '+state.error:state.file?'Ready to upload ✓':'Waiting';
    state.status.classList.toggle('error',Boolean(state.error));
    state.actions.hidden=!state.file||Boolean(state.saved);state.input.disabled=busy||Boolean(state.saved);state.input.hidden=Boolean(state.saved);state.input.labels[0].hidden=Boolean(state.saved);
  }
  for (const[kind,label]of FIELDS) {
    const card=document.createElement('section');card.className='card';
    const heading=document.createElement('h2');heading.textContent=label;card.append(heading);
    const fieldLabel=document.createElement('label');fieldLabel.htmlFor=kind;fieldLabel.textContent='Choose file';card.append(fieldLabel);
    const input=document.createElement('input');input.id=kind;input.type='file';input.accept='.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';card.append(input);
    // No capture attribute: mobile choosers can offer camera, gallery and files.
    const preview=document.createElement('div');preview.className='preview';card.append(preview);
    const info=document.createElement('p');info.className='filename';card.append(info);
    const status=document.createElement('p');status.className='status';status.setAttribute('aria-live','polite');card.append(status);
    const reason=document.createElement('p');reason.className='error';card.append(reason);
    const progress=document.createElement('progress');progress.max=100;progress.value=0;progress.hidden=true;progress.setAttribute('aria-label',label+' upload progress');card.append(progress);
    const actions=document.createElement('div');actions.className='actions';card.append(actions);
    const change=document.createElement('button');change.type='button';change.textContent='Change';change.onclick=()=>{if(!busy)input.click();};actions.append(change);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';actions.append(remove);
    const state={kind,label,input,preview,info,status,reason,progress,actions,file:null,saved:null,error:null,version:0,percent:0};states.set(kind,state);
    remove.onclick=()=>{if(busy)return;state.version++;state.file=null;state.error=null;input.value='';render(state);};
    input.onchange=async()=>{if(!input.files[0]||busy)return;const version=++state.version;const file=input.files[0];preparing++;submit.disabled=true;state.error=null;state.file=null;render(state);status.textContent='Preparing preview…';try{const ready=await prepareFile(file);if(version===state.version){state.file=ready;}}catch(e){if(version===state.version)state.error=e.message;}finally{preparing--;submit.disabled=busy||preparing>0;if(version===state.version)render(state);}};
    document.getElementById('document-cards').append(card);render(state);
  }
  function overall() {
    const percent=Math.round([...states.values()].reduce((n,s)=>n+s.percent,0)/FIELDS.length);
    document.getElementById('overall-progress').value=percent;
    document.getElementById('overall-status').textContent=`${busy?'Uploading':'Waiting'} — ${percent}%`;
  }
  function done(status='pending_verification') {form.hidden=true;const success=document.getElementById('success');success.hidden=false;if(status==='verified'){success.querySelector('h2').textContent='Documents Verified';success.querySelector('p').textContent='Our team has verified your documents. This does not confirm your booking; our team will contact you separately.';}else if(status==='rejected'){success.querySelector('h2').textContent='Please Contact Our Team';success.querySelector('p').textContent='Please contact our team about your document review.';}report('');}
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
  function upload(url,file,onprogress) {
    return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',file.type);xhr.setRequestHeader('x-upsert','false');xhr.timeout=120000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onprogress(Math.round(e.loaded/e.total*95));};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error('Upload failed. Please retry this file.'));xhr.onerror=()=>reject(Error('Network error. Please retry this file.'));xhr.ontimeout=()=>reject(Error('Upload timed out. Please retry this file.'));xhr.send(file);});
  }
  form.onsubmit=async e=>{
    e.preventDefault();if(busy||preparing)return;
    const alternatePhone=document.getElementById('alternate-phone').value.trim();
    if(!/^[6-9]\d{9}$/.test(alternatePhone)){report('Please enter a valid 10-digit alternate mobile number.',true);return;}
    if([...states.values()].some(s=>!s.saved&&!s.file)){report('Please select all required documents before submitting.',true);return;}
    busy=true;submit.disabled=true;document.getElementById('alternate-phone').disabled=true;report('Uploading. Please do not close or refresh this page.');document.getElementById('upload-progress').hidden=false;
    for(const s of states.values()){s.input.disabled=true;for(const b of s.actions.children)b.disabled=true;}
    try {
      for(const s of states.values()) {
        if(s.saved)continue;s.error=null;s.percent=0;s.progress.hidden=false;s.status.textContent='Uploading';overall();
        try {
          const meta={kind:s.kind,type:s.file.type,size:s.file.size,filename:s.file.name};
          const prepared=await api('prepare',meta);
          if(prepared.file)s.saved=prepared.file;
          else {
            try {await upload(prepared.upload_url,s.file,p=>{s.percent=p;s.progress.value=p;s.status.textContent=`Uploading — ${p}%`;overall();});}
            catch(error) { // Recover a PUT that completed despite a lost response.
              try {s.saved=(await api('verify',meta)).file;} catch {throw error;}
            }
            if(!s.saved)s.saved=(await api('verify',meta)).file;
          }
          s.percent=100;s.progress.value=100;render(s);overall();
        } catch(error){s.error=error.message;s.percent=0;render(s);overall();}
      }
      if([...states.values()].some(s=>!s.saved)) {report('Some documents failed. Click Retry Failed Files; uploaded documents will be kept.',true);submit.textContent='Retry Failed Files';}
      else {await api('submit',{alternatePhone});done();}
    } catch(error){report(error.message,true);submit.textContent='Retry Submit Documents';}
    finally {busy=false;submit.disabled=false;document.getElementById('alternate-phone').disabled=false;for(const s of states.values()){s.input.disabled=Boolean(s.saved);for(const b of s.actions.children)b.disabled=false;}const total=[...states.values()].filter(s=>s.saved).length;document.getElementById('overall-status').textContent=`${total===FIELDS.length?'Uploaded':'Waiting'} — ${Math.round(total/FIELDS.length*100)}%`;}
  };
  try {
    const result=await api('status');document.getElementById('booking-id').textContent=result.booking_id;
    for(const file of result.files){const s=states.get(file.kind);if(s){if(file.review_status==='reupload_required'){s.rejectionReason=file.rejection_reason;s.saved=null;s.percent=0;}else{s.saved=file;s.percent=100;}render(s);}}
    document.getElementById('alternate-phone').value=result.alternate_phone||'';
    if(!['awaiting_documents','reupload_required'].includes(result.status))done(result.status);else{form.hidden=false;if(result.status==='reupload_required'){document.querySelector('h1').textContent='Re-upload Documents';report('Replace only the requested documents below. Approved documents remain locked.');}else report('Choose each document, check the preview, then click Submit Documents.');}
  } catch(error){report(error.message,true);}
}
