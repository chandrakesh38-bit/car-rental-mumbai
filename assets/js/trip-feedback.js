(()=>{
 const token=new URLSearchParams(location.hash.slice(1)).get('t')||'';
 const status=document.getElementById('status'),form=document.getElementById('feedback-form'),button=document.getElementById('submit-feedback');
 async function call(body){
  const response=await fetch('/api/trip-feedback',{method:body?'POST':'GET',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{'x-feedback-token':token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||'Unable to load feedback. Please retry.');return data;
 }
 call().then(data=>{status.textContent=data.submitted?'Thank you! Your feedback has been recorded.':'Booking '+data.booking_id;form.hidden=data.submitted;}).catch(error=>{status.textContent=error.message;});
 form.addEventListener('submit',async event=>{
  event.preventDefault();button.disabled=true;status.textContent='Saving your feedback…';
  try{await call({rating:Number(new FormData(form).get('rating')),comment:document.getElementById('comment').value});form.hidden=true;status.textContent='Thank you! Your feedback has been recorded.';}
  catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 });
})();
