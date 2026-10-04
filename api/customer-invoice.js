const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
function fail(m,s=400){const e=new Error(m);e.status=s;throw e}
async function db(path,opt={}){if(!base()||!key())fail('Database is not configured.',503);const r=await fetch(base()+'/rest/v1/'+path,{...opt,headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();if(!r.ok){let msg='Database operation failed.';try{const p=JSON.parse(t);if(p?.message)msg+=' '+String(p.message).slice(0,180)}catch{}fail(msg,503)}return t?JSON.parse(t):null}
async function hashToken(t){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(t)));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)&&x>=0?x:d}
function iso(v){if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null}

async function handler(request){try{if(request.method!=='GET')return json({success:false,message:'Method not allowed.'},405);const raw=new URL(request.url).searchParams.get('t');if(!raw)fail('Invoice token required.',401);const h=await hashToken(raw),r=await db('cwd_customer_invoices?invoice_token_hash=eq.'+h+'&select=invoice_snapshot,payment_url,created_at&limit=1'),x=r?.[0];if(!x)fail('Invoice link is invalid.',404);return json({success:true,invoice:x.invoice_snapshot,payment_url:x.payment_url,created_at:x.created_at})}catch(e){return json({success:false,message:e.message||'Request failed.'},e.status||500)}}
export function GET(r){return handler(r)}