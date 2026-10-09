import { MIN_OUTSTATION_KM_DAY, CUSTOMER_NIGHT_CHARGE, VENDOR_NIGHT_CHARGE, bookingNightCount, vendorOutstationBreakdown, marginPreview } from '../lib/cwd-pricing.mjs';
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
function fail(m,s=400){const e=new Error(m);e.status=s;throw e}
async function db(path,opt={}){if(!base()||!key())fail('Database is not configured.',503);const r=await fetch(base()+'/rest/v1/'+path,{...opt,headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();if(!r.ok){let msg='Database operation failed.';try{const p=JSON.parse(t);if(p?.message)msg+=' '+String(p.message).slice(0,180)}catch{}fail(msg,503)}return t?JSON.parse(t):null}
async function hashToken(t){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(t)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)&&x>=0?x:d}
function iso(v){if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null}
// Vendor payout is T+1 calendar day at 4:00 PM INDIA time.
export function vendorPayoutDueAt(now=new Date()){
 const date=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(date.getTime()))throw new RangeError('Invalid payout review timestamp');
 const istDate=new Date(date.getTime()+330*60000).toISOString().slice(0,10);
 const nextDayUtc=Date.parse(istDate+'T00:00:00.000Z')+86400000;
 return new Date(nextDayUtc+10*3600000+30*60000);
}


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
function compatibleGlobalCars(globals,bookingVehicle){
 const wanted=normVehicleName(bookingVehicle);
 const exact=(globals||[]).filter(x=>normVehicleName(x.full_name)===wanted);
 if(exact.length)return exact;
 if(wanted.includes('sedan')&&wanted.includes('dzire')&&wanted.includes('aura')){
   return (globals||[]).filter(x=>String(x.segment||'').toLowerCase()==='sedan' && /dzire|aura/i.test(String(x.full_name||'')));
 }
 return (globals||[]).filter(x=>wanted.includes(normVehicleName(x.full_name))||normVehicleName(x.full_name).includes(wanted));
}
async function vendorRateForVehicle(vehicleName,preferredGlobalId=null){
 const globals=await db('with_driver_rates?select=*&is_active=eq.true&order=display_order.asc,full_name.asc');
 let candidates=compatibleGlobalCars(globals,vehicleName);
 if(preferredGlobalId)candidates=candidates.filter(x=>String(x.id)===String(preferredGlobalId));
 if(!candidates.length)fail('No matching Global Pricing vehicle found for '+vehicleName+'.',409);
 const car=candidates[0];
 const rate=(await db('cwd_vendor_rate_cards?vehicle_rate_id=eq.'+encodeURIComponent(String(car.id))+'&is_active=eq.true&select=*&limit=1'))?.[0];
 if(!rate)fail('Vendor Rate Card is not configured for '+car.full_name+'. Set the vendor rate first.',409);
 return {car,rate,candidates};
}
async function eligibleVendorVehicles(vendorId,bookingVehicle){
 const [globals,vendorVehicles]=await Promise.all([
   db('with_driver_rates?select=*&is_active=eq.true&order=display_order.asc,full_name.asc'),
   db('cwd_vendor_vehicles?vendor_id=eq.'+encodeURIComponent(vendorId)+'&is_active=eq.true&select=id,make_model,vehicle_number,category&order=created_at.asc')
 ]);
 const candidates=compatibleGlobalCars(globals,bookingVehicle);
 const out=[];
 for(const car of candidates){
   const token=normVehicleName(car.full_name);
   const short=token.replace(/^maruti suzuki /,'').replace(/^hyundai /,'').replace(/^toyota /,'').replace(/^kia /,'').replace(/^honda /,'');
   const vendorMatch=(vendorVehicles||[]).find(v=>{
     const vm=normVehicleName(v.make_model);
     return vm===token||vm.includes(short)||token.includes(vm);
   });
   if(!vendorMatch)continue;
   const rate=(await db('cwd_vendor_rate_cards?vehicle_rate_id=eq.'+encodeURIComponent(String(car.id))+'&is_active=eq.true&select=*&limit=1'))?.[0];
   if(rate)out.push({global_vehicle:car,vendor_vehicle:vendorMatch,rate});
 }
 return out;
}
function vendorPayoutFromRate(p,rate){
 const trip=String(p.trip_type||'').toLowerCase(),days=Math.max(1,Math.floor(n(p.duty_days,1))),night=Math.floor(n(p.night_count));
 if(trip.includes('local')){
  const pack=String(p.local_package||'8hr_80km');
  const base={ '8hr_80km':n(rate.local_pkg_8hr_80km),'10hr_100km':n(rate.local_pkg_10hr_100km),'12hr_120km':n(rate.local_pkg_12hr_120km)}[pack];
  if(base===undefined)fail('Choose a valid local package.');
  return base+n(p.extra_km)*n(rate.outstation_rate_per_km)+n(p.extra_hours)*n(rate.local_extra_hour_rate)+night*VENDOR_NIGHT_CHARGE;
 }
 const km=Math.max(n(p.estimated_km),days*MIN_OUTSTATION_KM_DAY);
 return vendorOutstationBreakdown({billableKm:km,dutyDays:days,vendorKmRate:n(rate.outstation_rate_per_km),driverAllowance:n(rate.driver_allowance_per_day),nightCount:night}).payout;
}
async function signedPhoto(path){if(!path)return null;try{const r=await fetch(base()+'/storage/v1/object/sign/cwd-vendor-trip-photos/'+path,{method:'POST',headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})});const d=await r.json();if(!r.ok)return null;const u=d.signedURL||d.signedUrl;return u?(u.startsWith('http')?u:base()+'/storage/v1'+u):null}catch{return null}}
async function signedRegistrationPhoto(path){if(!path)return null;try{const r=await fetch(base()+'/storage/v1/object/sign/cwd-vendor-registration-photos/'+path,{method:'POST',headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})});const d=await r.json();if(!r.ok)return null;const u=d.signedURL||d.signedUrl;return u?(u.startsWith('http')?u:base()+'/storage/v1'+u):null}catch{return null}}
async function vendorRegistrationMedia(vendorId,vehicles){
 const slots=['front','right','left','rear','interior'],out=[];
 for(const vehicle of vehicles||[]){
  const prefix=vendorId+'/'+vehicle.id;
  try{
   const response=await fetch(base()+'/storage/v1/object/list/cwd-vendor-registration-photos',{
    method:'POST',
    headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json'},
    body:JSON.stringify({prefix,limit:100,offset:0,sortBy:{column:'name',order:'asc'}})
   });
   if(!response.ok)continue;
   const rows=await response.json();
   for(const row of rows||[]){
    const name=String(row?.name||'');
    if(!slots.includes(name))continue;
    const path=prefix+'/'+name;
    const mime=String(row?.metadata?.mimetype||row?.metadata?.contentType||'');
    out.push({
      id:String(row?.id||path),
      vehicle_id:vehicle.id,
      view_type:name,
      object_path:path,
      original_filename:name,
      mime_type:mime,
      size_bytes:Number(row?.metadata?.size||0),
      created_at:row?.created_at||null,
      signed_url:await signedRegistrationPhoto(path)
    });
   }
  }catch{}
 }
 return out;
}

const VENDOR_REG_PHOTO_BUCKET='cwd-vendor-registration-photos';
const VENDOR_REG_PHOTO_SLOTS=new Set(['front','right','left','rear','interior']);
const VENDOR_REG_PHOTO_TYPES=new Set(['image/jpeg','image/png','application/pdf']);
const VENDOR_REG_PHOTO_MAX=5*1024*1024;

async function storageRequest(path,opt={}){
 if(!base()||!key())fail('Vehicle photo storage is not configured.',503);
 return fetch(base()+path,{
  ...opt,
  headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json',...(opt.headers||{})},
  signal:AbortSignal.timeout(20000)
 });
}
async function ensureVendorRegistrationPhotoBucket(){
 const check=await storageRequest('/storage/v1/bucket/'+VENDOR_REG_PHOTO_BUCKET,{method:'GET'});
 if(check.ok)return;
 const create=await storageRequest('/storage/v1/bucket',{
  method:'POST',
  body:JSON.stringify({
   id:VENDOR_REG_PHOTO_BUCKET,
   name:VENDOR_REG_PHOTO_BUCKET,
   public:false,
   file_size_limit:VENDOR_REG_PHOTO_MAX,
   allowed_mime_types:[...VENDOR_REG_PHOTO_TYPES]
  })
 });
 if(create.ok||create.status===409)return;
 const retry=await storageRequest('/storage/v1/bucket/'+VENDOR_REG_PHOTO_BUCKET,{method:'GET'});
 if(retry.ok)return;
 fail('Unable to prepare vehicle photo storage.',503);
}
function validateVendorAdminPhotoMeta(slot,type,size){
 if(!VENDOR_REG_PHOTO_SLOTS.has(slot))fail('Invalid vehicle photo position.');
 if(!VENDOR_REG_PHOTO_TYPES.has(type))fail('Use JPG, PNG or PDF.');
 if(!Number.isInteger(size)||size<=0)fail('Please choose a non-empty file.');
 if(size>VENDOR_REG_PHOTO_MAX)fail('Photo must be 5 MB or smaller.');
}
function validVendorAdminPhotoSignature(bytes,type){
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 return type==='application/pdf'&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
}
async function removeVendorRegistrationPhoto(path){
 await storageRequest('/storage/v1/object/'+VENDOR_REG_PHOTO_BUCKET,{
  method:'DELETE',
  body:JSON.stringify({prefixes:[path]})
 }).catch(()=>{});
}
function parseCwdBookingDate(value){
 const raw=String(value||'').trim().replace(/(\d{1,2})(st|nd|rd|th)/i,'$1');
 const m=raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
 if(!m)return null;
 const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
 const month=months[m[2].toLowerCase()];if(!month)return null;
 let hour=Number(m[4])%12;if(String(m[6]).toUpperCase()==='PM')hour+=12;
 const d=new Date(`${m[3]}-${String(month).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${m[5]}:00+05:30`);
 return Number.isFinite(d.getTime())?d.toISOString():null;
}
function bookingScheduleFromDetails(b){
 const text=String(b?.booking_details||'');
 let start=b?.pickup_date||b?.trip_date||b?.start_date||null;
 let end=b?.final_drop_date||b?.return_date||b?.end_date||null;
 if(!start){
   const out=text.match(/📅\s*Start:\s*([^\n]+)/i)?.[1];
   const generic=text.match(/📅\s*([^\n]+)/)?.[1];
   start=parseCwdBookingDate(out||generic?.split(/\s+[–-]\s+/)?.[0]||'');
 }
 if(!end){
   const out=text.match(/📅\s*Final Drop:\s*([^\n]+)/i)?.[1];
   const generic=text.match(/📅\s*([^\n]+)/)?.[1];
   end=parseCwdBookingDate(out||generic?.split(/\s+[–-]\s+/)?.[1]||'');
 }
 return {start,end};
}
function bookingIncludedKm(b){
 const text=String(b?.booking_details||'');
 const m=text.match(/KM Included:\s*([\d,]+)/i)||text.match(/([\d,]+)\s*km included/i);
 return m?Number(String(m[1]).replace(/,/g,''))||0:0;
}
function shortCustomerRoute(route){
 let parts=String(route||'').split('→').map(x=>x.trim()).filter(Boolean);
 if(parts.length>=3){
   const norm=x=>String(x||'').toLowerCase().replace(/\s+/g,' ').trim();
   if(norm(parts[0])===norm(parts[parts.length-1]))parts=parts.slice(1,-1);
 }
 const short=x=>{
   const bits=String(x||'').split(',').map(v=>v.trim()).filter(Boolean);
   return bits[0]||String(x||'').trim();
 };
 const compact=parts.map(short).filter(Boolean);
 return compact.join(' → ')||String(route||'');
}
async function snapshot(id){
 const raw=await booking(id),schedule=bookingScheduleFromDetails(raw);
 return {
  booking_id:raw.booking_id,trip_type:raw.trip_type||'',vehicle:raw.car_name||'',route:raw.route||'',
  start_at:schedule.start||null,final_drop_at:schedule.end||null,
  customer_name:raw.customer_name||'',customer_phone:raw.customer_phone||'',customer_email:raw.customer_email||'',
  paid_amount:n(raw.paid_amount),total_fare:n(raw.total_fare||raw.fare_amount),
  original_fare:n(raw.original_fare||raw.fare_amount||raw.total_fare),
  fare_amount:n(raw.fare_amount||raw.original_fare||raw.total_fare),
  included_km:bookingIncludedKm(raw),
  booking_details:raw.booking_details||''
 }
}
async function buildLedgers(b,a,t,over={}){
 const snap=a?.pricing_snapshot||{};
 const trip=String(b.trip_type||'').toLowerCase();
 const days=Math.max(1,Math.floor(n(over.duty_days||snap.duty_days,1)));
 const actualKm=n(over.billable_km,t.calculated_trip_km);
 const vendorMinKm=n(snap.minimum_km_per_day,240);
 const actuals={toll:n(over.toll,t.toll),parking:n(over.parking,t.parking),state_tax:n(over.state_tax,t.state_tax),other:n(over.other_amount,t.other_amount)};
 const night=Boolean(over.night_charge??t.night_charge);
 const negotiated=over.negotiated_customer_fare!==null&&over.negotiated_customer_fare!==undefined?n(over.negotiated_customer_fare):null;
 const bookingFare=negotiated!==null?negotiated:n(b.original_fare||b.fare_amount||b.total_fare);
 let customerKmRate=n(snap.customer_km_rate),vendorKmRate=n(snap.vendor_km_rate);
 let customerDa=0,vendorDa=0,customerExtraKm=0,customerExtraHours=0,customerExtraKmCharge=0,customerExtraHourCharge=0;
 let customerIncludedKm=n(b.included_km||snap.estimated_km||0),customerBillableKm=actualKm;
 let vendorBillableKm=actualKm,vendorBase=0;

 if(trip.includes('local')){
   const pack=String(snap.local_package||'8hr_80km');
   const packageKm={ '8hr_80km':80,'10hr_100km':100,'12hr_120km':120 }[pack]||80;
   const vendorPackages={
     '8hr_80km':n(snap.local_8h_80km),
     '10hr_100km':n(snap.local_10h_100km),
     '12hr_120km':n(snap.local_12h_120km)
   };
   customerIncludedKm=packageKm;
   customerExtraKm=Math.max(n(snap.extra_km),Math.max(0,actualKm-packageKm));
   customerExtraHours=n(snap.extra_hours);
   customerKmRate=n(snap.customer_local_extra_km);
   customerExtraKmCharge=customerExtraKm*customerKmRate;
   customerExtraHourCharge=customerExtraHours*n(snap.customer_local_extra_hour);
   vendorKmRate=n(snap.local_extra_km);
   vendorBillableKm=actualKm;
   vendorBase=n(vendorPackages[pack])+customerExtraKm*vendorKmRate+customerExtraHours*n(snap.local_extra_hour);
 }else{
   if(!customerIncludedKm)customerIncludedKm=Math.max(n(snap.estimated_km),days*240);
   customerExtraKm=Math.max(0,actualKm-customerIncludedKm);
   customerExtraKmCharge=customerExtraKm*customerKmRate;
   customerBillableKm=Math.max(customerIncludedKm,actualKm);
   vendorBillableKm=Math.max(actualKm,days*vendorMinKm);
   vendorBase=vendorBillableKm*vendorKmRate;
   customerDa=days*n(snap.customer_da);
   vendorDa=days*n(snap.vendor_da);
 }
 const customerNight=night?n(snap.customer_night):0;
 const vendorNight=night?n(snap.vendor_night):0;
 const customerTotal=bookingFare+customerExtraKmCharge+customerExtraHourCharge+customerNight+actuals.toll+actuals.parking+actuals.state_tax+actuals.other;
 const advance=n(b.paid_amount),balance=Math.max(0,customerTotal-advance);
 const standardVendorPreActual=vendorBase+vendorDa+vendorNight;
 const agreedVendorPreActual=snap.vendor_final_payout_override!==null&&snap.vendor_final_payout_override!==undefined?n(snap.vendor_final_payout_override):standardVendorPreActual;
 const vendorTotal=agreedVendorPreActual+actuals.toll+actuals.parking+actuals.state_tax+actuals.other-n(over.penalty);
 const due=vendorPayoutDueAt();
 return {
  customer:{
   booking_id:b.booking_id,customer_km_rate:customerKmRate,billable_km:customerBillableKm,customer_da:customerDa,customer_night:customerNight,
   toll:actuals.toll,parking:actuals.parking,state_tax:actuals.state_tax,approved_other:actuals.other,
   customer_advance:advance,customer_total:customerTotal,customer_balance:balance,updated_at:new Date().toISOString()
  },
  invoice_meta:{booking_fare:bookingFare,included_km:customerIncludedKm,actual_km:actualKm,extra_km:customerExtraKm,extra_km_rate:customerKmRate,extra_km_charge:customerExtraKmCharge,extra_hours:customerExtraHours,extra_hour_charge:customerExtraHourCharge},
  vendor:{booking_id:b.booking_id,vendor_id:a.vendor_id,vendor_km_rate:vendorKmRate,billable_km:vendorBillableKm,vendor_da:vendorDa,vendor_night:vendorNight,toll:actuals.toll,parking:actuals.parking,state_tax:actuals.state_tax,approved_other:actuals.other,penalty:n(over.penalty),vendor_final_payout:Math.max(0,vendorTotal),payout_due_at:due.toISOString(),updated_at:new Date().toISOString()}
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
      const vehicleMedia=await vendorRegistrationMedia(vendorId,vehicles||[]);
      return json({success:true,vendor:vendor[0],payout:payout?.[0]||null,vehicles:vehicles||[],vehicle_media:vehicleMedia||[],terms:terms||[],offers:offers||[],allocations:allocations||[],settlements:settlements||[]});
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
   const tripRow=trip?.[0]||null;if(tripRow){tripRow.start_photo_url=await signedPhoto(tripRow.starting_photo_path);tripRow.end_photo_url=await signedPhoto(tripRow.closing_photo_path);}
   const vendor_vehicle_options={};
   for(const v of vendors||[]){
     try{
       vendor_vehicle_options[v.id]=(await eligibleVendorVehicles(v.id,b.vehicle)).map(x=>({global_vehicle_id:String(x.global_vehicle.id),vehicle_name:x.global_vehicle.full_name,vendor_vehicle_number:x.vendor_vehicle.vehicle_number}));
     }catch{vendor_vehicle_options[v.id]=[]}
   }
   return json({success:true,booking:b,vendors:vendors||[],vendor_vehicle_options,offers:offers||[],allocation:alloc?.[0]||null,trip:tripRow,customer_ledger:customer?.[0]||null,vendor_ledger:vendorSet?.[0]||null,invoice:invoice?.[0]||null,commercial_override:commercialOverride?.[0]||null});
  }
  const body=await request.json(),action=String(body.action||''),id=String(body.booking_id||'');

  if(action==='prepare_vendor_vehicle_photo'){
    const vendorId=String(body.vendor_id||'').trim(),vehicleId=String(body.vehicle_id||'').trim();
    const slot=String(body.slot||'').trim().toLowerCase(),type=String(body.type||'').trim(),size=Number(body.size);
    if(!vendorId||!vehicleId)fail('Vendor and vehicle are required.');
    validateVendorAdminPhotoMeta(slot,type,size);
    const vehicle=(await db('cwd_vendor_vehicles?id=eq.'+encodeURIComponent(vehicleId)+'&vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=id&limit=1'))?.[0];
    if(!vehicle)fail('Vendor vehicle not found.',404);
    await ensureVendorRegistrationPhotoBucket();
    const objectPath=vendorId+'/'+vehicleId+'/'+slot;
    await removeVendorRegistrationPhoto(objectPath);
    const signed=await storageRequest('/storage/v1/object/upload/sign/'+VENDOR_REG_PHOTO_BUCKET+'/'+objectPath,{method:'POST',body:'{}'});
    const data=await signed.json().catch(()=>({}));
    if(!signed.ok||!data.url)fail('Unable to start vehicle photo upload.',503);
    const uploadUrl=new URL(base()+'/storage/v1'+data.url);
    if(uploadUrl.origin!==new URL(base()).origin||!uploadUrl.pathname.startsWith('/storage/v1/object/upload/sign/'+VENDOR_REG_PHOTO_BUCKET+'/'))fail('Unable to start vehicle photo upload.',503);
    return json({success:true,upload_url:uploadUrl.href,object_path:objectPath});
  }

  if(action==='verify_vendor_vehicle_photo'){
    const vendorId=String(body.vendor_id||'').trim(),vehicleId=String(body.vehicle_id||'').trim();
    const slot=String(body.slot||'').trim().toLowerCase(),objectPath=String(body.object_path||'').trim();
    if(!vendorId||!vehicleId)fail('Vendor and vehicle are required.');
    if(!VENDOR_REG_PHOTO_SLOTS.has(slot))fail('Invalid vehicle photo position.');
    const expectedPath=vendorId+'/'+vehicleId+'/'+slot;
    if(objectPath!==expectedPath)fail('Invalid vehicle photo reference.',403);
    const vehicle=(await db('cwd_vendor_vehicles?id=eq.'+encodeURIComponent(vehicleId)+'&vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=id&limit=1'))?.[0];
    if(!vehicle)fail('Vendor vehicle not found.',404);
    const response=await storageRequest('/storage/v1/object/authenticated/'+VENDOR_REG_PHOTO_BUCKET+'/'+objectPath,{method:'GET'});
    if(!response.ok)fail('Vehicle photo was not received. Please retry.',409);
    const actualType=String(response.headers.get('content-type')||'').split(';')[0];
    const bytes=new Uint8Array(await response.arrayBuffer());
    try{
      validateVendorAdminPhotoMeta(slot,actualType,bytes.length);
      if(!validVendorAdminPhotoSignature(bytes,actualType))fail('File content does not match JPG, PNG or PDF.');
    }catch(error){
      await removeVendorRegistrationPhoto(objectPath);
      throw error;
    }
    return json({success:true,vehicle_id:vehicleId,slot,mime_type:actualType,size_bytes:bytes.length});
  }

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
      minimum_outstation_km_per_day:MIN_OUTSTATION_KM_DAY, // fixed preview policy
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
  if(action==='set_vendor_vehicle_status'){
    const vendorId=String(body.vendor_id||'').trim(),vehicleId=String(body.vehicle_id||'').trim();
    if(!vendorId||!vehicleId)fail('Vendor and vehicle are required.');
    const vehicle=(await db('cwd_vendor_vehicles?id=eq.'+encodeURIComponent(vehicleId)+'&vendor_id=eq.'+encodeURIComponent(vendorId)+'&select=id,vehicle_number,is_active&limit=1'))?.[0];
    if(!vehicle)fail('Vendor vehicle not found.',404);
    const active=body.is_active===true;
    await db('cwd_vendor_vehicles?id=eq.'+encodeURIComponent(vehicleId),{
      method:'PATCH',
      headers:{Prefer:'return=minimal'},
      body:JSON.stringify({is_active:active})
    });
    return json({success:true,vehicle_id:vehicleId,is_active:active});
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
        rc_number:vehicleNumber
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
  if(action==='unlock_vendor_cancellation'){
    const offerId=String(body.offer_id||'');
    if(!/^[0-9a-f-]{36}$/i.test(offerId))fail('Offer ID is required.');
    const offer=(await db('cwd_vendor_offers?id=eq.'+
      encodeURIComponent(offerId)+'&select=id,status&limit=1'))?.[0];
    if(!offer||offer.status!=='accepted')
      fail('Only accepted, unallocated offers can be unlocked.',409);
    const allowed=body.allow===true;
    await db('cwd_vendor_offers?id=eq.'+encodeURIComponent(offerId),{
      method:'PATCH',headers:{Prefer:'return=minimal'},
      body:JSON.stringify({vendor_cancel_unlocked_at:
        allowed?new Date().toISOString():null}),
    });
    return json({success:true,allowed});
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
    const tripKind=String(b.trip_type||'').toLowerCase();
    const outstation=tripKind.includes('outstation');
    const local=tripKind.includes('local');
    // For outstation, never trust manually entered vendor KM/night counts.
    // Customer booked KM is the single source of truth.
    const bookedDays=Number(String(b.booking_details||'').match(/(\d+)\s*Days?\s*\|/i)?.[1]||0);
    const days=bookedDays>0?bookedDays:Math.max(1,Math.floor(n(body.duty_days,1)));
    if(outstation&&(!Number.isFinite(b.included_km)||b.included_km<=0))
      fail('Customer booked KM missing. Check booking details before making an offer.',409);
    const p={trip_type:b.trip_type,
      estimated_km:outstation?Math.max(b.included_km,days*MIN_OUTSTATION_KM_DAY):n(body.estimated_km),
      duty_days:days,
      night_count:bookingNightCount(b.start_at,b.final_drop_at),
      local_package:local?(body.local_package||'8hr_80km'):null,
      extra_km:local?n(body.extra_km):0,
      extra_hours:local?n(body.extra_hours):0};
    const selectedVehicleByVendor=body.vendor_vehicle_ids&&typeof body.vendor_vehicle_ids==='object'?body.vendor_vehicle_ids:{};
    const vendorRateOverride=body.vendor_rate_per_km_override===null||body.vendor_rate_per_km_override===''?null:n(body.vendor_rate_per_km_override);
    const vendorFinalOverride=body.vendor_final_payout_override===null||body.vendor_final_payout_override===''?null:n(body.vendor_final_payout_override);
    const vendorOverrideReason=String(body.vendor_override_reason||'').trim();
    if((vendorRateOverride!==null||vendorFinalOverride!==null)&&!vendorOverrideReason)fail('Vendor override reason is required.');
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
      const eligible=await eligibleVendorVehicles(vid,b.vehicle);
      if(!eligible.length)fail((vendor.owner_business_name||vendor.vendor_code)+' has no active registered vehicle compatible with '+b.vehicle+'.',409);
      const preferredId=String(selectedVehicleByVendor[vid]||'');
      let chosen=preferredId?eligible.find(x=>String(x.global_vehicle.id)===preferredId):null;
      if(!chosen&&eligible.length===1)chosen=eligible[0];
      if(!chosen&&eligible.length>1)fail('Choose the exact vehicle model for '+(vendor.owner_business_name||vendor.vendor_code)+' before generating the offer.',409);
      const vr={car:chosen.global_vehicle,rate:chosen.rate};
      const rateForOffer={...vr.rate,minimum_outstation_km_per_day:MIN_OUTSTATION_KM_DAY,night_charge:VENDOR_NIGHT_CHARGE,local_extra_km_rate:n(vr.rate.outstation_rate_per_km)};
      if(vendorRateOverride!==null)rateForOffer.outstation_rate_per_km=vendorRateOverride;
      let payout=vendorPayoutFromRate(p,rateForOffer);
      if(vendorFinalOverride!==null)payout=vendorFinalOverride;
      const raw=token(),h=await hashToken(raw);
      const rows=await db('cwd_vendor_offers',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({vendor_id:vid,booking_id:id,offer_token_hash:h,status:'offered',trip_type:b.trip_type||'',vehicle_required:vr.car.full_name||b.vehicle||'',route_summary:b.route||'',start_at:iso(b.start_at),final_drop_at:iso(b.final_drop_at),estimated_km:p.estimated_km,duty_days:p.duty_days,night_count:p.night_count,local_package:p.local_package,extra_km:p.extra_km,extra_hours:p.extra_hours,estimated_vendor_payout:payout,pricing_snapshot:{...p,vehicle_rate_id:String(vr.car.id),vehicle_name:vr.car.full_name,customer_km_rate:n(vr.car.outstation_rate_per_km),customer_da:n(vr.car.driver_allowance_per_day),customer_night:CUSTOMER_NIGHT_CHARGE,customer_local_8h_80km:n(vr.car.local_pkg_8hr_80km),customer_local_10h_100km:n(vr.car.local_pkg_8hr_80km)+n(vr.car.local_extra_hour_rate)*2,customer_local_12h_120km:n(vr.car.local_pkg_8hr_80km)+n(vr.car.local_extra_hour_rate)*4,customer_local_extra_km:n(vr.car.local_extra_km_rate),customer_local_extra_hour:n(vr.car.local_extra_hour_rate),vendor_km_rate:n(rateForOffer.outstation_rate_per_km),vendor_da:n(rateForOffer.driver_allowance_per_day),vendor_night:VENDOR_NIGHT_CHARGE,minimum_km_per_day:MIN_OUTSTATION_KM_DAY,pricing_policy_version:'CWD-KM-200-TIER-V1',customer_extra_km_rate:n(vr.car.outstation_rate_per_km)+1,customer_first_km:days*MIN_OUTSTATION_KM_DAY,local_8h_80km:n(rateForOffer.local_pkg_8hr_80km),local_10h_100km:n(rateForOffer.local_pkg_10hr_100km),local_12h_120km:n(rateForOffer.local_pkg_12hr_120km),local_extra_km:n(rateForOffer.outstation_rate_per_km),local_extra_hour:n(rateForOffer.local_extra_hour_rate),vendor_rate_override:vendorRateOverride,vendor_final_payout_override:vendorFinalOverride,vendor_override_reason:vendorOverrideReason||null},created_by:String(user.email||'')})});
      created.push({...rows?.[0],vendor_name:vendor.owner_business_name,vendor_code:vendor.vendor_code,vendor_whatsapp:vendor.primary_whatsapp,margin_preview:marginPreview(b.total_fare,payout),view_url:publicBase(request)+'/vendor-booking?offer='+raw});
    } return json({success:true,offers:created});
  }
  if(action==='allocate'){
    const os=await db('cwd_vendor_offers?id=eq.'+encodeURIComponent(body.offer_id)+'&booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),o=os?.[0];if(!o||o.status!=='accepted')fail('Only an accepted offer can be allocated.',409);
    const old=await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1');
    if(old?.[0])await db('cwd_vendor_allocations?id=eq.'+old[0].id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'reallocated',revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    await db('cwd_vendor_offers?booking_id=eq.'+encodeURIComponent(id)+'&status=eq.allocated',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'revoked'})});
    let chosenPlate=null;
    if(o.selected_vendor_vehicle_id){
      const selected=(await db('cwd_vendor_vehicles?id=eq.'+
        encodeURIComponent(o.selected_vendor_vehicle_id)+
        '&vendor_id=eq.'+encodeURIComponent(o.vendor_id)+
        '&is_active=eq.true&select=vehicle_number&limit=1'))?.[0];
      if(!selected)fail('Vendor selected car is no longer active.',409);
      chosenPlate=selected.vehicle_number;
    }
    const raw=token(),h=await hashToken(raw);
    const rows=await db('cwd_vendor_allocations',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({booking_id:id,offer_id:o.id,vendor_id:o.vendor_id,allocation_token_hash:h,status:'allocated',allocated_at:new Date().toISOString(),revoked_at:null,vehicle_number:chosenPlate})});
    await db('cwd_vendor_offers?id=eq.'+o.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'allocated'})});
    return json({success:true,allocation:rows?.[0],allocated_url:publicBase(request)+'/vendor-booking?allocation='+raw});
  }
  if(action==='allow_early_start'){
    const a=(await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'))?.[0];
    if(!a)fail('No allocated vendor found.',404);
    const t=(await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(id)+'&select=started_at,ended_at&limit=1'))?.[0];
    if(t?.ended_at)fail('Trip is already closed.',409);
    if(t?.started_at)fail('Trip has already started.',409);
    const o=(await db('cwd_vendor_offers?id=eq.'+encodeURIComponent(a.offer_id)+'&select=id,pricing_snapshot&limit=1'))?.[0];
    if(!o)fail('Allocated offer not found.',404);
    const now=new Date().toISOString();
    const pricing={...(o.pricing_snapshot||{}),early_start_approved_at:now,early_start_approved_by:String(user.email||'')};
    await db('cwd_vendor_offers?id=eq.'+encodeURIComponent(o.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({pricing_snapshot:pricing})});
    return json({success:true,approved_at:now});
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
    await db('inquiries?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({
      extra_km:led.invoice_meta.extra_km,
      extra_km_rate:led.invoice_meta.extra_km_rate,
      extra_km_charge:led.invoice_meta.extra_km_charge,
      night_charge:led.customer.customer_night,
      toll_charge:led.customer.toll,
      parking_charge:led.customer.parking,
      state_tax_charge:led.customer.state_tax,
      other_charge:led.customer.approved_other,
      total_fare:led.customer.customer_total,
      final_charges_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    })});
    return json({success:true,customer_ledger:led.customer,vendor_ledger:led.vendor});
  }
  if(action==='refresh_invoice_totals'){
    const [cl,a,co]=await Promise.all([
      db('cwd_customer_billing_ledger?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
      db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=offer_id&limit=1'),
      db('cwd_booking_commercial_overrides?booking_id=eq.'+encodeURIComponent(id)+'&select=negotiated_customer_fare&limit=1')
    ]);
    const ledger=cl?.[0];if(!ledger)fail('Approve trip review first.');
    const offer=a?.[0]?(await db('cwd_vendor_offers?id=eq.'+encodeURIComponent(a[0].offer_id)+'&select=pricing_snapshot&limit=1'))?.[0]:null;
    const ps=offer?.pricing_snapshot||{};
    const bookingFare=co?.[0]?.negotiated_customer_fare!==null&&co?.[0]?.negotiated_customer_fare!==undefined?n(co[0].negotiated_customer_fare):n(b.original_fare||b.fare_amount||b.total_fare);
    const trip=String(b.trip_type||'').toLowerCase();
    const pack=String(ps.local_package||'8hr_80km');
    const includedKm=trip.includes('local')?({'8hr_80km':80,'10hr_100km':100,'12hr_120km':120}[pack]||80):n(b.included_km||ps.estimated_km||240);
    const extraKm=Math.max(0,n(ledger.billable_km)-includedKm);
    const extraKmCharge=extraKm*n(ledger.customer_km_rate);
    const extraHours=trip.includes('local')?n(ps.extra_hours):0;
    const extraHourCharge=extraHours*n(ps.customer_local_extra_hour);
    const total=bookingFare+extraKmCharge+extraHourCharge+n(ledger.customer_night)+n(ledger.toll)+n(ledger.parking)+n(ledger.state_tax)+n(ledger.approved_other);
    const balance=Math.max(0,total-n(ledger.customer_advance));
    await db('cwd_customer_billing_ledger?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({customer_total:total,customer_balance:balance,updated_at:new Date().toISOString()})});
    await db('inquiries?booking_id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({extra_km:extraKm,extra_km_rate:n(ledger.customer_km_rate),extra_km_charge:extraKmCharge,night_charge:n(ledger.customer_night),toll_charge:n(ledger.toll),parking_charge:n(ledger.parking),state_tax_charge:n(ledger.state_tax),other_charge:n(ledger.approved_other),total_fare:total,final_charges_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    return json({success:true,total,balance,booking_fare:bookingFare});
  }
  if(action==='generate_invoice'){
    const [cl,a,co]=await Promise.all([
      db('cwd_customer_billing_ledger?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),
      db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(id)+'&select=offer_id&limit=1'),
      db('cwd_booking_commercial_overrides?booking_id=eq.'+encodeURIComponent(id)+'&select=negotiated_customer_fare&limit=1')
    ]);
    const ledger=cl?.[0];if(!ledger)fail('Approve trip review first.');
    const offer=a?.[0]?(await db('cwd_vendor_offers?id=eq.'+encodeURIComponent(a[0].offer_id)+'&select=pricing_snapshot&limit=1'))?.[0]:null;
    const ps=offer?.pricing_snapshot||{};
    const bookingFare=co?.[0]?.negotiated_customer_fare!==null&&co?.[0]?.negotiated_customer_fare!==undefined?n(co[0].negotiated_customer_fare):n(b.original_fare||b.fare_amount||b.total_fare);
    const trip=String(b.trip_type||'').toLowerCase();
    const localPack=String(ps.local_package||'8hr_80km');
    const includedKm=trip.includes('local')?({'8hr_80km':80,'10hr_100km':100,'12hr_120km':120}[localPack]||80):n(b.included_km||ps.estimated_km||240);
    const extraKm=Math.max(0,n(ledger.billable_km)-includedKm);
    const extraKmRate=n(ledger.customer_km_rate);
    const extraKmCharge=extraKm*extraKmRate;
    const extraHours=trip.includes('local')?n(ps.extra_hours):0;
    const extraHourRate=trip.includes('local')?n(ps.customer_local_extra_hour):0;
    const extraHourCharge=extraHours*extraHourRate;
    const snap={
      booking_id:id,
      route:shortCustomerRoute(b.route),
      trip_date:b.start_at,
      vehicle:b.vehicle,
      booking_fare:bookingFare,
      booking_fare_note:'Includes car, fuel and driver allowance',
      included_km:includedKm,
      extra_km:extraKm,
      extra_km_rate:extraKmRate,
      extra_km_charge:extraKmCharge,
      extra_hours:extraHours,
      extra_hour_rate:extraHourRate,
      extra_hour_charge:extraHourCharge,
      ...ledger
    };
    const raw=token(),h=await hashToken(raw);
    const rows=await db('cwd_customer_invoices?on_conflict=booking_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({booking_id:id,invoice_token_hash:h,invoice_snapshot:snap,payment_url:String(body.payment_url||'')||null})});
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