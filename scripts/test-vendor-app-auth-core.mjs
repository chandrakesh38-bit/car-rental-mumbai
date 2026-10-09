import assert from 'node:assert/strict';
import {vendorMobile,vendorLoginStatus,vendorOtpAdmission,vendorAuthConfig,vendorMsg91WidgetHeaders,vendorMsg91WidgetBody,validOtp} from '../lib/vendor-app-auth-core.mjs';
assert.equal(vendorMobile('9876543210'),'9876543210');
assert.equal(vendorMobile('+91 98765 43210'),'9876543210');
assert.equal(vendorMobile('1234567890'),null);
assert.equal(vendorLoginStatus('active').kind,'approved');
assert.equal(vendorLoginStatus('pending_review').kind,'pending');
assert.equal(vendorLoginStatus('suspended').kind,'suspended');
assert.equal(vendorLoginStatus('rejected').kind,'rejected');
assert.equal(vendorLoginStatus('needs_correction').kind,'correction');
assert.equal(vendorOtpAdmission(null).status,404);
assert.match(vendorOtpAdmission(null).message,/Register Now/);
assert.equal(vendorOtpAdmission({status:'rejected'}).status,403);
assert.match(vendorOtpAdmission({status:'rejected'}).message,/not approved/);
assert.equal(vendorOtpAdmission({status:'pending_review'}).status,403);
assert.equal(vendorOtpAdmission({status:'active'}),null);
assert.equal(validOtp('1234'),true);
assert.equal(validOtp('123A'),false);
assert.equal(validOtp('12345'),false);
const env={
 CWD_VENDOR_APP_AUTH_ENABLED:'true',
 CWD_VENDOR_APP_SHARED_DB_MODE:'true',
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'testing',
 SUPABASE_URL:'https://example-ref.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'dummy-not-real',
 MSG91_AUTH_KEY:'A'.repeat(48),
 NEXT_PUBLIC_MSG91_WIDGET_ID:'widget-demo',
 NEXT_PUBLIC_MSG91_WIDGET_TOKEN:'widget-token-demo',
 CWD_VENDOR_APP_MSG91_WIDGET_ID:'vendor-widget-demo',
 CWD_VENDOR_APP_MSG91_WIDGET_TOKEN:'vendor-token-demo',
};
const safe=vendorAuthConfig(env);
assert.ok(safe);
assert.equal(safe.writesEnabled,false);
const widgetHeaders=vendorMsg91WidgetHeaders(safe);
assert.equal(Object.hasOwn(widgetHeaders,'token'),false);
assert.deepEqual(vendorMsg91WidgetBody(safe,{identifier:'919876543210'}),{
 identifier:'919876543210',widgetId:env.CWD_VENDOR_APP_MSG91_WIDGET_ID,
 tokenAuth:env.CWD_VENDOR_APP_MSG91_WIDGET_TOKEN,
});
assert.equal(widgetHeaders['Content-Type'],'application/json');
assert.equal(Object.hasOwn(widgetHeaders,'tokenauth'),false);
assert.equal(Object.hasOwn(widgetHeaders,'Authorization'),false);
const dedicated=vendorAuthConfig({...env,
  CWD_VENDOR_APP_MSG91_WIDGET_TOKEN:'vendor-specific-token-12345',
  CWD_VENDOR_APP_MSG91_WIDGET_ID:'aabbccddeeff001122334455'});
assert.equal(dedicated.widgetId,'aabbccddeeff001122334455');
assert.equal(dedicated.widgetToken,'vendor-specific-token-12345');
assert.equal(vendorMsg91WidgetBody(dedicated,{}).tokenAuth,'vendor-specific-token-12345');
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_MSG91_WIDGET_TOKEN:'bad key!'}),null);
const separated=vendorAuthConfig({...env,CWD_VENDOR_APP_MSG91_WIDGET_ID:'aabbccddeeff001122334455'});
assert.ok(separated);
assert.equal(separated.widgetId,'aabbccddeeff001122334455');
assert.equal(safe.widgetId,env.CWD_VENDOR_APP_MSG91_WIDGET_ID);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_MSG91_WIDGET_ID:''}),null);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_MSG91_WIDGET_TOKEN:''}),null);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_MSG91_WIDGET_ID:'not valid $ id'}),null);
assert.equal(vendorAuthConfig({...env,VERCEL_GIT_COMMIT_REF:'main'}),null);
assert.equal(vendorAuthConfig({...env,VERCEL_ENV:'production'}),null);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_SHARED_DB_MODE:'false'}),null);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_AUTH_ENABLED:'false'}),null);
assert.equal(vendorAuthConfig({...env,SUPABASE_URL:'http://localhost'}),null);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_TESTING_LIVE_WRITES_ENABLED:'true'}).writesEnabled,true);
console.log('Vendor mobile/status/OTP/staging isolation gates: PASS');
