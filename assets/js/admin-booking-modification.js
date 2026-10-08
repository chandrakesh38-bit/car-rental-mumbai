/* CWD Modify Booking: admin-only client UI, testing branch. */

(function startCwdBookingEditor() {
  'use strict';
  const body=document.getElementById('booking-detail-body');
  if(!body)return;
  const makeCard=()=>{
    if(document.getElementById('cwd-booking-modify-card'))return;
    const status=body.querySelector('#booking-status-select');
    if(!status)return;
    const box=document.createElement('section');
    box.id='cwd-booking-modify-card';
    box.className='mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/40';
    box.innerHTML='<details><summary class="cursor-pointer p-4 flex items-center justify-between gap-3">'
      +'<span class="text-sm font-black text-indigo-950">✏️ Modify Booking</span>'
      +'<span class="text-xs font-bold text-indigo-700">Edit dates, rent &amp; charges</span>'
      +'</summary><div id="cwd-modify-content" class="p-4 border-t border-indigo-100"></div></details>';
    const statusCard=status.closest('.mt-4');
    if(statusCard)statusCard.insertAdjacentElement('afterend',box);
    else body.prepend(box);
    box.querySelector('details').addEventListener('toggle',event=>{
      if(event.target.open)cwdLoadBookingEditor();
    });
  };
  new MutationObserver(makeCard).observe(body,{childList:true});
  makeCard();
})();
function cwdModId(){return document.getElementById('booking-detail-title')?.textContent?.trim()||'';}
function cwdModEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cwdModMoney(value){return '₹'+Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2});}
let cwdModContext=null;

async function cwdLoadBookingEditor() {
  const root=document.getElementById('cwd-modify-content'),id=cwdModId();
  if(!root||!id)return;
  root.innerHTML='<p class="text-xs text-slate-500">Loading editable booking details…</p>';
  try{
    const result=await adminApi('/api/admin-booking-modification?booking_id='+encodeURIComponent(id));
    if(id!==cwdModId()||!root.isConnected)return;
    cwdModContext=result;
    cwdRenderBookingEditor(result);
  }catch(error){if(root.isConnected)root.innerHTML='<p class="text-xs font-semibold text-rose-700">'+cwdModEsc(error.message||'Unable to load booking.')+'</p>';}
}
function cwdModificationHistory(items) {
  if(!items?.length)return '<p class="text-xs text-slate-500">No previous modifications.</p>';
  return items.map(item=>{
    const old=item.before||{},next=item.after||{};
    const change='Rent: '+cwdModMoney(old.rental)+' → '+cwdModMoney(next.rental)
      +' · Total: '+cwdModMoney(old.total)+' → '+cwdModMoney(next.total);
    const dates=(old.return||next.return)?' · Return: '+cwdModEsc(old.return||'—')+' → '+cwdModEsc(next.return||'—'):'';
    return '<div class="border-b border-slate-100 py-2 text-xs">'
      +'<div class="font-bold text-slate-700">'+cwdModEsc(new Date(item.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))
      +' · '+cwdModEsc(item.by)+'</div><div class="mt-1">'+cwdModEsc(change)+dates+'</div>'
      +'<div class="mt-1 text-slate-500">Reason: '+cwdModEsc(item.reason)+'</div></div>';
  }).join('');
}
function cwdModField(label,id,value,opts=''){
  return '<label class="text-xs font-bold text-slate-700">'+cwdModEsc(label)
    +'<input id="'+id+'" '+opts+' value="'+cwdModEsc(value)+'" class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"></label>';
}
