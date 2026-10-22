import {getBooking,startPayment,cancelPendingBooking} from './customer-checkout.js';
const container=document.getElementById('customer-bookings'),message=document.getElementById('booking-message');
const id=new URLSearchParams(location.search).get('booking_id');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
let bookings=[];
function render(){const filter=document.getElementById('booking-filter')?.value||'all';
 const shown=bookings.filter(b=>filter==='all'||(filter==='upcoming'?!['completed','cancelled'].includes(b.booking_status):b.booking_status===filter));
 container.innerHTML=shown.map(b=>`<article class="card booking-card" data-id="${escape(b.booking_id)}"><h2>${escape(b.booking_id)}</h2><p class="status">${b.booking_status==='confirmed'?'Booking confirmed':b.booking_status==='received'?'Booking saved — payment pending':escape(b.booking_status)}</p><dl><dt>Vehicle</dt><dd>${escape(b.car_name)}</dd><dt>Trip</dt><dd>${escape(b.booking_data.pickupLocation)}${b.booking_data.destination?' → '+escape(b.booking_data.destination):''}</dd><dt>Pickup (IST)</dt><dd>${escape(new Date(b.booking_data.pickupAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))}</dd><dt>Total fare</dt><dd>${money(b.total_fare)}</dd><dt>Payment status</dt><dd>${escape(b.payment_status.replaceAll('_',' '))}</dd><dt>Paid</dt><dd>${money(b.paid_amount)}</dd><dt>Outstanding balance</dt><dd>${money(b.outstanding)}</dd><dt>Driver</dt><dd>${escape(b.driver_status)}</dd></dl>${b.outstanding>0&&!['cancelled','completed'].includes(b.booking_status)?`<button type="button" data-pay>${b.booking_status==='received'?'Continue selected payment':'Pay outstanding balance'}</button>`:''}<details><summary>Payment history</summary><ul>${b.payments.length?b.payments.map(p=>`<li>${escape(p.payment_type)} · ${money(p.amount)} · ${escape(p.status)}</li>`).join(''):'<li>No payments received.</li>'}</ul></details><details><summary>Booking updates</summary><ul>${b.events.map(e=>`<li>${escape(e.event_type.replaceAll('_',' '))} · ${escape(new Date(e.created_at).toLocaleString('en-IN'))}</li>`).join('')}</ul></details><button class="secondary" type="button" data-print>Print / save confirmation</button><p class="small">This confirmation is not a tax invoice. Final trip extras and any invoice are reconciled separately.</p><a href="/contact">Contact support for changes or cancellation</a></article>`).join('')||'<p>No bookings in this category.</p>';
 for(const b of shown){
  const card=[...container.querySelectorAll('[data-id]')].find(node=>node.dataset.id===b.booking_id);
  const coupon=b.booking_data?.loginCoupon;
  if(coupon){
   const summary=document.createElement('p');summary.className='small';
   summary.textContent=`${coupon.code}: ${money(coupon.grossPaise/100)} before coupon − ${money(coupon.discountPaise/100)} savings = ${money(coupon.totalPaise/100)}. ${b.booking_status==='received'?'Coupon reserved; redeemed only on confirmation.':''}`;
   card.querySelector('dl').after(summary);
  }
  if(b.booking_status==='received'&&Number(b.paid_amount)===0){
   const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancel pending booking';
   cancel.addEventListener('click',async()=>{cancel.disabled=true;try{await cancelPendingBooking(b.booking_id);await load();message.textContent='Pending booking cancelled. Any unused coupon reservation was released.';}catch(e){message.textContent=e.message;cancel.disabled=false;}});
   card.append(cancel);
  }
 }
}
async function load(){try{if(id)bookings=[await getBooking(id)];else{const r=await fetch('/api/customer-bookings',{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.message);bookings=data.bookings;}message.textContent='';render();}catch(e){message.dataset.error='true';message.textContent=e.message;container.innerHTML='<a href="/customer-account">Sign in with mobile OTP</a>';}}
async function pay(booking){message.dataset.error='false';message.textContent='Opening secure payment…';container.querySelectorAll('button').forEach(b=>b.disabled=true);try{await startPayment(booking.booking_id,booking.booking_status!=='received');await load();}catch(e){message.dataset.error='true';message.textContent=e.message;}finally{container.querySelectorAll('button').forEach(b=>b.disabled=false);}}
container.addEventListener('click',event=>{const card=event.target.closest('[data-id]');if(!card)return;if(event.target.closest('[data-pay]'))pay(bookings.find(b=>b.booking_id===card.dataset.id));if(event.target.closest('[data-print]'))window.print();});
document.getElementById('booking-filter')?.addEventListener('change',render);
await load();if(id&&bookings.length&&new URLSearchParams(location.search).get('pay')==='1'){history.replaceState(null,'','?booking_id='+encodeURIComponent(id));await pay(bookings[0]);}
