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

export async function GET() { return json({success:false,message:'Feature not ready'},503); }
