import {vendorMobile,vendorLoginStatus,vendorAuthConfig,validOtp,authError}
  from './vendor-app-auth-core.mjs';

const enc=new TextEncoder();
const hex=buffer=>[...new Uint8Array(buffer)]
  .map(n=>n.toString(16).padStart(2,'0')).join('');
export const sha256=async text=>hex(await crypto.subtle.digest('SHA-256',enc.encode(text)));
export function tokenHex() {
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes.buffer);
}
export function vendorAuthOrFail() {
  const config=vendorAuthConfig(process.env);
  if(!config)throw authError(
    'Vendor app login is unavailable while isolated staging is being prepared.',503);
  return config;
}
export async function vendorDb(cfg,path,opt={}) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const r=await fetch(cfg.url+'/rest/v1/'+path,{
      ...opt,signal:controller.signal,
      headers:{
        apikey:cfg.key,Authorization:'Bearer '+cfg.key,
        'Content-Type':'application/json',
        ...(opt.headers||{}),
      },
    });
    const raw=await r.text();
    if(!r.ok)throw authError('Vendor service is temporarily unavailable.',503);
    return raw?JSON.parse(raw):null;
  } catch(e){
    if(e?.status)throw e;
    throw authError('Vendor service is temporarily unavailable.',503);
  } finally {clearTimeout(timeout);}
}
export async function findVendor(cfg,mobile) {
  const rows=await vendorDb(cfg,'cwd_vendors?primary_whatsapp=eq.'+
    encodeURIComponent(mobile)+
    '&select=id,vendor_code,owner_business_name,status,primary_whatsapp&limit=1');
  return rows?.[0]||null;
}
export async function activeVendorForSession(cfg,request) {
  const auth=String(request.headers.get('authorization')||'');
  const match=/^Bearer ([a-f0-9]{64})$/i.exec(auth);
  if(!match)throw authError('Vendor login required.',401);
  const hash=await sha256(match[1]);
  const rows=await vendorDb(cfg,'cwd_vendor_app_sessions?session_hash=eq.'+
    hash+'&select=id,vendor_id,expires_at,revoked_at&limit=1');
  const session=rows?.[0];
  if(!session||session.revoked_at||Date.parse(session.expires_at)<=Date.now())
    throw authError('Session expired. Please log in again.',401);
  const vendors=await vendorDb(cfg,'cwd_vendors?id=eq.'+
    encodeURIComponent(session.vendor_id)+
    '&select=id,vendor_code,owner_business_name,status,primary_whatsapp&limit=1');
  const vendor=vendors?.[0];
  if(!vendor || vendorLoginStatus(vendor.status).kind!=='approved')
    throw authError('Vendor account is no longer approved. Contact CWD.',403);
  return {vendor,session};
}
export function cleanMobile(input) {
  const out=vendorMobile(input);
  if(!out)throw authError('Enter a valid 10-digit mobile number.',400);
  return out;
}
export {vendorLoginStatus,validOtp,authError};
