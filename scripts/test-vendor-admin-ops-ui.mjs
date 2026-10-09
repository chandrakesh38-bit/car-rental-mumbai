// Parse the existing CWD admin inline script without executing it.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const admin=readFileSync(new URL('../cwd-admin-5377.html',import.meta.url),'utf8');
const inline=[...admin.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([,attrs,code])=>!attrs.includes('src=')&&code.trim());
assert.equal(inline.length,1,'Expected a single authored admin script');
new Script(inline[0][2],{filename:'cwd-admin-inline.js'});
assert.match(admin,/function cwdToggleVendorCancelUnlock\(/);
assert.match(admin,/action:'unlock_vendor_cancellation'/);
assert.match(admin,/Cancellation unlocked/);
assert.match(admin,/Cancellation locked/);
assert.match(admin,/cwdAllocate\(&quot;/);
const api=readFileSync(new URL('../api/admin-vendor-ops.js',import.meta.url),'utf8');
assert.match(api,/action==='unlock_vendor_cancellation'/);
assert.match(api,/offer.status!=='accepted'/);
console.log('Vendor admin cancellation UI and accepted-only authorization: PASS');
