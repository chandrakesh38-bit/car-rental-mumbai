const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
function fail(m,s=400){const e=new Error(m);e.status=s;throw e}
async function db(path,opt={}){if(!base()||!key())fail('Database is not configured.',503);const r=await fetch(base()+'/rest/v1/'+path,{...opt,headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();if(!r.ok){let msg='Database operation failed.';try{const p=JSON.parse(t);if(p?.message)msg+=' '+String(p.message).slice(0,180)}catch{}fail(msg,503)}return t?JSON.parse(t):null}
async function hashToken(t){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(t)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)&&x>=0?x:d}
function iso(v){if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null}

async function requireAdmin(request){
 const tok=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!tok)fail('Admin authentication required.',401);
 const publicKey=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!publicKey)fail('Admin auth is not configured.',503);
 const r=await fetch(base()+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:'Bearer '+tok}});
 if(!r.ok)fail('Admin session expired.',401);
 const user=await r.json();
 const allowed=String(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allowed.includes(String(user?.email||'').toLowerCase()))fail('Admin access denied.',403);
 return user;
}
async function booking(id){const r=await db('inquiries?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1');if(!r?.[0])fail('Booking not found.',404);return r[0]}
function payoutCalc(p){
 const trip=String(p.trip_type||'').toLowerCase(),days=Math.max(1,Math.floor(n(p.duty_days,1))),night=Math.floor(n(p.night_count));
 if(trip.includes('local')){
  const bases={'8hr_80km':2000,'10hr_100km':2300,'12hr_120km':2600};
  const pack=String(p.local_package||'8hr_80km'); if(!bases[pack])fail('Choose a valid local package.');
  return bases[pack]+n(p.extra_km)*13+n(p.extra_hours)*100+night*300;
 }
 const km=Math.max(n(p.estimated_km),days*240);
 return km*11+days*500+night*300;
}
function publicBase(request){return new URL(request.url).origin}
async function signedPhoto(path){if(!path)return null;try{const r=await fetch(base()+'/storage/v1/object/sign/cwd-vendor-trip-photos/'+path,{method:'POST',headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})});const d=await r.json();if(!r.ok)return null;const u=d.signedURL||d.signedUrl;return u?(u.startsWith('http')?u:base()+'/storage/v1'+u):null}catch{return null}}
async function snapshot(id){const b=await booking(id);return {booking_id:b.booking_id,trip_type:b.trip_type||'',vehicle:b.car_name||'',route:b.route||'',start_at:b.pickup_date||b.trip_date||b.start_date||null,final_drop_at:b.final_drop_date||b.return_date||b.end_date||null,customer_name:b.customer_name||'',customer_phone:b.customer_phone||'',customer_email:b.customer_email||'',paid_amount:n(b.paid_amount),total_fare:n(b.total_fare||b.fare_amount)}}
async function buildLedgers(b,a,t,over={}){
 const trip=String(b.trip_type||'').toLowerCase(),days=Math.max(1,Math.floor(n(over.duty_days||a?.pricing_snapshot?.duty_days,1)));
 const actualKm=n(over.billable_km,t.calculated_trip_km),oneway=trip.includes('one');
 const billableKm=trip.includes('local')?actualKm:Math.max(actualKm,days*240);
 const actuals={toll:n(over.toll,t.toll),parking:n(over.parking,t.parking),state_tax:n(over.state_tax,t.state_tax),other:n(over.other_amount,t.other_amount)};
 const night=Boolean(over.night_charge??t.night_charge);
 let customerBase=0,vendorBase=0,customerDa=0,vendorDa=0;
 if(trip.includes('local')){
   const pack=String(a?.pricing_snapshot?.local_package||'8hr_80km');
   const cb={'8hr_80km':2500,'10hr_100km':2900,'12hr_120km':3300}[pack]||2500;
   const vb={'8hr_80km':2000,'10hr_100km':2300,'12hr_120km':2600}[pack]||2000;
   const ek=n(a?.pricing_snapshot?.extra_km),eh=n(a?.pricing_snapshot?.extra_hours);
   customerBase=cb+ek*17+eh*200; vendorBase=vb+ek*13+eh*100;
 }else{
   customerBase=billableKm*13;vendorBase=billableKm*11;customerDa=days*600;vendorDa=days*500;
 }
 const customerNight=night?400:0,vendorNight=night?300:0;
 const customerTotal=customerBase+customerDa+customerNight+actuals.toll+actuals.parking+actuals.state_tax+actuals.other;
 const advance=n(b.paid_amount),balance=Math.max(0,customerTotal-advance);
 const vendorTotal=vendorBase+vendorDa+vendorNight+actuals.toll+actuals.parking+actuals.state_tax+actuals.other-n(over.penalty);
 const due=new Date();due.setUTCDate(due.getUTCDate()+1);due.setUTCHours(10,30,0,0);
 return {customer:{booking_id:b.booking_id,customer_km_rate:trip.includes('local')?17:13,billable_km:billableKm,customer_da:customerDa,customer_night:customerNight,toll:actuals.toll,parking:actuals.parking,state_tax:actuals.state_tax,approved_other:actuals.other,customer_advance:advance,customer_total:customerTotal,customer_balance:balance,updated_at:new Date().toISOString()},vendor:{booking_id:b.booking_id,vendor_id:a.vendor_id,vendor_km_rate:trip.includes('local')?13:11,billable_km:billableKm,vendor_da:vendorDa,vendor_night:vendorNight,toll:actuals.toll,parking:actuals.parking,state_tax:actuals.state_tax,approved_other:actuals.other,penalty:n(over.penalty),vendor_final_payout:Math.max(0,vendorTotal),payout_due_at:due.toISOString(),updated_at:new Date().toISOString()}}
}
async function handler(request){
 if(!['GET','POST'].includes(request.method))return json({success:false,message:'Method not allowed.'},405);
 try{
  const user=await requireAdmin(request);
  if(request.method==='GET'){
   const u=new URL(request.url),id=u.searchParams.get('booking_id');
   if(u.searchParams.get('dashboard')==='1'){
    const [vendors,offers,allocations,settlements]=await Promise.all([
      db('cwd_vendors?select=id,vendor_code,owner_business_name,primary_whatsapp,alternate_mobile,email,base_location,status,created_at&order=created_at.desc'),
      db('cwd_vendor_offers?select=id,vendor_id,booking_id,status,estimated_vendor_payout,responded_at,created_at&order=created_at.desc&limit=300'),
      db('cwd_vendor_allocations?select=id,booking_id,vendor_id,status,vehicle_number,driver_name,driver_mobile,allocated_at,updated_at&order=allocated_at.desc&limit=300'),
      db('cwd_vendor_settlement_ledger?select=booking_id,vendor_id,vendor_final_payout,payout_status,payout_due_at,paid_at,utr_reference,updated_at&order=updated_at.desc&limit=300')
    ]);
    return json({success:true,vendors:vendors||[],offers:offers||[],allocations:allocations||[],settlements:settlements||[]});
   }
   if(!id)fail('Booking ID required.');
   const b=await snapshot(id);
   const [vendors,offers,alloc,trip,customer,vendorSet,invoice]=await Promise.all([
    db('cwd_vendors?status=in.(pending_review,active)&select=id,vendor_code,owner_business_name,primary_whatsapp,base_location,status&order=created_at.desc'),
    db('cwd_vendor_offers?booking_id=eq.'+encodeURIComponent(id)+'&select=*&order=created_at.desc'),
    db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_customer_billing_ledger?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_vendor_settlement_ledger?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_customer_invoices?booking_id=eq.'+encodeURIComponent(id)+'&select=id,booking_id,payment_url,created_at&limit=1')
   ]);
   const tripRow=trip?.[0]||null;if(tripRow){tripRow.start_photo_url=await signedPhoto(tripRow.starting_photo_path);tripRow.end_photo_url=await signedPhoto(tripRow.closing_photo_path);}return json({success:true,booking:b,vendors:vendors||[],offers:offers||[],allocation:alloc?.[0]||null,trip:tripRow,customer_ledger:customer?.[0]||null,vendor_ledger:vendorSet?.[0]||null,invoice:invoice?.[0]||null});
  }
  const body=await request.json(),action=String(body.action||''),id=String(body.booking_id||'');
  if(action==='set_vendor_status'){
    if(!['active','suspended','rejected','pending_review'].includes(body.status))fail('Invalid vendor status.');
    if(!body.vendor_id)fail('Vendor is required.');
    await db('cwd_vendors?id=eq.'+encodeURIComponent(body.vendor_id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:body.status,updated_at:new Date().toISOString()})});return json({success:true});
  }
  if(!id)fail('Booking ID required.');
  const b=await snapshot(id);
  if(action==='create_offer'){
    const ids=Array.isArray(body.vendor_ids)?[...new Set(body.vendor_ids.map(String))]:[];if(!ids.length)fail('Select at least one vendor.');
    const p={trip_type:b.trip_type,estimated_km:n(body.estimated_km),duty_days:Math.max(1,Math.floor(n(body.duty_days,1))),night_count:Math.floor(n(body.night_count)),local_package:body.local_package||null,extra_km:n(body.extra_km),extra_hours:n(body.extra_hours)};
    const payout=payoutCalc(p),created=[];
    for(const vid of ids){
      const vendor=(await db('cwd_vendors?id=eq.'+encodeURIComponent(vid)+'&select=id,vendor_code,owner_business_name,primary_whatsapp,status&limit=1'))?.[0];
      if(!vendor)continue;
      const raw=token(),h=await hashToken(raw);
      const rows=await db('cwd_vendor_offers',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({vendor_id:vid,booking_id:id,offer_token_hash:h,status:'offered',trip_type:b.trip_type||'',vehicle_required:b.vehicle||'',route_summary:b.route||'',start_at:iso(b.start_at),final_drop_at:iso(b.final_drop_at),estimated_km:p.estimated_km,duty_days:p.duty_days,night_count:p.night_count,local_package:p.local_package,extra_km:p.extra_km,extra_hours:p.extra_hours,estimated_vendor_payout:payout,pricing_snapshot:{...p,vendor_km_rate:11,vendor_da:500,vendor_night:300,minimum_km_per_day:240},created_by:String(user.email||'')})});
      created.push({...rows?.[0],vendor_name:vendor.owner_business_name,vendor_code:vendor.vendor_code,vendor_whatsapp:vendor.primary_whatsapp,view_url:publicBase(request)+'/vendor-booking?offer='+raw});
    } return json({success:true,offers:created});
  }
  if(action==='allocate'){
    const os=await db('cwd_vendor_offers?id=eq.'+encodeURIComponent(body.offer_id)+'&booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),o=os?.[0];if(!o||o.status!=='accepted')fail('Only an accepted offer can be allocated.',409);
    const old=await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1');
    if(old?.[0])await db('cwd_vendor_allocations?id=eq.'+old[0].id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'reallocated',revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    await db('cwd_vendor_offers?booking_id=eq.'+encodeURIComponent(id)+'&status=eq.allocated',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'revoked'})});
    const raw=token(),h=await hashToken(raw);
    const rows=await db('cwd_vendor_allocations',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({booking_id:id,offer_id:o.id,vendor_id:o.vendor_id,allocation_token_hash:h,status:'allocated',allocated_at:new Date().toISOString(),revoked_at:null})});
    await db('cwd_vendor_offers?id=eq.'+o.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'allocated'})});
    return json({success:true,allocation:rows?.[0],allocated_url:publicBase(request)+'/vendor-booking?allocation='+raw});
  }
  if(action==='review'){
    const ar=await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),a=ar?.[0];if(!a)fail('No allocation found.');
    const tr=await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),t=tr?.[0];if(!t||!t.ended_at)fail('Trip closure has not been submitted.');
    if(body.review_action==='query'){
      await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({review_status:'query_vendor',admin_notes:String(body.admin_notes||'').slice(0,1000),reviewed_at:new Date().toISOString(),reviewed_by:String(user.email||'')})});return json({success:true});
    }
    if(!['approve','correct'].includes(body.review_action))fail('Invalid review action.');
    const led=await buildLedgers(b,a,t,body.corrections||{});
    await db('cwd_customer_billing_ledger',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(led.customer)});
    await db('cwd_vendor_settlement_ledger',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(led.vendor)});
    await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({review_status:body.review_action==='correct'?'corrected':'approved',admin_notes:String(body.admin_notes||'').slice(0,1000)||null,reviewed_at:new Date().toISOString(),reviewed_by:String(user.email||'')})});
    await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'approved',updated_at:new Date().toISOString()})});
    await db('inquiries?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({total_fare:led.customer.customer_total,updated_at:new Date().toISOString()})});
    return json({success:true,customer_ledger:led.customer,vendor_ledger:led.vendor});
  }
  if(action==='generate_invoice'){
    const cl=(await db('cwd_customer_billing_ledger?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'))?.[0];if(!cl)fail('Approve trip review first.');
    const raw=token(),h=await hashToken(raw),snap={booking_id:id,route:b.route,trip_date:b.start_at,vehicle:b.vehicle,...cl};
    const rows=await db('cwd_customer_invoices',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({booking_id:id,invoice_token_hash:h,invoice_snapshot:snap,payment_url:String(body.payment_url||'')||null})});
    return json({success:true,invoice:rows?.[0],invoice_url:publicBase(request)+'/customer-invoice?t='+raw});
  }
  if(action==='mark_vendor_paid'){
    const utr=String(body.utr_reference||'').trim();if(!utr)fail('UTR/payment reference required.');
    await db('cwd_vendor_settlement_ledger?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({payout_status:'paid',paid_at:new Date().toISOString(),utr_reference:utr,updated_at:new Date().toISOString()})});return json({success:true});
  }
  fail('Unknown action.');
 }catch(e){return json({success:false,message:e.message||'Request failed.'},e.status||500)}
}
export function GET(r){return handler(r)} export function POST(r){return handler(r)}