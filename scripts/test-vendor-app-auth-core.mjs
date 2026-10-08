import assert from 'node:assert/strict';
import {vendorMobile,vendorLoginStatus,vendorAuthConfig,validOtp} from '../lib/vendor-app-auth-core.mjs';
assert.equal(vendorMobile('9876543210'),'9876543210');
assert.equal(vendorMobile('+91 98765 43210'),'9876543210');
assert.equal(vendorMobile('1234567890'),null);
assert.equal(vendorLoginStatus('active').kind,'approved');
assert.equal(vendorLoginStatus('pending_review').kind,'pending');
assert.equal(vendorLoginStatus('suspended').kind,'suspended');
assert.equal(vendorLoginStatus('rejected').kind,'rejected');
assert.equal(vendorLoginStatus('needs_correction').kind,'correction');
assert.equal(validOtp('1234'),true);
assert.equal(validOtp('123A'),false);
assert.equal(validOtp('12345'),false);
const env={CWD_VENDOR_APP_AUTH_ENABLED:'true',VERCEL_ENV:'preview',
 CWD_VENDOR_APP_SUPABASE_URL:'https://testing123.supabase.co',
 CWD_VENDOR_APP_STAGING_PROJECT_REF:'testing123',
 CWD_VENDOR_APP_SERVICE_ROLE_KEY:'test-secret-not-real',
 CWD_VENDOR_APP_SESSION_SECRET:'X'.repeat(48),
 CWD_VENDOR_APP_MSG91_WIDGET_ID:'fake-widget',
 CWD_VENDOR_APP_MSG91_WIDGET_TOKEN:'fake-token',
 CWD_VENDOR_APP_MSG91_AUTH_KEY:'fake-authkey',
 SUPABASE_URL:'https://production123.supabase.co'};
assert.ok(vendorAuthConfig(env));
assert.equal(vendorAuthConfig({...env,SUPABASE_URL:env.CWD_VENDOR_APP_SUPABASE_URL}),null);
assert.equal(vendorAuthConfig({...env,VERCEL_ENV:'production'}),null);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_STAGING_PROJECT_REF:'other'}),null);
assert.equal(vendorAuthConfig({...env,CWD_VENDOR_APP_AUTH_ENABLED:'false'}),null);
console.log('Vendor mobile/status/OTP/staging isolation gates: PASS');
