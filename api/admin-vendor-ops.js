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
function normVehicleName(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')}
async function vendorRateForVehicle(vehicleName){
 const globals=await db('with_driver_rates?select=*&is_active=eq.true&order=display_order.asc,full_name.asc');
 const wanted=normVehicleName(vehicleName);
 let car=(globals||[]).find(x=>normVehicleName(x.full_name)===wanted) || (globals||[]).find(x=>wanted.includes(normVehicleName(x.full_name))||normVehicleName(x.full_name).includes(wanted));

 // Customer website intentionally groups Dzire and Aura under one public sedan label.
 // Resolve that public label back to a canonical Global Pricing vehicle for vendor costing.
 if(!car && wanted.includes('sedan') && wanted.includes('dzire') && wanted.includes('aura')){
   const sedanCandidates=(globals||[]).filter(x=>String(x.segment||'').toLowerCase()==='sedan' && /dzire|aura/i.test(String(x.full_name||'')));
   const preferred=sedanCandidates.find(x=>/dzire/i.test(String(x.full_name||''))) || sedanCandidates[0];
   if(preferred)car=preferred;
 }

 if(!car)fail('No matching Global Pricing vehicle found for '+vehicleName+'.',409);
 const rate=(await db('cwd_vendor_rate_cards?vehicle_rate_id=eq.'+encodeURIComponent(String(car.id))+'&is_active=eq.true&select=*&limit=1'))?.[0];
 if(!rate)fail('Vendor Rate Card is not configured for '+car.full_name+'. Set the vendor rate first.',409);
 return {car,rate};
}
function vendorPayoutFromRate(p,rate){
 const trip=String(p.trip_type||'').toLowerCase(),days=Math.max(1,Math.floor(n(p.duty_days,1))),night=Math.floor(n(p.night_count));
 if(trip.includes('local')){
  const pack=String(p.local_package||'8hr_80km');
  const base={ '8hr_80km':n(rate.local_pkg_8hr_80km),'10hr_100km':n(rate.local_pkg_10hr_100km),'12hr_120km':n(rate.local_pkg_12hr_120km)}[pack];
  if(base===undefined)fail('Choose a valid local package.');
  return base+n(p.extra_km)*n(rate.local_extra_km_rate)+n(p.extra_hours)*n(rate.local_extra_hour_rate)+night*n(rate.night_charge);
 }
 const km=Math.max(n(p.estimated_km),days*n(rate.minimum_outstation_km_per_day,240));
 return km*n(rate.outstation_rate_per_km)+days*n(rate.driver_allowance_per_day)+night*n(rate.night_charge);
}
async function signedPhoto(path){if(!path)return null;try{const r=await fetch(base()+'/storage/v1/object/sign/cwd-vendor-trip-photos/'+path,{method:'POST',headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})});const d=await r.json();if(!r.ok)return null;const u=d.signedURL||d.signedUrl;return u?(u.startsWith('http')?u:base()+'/storage/v1'+u):null}catch{return null}}
async function snapshot(id){const b=await booking(id);return {booking_id:b.booking_id,trip_type:b.trip_type||'',vehicle:b.car_name||'',route:b.route||'',start_at:b.pickup_date||b.trip_date||b.start_date||null,final_drop_at:b.final_drop_date||b.return_date||b.end_date||null,customer_name:b.customer_name||'',customer_phone:b.customer_phone||'',customer_email:b.customer_email||'',paid_amount:n(b.paid_amount),total_fare:n(b.total_fare||b.fare_amount)}}
async function buildLedgers(b,a,t,over={}){
 const snap=a?.pricing_snapshot||{};
 const trip=String(b.trip_type||'').toLowerCase();
 const days=Math.max(1,Math.floor(n(over.duty_days||snap.duty_days,1)));
 const actualKm=n(over.billable_km,t.calculated_trip_km);
 const minKm=n(snap.minimum_km_per_day,240);
 const billableKm=trip.includes('local')?actualKm:Math.max(actualKm,days*minKm);
 const actuals={toll:n(over.toll,t.toll),parking:n(over.parking,t.parking),state_tax:n(over.state_tax,t.state_tax),other:n(over.other_amount,t.other_amount)};
 const night=Boolean(over.night_charge??t.night_charge);
 let customerBase=0,vendorBase=0,customerDa=0,vendorDa=0;
 let customerKmRate=n(snap.customer_km_rate);
 let vendorKmRate=n(snap.vendor_km_rate);

 if(trip.includes('local')){
   const pack=String(snap.local_package||'8hr_80km');
   const customerPackages={
     '8hr_80km':n(snap.customer_local_8h_80km),
     '10hr_100km':n(snap.customer_local_10h_100km),
     '12hr_120km':n(snap.customer_local_12h_120km)
   };
   const vendorPackages={
     '8hr_80km':n(snap.local_8h_80km),
     '10hr_100km':n(snap.local_10h_100km),
     '12hr_120km':n(snap.local_12h_120km)
   };
   const ek=n(snap.extra_km),eh=n(snap.extra_hours);
   customerBase=n(customerPackages[pack])+ek*n(snap.customer_local_extra_km)+eh*n(snap.customer_local_extra_hour);
   vendorBase=n(vendorPackages[pack])+ek*n(snap.local_extra_km)+eh*n(snap.local_extra_hour);
   customerKmRate=n(snap.customer_local_extra_km);
   vendorKmRate=n(snap.local_extra_km);
 }else{
   customerBase=billableKm*customerKmRate;
   vendorBase=billableKm*vendorKmRate;
   customerDa=days*n(snap.customer_da);
   vendorDa=days*n(snap.vendor_da);
 }
 const customerNight=night?n(snap.customer_night):0;
 const vendorNight=night?n(snap.vendor_night):0;
 const standardCustomerPreActual=customerBase+customerDa+customerNight;
 const agreedCustomerPreActual=over.negotiated_customer_fare!==null&&over.negotiated_customer_fare!==undefined?n(over.negotiated_customer_fare):standardCustomerPreActual;
 const customerTotal=agreedCustomerPreActual+actuals.toll+actuals.parking+actuals.state_tax+actuals.other;
 const advance=n(b.paid_amount),balance=Math.max(0,customerTotal-advance);
 const standardVendorPreActual=vendorBase+vendorDa+vendorNight;
 const agreedVendorPreActual=snap.vendor_final_payout_override!==null&&snap.vendor_final_payout_override!==undefined?n(snap.vendor_final_payout_override):standardVendorPreActual;
 const vendorTotal=agreedVendorPreActual+actuals.toll+actuals.parking+actuals.state_tax+actuals.other-n(over.penalty);
 const due=new Date();due.setUTCDate(due.getUTCDate()+1);due.setUTCHours(10,30,0,0);
 return {
  customer:{booking_id:b.booking_id,customer_km_rate:customerKmRate,billable_km:billableKm,customer_da:customerDa,customer_night:customerNight,toll:actuals.toll,parking:actuals.parking,state_tax:actuals.state_tax,approved_other:actuals.other,customer_advance:advance,customer_total:customerTotal,customer_balance:balance,updated_at:new Date().toISOString()},
  vendor:{booking_id:b.booking_id,vendor_id:a.vendor_id,vendor_km_rate:vendorKmRate,billable_km:billableKm,vendor_da:vendorDa,vendor_night:vendorNight,toll:actuals.toll,parking:actuals.parking,state_tax:actuals.state_tax,approved_other:actuals.other,penalty:n(over.penalty),vendor_final_payout:Math.max(0,vendorTotal),payout_due_at:due.toISOString(),updated_at:new Date().toISOString()}
 };
}
async function handler(request){
 if(!['GET','POST'].includes(request.method))return json({success:false,message:'Method not allowed.'},405);
 try{
  const user=await requireAdmin(request);
  if(request.method==='GET'){
   const u=new URL(request.url),id=u.searchParams.get('booking_id');
   if(u.searchParams.get('rates')==='1'){
    const [vehicles,vendorRates]=await Promise.all([
      db('with_driver_rates?select=id,full_name,segment,outstation_rate_per_km,local_pkg_8hr_80km,local_extra_hour_rate,local_extra_km_rate,driver_allowance_per_day,is_active,display_order&order=display_order.asc,full_name.asc'),
      db('cwd_vendor_rate_cards?select=*&order=updated_at.desc')
    ]);
    return json({success:true,vehicles:vehicles||[],vendor_rates:vendorRates||[]});
   }
   if(u.searchParams.get('dashboard')==='1'){
    const vendorId=u.searchParams.get('vendor_id');
    if(vendorId){
      const [vendor,payout,vehicles,terms,offers,allocations,settlements]=await Promise.all([
        db('cwd_vendors?id=eq.'+encodeURIComponent(vendorId)+'&select=*&limit=1'),
        db('cwd_vendor_payout_accounts?vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=*&limit=1'),
        db('cwd_vendor_vehicles?vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=*&order=created_at.asc'),
        db('cwd_vendor_terms_acceptances?vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=*&order=accepted_at.desc'),
        db('cwd_vendor_offers?vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=id,booking_id,status,estimated_vendor_payout,responded_at,created_at&order=created_at.desc'),
        db('cwd_vendor_allocations?vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=id,booking_id,status,vehicle_number,driver_name,driver_mobile,allocated_at,updated_at&order=allocated_at.desc'),
        db('cwd_vendor_settlement_ledger?vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=booking_id,vendor_final_payout,payout_status,payout_due_at,paid_at,utr_reference,updated_at&order=updated_at.desc')
      ]);
      if(!vendor?.[0])fail('Vendor not found.',404);
      return json({success:true,vendor:vendor[0],payout:payout?.[0]||null,vehicles:vehicles||[],terms:terms||[],offers:offers||[],allocations:allocations||[],settlements:settlements||[]});
    }
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
   const [vendors,offers,alloc,trip,customer,vendorSet,invoice,commercialOverride]=await Promise.all([
    db('cwd_vendors?status=eq.active&select=id,vendor_code,owner_business_name,primary_whatsapp,base_location,status&order=created_at.desc'),
    db('cwd_vendor_offers?booking_id=eq.'+encodeURIComponent(id)+'&select=*&order=created_at.desc'),
    db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_customer_billing_ledger?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_vendor_settlement_ledger?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
    db('cwd_customer_invoices?booking_id=eq.'+encodeURIComponent(id)+'&select=id,booking_id,payment_url,created_at&limit=1'),
    db('cwd_booking_commercial_overrides?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1')
   ]);
   const tripRow=trip?.[0]||null;if(tripRow){tripRow.start_photo_url=await signedPhoto(tripRow.starting_photo_path);tripRow.end_photo_url=await signedPhoto(tripRow.closing_photo_path);}return json({success:true,booking:b,vendors:vendors||[],offers:offers||[],allocation:alloc?.[0]||null,trip:tripRow,customer_ledger:customer?.[0]||null,vendor_ledger:vendorSet?.[0]||null,invoice:invoice?.[0]||null,commercial_override:commercialOverride?.[0]||null});
  }
  const body=await request.json(),action=String(body.action||''),id=String(body.booking_id||'');
  if(action==='update_customer_fare'){
    if(!id)fail('Booking ID required.');
    const current=await booking(id);
    const original=n(body.original_customer_fare, current.original_fare||current.fare_amount||current.total_fare);
    const negotiated=n(body.negotiated_customer_fare,-1);
    const reason=String(body.reason||'').trim();
    if(negotiated<0)fail('Negotiated fare must be a valid non-negative amount.');
    if(!reason)fail('Reason is required.');
    const now=new Date().toISOString();
    await db('cwd_booking_commercial_overrides',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({
      booking_id:id,original_customer_fare:original,negotiated_customer_fare:negotiated,customer_override_reason:reason.slice(0,500),customer_overridden_at:now,customer_overridden_by:String(user.email||''),updated_at:now
    })});
    await db('inquiries?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({total_fare:negotiated,updated_at:now})});
    return json({success:true,original_customer_fare:original,negotiated_customer_fare:negotiated});
  }

  if(action==='save_customer_fleet_vehicle'){
    const v=body.vehicle||{},id=String(v.id||'').trim();
    const fullName=String(v.full_name||'').trim();
    let brand='',model=fullName;
    if(/^(maruti suzuki\s+|maruti\s+)?(wagon\s*r|wagonr|dzire|ertiga|ciaz|swift|baleno|alto|celerio|brezza)/i.test(fullName)){
      brand='Maruti Suzuki';
      model=fullName.replace(/^(maruti suzuki\s+|maruti\s+)?/i,'').trim();
      if(/^wagonr$/i.test(model))model='Wagon R';
    }else{
      const brands=['Hyundai','Toyota','Kia','Honda','Tata','Mahindra'];
      const match=brands.find(b=>fullName.toLowerCase().startsWith(b.toLowerCase()+' '));
      if(match){brand=match;model=fullName.slice(match.length).trim();}
    }
    if(!brand){
      const parts=fullName.split(/\s+/).filter(Boolean);
      brand=parts[0]||'Other';
      model=parts.slice(1).join(' ')||fullName||'Other';
    }
    const payload={
      full_name:fullName,
      brand,
      model,
      segment:String(v.segment||'').trim(),
      seating_capacity:Math.max(1,Math.floor(n(v.seating_capacity,1))),
      bag_capacity:Math.max(0,Math.floor(n(v.bag_capacity,0))),
      local_pkg_8hr_80km:n(v.local_pkg_8hr_80km),
      local_extra_hour_rate:n(v.local_extra_hour_rate),
      local_extra_km_rate:n(v.local_extra_km_rate),
      outstation_rate_per_km:n(v.outstation_rate_per_km),
      driver_allowance_per_day:n(v.driver_allowance_per_day),
      customer_night_charge:n(v.customer_night_charge),
      airport_t1_rate:n(v.airport_t1_rate),
      airport_t2_rate:n(v.airport_t2_rate),
      airport_nmia_rate:n(v.airport_nmia_rate),
      display_order:Math.max(0,Math.floor(n(v.display_order,999))),
      is_active:v.is_active!==false
    };
    if(!payload.full_name||!payload.segment)fail('Vehicle name and category are required.');
    let saved;
    if(id){
      saved=await db('with_driver_rates?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    }else{
      saved=await db('with_driver_rates',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    }
    return json({success:true,vehicle:saved?.[0]||null});
  }

  if(action==='delete_customer_fleet_vehicle'){
    const vehicleId=String(body.vehicle_id||'').trim();if(!vehicleId)fail('Vehicle ID required.');
    await db('with_driver_rates?id=eq.'+encodeURIComponent(vehicleId),{method:'DELETE',headers:{Prefer:'return=minimal'}});
    return json({success:true});
  }

  if(action==='update_vendor_rate'){
    const r=body.rate||{},vehicleRateId=String(r.vehicle_rate_id||'').trim();
    if(!vehicleRateId)fail('Global Pricing vehicle is required.');
    const global=(await db('with_driver_rates?id=eq.'+encodeURIComponent(vehicleRateId)+'&select=id,full_name&limit=1'))?.[0];
    if(!global)fail('Global Pricing vehicle no longer exists.',409);
    const payload={
      vehicle_rate_id:vehicleRateId,
      outstation_rate_per_km:n(r.outstation_rate_per_km),
      minimum_outstation_km_per_day:Math.max(0,Math.floor(n(r.minimum_outstation_km_per_day,240))),
      driver_allowance_per_day:n(r.driver_allowance_per_day),
      night_charge:n(r.night_charge),
      local_pkg_8hr_80km:n(r.local_pkg_8hr_80km),
      local_pkg_10hr_100km:n(r.local_pkg_10hr_100km),
      local_pkg_12hr_120km:n(r.local_pkg_12hr_120km),
      local_extra_km_rate:n(r.local_extra_km_rate),
      local_extra_hour_rate:n(r.local_extra_hour_rate),
      is_active:r.is_active!==false,
      updated_at:new Date().toISOString()
    };
    const existing=(await db('cwd_vendor_rate_cards?vehicle_rate_id=eq.'+encodeURIComponent(vehicleRateId)+'&select=id&limit=1'))?.[0];
    if(existing)await db('cwd_vendor_rate_cards?id=eq.'+existing.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
    else await db('cwd_vendor_rate_cards',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
    return json({success:true,vehicle_name:global.full_name});
  }
  if(action==='update_vendor_profile'){
    const vendorId=String(body.vendor_id||'').trim();
    if(!vendorId)fail('Vendor is required.');
    const profile=body.profile||{}, payout=body.payout||{}, vehicles=Array.isArray(body.vehicles)?body.vehicles:[];
    const mobile=String(profile.primary_whatsapp||'').replace(/\D/g,'').slice(-10);
    const alt=String(profile.alternate_mobile||'').replace(/\D/g,'').slice(-10);
    if(!/^[6-9][0-9]{9}$/.test(mobile))fail('Valid primary WhatsApp mobile is required.');
    if(alt && !/^[6-9][0-9]{9}$/.test(alt))fail('Alternate mobile is invalid.');
    const pan=String(profile.pan||'').trim().toUpperCase();
    if(!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))fail('Valid PAN is required.');
    const owner=String(profile.owner_business_name||'').trim();
    const baseLocation=String(profile.base_location||'').trim();
    const address=String(profile.address||'').trim();
    if(!owner||!baseLocation||!address)fail('Business name, base location and address are required.');
    const email=String(profile.email||'').trim().toLowerCase()||null;
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Email is invalid.');
    const payoutMode=String(payout.payout_mode||'').trim();
    if(!['upi','bank','bank_upi'].includes(payoutMode))fail('Payout method is required.');
    const upi=String(payout.upi_id||'').trim()||null;
    const holder=String(payout.account_holder_name||'').trim()||null;
    const bank=String(payout.bank_name||'').trim()||null;
    const account=String(payout.account_number||'').trim()||null;
    const ifsc=String(payout.ifsc||'').trim().toUpperCase()||null;
    if((payoutMode==='upi'||payoutMode==='bank_upi')&&!upi)fail('UPI ID is required.');
    if((payoutMode==='bank'||payoutMode==='bank_upi')&&(!holder||!account||!ifsc))fail('Bank account holder, account number and IFSC are required.');
    if(!vehicles.length)fail('At least one vehicle is required.');
    const currentYear=new Date().getFullYear();
    const cleanedVehicles=vehicles.map((v,i)=>{
      const vehicleNumber=String(v.vehicle_number||'').trim().toUpperCase().replace(/\s+/g,'');
      const year=Number(v.manufacturing_year), seating=Number(v.seating);
      if(!/^[A-Z0-9-]{6,20}$/.test(vehicleNumber))fail('Vehicle '+(i+1)+' number is invalid.');
      if(!Number.isInteger(year)||year<currentYear-4||year>currentYear)fail('Vehicle '+(i+1)+' manufacturing year must be within the last 4 years.');
      if(!Number.isInteger(seating)||seating<2||seating>20)fail('Vehicle '+(i+1)+' seating is invalid.');
      return {
        id:String(v.id||'').trim(),
        vehicle_number:vehicleNumber,
        make_model:String(v.make_model||'').trim(),
        category:String(v.category||'').trim(),
        manufacturing_year:year,
        fuel:String(v.fuel||'').trim(),
        seating,
        commercial_permit_type:String(v.commercial_permit_type||'').trim(),
        rc_number:vehicleNumber,
        insurance_policy_number:String(v.insurance_policy_number||'').trim(),
        insurance_expiry:v.insurance_expiry||null,
        puc_number:String(v.puc_number||'').trim(),
        puc_expiry:v.puc_expiry||null,
        permit_fitness_number:String(v.permit_fitness_number||'').trim()||null,
        permit_fitness_expiry:v.permit_fitness_expiry||null
      };
    });
    await db('cwd_vendors?id=eq.'+encodeURIComponent(vendorId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({
      vendor_code:'CWD'+mobile,owner_business_name:owner,primary_whatsapp:mobile,alternate_mobile:alt||null,email,base_location:baseLocation,address,pan,updated_at:new Date().toISOString()
    })});
    await db('cwd_vendor_payout_accounts?vendor_id=eq.'+encodeURIComponent(vendorId),{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({
      vendor_id:vendorId,payout_mode:payoutMode,account_holder_name:holder,bank_name:bank,account_number:account,ifsc,upi_id:upi
    })});
    const existing=await db('cwd_vendor_vehicles?vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=id');
    const keepIds=new Set(cleanedVehicles.filter(v=>v.id).map(v=>v.id));
    for(const old of existing||[]){
      if(!keepIds.has(old.id))await db('cwd_vendor_vehicles?id=eq.'+old.id,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    }
    for(const v of cleanedVehicles){
      const payload={...v,vendor_id:vendorId};delete payload.id;
      if(v.id)await db('cwd_vendor_vehicles?id=eq.'+encodeURIComponent(v.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
      else await db('cwd_vendor_vehicles',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
    }
    return json({success:true});
  }
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
    const vr=await vendorRateForVehicle(b.vehicle);
    const vendorRateOverride=body.vendor_rate_per_km_override===null||body.vendor_rate_per_km_override===''?null:n(body.vendor_rate_per_km_override);
    const vendorFinalOverride=body.vendor_final_payout_override===null||body.vendor_final_payout_override===''?null:n(body.vendor_final_payout_override);
    const vendorOverrideReason=String(body.vendor_override_reason||'').trim();
    if((vendorRateOverride!==null||vendorFinalOverride!==null)&&!vendorOverrideReason)fail('Vendor override reason is required.');
    const rateForOffer={...vr.rate};
    if(vendorRateOverride!==null)rateForOffer.outstation_rate_per_km=vendorRateOverride;
    let payout=vendorPayoutFromRate(p,rateForOffer);
    if(vendorFinalOverride!==null)payout=vendorFinalOverride;
    if(vendorRateOverride!==null||vendorFinalOverride!==null){
      const now=new Date().toISOString();
      await db('cwd_booking_commercial_overrides',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({
        booking_id:id,vendor_rate_per_km_override:vendorRateOverride,vendor_final_payout_override:vendorFinalOverride,vendor_override_reason:vendorOverrideReason.slice(0,500),vendor_overridden_at:now,vendor_overridden_by:String(user.email||''),updated_at:now
      })});
    }
    const created=[];
    for(const vid of ids){
      const vendor=(await db('cwd_vendors?id=eq.'+encodeURIComponent(vid)+'&select=id,vendor_code,owner_business_name,primary_whatsapp,status&limit=1'))?.[0];
      if(!vendor)continue;
      if(vendor.status!=='active')fail('Only active vendors can receive booking offers. Approve the vendor first.',409);
      const raw=token(),h=await hashToken(raw);
      const rows=await db('cwd_vendor_offers',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({vendor_id:vid,booking_id:id,offer_token_hash:h,status:'offered',trip_type:b.trip_type||'',vehicle_required:b.vehicle||'',route_summary:b.route||'',start_at:iso(b.start_at),final_drop_at:iso(b.final_drop_at),estimated_km:p.estimated_km,duty_days:p.duty_days,night_count:p.night_count,local_package:p.local_package,extra_km:p.extra_km,extra_hours:p.extra_hours,estimated_vendor_payout:payout,pricing_snapshot:{...p,vehicle_rate_id:String(vr.car.id),vehicle_name:vr.car.full_name,customer_km_rate:n(vr.car.outstation_rate_per_km),customer_da:n(vr.car.driver_allowance_per_day),customer_night:n(vr.car.customer_night_charge),customer_local_8h_80km:n(vr.car.local_pkg_8hr_80km),customer_local_10h_100km:n(vr.car.local_pkg_8hr_80km)+n(vr.car.local_extra_hour_rate)*2,customer_local_12h_120km:n(vr.car.local_pkg_8hr_80km)+n(vr.car.local_extra_hour_rate)*4,customer_local_extra_km:n(vr.car.local_extra_km_rate),customer_local_extra_hour:n(vr.car.local_extra_hour_rate),vendor_km_rate:n(rateForOffer.outstation_rate_per_km),vendor_da:n(rateForOffer.driver_allowance_per_day),vendor_night:n(rateForOffer.night_charge),minimum_km_per_day:n(rateForOffer.minimum_outstation_km_per_day),local_8h_80km:n(rateForOffer.local_pkg_8hr_80km),local_10h_100km:n(rateForOffer.local_pkg_10hr_100km),local_12h_120km:n(rateForOffer.local_pkg_12hr_120km),local_extra_km:n(rateForOffer.local_extra_km_rate),local_extra_hour:n(rateForOffer.local_extra_hour_rate),vendor_rate_override:vendorRateOverride,vendor_final_payout_override:vendorFinalOverride,vendor_override_reason:vendorOverrideReason||null},created_by:String(user.email||'')})});
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
    const [sourceOffer,commercialOverride]=await Promise.all([
      db('cwd_vendor_offers?id=eq.'+encodeURIComponent(a.offer_id)+'&select=pricing_snapshot&limit=1'),
      db('cwd_booking_commercial_overrides?booking_id=eq.'+encodeURIComponent(id)+'&select=negotiated_customer_fare&limit=1')
    ]);
    a.pricing_snapshot=sourceOffer?.[0]?.pricing_snapshot||{};
    const tr=await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),t=tr?.[0];if(!t||!t.ended_at)fail('Trip closure has not been submitted.');
    if(body.review_action==='query'){
      await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({review_status:'query_vendor',admin_notes:String(body.admin_notes||'').slice(0,1000),reviewed_at:new Date().toISOString(),reviewed_by:String(user.email||'')})});return json({success:true});
    }
    if(!['approve','correct'].includes(body.review_action))fail('Invalid review action.');
    const corrections={...(body.corrections||{})};
    if(commercialOverride?.[0]?.negotiated_customer_fare!==null&&commercialOverride?.[0]?.negotiated_customer_fare!==undefined)corrections.negotiated_customer_fare=Number(commercialOverride[0].negotiated_customer_fare);
    const led=await buildLedgers(b,a,t,corrections);
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