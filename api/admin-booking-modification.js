// Vercel compiles file-based API handlers to CommonJS. Load ESM helpers lazily.
let bookingLogic;
async function loadBookingLogic() {
  bookingLogic ||= await import('../lib/booking-modification.mjs');
  return bookingLogic;
}
const snapshot = (...args) => bookingLogic.snapshot(...args);
const history = (...args) => bookingLogic.history(...args);
const updateDetails = (...args) => bookingLogic.updateDetails(...args);
const parseLocal = (...args) => bookingLogic.parseLocal(...args);
const tripDays = (...args) => bookingLogic.tripDays(...args);
const moneyRound = (...args) => bookingLogic.moneyRound(...args);
const pickupEditPolicy = (...args) => bookingLogic.pickupEditPolicy(...args);
const securityDepositAccounting = () => import('../lib/security-deposit-accounting.mjs');

const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const roleKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const isPreviewOnly=()=>process.env.VERCEL_ENV!=='production'&&process.env.CWD_BOOKING_MODIFICATION_PREVIEW_WRITES!=='enabled';
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

async function getPickupPolicy(id,current) {
  if (!current.eligible || !current.dates_supported || current.is_self_drive)
    return pickupEditPolicy(current);
  try {
    const events = await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id)+'&select=started_at,ended_at&limit=1');
    const row=events?.[0];
    return pickupEditPolicy(current,{trip_started:!!(row?.started_at||row?.ended_at)});
  } catch {
    return {editable:false,requires_confirmation:false,reason:'Cannot verify vendor trip start status. Please retry.'};
  }
}

export async function GET(request) {
  try {
    await requireAdmin(request);
    await loadBookingLogic();
    const id = new URL(request.url).searchParams.get('booking_id') || '';
    if (!validId(id)) fail('Invalid booking ID.');
    const b = await getBooking(id), payments = await getPayments(id);
    const current=snapshot(b,sumPaid(payments));
    const policy=await getPickupPolicy(id,current);
    return json({success:true,booking_id:id,customer_name:b.customer_name,customer_phone:b.customer_phone,
      current:{...current,pickup_editable:policy.editable,pickup_confirmation_required:policy.requires_confirmation,
        pickup_lock_reason:policy.reason},history:history(b.booking_details).slice(0,30),preview_only:isPreviewOnly()});
  } catch (error) { return json({success:false,message:error.message || 'Modification cannot load.'},error.status || 500); }
}


function validAmount(value,label){
  if(value==null||value==='')fail(label+' is required.');
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>10000000||Math.abs(n*100-Math.round(n*100))>0.001)fail('Invalid '+label+'.');
  return moneyRound(n);
}
function calculateChange(booking,current,body,policy){
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
    if(body.pickup_at!==current.pickup_at) {
      if(!policy?.editable) fail(policy?.reason || 'Pickup cannot be modified after the trip has started.',409);
      if(policy.requires_confirmation && body.confirm_trip_not_started!==true)
        fail('Please confirm that this booking has not actually started before modifying pickup.',409);
    }
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


async function modifyBooking(request){
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)fail('Invalid request origin.',403);
  const user=await requireAdmin(request);
  await loadBookingLogic();
  const raw=await request.text();
  if(raw.length>15000)fail('Modification request is too large.',413);
  const body=JSON.parse(raw),id=String(body.booking_id||'');
  if(!validId(id))fail('Invalid booking ID.');
  const b=await getBooking(id);
  if(String(body.expected_updated_at??'')!==String(b.updated_at??''))fail('Booking was updated. Refresh and retry.',409);
  let payments=await getPayments(id);
  const old=snapshot(b,sumPaid(payments));
  const pickupPolicy=await getPickupPolicy(id,old);
  const change=calculateChange(b,old,body,pickupPolicy);
  if(isPreviewOnly())return json({success:true,preview_only:true,simulation:{previous_total:old.total_fare,revised_total:change.total,paid:old.paid_amount,balance:Math.max(0,moneyRound(change.total-old.paid_amount)),excess_paid:Math.max(0,moneyRound(old.paid_amount-change.total)),revised_return:change.returnDate?.toISOString()||null}});
  payments=await cancelPendingPayments(id,payments);
  const paid=sumPaid(payments);
  if(String(body.expected_updated_at??'')!==String((await getBooking(id)).updated_at??''))fail('Booking changed while payment links were checked. Refresh.',409);
  const now=new Date().toISOString();
  const entry={at:now,by:String(user.email||'').toLowerCase(),reason:change.reason,
    before:{pickup:old.pickup_at,return:old.return_at,rental:old.rental_amount,deposit:old.security_deposit,
      delivery:old.delivery_charge,total:old.total_fare,included_km:old.included_km},
    after:{pickup:change.pickup?change.pickup.toISOString():old.pickup_at,
      return:change.returnDate?change.returnDate.toISOString():old.return_at,
      rental:change.rental,deposit:change.deposit,delivery:change.delivery,total:change.total,included_km:change.km},
    paid};
  const details=updateDetails(b,old,change,entry);
  if(details.length>60000)fail('Booking modification history is full. Contact support.',409);
  return await saveModification({id,b,old,change,details,entry,paid});
}

async function saveModification({id,b,old,change,details,entry,paid}) {
  const now=entry.at;
  const paymentStatus=paid<=0?'pending':paid>=change.total?'paid':'partially_paid';
  const patch={booking_details:details,fare_amount:change.base,original_fare:change.base,total_fare:change.total,
    paid_amount:paid,payment_status:paymentStatus,updated_at:now};
  const version=b.updated_at?'&updated_at=eq.'+encodeURIComponent(b.updated_at):'&updated_at=is.null';
  const saved=await db(bookingPath(id)+version,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
  if(!saved?.length)fail('Booking changed while saving. Refresh and retry.',409);
  return finishModification({id,b,old,change,entry,paid,saved:saved[0],details});
}

async function syncDriverFare(id,booking,change,entry) {
  const oldRows=await db('cwd_booking_commercial_overrides?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1');
  const original=oldRows?.[0]?.original_customer_fare??booking.fare_amount??change.base;
  await db('cwd_booking_commercial_overrides',{method:'POST',
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({booking_id:id,original_customer_fare:Number(original),
      negotiated_customer_fare:change.base,customer_override_reason:'Booking modification: '+change.reason,
      customer_overridden_at:entry.at,customer_overridden_by:entry.by,updated_at:entry.at})
  });
}

async function finishModification({id,b,old,change,entry,paid,saved,details}) {
  if(!old.is_self_drive) {
    try { await syncDriverFare(id,b,change,entry); }
    catch(error) {
      let restored=false;
      try {
        const originalStatus=paid<=0?'pending':paid>=Number(b.total_fare||0)?'paid':'partially_paid';
        const rows=await db(bookingPath(id)+'&updated_at=eq.'+encodeURIComponent(entry.at),{
          method:'PATCH',headers:{Prefer:'return=representation'},
          body:JSON.stringify({booking_details:b.booking_details,fare_amount:b.fare_amount,
            original_fare:b.original_fare,total_fare:b.total_fare,paid_amount:paid,
            payment_status:originalStatus,updated_at:new Date().toISOString()})
        });
        restored=!!rows?.length;
      }catch{}
      fail('Vendor fare sync failed. '+(restored?'Previous fare restored.':'Manual reconciliation required.')+' '+error.message,503);
    }
  }
  let accountingWarning='';
  if(old.is_self_drive&&change.deposit>0) {
    try{const {syncSecurityDepositReceived}=await securityDepositAccounting();await syncSecurityDepositReceived({...saved,paid_amount:paid},paid,'bank_transfer');}
    catch(error){accountingWarning=error.message||'Deposit accounting requires review.';}
  }
  return json({success:true,current:snapshot(saved,paid),history:history(details).slice(0,30),
    accounting_warning:accountingWarning,vendor_notice:!old.is_self_drive});
}

export async function POST(request) { try { return await modifyBooking(request); } catch(e) { return json({success:false,message:e.message},e.status||500); } }
