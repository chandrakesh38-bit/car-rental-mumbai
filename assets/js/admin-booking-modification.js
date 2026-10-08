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

function cwdRenderBookingEditor(data){
  const root=document.getElementById('cwd-modify-content'),c=data.current;
  if(!root)return;
  let html='';
  if(!c.eligible)html='<p class="text-xs font-semibold text-amber-800">Completed and cancelled bookings are locked. Existing records remain available below.</p>';
  else{
    html='<p class="text-xs text-slate-600 mb-3">Original booking ID and successful payment history stay unchanged. Changes will be logged.</p>';
    if(c.dates_supported){
      html+='<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">';
      html+=cwdModField('Pickup (India time)','cwd-mod-pickup',c.pickup_at,'type="datetime-local" required '+(c.booking_status==='ongoing'?'readonly':''));
      if(c.supports_return)html+=cwdModField('Return (India time)','cwd-mod-return',c.return_at,'type="datetime-local" required');
      html+='</div>';
    }else html+='<p class="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Existing date format is not supported for editing. You can still revise the agreed fare.</p>';
    html+='<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">';
    html+=cwdModField(c.is_self_drive?'Revised Rental ₹':'Revised Customer Fare ₹','cwd-mod-rent',c.rental_amount,'type="number" min="0" max="10000000" step="0.01" required');
    if(c.is_self_drive){
      html+=cwdModField('Refundable Security Deposit ₹','cwd-mod-deposit',c.security_deposit,'type="number" min="0" step="0.01" '+(c.paid_amount>0||c.deposit_refunded?'readonly':''));
      html+=cwdModField('Delivery Charge ₹','cwd-mod-delivery',c.delivery_charge,'type="number" min="0" step="0.01" required');
    }
    if(c.trip_type==='outstation'&&c.included_km!==null)
      html+=cwdModField('Revised Included KM','cwd-mod-km',c.included_km,'type="number" min="0" step="1" required');
    html+='</div>';
    if(c.trip_type==='outstation')html+='<p class="mb-3 text-xs text-amber-800">Outstation: confirm updated included KM and vendor package separately.</p>';
    if(!c.is_self_drive)html+='<p class="mb-3 text-xs text-amber-800">Vendor payout and allocation will not change automatically. Inform vendor separately.</p>';
    html+='<label class="block text-xs font-bold text-slate-700">Reason for Modification<textarea id="cwd-mod-reason" maxlength="500" rows="2" required placeholder="e.g. Customer requested early return" class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"></textarea></label>';
    html+='<div id="cwd-mod-preview" class="mt-3 rounded-xl border bg-white p-3 text-xs"></div>';
    html+='<button type="button" id="cwd-mod-save" class="mt-3 w-full rounded-xl bg-indigo-800 px-4 py-3 text-sm font-black text-white hover:bg-indigo-900">Save Booking Modification</button>';
  }
  if(data.history?.length)html+='<button type="button" id="cwd-mod-share" class="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Share Revised Confirmation on WhatsApp</button>';
  html+='<details class="mt-4 rounded-xl border bg-white p-3"><summary class="cursor-pointer text-xs font-bold">Modification History ('+(data.history?.length||0)+')</summary><div class="mt-2 max-h-60 overflow-y-auto">'+cwdModificationHistory(data.history)+'</div></details>';
  root.innerHTML=html;
  if(c.eligible)cwdBindBookingEditor();
  root.querySelector('#cwd-mod-share')?.addEventListener('click',cwdShareRevisedBooking);
}
