const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
function fail(m,s=400){const e=new Error(m);e.status=s;throw e}
async function db(path,opt={}){if(!base()||!key())fail('Database is not configured.',503);const r=await fetch(base()+'/rest/v1/'+path,{...opt,headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();if(!r.ok){let msg='Database operation failed.';try{const p=JSON.parse(t);if(p?.message)msg+=' '+String(p.message).slice(0,180)}catch{}fail(msg,503)}return t?JSON.parse(t):null}
async function hashToken(t){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(t)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)&&x>=0?x:d}
function iso(v){if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null}

const BUCKET='cwd-vendor-trip-photos';
async function byOffer(raw){const h=await hashToken(raw),r=await db('cwd_vendor_offers?offer_token_hash=eq.'+h+'&select=*&limit=1');return r?.[0]||null}
async function byAlloc(raw){const h=await hashToken(raw),r=await db('cwd_vendor_allocations?allocation_token_hash=eq.'+h+'&select=*&limit=1');return r?.[0]||null}
async function booking(id){return (await db('inquiries?booking_id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'))?.[0]||null}

function parseCwdDateText(value){
 const raw=String(value||'').trim().replace(/(\d{1,2})(st|nd|rd|th)/i,'$1');
 const m=raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
 if(!m)return null;
 const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
 const month=months[m[2].toLowerCase()];if(!month)return null;
 let hour=Number(m[4])%12;if(String(m[6]).toUpperCase()==='PM')hour+=12;
 const iso=`${m[3]}-${String(month).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${m[5]}:00+05:30`;
 const d=new Date(iso);return Number.isFinite(d.getTime())?d:null;
}
function bookingSchedule(b){
 const directStart=b?.pickup_date||b?.trip_date||b?.start_date||null;
 const directEnd=b?.final_drop_date||b?.return_date||b?.end_date||null;
 let start=directStart?new Date(directStart):null,end=directEnd?new Date(directEnd):null;
 if(start&&!Number.isFinite(start.getTime()))start=null;
 if(end&&!Number.isFinite(end.getTime()))end=null;
 const text=String(b?.booking_details||'');
 if(!start){
   const out=text.match(/📅\s*Start:\s*([^\n]+)/i)?.[1];
   const generic=text.match(/📅\s*([^\n]+)/)?.[1];
   const localStart=generic?.split(/\s+[–-]\s+/)?.[0];
   start=parseCwdDateText(out||localStart||'');
 }
 if(!end){
   const outEnd=text.match(/📅\s*Final Drop:\s*([^\n]+)/i)?.[1];
   const generic=text.match(/📅\s*([^\n]+)/)?.[1];
   const localEnd=generic?.split(/\s+[–-]\s+/)?.[1];
   end=parseCwdDateText(outEnd||localEnd||'');
 }
 return {start,end};
}
function formatIndiaDateTime(d){
 if(!d||!Number.isFinite(d.getTime()))return '';
 return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d);
}
async function upload(file,path){if(!file||typeof file.arrayBuffer!=='function')fail('Odometer photo is required.');if(file.size<=0||file.size>5242880)fail('Photo must be under 5 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))fail('Use JPG, PNG or WEBP photo.');const r=await fetch(base()+'/storage/v1/object/'+BUCKET+'/'+path,{method:'POST',headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':file.type,'x-upsert':'false'},body:await file.arrayBuffer()});if(!r.ok)fail('Photo upload failed.',503);return path}
function piiBooking(b){
 const schedule=bookingSchedule(b);
 return {booking_id:b.booking_id,customer_name:b.customer_name,customer_mobile:b.customer_phone,exact_pickup:b.pickup_location||b.route||'',exact_drop:b.destination||b.route||'',route:b.route||'',pickup_date_time:formatIndiaDateTime(schedule.start),final_drop_date_time:formatIndiaDateTime(schedule.end),trip_type:b.trip_type||'',vehicle:b.car_name||''}
}
async function handler(request){
 try{
  const u=new URL(request.url);
  if(request.method==='GET'){
   const offer=u.searchParams.get('offer'),allocation=u.searchParams.get('allocation');
   if(offer){const o=await byOffer(offer);if(!o||['revoked','expired'].includes(o.status))fail('Offer link is invalid or expired.',410);return json({success:true,mode:'offer',offer:{booking_id:o.booking_id,vehicle:o.vehicle_required,trip_type:o.trip_type,route:o.route_summary,start_at:o.start_at,final_drop_at:o.final_drop_at,estimated_km:o.estimated_km,estimated_vendor_payout:o.estimated_vendor_payout,status:o.status,pricing_snapshot:o.pricing_snapshot}})}
   if(allocation){const a=await byAlloc(allocation);if(!a||a.revoked_at||['cancelled','reallocated'].includes(a.status))fail('Allocation link is invalid or revoked.',410);const b=await booking(a.booking_id),t=(await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(a.booking_id)+'&select=*&limit=1'))?.[0];return json({success:true,mode:'allocation',allocation:a,booking:piiBooking(b),trip:t||null})}
   fail('Secure token is required.',401);
  }
  const ct=String(request.headers.get('content-type')||'');
  if(ct.includes('multipart/form-data')){
    const f=await request.formData(),raw=String(f.get('allocation')||''),action=String(f.get('action')||''),a=await byAlloc(raw);if(!a||a.revoked_at)fail('Allocation link is invalid or revoked.',410);
    let t=(await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(a.booking_id)+'&select=*&limit=1'))?.[0];
    if(action==='start'){
      if(t?.started_at)fail('Trip has already been started.',409);
      if(!a.vehicle_number||!a.driver_name||!a.driver_mobile)fail('Enter vehicle and driver details before starting trip.');
      const b=await booking(a.booking_id);
      const schedule=bookingSchedule(b);
      if(!schedule.start)fail('Trip start time is missing in this booking. Please contact CWD before starting the trip.',409);
      const now=Date.now(),windowOpens=schedule.start.getTime()-(3*60*60*1000);
      if(now<windowOpens){
        fail('Trip Start is locked. You can start this trip only within 3 hours of pickup time ('+formatIndiaDateTime(schedule.start)+').',409);
      }
      const km=n(f.get('odometer'),-1);if(km<0)fail('Starting odometer is required.');
      const path=a.booking_id+'/start-'+crypto.randomUUID();await upload(f.get('photo'),path);
      await db('cwd_vendor_trip_events',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({booking_id:a.booking_id,starting_odometer:km,starting_photo_path:path,started_at:new Date().toISOString(),review_status:'not_submitted'})});
      await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(a.booking_id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'trip_started',updated_at:new Date().toISOString()})});return json({success:true});
    }
    if(action==='end'){
      if(!t?.started_at)fail('Start Trip must be completed first.',409);if(t?.ended_at)fail('Trip closure has already been submitted.',409);
      const close=n(f.get('odometer'),-1);if(close<t.starting_odometer)fail('Closing odometer cannot be lower than starting odometer.');
      const path=a.booking_id+'/end-'+crypto.randomUUID();await upload(f.get('photo'),path);
      const other=n(f.get('other_amount')),reason=String(f.get('other_reason')||'').trim();if(other>0&&!reason)fail('Add a short reason for Other charge.');
      const patch={closing_odometer:close,closing_photo_path:path,ended_at:new Date().toISOString(),toll:n(f.get('toll')),parking:n(f.get('parking')),state_tax:n(f.get('state_tax')),night_charge:String(f.get('night_charge'))==='yes',other_amount:other,other_reason:reason||null,calculated_trip_km:close-n(t.starting_odometer),review_status:'review_required'};
      await db('cwd_vendor_trip_events?booking_id=eq.'+encodeURIComponent(a.booking_id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
      await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(a.booking_id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'trip_completed_review_required',updated_at:new Date().toISOString()})});return json({success:true,trip_km:patch.calculated_trip_km});
    }
    fail('Unknown trip action.');
  }
  const body=await request.json(),action=String(body.action||'');
  if(action==='respond_offer'){
    const o=await byOffer(body.offer);if(!o||o.status!=='offered')fail('Offer is no longer open.',409);if(!['accepted','declined'].includes(body.response))fail('Invalid response.');
    await db('cwd_vendor_offers?id=eq.'+o.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:body.response,responded_at:new Date().toISOString()})});return json({success:true,status:body.response});
  }
  if(action==='save_driver_vehicle'){
    const a=await byAlloc(body.allocation);if(!a||a.revoked_at)fail('Allocation link is invalid or revoked.',410);
    const vehicle=String(body.vehicle_number||'').trim().toUpperCase(),name=String(body.driver_name||'').trim(),mobile=String(body.driver_mobile||'').replace(/\D/g,'').slice(-10);
    if(!vehicle||!name||!/^[6-9][0-9]{9}$/.test(mobile))fail('Valid vehicle number, driver name and mobile are required.');
    await db('cwd_vendor_allocations?booking_id=eq.'+encodeURIComponent(a.booking_id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({vehicle_number:vehicle,driver_name:name,driver_mobile:mobile,updated_at:new Date().toISOString()})});return json({success:true});
  }
  fail('Unknown action.');
 }catch(e){return json({success:false,message:e.message||'Request failed.'},e.status||500)}
}
export function GET(r){return handler(r)} export function POST(r){return handler(r)}