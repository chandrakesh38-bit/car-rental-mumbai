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
export function vendorAuthConfig(env) {
  const enabled=env.CWD_VENDOR_APP_AUTH_ENABLED==='true';
  const preview=env.VERCEL_ENV==='preview';
  const url=String(env.CWD_VENDOR_APP_SUPABASE_URL||'').replace(/\/$/,'');
  const key=env.CWD_VENDOR_APP_SERVICE_ROLE_KEY;
  const secret=env.CWD_VENDOR_APP_SESSION_SECRET;
  const productionUrl=String(env.SUPABASE_URL||'').replace(/\/$/,'');
  let host='';
  try{ const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co'))return null;host=u.hostname;}catch{return null;}
  const expected=String(env.CWD_VENDOR_APP_STAGING_PROJECT_REF||'').trim();
  if(!enabled||!preview||!url||!key||!secret||secret.length<40||!expected||host!==expected+'.supabase.co'||url===productionUrl)return null;
  const widgetId=env.CWD_VENDOR_APP_MSG91_WIDGET_ID;
  const widgetToken=env.CWD_VENDOR_APP_MSG91_WIDGET_TOKEN;
  const msg91Key=env.CWD_VENDOR_APP_MSG91_AUTH_KEY;
  if(!widgetId||!widgetToken||!msg91Key)return null;
  return {url,key,secret,widgetId,widgetToken,msg91Key};
}
export function validOtp(value,length=4) {
  return typeof value==='string'&&new RegExp('^\\d{'+length+'}$').test(value);
}
export function authError(message,status=400) {
  return Object.assign(new Error(message),{status});
}
