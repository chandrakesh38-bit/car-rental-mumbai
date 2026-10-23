let partnerPage=0, partnerCurrent=null, partnerListRequest=0, partnerDetailRequest=0;
const partnerMessage=text=>{document.getElementById('partner-message').textContent=text;};
async function loadPartnerApplications(page=partnerPage){
 const request=++partnerListRequest;partnerPage=Math.max(0,page);partnerMessage('Loading applications…');
 try{
  const data=await adminApi('/api/admin-partner-applications?status='+encodeURIComponent(document.getElementById('partner-filter').value)+'&page='+partnerPage);
  if(request!==partnerListRequest)return;
  const list=document.getElementById('partner-list');list.replaceChildren();
  for(const application of data.applications){
   const row=document.createElement('div');row.className='border rounded-lg p-3 flex flex-wrap gap-3 items-center';
   const label=document.createElement('span');label.textContent=[application.application_number||application.id,application.name,application.phone,[application.car_brand,application.car_model].filter(Boolean).join(' '),application.review_status].join(' · ');
   const button=document.createElement('button');button.textContent='Review';button.className='text-indigo-700 font-bold';button.onclick=()=>openPartnerApplication(application.id);row.append(label,button);list.append(row);
  }
  document.getElementById('partner-prev').disabled=partnerPage===0;document.getElementById('partner-next').disabled=!data.hasMore;
  partnerMessage(data.applications.length?'':'No applications in this category.');
 }catch(error){if(request===partnerListRequest)partnerMessage(error.message);}
}
async function openPartnerApplication(id){
 const request=++partnerDetailRequest;partnerCurrent=null;
 const panel=document.getElementById('partner-detail');panel.classList.remove('hidden');panel.textContent='Loading details…';
 try{
  const data=await adminApi('/api/admin-partner-applications?id='+encodeURIComponent(id));if(request!==partnerDetailRequest)return;
  partnerCurrent=data.application;panel.replaceChildren();
  for(const [label,key] of [['Application','application_number'],['Submitted','created_at'],['Name','name'],['Mobile','phone'],['Alternate mobile','alternate_phone'],['Email','email'],['Car brand','car_brand'],['Car model','car_model'],['Manufacturing year','mfg_year'],['Status','review_status'],['Reviewed by','reviewed_by'],['Reviewed at','reviewed_at']]){
   const line=document.createElement('p');line.textContent=label+': '+(partnerCurrent[key]??'—');panel.append(line);
  }
  const files=document.createElement('div');files.className='flex flex-wrap gap-3';
  for(const file of data.documents){const button=document.createElement('button');button.textContent='Open '+file.label;button.className='text-indigo-700 underline';button.onclick=async()=>{
   button.disabled=true;const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
   try{const result=await adminApi('/api/admin-partner-applications?id='+encodeURIComponent(id)+'&document='+encodeURIComponent(file.key));const link=new URL(result.url);if(link.protocol!=='https:')throw new Error('Invalid document link.');if(popup)popup.location.replace(link.href);else throw new Error('Allow pop-ups to view documents.');}catch(error){popup?.close();partnerMessage(error.message);}finally{button.disabled=false;}
  };files.append(button);}panel.append(files);
  const label=document.createElement('label');label.textContent='Review notes (required for rejection)';label.htmlFor='partner-notes';const notes=document.createElement('textarea');notes.id='partner-notes';notes.maxLength=2000;notes.className='w-full border rounded p-2';notes.value=partnerCurrent.review_notes||'';panel.append(label,notes);
  const actions=document.createElement('div');actions.className='flex gap-4';
  for(const [status,title] of [['approved','Approve'],['rejected','Reject'],['pending','Return to pending']]){const button=document.createElement('button');button.textContent=title;button.className='border rounded px-4 py-2';button.onclick=()=>savePartnerReview(status);actions.append(button);}panel.append(actions);
 }catch(error){if(request===partnerDetailRequest){panel.textContent=error.message;partnerCurrent=null;}}
}
async function savePartnerReview(status){
 if(!partnerCurrent)return;const current=partnerCurrent,notes=document.getElementById('partner-notes').value.trim();
 if(status==='rejected'&&!notes){partnerMessage('Add a reason for rejection.');document.getElementById('partner-notes').focus();return;}
 const panel=document.getElementById('partner-detail');panel.querySelectorAll('button,textarea').forEach(el=>el.disabled=true);
 try{await adminApi('/api/admin-partner-applications',{method:'POST',body:JSON.stringify({id:current.id,status,notes,version:current.review_version})});await loadPartnerApplications();await openPartnerApplication(current.id);partnerMessage('Application '+status+'.');}
 catch(error){partnerMessage(error.message);}
 finally{panel.querySelectorAll('button,textarea').forEach(el=>el.disabled=false);}
}
