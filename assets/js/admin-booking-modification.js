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
