// CWD Partner: vendor-scoped server operations; never trust a client vendor_id.
// Always scope tables by the vendor validated from a hashed login session.
import {
  vendorAuthOrFail,vendorDb,activeVendorForSession,sha256,authError,
} from '../lib/vendor-app-server.mjs';
import {vendorOfferAreaSummary,vendorOfferSafePricing}
  from '../lib/vendor-offer-privacy.mjs';
export const config={runtime:'edge'};

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'},
});
const fail=(msg,status=400)=>{throw authError(msg,status);};
const eq=v=>encodeURIComponent(String(v));
const number=(v,{max=10000000}={})=>{
  const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=max?n:null;
};
const now=()=>new Date().toISOString();
const validUuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));
const cleanVehicle=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
// Reservations are evaluated on India-local calendar dates, not UTC midnight.
export function indiaDate(iso) {
 const ms=Date.parse(String(iso||''));
 if(!Number.isFinite(ms))return null;
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(new Date(ms));
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return v.year+'-'+v.month+'-'+v.day;
}
export function bookedOnDate(date,from,to) {
 const start=indiaDate(from),end=indiaDate(to||from);
 return !!(start&&end&&date>=start&&date<=end);
}
// Two accepted/allocated offers may not reserve the same vendor car for
// overlapping trip duties. The fallback uses the agreed duty-days field.
export function tripsOverlap(first,second) {
 const window=offer=>{
   const from=Date.parse(offer?.start_at||'');
   if(!Number.isFinite(from))return null;
   const explicit=Date.parse(offer?.final_drop_at||'');
   const days=Math.max(1,Math.min(30,Number(offer?.duty_days)||1));
   const until=Number.isFinite(explicit)&&explicit>from
     ?explicit:from+days*86400000;
   return {from,until};
 };
 const a=window(first),b=window(second);
 return !a||!b|| (a.from<b.until&&b.from<a.until);
}
const brandTokens=['dzire','aura','ertiga','carens','innova','crysta','wagonr','swift','baleno','xuv','brezza','ciaz','honda city','city','creta','nexon'];
export function matchedCar(required,vehicle){
  const req=String(required||'').toLowerCase();
  const model=String(vehicle?.make_model||'').toLowerCase();
  const group=String(vehicle?.category||'').toLowerCase();
  if(!req||!model)return false;
  const key=brandTokens.find(t=>(' '+req+' ').includes(' '+t+' '));
  if(key)return (' '+model+' ').includes(' '+key+' ');
  const category=['hatchback','sedan','suv','muv','mpv'].find(x=>req.includes(x));
  if(category)return group.includes(category) || (
    category==='mpv'&&group.includes('muv'));
  return cleanVehicle(req)===cleanVehicle(model);
}
export function safeOffer(row,vehicles=[]){
  const area=vendorOfferAreaSummary(row.route_summary);
  return {
    id:row.id,booking_id:row.booking_id,status:row.status,
    vehicle_required:row.vehicle_required||'',
    trip_type:row.trip_type||'',
    pickup_area:area.pickup_area,destination_area:area.destination_area,
    start_at:row.start_at,final_drop_at:row.final_drop_at,
    estimated_km:row.estimated_km,estimated_payout:row.estimated_vendor_payout,
    estimated_vendor_payout:row.estimated_vendor_payout,
    pricing:vendorOfferSafePricing(row.pricing_snapshot),
    selectable_vehicles:vehicles.filter(v=>v.is_active&&matchedCar(row.vehicle_required,v))
      .map(v=>({id:v.id,vehicle_number:v.vehicle_number,make_model:v.make_model,
        category:v.category})),
    selected_vehicle_id:row.selected_vendor_vehicle_id||null,
    cancel_unlocked:Boolean(row.vendor_cancel_unlocked_at),
    // Deliberately no customer contact, exact addresses or raw route text.
  };
}
function customerTripLocations(b){
  const raw=String(b?.route||'');
  let locations=raw.split(/\s*(?:→|➔|➜|->)\s*/).map(v=>v.trim()).filter(Boolean);
  const base=s=>/godrej hillside colony|vikhroli base/i.test(String(s));
  if(locations.length>1&&base(locations[0]))locations.shift();
  if(locations.length>1&&base(locations.at(-1)))locations.pop();
  // Live inquiries store detailed route information in the route field.
  // pickup_location and destination do not exist on the production table.
  const pickup=String(locations[0]||b?.full_address||'').trim();
  const last=String(locations.at(-1)||'').trim();
  const round=/round/i.test(b?.trip_type||b?.booking_details||'');
  const destination=round
    ? String(locations.slice(1).find(v=>v.toLowerCase()!==pickup.toLowerCase())||last||'').trim()
    : last;
  // Detailed intermediate stops are shared only AFTER CWD admin allocation.
  // safeOffer() must never expose these customer route strings.
  const stops=locations.slice(1,-1);
  return {pickup,drop:round?pickup:last,destination,stops};
}
function customerAfterAllocation(booking){
  if(!booking)return null;
  const p=customerTripLocations(booking);
  return {customer_name:booking.customer_name||'',
    customer_mobile:booking.customer_phone||'',
    pickup_address:p.pickup,drop_address:p.drop,
    destination:p.destination,stops:p.stops};
}
export function allocationSafe(row,offer,booking,trip,settlement){
  const status=row.status==='trip_started'?'ongoing':
    ['trip_completed_review_required','approved'].includes(row.status)
    ?'completed':row.status;
  return {
    id:row.id,booking_id:row.booking_id,status,
    allocation_status:row.status,allocated_at:row.allocated_at,
    vehicle_number:row.vehicle_number,
    driver_name:row.driver_name,driver_mobile:row.driver_mobile,
    trip_type:offer?.trip_type||'',vehicle_required:offer?.vehicle_required||'',
    pickup_at:offer?.start_at||null,final_drop_at:offer?.final_drop_at||null,
    estimated_payout:offer?.estimated_vendor_payout||0,
    pricing:vendorOfferSafePricing(offer?.pricing_snapshot),
    route:vendorOfferAreaSummary(offer?.route_summary),
    customer:customerAfterAllocation(booking),
    trip:trip?{starting_odometer:trip.starting_odometer,
      started_at:trip.started_at,closing_odometer:trip.closing_odometer,
      ended_at:trip.ended_at,review_status:trip.review_status}:null,
    // Only admin-approved ledger may be called the final earning.
    final_earning:row.status==='approved'&&settlement?
      {vendor_km_rate:settlement.vendor_km_rate,
        billable_km:settlement.billable_km,
        vendor_da:settlement.vendor_da,vendor_night:settlement.vendor_night,
        toll:settlement.toll,parking:settlement.parking,
        state_tax:settlement.state_tax,approved_other:settlement.approved_other,
        penalty:settlement.penalty,
        payout_status:settlement.payout_status,
        payout_due_at:settlement.payout_due_at||null,
        paid_at:settlement.paid_at||null,
        utr_reference:settlement.payout_status==='paid'
          ?settlement.utr_reference||null:null,
        vendor_final_payout:settlement.vendor_final_payout}:null,
  };
}
function assertWrite(cfg){
 if(!cfg.writesEnabled)fail('Booking changes are locked on this preview. Contact CWD admin.',403);
}
async function ownedOffer(cfg,vid,id){
 if(!validUuid(id))fail('Valid offer ID required.');
 const list=await vendorDb(cfg,'cwd_vendor_offers?id=eq.'+eq(id)+
   '&vendor_id=eq.'+eq(vid)+'&select=*&limit=1');
 if(!list?.[0])fail('Booking offer not found.',404);
 return list[0];
}
async function ownedAllocation(cfg,vid,id){
 if(!validUuid(id))fail('Valid allocation ID required.');
 const list=await vendorDb(cfg,'cwd_vendor_allocations?id=eq.'+eq(id)+
   '&vendor_id=eq.'+eq(vid)+'&select=*&limit=1');
 const a=list?.[0];
 if(!a||a.revoked_at||['cancelled','reallocated'].includes(a.status))
   fail('Booking is no longer allocated to you.',404);
 return a;
}
async function vendorVehicles(cfg,vid){
 return await vendorDb(cfg,'cwd_vendor_vehicles?vendor_id=eq.'+
   eq(vid)+'&select=id,vendor_id,vehicle_number,make_model,category,is_active&order=created_at.desc&limit=150')||[];
}
async function listDashboard(cfg,vendor){
 const vid=vendor.id;
 const [vehicles,offers,alloc,blocks]=await Promise.all([
   vendorVehicles(cfg,vid),
   vendorDb(cfg,'cwd_vendor_offers?vendor_id=eq.'+
     eq(vid)+'&select=*&order=created_at.desc&limit=120'),
   vendorDb(cfg,'cwd_vendor_allocations?vendor_id=eq.'+
     eq(vid)+'&select=*&order=allocated_at.desc&limit=120'),
   vendorDb(cfg,'cwd_vendor_app_vehicle_blocks?vendor_id=eq.'+
     eq(vid)+'&select=id,vehicle_id,blocked_date,reason&order=blocked_date.asc&limit=350'),
 ]);
 const allocatedIds=new Set((alloc||[]).filter(a=>!a.revoked_at).map(a=>a.offer_id));
 const details=[];
 for(const a of (alloc||[]).filter(a=>!a.revoked_at&&a.status!=='reallocated')){
   const offer=(offers||[]).find(o=>o.id===a.offer_id)||(
     await vendorDb(cfg,'cwd_vendor_offers?id=eq.'+eq(a.offer_id)+
       '&vendor_id=eq.'+eq(vid)+'&select=*&limit=1'))?.[0];
   if(!offer)continue;
   const [booking,trip,ledger]=await Promise.all([
     vendorDb(cfg,'inquiries?booking_id=eq.'+eq(a.booking_id)+
       '&select=booking_id,customer_name,customer_phone,full_address,route,trip_type,booking_details&limit=1'),
     vendorDb(cfg,'cwd_vendor_trip_events?booking_id=eq.'+
       eq(a.booking_id)+'&select=starting_odometer,started_at,closing_odometer,ended_at,review_status&limit=1'),
     a.status==='approved'
       ?vendorDb(cfg,'cwd_vendor_settlement_ledger?booking_id=eq.'+
         eq(a.booking_id)+'&vendor_id=eq.'+eq(vid)+'&select=*&limit=1')
       :Promise.resolve([]),
   ]);
   details.push(allocationSafe(a,offer,booking?.[0],trip?.[0],ledger?.[0]));
 }
 const exposed=(offers||[]).filter(o=>!allocatedIds.has(o.id)&&
   !['revoked','expired'].includes(o.status)).map(o=>safeOffer(o,vehicles));
 return json({success:true,
   vendor:{vendor_code:vendor.vendor_code,name:vendor.owner_business_name},
   vehicles:vehicles.map(v=>({id:v.id,vehicle_number:v.vehicle_number,
     make_model:v.make_model,category:v.category,is_active:v.is_active})),
   vehicle_blocks:blocks||[],offers:exposed,
   allocations:details,
   is_live_writes_enabled:Boolean(cfg.writesEnabled),
 });
}
async function respondOffer(cfg,vid,body){
 const offer=await ownedOffer(cfg,vid,body.offer_id);
 const response=String(body.response||'');
 if(!['accepted','declined'].includes(response))fail('Invalid booking response.');
 if(offer.status!=='offered')fail('Offer has already been answered.',409);
 const reason=String(body.reason||'').trim().slice(0,160);
 if(response==='declined'&&!reason)
   fail('Select a reason before declining this booking.',400);
 let selected=null;
 if(response==='accepted'){
   const vehicle=(await vendorDb(cfg,'cwd_vendor_vehicles?id=eq.'+
     eq(body.vehicle_id)+'&vendor_id=eq.'+eq(vid)+
     '&is_active=eq.true&select=id,make_model,category,vehicle_number&limit=1'))?.[0];
   if(!vehicle||!matchedCar(offer.vehicle_required,vehicle))
     fail('Select an approved matching registered car.',409);
   const from=indiaDate(offer.start_at);
   const until=indiaDate(offer.final_drop_at||offer.start_at);
   if(!from||!until||until<from)
     fail('Booking dates are incomplete. Contact CWD admin.',409);
   const blocked=await vendorDb(cfg,'cwd_vendor_app_vehicle_blocks?vehicle_id=eq.'+
     eq(vehicle.id)+'&blocked_date=gte.'+from+
     '&blocked_date=lte.'+until+'&select=id&limit=1');
   if(blocked?.length)fail('Selected car is blocked for these dates.',409);
   const reserved=await vendorDb(cfg,'cwd_vendor_offers?vendor_id=eq.'+
     eq(vid)+'&selected_vendor_vehicle_id=eq.'+eq(vehicle.id)+
     '&status=in.(accepted,allocated)&select=id,start_at,final_drop_at,duty_days&limit=120');
   if((reserved||[]).some(other=>other.id!==offer.id&&tripsOverlap(offer,other)))
     fail('This car already has an overlapping accepted booking. Select another car.',409);
   selected=vehicle.id;
 }
 const changed=await vendorDb(cfg,'cwd_vendor_offers?id=eq.'+eq(offer.id)+
  '&vendor_id=eq.'+eq(vid)+'&status=eq.offered',{
   method:'PATCH',headers:{Prefer:'return=representation'},
   body:JSON.stringify({status:response,responded_at:now(),
      ...(selected?{selected_vendor_vehicle_id:selected}:{}),
      ...(reason?{vendor_response_reason:reason}:{})}),
 });
 if(changed?.length!==1)fail('Offer has already changed. Refresh your bookings.',409);
 return json({success:true,status:response});
}
async function cancelAcceptedOffer(cfg,vid,body) {
 const offer=await ownedOffer(cfg,vid,body.offer_id);
 if(offer.status!=='accepted'||!offer.vendor_cancel_unlocked_at)
   fail('Cancellation is locked. Contact the CWD admin.',403);
 const reason=String(body.reason||'').trim().slice(0,160);
 if(!reason)fail('Cancellation reason required.');
 const changed=await vendorDb(cfg,'cwd_vendor_offers?id=eq.'+eq(offer.id)+
   '&vendor_id=eq.'+eq(vid)+'&status=eq.accepted',{
    method:'PATCH',headers:{Prefer:'return=representation'},
    body:JSON.stringify({status:'declined',responded_at:now(),
      vendor_response_reason:reason,vendor_cancel_unlocked_at:null}),
 });
 if(changed?.length!==1)fail('Offer is no longer cancellable.',409);
 return json({success:true,status:'declined'});
}
async function saveDriver(cfg,vid,body){
 const a=await ownedAllocation(cfg,vid,body.allocation_id);
 if(!['allocated','trip_started'].includes(a.status))
   fail('Trip details are locked.',409);
 const existing=(await vendorDb(cfg,'cwd_vendor_trip_events?booking_id=eq.'+
   eq(a.booking_id)+'&select=ended_at&limit=1'))?.[0];
 if(existing?.ended_at)fail('Trip is closed. Contact CWD for correction.',409);
 const vehicle=cleanVehicle(body.vehicle_number);
 const driver=String(body.driver_name||'').trim();
 const mobile=String(body.driver_mobile||'').replace(/\D/g,'');
 const allowed=(await vendorVehicles(cfg,vid)).some(v=>
   v.is_active&&cleanVehicle(v.vehicle_number)===vehicle);
 if(!allowed)fail('Vehicle must belong to your approved fleet.',409);
 // A selected car is approved during offer acceptance, so the driver cannot
 // substitute another plate without CWD admin approval.
 const offer=await ownedOffer(cfg,vid,a.offer_id);
 const selected=(await vendorDb(cfg,'cwd_vendor_vehicles?vehicle_number=eq.'+
   eq(vehicle)+'&vendor_id=eq.'+eq(vid)+
   '&select=id,vehicle_number,make_model,category&limit=1'))?.[0];
 if(!selected||!matchedCar(offer.vehicle_required,selected)||
     (offer.selected_vendor_vehicle_id&&
      offer.selected_vendor_vehicle_id!==selected.id))
   fail('Vehicle does not match the allocated car. Contact CWD admin.',409);
 if(!driver||driver.length>120||!(/^[6-9]\d{9}$/).test(mobile))
   fail('Enter driver name and a valid 10-digit mobile.',400);
 const updated=await vendorDb(cfg,'cwd_vendor_allocations?id=eq.'+eq(a.id)+
   '&vendor_id=eq.'+eq(vid),{
     method:'PATCH',headers:{Prefer:'return=representation'},
     body:JSON.stringify({vehicle_number:vehicle,driver_name:driver,
        driver_mobile:mobile,updated_at:now()}),
   });
 if(updated?.length!==1)fail('Driver details could not be saved.',409);
 return json({success:true});
}
async function uploadPhoto(cfg,bookingId,file,kind) {
 if(!(file instanceof File)||file.size<100||file.size>5242880)
   fail('A real odometer photo under 5 MB is required.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))
   fail('Use JPG, PNG or WEBP photo.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const jpg=bytes[0]===0xff&&bytes[1]===0xd8;
 const png=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
 const webp=bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&
   bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50;
 if(!(jpg||png||webp)||!({ 'image/jpeg':jpg,'image/png':png,'image/webp':webp }[file.type]))
   fail('Photo file content is invalid.');
 const path=bookingId+'/'+kind+'-'+crypto.randomUUID();
 const response=await fetch(cfg.url+'/storage/v1/object/cwd-vendor-trip-photos/'+path,{
   method:'POST',headers:{apikey:cfg.key,
     Authorization:'Bearer '+cfg.key,'Content-Type':file.type,'x-upsert':'false'},
   body:bytes,signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)fail('Unable to upload odometer photo.',503);
 return path;
}
async function saveTrip(cfg,vid,form){
 const a=await ownedAllocation(cfg,vid,String(form.get('allocation_id')||''));
 const action=String(form.get('action')||'');
 const trip=(await vendorDb(cfg,'cwd_vendor_trip_events?booking_id=eq.'+
   eq(a.booking_id)+'&select=*&limit=1'))?.[0];
 const km=number(form.get('odometer'),{max:9999999});
 if(km===null)fail('Valid odometer reading required.');
 if(action==='start_trip'){
   if(a.status!=='allocated'||trip?.started_at)
     fail('This trip cannot be started again.',409);
   if(String(form.get('customer_picked_up'))!=='yes')
     fail('Please confirm that the customer has been picked up.',400);
   if(!a.vehicle_number||!a.driver_name||!a.driver_mobile)
     fail('Save vehicle and driver details before starting.',409);
   const offer=(await ownedOffer(cfg,vid,a.offer_id));
   const planned=Date.parse(offer.start_at||'');
   if(!Number.isFinite(planned))
     fail('Trip pickup time missing. Contact CWD admin.',409);
   if(Date.now()<planned-3*3600000&&!offer.pricing_snapshot?.early_start_approved_at)
     fail('Start Trip is available only within 3 hours of pickup.',409);
   const photo=await uploadPhoto(cfg,a.booking_id,form.get('photo'),'start');
   await vendorDb(cfg,'cwd_vendor_trip_events',{
     method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
     body:JSON.stringify({booking_id:a.booking_id,
       starting_odometer:km,starting_photo_path:photo,
       started_at:now(),review_status:'not_submitted'}),
   });
   await vendorDb(cfg,'cwd_vendor_allocations?booking_id=eq.'+
     eq(a.booking_id)+'&vendor_id=eq.'+eq(vid)+'&status=eq.allocated',{
     method:'PATCH',headers:{Prefer:'return=minimal'},
     body:JSON.stringify({status:'trip_started',updated_at:now()}),
   });
   return json({success:true,status:'ongoing'});
 }
 if(action==='end_trip'){
   if(a.status!=='trip_started'||!trip?.started_at||trip.ended_at)
     fail('Start Trip first, or trip is already closed.',409);
   if(km<Number(trip.starting_odometer))
     fail('Closing KM cannot be lower than starting KM.',400);
   const chargeKeys=['toll','parking','state_tax','other_amount'];
   const charges={};
   for(const k of chargeKeys){
     const value=number(form.get(k)||0,{max:1000000});
     if(value===null)fail('Invalid '+k+' charge.');
     charges[k]=value;
   }
   const note=String(form.get('other_reason')||'').trim().slice(0,250);
   if(charges.other_amount>0&&!note)fail('Other charge needs a reason.');
   const photo=await uploadPhoto(cfg,a.booking_id,form.get('photo'),'end');
   await vendorDb(cfg,'cwd_vendor_trip_events?booking_id=eq.'+
     eq(a.booking_id)+'&ended_at=is.null',{
     method:'PATCH',headers:{Prefer:'return=minimal'},
     body:JSON.stringify({
       closing_odometer:km,closing_photo_path:photo,ended_at:now(),
       calculated_trip_km:km-Number(trip.starting_odometer),
       toll:charges.toll,parking:charges.parking,
       state_tax:charges.state_tax,other_amount:charges.other_amount,
       other_reason:note||null,
       night_charge:String(form.get('night_charge'))==='yes',
       review_status:'review_required',
     }),
   });
   await vendorDb(cfg,'cwd_vendor_allocations?booking_id=eq.'+
     eq(a.booking_id)+'&vendor_id=eq.'+eq(vid)+'&status=eq.trip_started',{
     method:'PATCH',headers:{Prefer:'return=minimal'},
     body:JSON.stringify({status:'trip_completed_review_required',updated_at:now()}),
   });
   return json({success:true,status:'completed',trip_km:km-Number(trip.starting_odometer)});
 }
 fail('Unknown trip action.');
}
async function blockVehicle(cfg,vid,body) {
 const date=String(body.blocked_date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))
   fail('Choose a valid calendar date.');
 const day=Date.parse(date+'T00:00:00+05:30');
 if(!Number.isFinite(day)||day<Date.now()-86400000)
   fail('Past dates cannot be blocked.');
 const car=(await vendorDb(cfg,'cwd_vendor_vehicles?id=eq.'+
   eq(body.vehicle_id)+'&vendor_id=eq.'+eq(vid)+
   '&is_active=eq.true&select=id&limit=1'))?.[0];
 if(!car)fail('Vehicle not in your active fleet.',404);
 const existing=await vendorDb(cfg,'cwd_vendor_app_vehicle_blocks?vehicle_id=eq.'+
   eq(car.id)+'&blocked_date=eq.'+date+'&select=id&limit=1');
 if(body.action==='unblock_vehicle'){
   if(existing?.[0])await vendorDb(cfg,'cwd_vendor_app_vehicle_blocks?id=eq.'+
     eq(existing[0].id)+'&vendor_id=eq.'+eq(vid),{
     method:'DELETE',headers:{Prefer:'return=minimal'},
   });
   return json({success:true});
 }
 if(existing?.length)fail('This date is already blocked.',409);
 const alloc=await vendorDb(cfg,'cwd_vendor_allocations?vendor_id=eq.'+
   eq(vid)+'&status=in.(allocated,trip_started)&select=booking_id,offer_id,vehicle_number&limit=100');
 for(const a of alloc||[]){
   const offer=(await vendorDb(cfg,'cwd_vendor_offers?id=eq.'+
     eq(a.offer_id)+'&select=start_at,final_drop_at,selected_vendor_vehicle_id&limit=1'))?.[0];
   if(!offer)continue;
   if(offer.selected_vendor_vehicle_id===car.id&&
      bookedOnDate(date,offer.start_at,offer.final_drop_at))
     fail('Booked dates cannot be blocked.',409);
 }
 // Also reserve a car after vendor acceptance but before admin allocation.
 const accepted=await vendorDb(cfg,'cwd_vendor_offers?vendor_id=eq.'+
   eq(vid)+'&selected_vendor_vehicle_id=eq.'+eq(car.id)+
   '&status=eq.accepted&select=start_at,final_drop_at&limit=100');
 if((accepted||[]).some(o=>bookedOnDate(date,o.start_at,o.final_drop_at)))
   fail('Accepted-booking dates cannot be blocked.',409);
 await vendorDb(cfg,'cwd_vendor_app_vehicle_blocks',{
   method:'POST',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({vendor_id:vid,vehicle_id:car.id,blocked_date:date,
     reason:String(body.reason||'').slice(0,200)||null}),
 });
 return json({success:true});
}
export default async function handler(request){
 try{
   const cfg=vendorAuthOrFail();
   const origin=request.headers.get('origin');
   if(origin&&origin!==new URL(request.url).origin)fail('Invalid origin.',403);
   const {vendor}=await activeVendorForSession(cfg,request);
   if(request.method==='GET')return listDashboard(cfg,vendor);
   if(request.method!=='POST')return json({success:false},405);
   assertWrite(cfg);
   const ct=String(request.headers.get('content-type')||'');
   if(ct.startsWith('multipart/form-data'))
     return await saveTrip(cfg,vendor.id,await request.formData());
   const raw=await request.text();
   if(raw.length>12000)fail('Request too large.',413);
   const body=JSON.parse(raw||'{}');
   switch(body.action){
     case 'respond_offer':return await respondOffer(cfg,vendor.id,body);
     case 'save_driver':return await saveDriver(cfg,vendor.id,body);
     case 'cancel_accepted_offer':return await cancelAcceptedOffer(cfg,vendor.id,body);
     case 'block_vehicle':
     case 'unblock_vehicle':return await blockVehicle(cfg,vendor.id,body);
     default:fail('Unsupported action.');
   }
 }catch(e){
   return json({success:false,
     message:e?.status?e.message:'CWD Partner service is temporarily unavailable.'},
     e?.status||503);
 }
}
