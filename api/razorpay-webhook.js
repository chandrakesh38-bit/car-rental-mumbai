export const config = { runtime: 'edge' };
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function validSignature(raw,signature,secret){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw)));
  if(!signature || digest.length!==signature.length)return false;
  let diff=0;for(let i=0;i<digest.length;i++)diff|=digest.charCodeAt(i)^signature.charCodeAt(i);return diff===0;
}
async function db(path,options={}){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new Error('Database is not configured.');
  const r=await fetch(base+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})}});
  const t=await r.text();if(!r.ok)throw new Error('Database update failed.');return t?JSON.parse(t):null;
}
async function sync(bookingId){
  const ps=await db('booking_payments?booking_id=eq.'+encodeURIComponent(bookingId)+'&select=amount,status');
  const paid=(ps||[]).filter(p=>p.status==='paid').reduce((n,p)=>n+Number(p.amount||0),0);
  const bs=await db('inquiries?booking_id=eq.'+encodeURIComponent(bookingId)+'&select=total_fare&limit=1');
  const fare=Number(bs?.[0]?.total_fare||0),status=paid<=0?'pending':paid>=fare&&fare>0?'paid':'partially_paid';
  await db('inquiries?booking_id=eq.'+encodeURIComponent(bookingId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({paid_amount:paid,payment_status:status,updated_at:new Date().toISOString()})});
}
async function handle(request){
  if(request.method!=='POST')return json({ok:false},405);
  try{
    const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)return json({ok:false},503);
    const raw=await request.text();
    if(!await validSignature(raw,request.headers.get('x-razorpay-signature')||'',secret))return json({ok:false},401);
    const event=JSON.parse(raw),link=event?.payload?.payment_link?.entity,payment=event?.payload?.payment?.entity;
    if(!link?.id)return json({ok:true});
    const rows=await db('booking_payments?razorpay_payment_link_id=eq.'+encodeURIComponent(link.id)+'&select=*&limit=1');
    const record=rows?.[0];if(!record)return json({ok:true});
    let status=record.status,patch={updated_at:new Date().toISOString()};
    if(link.status==='paid' && payment?.status==='captured'){status='paid';patch={...patch,status,razorpay_payment_id:payment.id,paid_at:new Date((payment.created_at||Math.floor(Date.now()/1000))*1000).toISOString()};}
    else if(link.status==='cancelled'||link.status==='expired'){status='cancelled';patch={...patch,status,cancelled_at:new Date().toISOString()};}
    else if(payment?.status==='failed'){patch={...patch,status:'failed'};}
    await db('booking_payments?id=eq.'+encodeURIComponent(record.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
    await sync(record.booking_id);
    return json({ok:true});
  }catch{return json({ok:false},500);}
}

export function POST(request){ return handle(request); }
