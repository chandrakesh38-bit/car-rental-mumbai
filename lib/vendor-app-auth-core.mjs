// CWD Vendor App: pure authorization/status helpers. No client secrets.
export function vendorMobile(value) {
  if (typeof value !== 'string') return null;
  const digits=value.replace(/[^\d]/g,'');
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  return null;
}
export function vendorLoginStatus(status) {
  switch(String(status||'').trim().toLowerCase()){
    case 'active':
    case 'approved': return {kind:'approved',message:'Login successful'};
    case 'pending_review':
    case 'pending_vehicle_review':
    case 'pending':
      return {kind:'pending',message:'Your approval is pending. Please contact the CWD team.'};
    case 'needs_correction':
    case 'correction_requested':
      return {kind:'correction',message:'Registration correction required. Please contact the CWD team.'};
    case 'suspended':
      return {kind:'suspended',message:'Your vendor account is suspended. Contact CWD support.'};
    case 'rejected':
      return {kind:'rejected',message:'Your application was not approved. Contact CWD support.'};
    default:
      return {kind:'pending',message:'Your vendor account is awaiting verification.'};
  }
}
// Validate vendor existence and approval before any OTP provider request.
// This produces an actionable response without sending SMS to inactive accounts.
export function vendorOtpAdmission(vendor) {
  if(!vendor) return {
    status:404,code:'not_registered',
    message:'This number is not registered with CWD Partner. Tap Register Now to join our vendor network.',
  };
  const approval=vendorLoginStatus(vendor.status);
  if(approval.kind!=='approved') return {
    status:403,code:'not_approved',message:approval.message,
  };
  return null;
}
// The shared CWD database can be used for the final app. The testing-branch
// backend is *never* allowed to mutate live bookings without a second,
// independent write gate. No new Supabase project is required.
export function vendorAuthConfig(env) {
  const enabled=env.CWD_VENDOR_APP_AUTH_ENABLED==='true';
  if(!enabled)return null;
  const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
  const secret=String(env.CWD_VENDOR_APP_SESSION_SECRET||env.MSG91_AUTH_KEY||'');
  // Allow a dedicated CWD Partner REST widget rather than changing the
  // CAPTCHA-enabled website widget used by customer bookings.
  // The override must be configured server-side on Vercel only.
  const vendorWidgetId=String(env.CWD_VENDOR_APP_MSG91_WIDGET_ID||'').trim();
  if(vendorWidgetId&&!/^[a-z0-9_-]{16,128}$/i.test(vendorWidgetId))return null;
  const widgetId=vendorWidgetId||String(env.NEXT_PUBLIC_MSG91_WIDGET_ID||'');
  // Prefer the separately issued CWD Partner OTP token. Existing website
  // token remains an explicit compatibility fallback until owner provisions it.
  const vendorToken=String(env.CWD_VENDOR_APP_MSG91_WIDGET_TOKEN||'').trim();
  if(vendorToken && !/^[A-Za-z0-9_-]{16,256}$/.test(vendorToken)) return null;
  const widgetToken=vendorToken||String(env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN||'');
  const msg91Key=String(env.MSG91_AUTH_KEY||'');
  const isPreview=env.VERCEL_ENV==='preview';
  const isTestingBranch=env.VERCEL_GIT_COMMIT_REF==='testing';
  const isProduction=env.VERCEL_ENV==='production';
  // Strict shared-DB rule: main deployment is never activated merely by
  // the testing preview config. Production opt-in is independent.
  const allowed=isPreview
    ? isTestingBranch && env.CWD_VENDOR_APP_SHARED_DB_MODE==='true'
    : isProduction && env.CWD_VENDOR_APP_PRODUCTION_ENABLED==='true';
  let urlOk=false;
  try{
    const uri=new URL(url);
    urlOk=uri.protocol==='https:'&&uri.hostname.endsWith('.supabase.co');
  }catch{}
  if(!allowed||!urlOk||!key||secret.length<32||
     !widgetId||!widgetToken||!msg91Key)return null;
  return {
    url,key,secret,widgetId,widgetToken,msg91Key,
    sharedDatabase:true,
    writesEnabled:isProduction
      ? env.CWD_VENDOR_APP_PRODUCTION_WRITES_ENABLED==='true'
      : env.CWD_VENDOR_APP_TESTING_LIVE_WRITES_ENABLED==='true',
  };
}
// MSG91 documents sending the OTP widget token in the 'token' HTTP header.
// Never put this credential in the request URL, logs, or client APK.
export function vendorMsg91WidgetHeaders(cfg) {
  const value=String(cfg?.widgetToken||'');
  if(!value) throw authError('Vendor OTP provider is not configured.',503);
  return {
    Accept:'application/json',
    'Content-Type':'application/json',
    token:value,
  };
}
export function validOtp(value,length=4) {
  return typeof value==='string'&&new RegExp('^\\d{'+length+'}$').test(value);
}
export function authError(message,status=400) {
  return Object.assign(new Error(message),{status});
}
