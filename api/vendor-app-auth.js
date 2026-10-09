import {
 vendorAuthOrFail,vendorDb,findVendor,activeVendorForSession,
 cleanMobile,vendorLoginStatus,validOtp,sha256,tokenHex,authError
} from '../lib/vendor-app-server.mjs';
import {vendorOtpAdmission,vendorMsg91WidgetHeaders} from '../lib/vendor-app-auth-core.mjs';

export const config={runtime:'edge'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'},
});
const fail=(message,status=400)=>{throw authError(message,status)};
const mobileCode=code=>String(code||'').replace(/[^\d]/g,'');
const expIso=seconds=>new Date(Date.now()+seconds*1000).toISOString();
function guardedRequest(request) {
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin)fail('Invalid request origin.',403);
}
async function msg91(cfg,path,body) {
 const r=await fetch('https://control.msg91.com/api/v5/widget/'+path,{
   // MSG91 allows the widget token via the "token" HTTP header.
   // Keep credentials server-side and use vendor-specific token when set.
   method:'POST',headers:vendorMsg91WidgetHeaders(cfg),
   body:JSON.stringify({widgetId:cfg.widgetId,...body}),
   signal:AbortSignal.timeout(15000),
 });
 let response;try{response=await r.json()}catch{response={}};
 if(!r.ok || response.type!=='success'){
   // Safe provider diagnostics: never log mobile, OTP, keys, tokens or reqId.
   const reason=String(response?.message||'').toLowerCase();
   const category=/captcha|recaptcha/.test(reason)?'captcha_required':
     /auth|unauthori|token|credential|invalid.widget/.test(reason)?'auth_rejected':
     /balance|credit|fund/.test(reason)?'balance_rejected':
     /block|blacklist|ip.security|whitelist/.test(reason)?'access_blocked':
     /country|restrict/.test(reason)?'country_restricted':
     /template|channel|inactive/.test(reason)?'widget_channel':
     /limit|frequency|throttle/.test(reason)?'rate_limited':'unknown';
   const rawCode=String(response?.code??'');
   const code=/^[a-zA-Z0-9_-]{1,16}$/.test(rawCode)?rawCode:'unspecified';
   console.warn('[CWD_PARTNER_MSG91]',JSON.stringify({
     operation:path,httpStatus:r.status,providerType:String(response?.type||'').slice(0,16),
     providerCode:code,category,
   }));
   if(code==='401')
     fail('OTP provider authentication is unavailable. Please contact CWD support; no OTP was sent.',503);
   fail('OTP service temporarily unavailable. Please try again.',503);
 }
 return response;
}
async function verifyAccess(cfg,accessToken){
 const r=await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({authkey:cfg.msg91Key,'access-token':accessToken}),
   signal:AbortSignal.timeout(15000),
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.type!=='success')
   fail('OTP could not be verified. Please request a new code.',401);
}
async function throttle(cfg,mobile,ip) {
 const since=encodeURIComponent(new Date(Date.now()-3600000).toISOString());
 const [byMobile,byIp]=await Promise.all([
  vendorDb(cfg,'cwd_vendor_app_login_challenges?mobile=eq.'+
    encodeURIComponent(mobile)+'&created_at=gte.'+since+'&select=id,created_at&limit=7'),
  vendorDb(cfg,'cwd_vendor_app_login_challenges?ip_hash=eq.'+
    ip+'&created_at=gte.'+since+'&select=id&limit=21'),
 ]);
 if((byMobile?.length||0)>=5 || (byIp?.length||0)>=20)
   fail('Too many OTP requests. Please try again later.',429);
 const newest=byMobile?.map(x=>Date.parse(x.created_at)||0)
   .reduce((a,b)=>Math.max(a,b),0)||0;
 if(newest&&Date.now()-newest<30000)
   fail('Please wait 30 seconds before requesting another OTP.',429);
}
async function sendOtp(cfg,request,body){
 const mobile=cleanMobile(body.mobile);
 const vendor=await findVendor(cfg,mobile);
 const admission=vendorOtpAdmission(vendor);
 if(admission)fail(admission.message,admission.status);
 const forwarded=request.headers.get('x-forwarded-for')||'unknown';
 const ip=String(forwarded).split(',')[0].trim().slice(0,100);
 const ipHash=await sha256(cfg.secret+'|'+ip);
 await throttle(cfg,mobile,ipHash);
 const response=await msg91(cfg,'sendOtp',{identifier:'91'+mobile});
 const reqId=typeof response.message==='string'?response.message:'';
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(reqId))
   fail('OTP session could not be initialized. Try again.',503);
 const challenge=tokenHex();
 await vendorDb(cfg,'cwd_vendor_app_login_challenges',{
   method:'POST',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({
      challenge_hash:await sha256(challenge),mobile,
      vendor_id:vendor.id,msg91_req_id:reqId,ip_hash:ipHash,
      expires_at:expIso(300),last_sent_at:new Date().toISOString(),
   }),
 });
 return json({success:true,challenge,otp_length:4,expires_in:300,
   message:'OTP has been sent to your registered mobile number.'});
}
function accessTokenFrom(data){
 const candidate=[data?.message,data?.accessToken,data?.['access-token'],
    data?.access_token,data?.token].find(x=>
      typeof x==='string' && x.split('.').length===3 && x.length<8000);
 return candidate||null;
}
async function verifyOtp(cfg,body){
 const challenge=String(body.challenge||'');
 if(!/^[a-f0-9]{64}$/i.test(challenge)||!validOtp(String(body.otp||''),4))
   fail('Enter the valid four-digit OTP.',400);
 const hash=await sha256(challenge);
 const rows=await vendorDb(cfg,'cwd_vendor_app_login_challenges?challenge_hash=eq.'+
   hash+'&select=*&limit=1');
 const pending=rows?.[0];
 if(!pending||pending.verified_at||Date.parse(pending.expires_at)<=Date.now())
   fail('OTP expired. Please request a new OTP.',401);
 if(pending.attempt_count>=5)fail('Too many incorrect OTP attempts.',429);
 // Optimistic lock is also enforced when claiming verification below.
 const current=Number(pending.attempt_count||0);
 const changed=await vendorDb(cfg,
  'cwd_vendor_app_login_challenges?id=eq.'+
  encodeURIComponent(pending.id)+'&attempt_count=eq.'+current+
  '&verified_at=is.null',{
    method:'PATCH',headers:{Prefer:'return=representation'},
    body:JSON.stringify({attempt_count:current+1}),
  });
 if(changed?.length!==1)fail('OTP session changed. Request another OTP.',409);
 let response;
 try {
   response=await msg91(cfg,'verifyOtp',{
      reqId:pending.msg91_req_id,otp:String(body.otp),
   });
 } catch(e){
   if(e?.status===503)throw e;
   fail('Invalid OTP. Please retry.',401);
 }
 const accessToken=accessTokenFrom(response);
 if(!accessToken)fail('Unable to verify OTP token. Please retry.',401);
 // Check the access token belongs to the EXACT server-generated requestId.
 try {
   const payload=accessToken.split('.')[1]
     .replace(/-/g,'+').replace(/_/g,'/');
   const decoded=JSON.parse(atob(payload));
   if(String(decoded.requestId||'')!==pending.msg91_req_id)
     fail('OTP session mismatch. Please request a new code.',401);
 }catch(e){if(e?.status)throw e;
   fail('OTP session mismatch. Please request a new code.',401);}
 await verifyAccess(cfg,accessToken);
 const used=await vendorDb(cfg,
  'cwd_vendor_app_login_challenges?id=eq.'+
  encodeURIComponent(pending.id)+'&verified_at=is.null',{
    method:'PATCH',headers:{Prefer:'return=representation'},
    body:JSON.stringify({verified_at:new Date().toISOString()}),
  });
 if(used?.length!==1)fail('OTP already used. Please log in again.',409);
 const vendors=await vendorDb(cfg,'cwd_vendors?id=eq.'+
   encodeURIComponent(pending.vendor_id)+
   '&primary_whatsapp=eq.'+encodeURIComponent(pending.mobile)+
   '&select=id,vendor_code,owner_business_name,status&limit=1');
 const vendor=vendors?.[0];
 if(!vendor)fail('Vendor registration could not be found.',404);
 const status=vendorLoginStatus(vendor.status);
 const info={success:true,status:status.kind,message:status.message,
   vendor_code:vendor.vendor_code};
 if(status.kind!=='approved')return json(info);
 const token=tokenHex();
 await vendorDb(cfg,'cwd_vendor_app_sessions',{
   method:'POST',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({session_hash:await sha256(token),
    vendor_id:vendor.id,expires_at:expIso(14*86400),
    device_label:'CWD Vendor Android App'}),
 });
 return json({...info,session_token:token,
   expires_in:14*86400,vendor_name:vendor.owner_business_name});
}
export default async function handler(request){
 try{
   guardedRequest(request);
   const cfg=vendorAuthOrFail();
   if(request.method==='GET'){
     const active=await activeVendorForSession(cfg,request);
     return json({success:true,status:'approved',
       vendor_code:active.vendor.vendor_code,
       vendor_name:active.vendor.owner_business_name});
   }
   if(request.method!=='POST')return json({success:false},405);
   const raw=await request.text();
   if(raw.length>5000)fail('Request too large.',413);
   const body=JSON.parse(raw||'{}');
   if(body.action==='send_otp')return await sendOtp(cfg,request,body);
   if(body.action==='verify_otp')return await verifyOtp(cfg,body);
   if(body.action==='logout'){
     const {session}=await activeVendorForSession(cfg,request);
     await vendorDb(cfg,'cwd_vendor_app_sessions?id=eq.'+
       encodeURIComponent(session.id),{
         method:'PATCH',headers:{Prefer:'return=minimal'},
         body:JSON.stringify({revoked_at:new Date().toISOString()}),
       });
     return json({success:true});
   }
   fail('Unknown action.',400);
 }catch(e){
   return json({success:false,message:e?.status?e.message:
     'Vendor login is temporarily unavailable.'},e?.status||500);
 }
}
