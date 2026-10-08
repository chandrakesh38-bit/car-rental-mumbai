import { snapshot, history, updateDetails, parseLocal, tripDays, moneyRound } from '../lib/booking-modification.mjs';
// Booking modification API: testing branch only.
import { syncSecurityDepositReceived } from '../lib/security-deposit-accounting.mjs';

const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const roleKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
async function requireAdmin(request){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token||!base()||!roleKey())fail('Admin authentication required.',401);
  const publicKey=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!publicKey)fail('Admin public key is not configured.',503);
  const res=await fetch(base()+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:'Bearer '+token}});
  if(!res.ok)fail('Admin session expired.',401);
  const user=await res.json();
  const allowed=String(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allowed.includes(String(user.email||'').toLowerCase()))fail('Admin access denied.',403);
  return user;
}
async function db(path,options={}){
  const res=await fetch(base()+'/rest/v1/'+path,{...options,headers:{apikey:roleKey(),Authorization:'Bearer '+roleKey(),'Content-Type':'application/json',...(options.headers||{})}});
  const raw=await res.text();
  if(!res.ok)fail('Database request failed ('+res.status+'): '+raw.slice(0,180),503);
  return raw?JSON.parse(raw):null;
}

const bookPath = id => 'inquiries?booking_id=eq.' + encodeURIComponent(id);
const payPath = id => 'booking_payments?booking_id=eq.' + encodeURIComponent(id);
async function getBooking(id) {
  const items = await db(bookPath(id) + '&select=*&limit=1');
  if (!items?.[0]) fail('Booking not found.', 404);
  return items[0];
}

const getPayments = id => db(payPath(id) + '&select=*&order=created_at.desc');
const sumPaid = rows => moneyRound((rows || []).filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0));
const validId = id => /^CWD-WD-\d{6}-\d{4}$/.test(id);

export async function GET(request) {
  try {
    await requireAdmin(request);
    const id = new URL(request.url).searchParams.get('booking_id') || '';
    if (!validId(id)) fail('Invalid booking ID.');
    const b = await getBooking(id), payments = await getPayments(id);
    return json({success:true,booking_id:id,customer_name:b.customer_name,customer_phone:b.customer_phone,
      current:snapshot(b,sumPaid(payments)),history:history(b.booking_details).slice(0,30)});
  } catch (error) { return json({success:false,message:error.message || 'Modification cannot load.'},error.status || 500); }
}


function validAmount(value,label){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>10000000||Math.abs(n*100-Math.round(n*100))>0.001)fail('Invalid '+label+'.');
  return moneyRound(n);
}
function calculateChange(booking,current,body){
  if(!current.eligible)fail('Completed or cancelled bookings cannot be modified.',409);
  const reason=String(body.reason||'').replace(/[\r\n]+/g,' ').trim();
  if(reason.length<4||reason.length>500)fail('Enter a modification reason (4 to 500 characters).');
  const rental=validAmount(body.rental_amount,'rental amount');
  const deposit=current.is_self_drive?validAmount(body.security_deposit,'security deposit'):0;
  const delivery=current.is_self_drive?validAmount(body.delivery_charge,'delivery charge'):0;
  if(current.is_self_drive&&deposit!==current.security_deposit&&(current.paid_amount>0||current.deposit_refunded))
    fail('Security deposit cannot change after a payment or refund is recorded.',409);
  let pickup=null,returnDate=null;
  if(current.dates_supported){
    pickup=parseLocal(body.pickup_at);
    returnDate=current.supports_return?parseLocal(body.return_at):null;
    if(!pickup||(current.supports_return&&!returnDate))fail('Invalid pickup or return date and time.');
    if(current.supports_return&&returnDate<=pickup)fail('Return must be after pickup.');
    if(current.is_self_drive&&(returnDate-pickup)/3600000<24)fail('Self Drive bookings require minimum 24 hours.');
    if(current.booking_status==='ongoing'&&body.pickup_at!==current.pickup_at)fail('Pickup time is locked after the trip begins.',409);
  }else if(body.pickup_at||body.return_at)fail('This booking has an unsupported date format; dates cannot be edited.',409);
  const km=current.trip_type==='outstation'&&current.included_km!==null?validAmount(body.included_km,'included KM'):null;
  const days=current.trip_type==='outstation'&&pickup&&returnDate?tripDays(pickup,returnDate):current.trip_days;
  const base=moneyRound(rental+deposit+delivery),total=moneyRound(base+current.extras_amount);
  const changed=rental!==current.rental_amount||deposit!==current.security_deposit||delivery!==current.delivery_charge||
    (current.dates_supported&&(body.pickup_at!==current.pickup_at||(current.supports_return&&body.return_at!==current.return_at)))||
    (km!==null&&km!==current.included_km);
  if(!changed)fail('No booking changes were entered.');
  return {reason,rental,deposit,delivery,pickup,returnDate,km,days,base,total};
}


async function razor(path,method='GET'){
  const id=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
  if(!id||!secret)fail('Razorpay configuration is missing.',503);
  const res=await fetch('https://api.razorpay.com/v1/'+path,{method,headers:{Authorization:'Basic '+btoa(id+':'+secret),'Content-Type':'application/json'}});
  const result=await res.json().catch(()=>({}));
  if(!res.ok)fail(result?.error?.description||'Razorpay request failed.',502);
  return result;
}
async function cancelPendingPayments(id,rows){
  for(const row of rows.filter(p=>p.status==='pending'&&p.razorpay_payment_link_id)){
    const ref=encodeURIComponent(row.razorpay_payment_link_id);
    const remote=await razor('payment_links/'+ref);
    let patch=null;
    if(remote.status==='paid'){
      const payment=Array.isArray(remote.payments)?remote.payments.find(p=>p.status==='captured'):null;
      if(!payment)fail('A payment may have just arrived. Refresh before modifying this booking.',409);
      patch={status:'paid',razorpay_payment_id:payment.id,paid_at:new Date((payment.created_at||Math.floor(Date.now()/1000))*1000).toISOString()};
    }else if(['cancelled','expired'].includes(remote.status))patch={status:'cancelled',cancelled_at:new Date().toISOString()};
    else if(['created','issued'].includes(remote.status)){
      await razor('payment_links/'+ref+'/cancel','POST');
      patch={status:'cancelled',cancelled_at:new Date().toISOString()};
    }else fail('An unsettled Razorpay payment link needs review before modification.',409);
    await db('booking_payments?id=eq.'+encodeURIComponent(row.id),{
      method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})
    });
  }
  return getPayments(id);
}

export async function POST() { return json({success:false,message:'Modification is not yet enabled.'},503); }
