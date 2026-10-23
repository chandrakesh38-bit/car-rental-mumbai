let feedbackPage=0,feedbackRequest=0;
async function loadTripFeedback(page=0){
 const request=++feedbackRequest;feedbackPage=Math.max(0,page);
 const status=document.getElementById('feedback-message'),list=document.getElementById('feedback-list');status.textContent='Loading feedback…';
 try{
  const data=await adminApi('/api/admin-vendor-ops?feedback=1&page='+feedbackPage);
  if(request!==feedbackRequest)return;list.replaceChildren();
  for(const row of data.feedback){
   const card=document.createElement('article');card.className='bg-white border rounded-xl p-4';
   const title=document.createElement('h3');title.className='font-bold';title.textContent=row.customer_name+' · '+row.rating+'/5 ★';
   const details=document.createElement('p');details.className='text-sm text-slate-500';details.textContent=row.booking_id+' · '+new Date(row.submitted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST';
   const comment=document.createElement('p');comment.style.whiteSpace='pre-wrap';comment.textContent=row.comment||'No written comment.';
   card.append(title,details,comment);list.append(card);
  }
  status.textContent=data.feedback.length?'':'No feedback submitted yet.';
  document.getElementById('feedback-prev').disabled=feedbackPage===0;document.getElementById('feedback-next').disabled=!data.hasMore;
 }catch(error){if(request===feedbackRequest)status.textContent=error.message;}
}
