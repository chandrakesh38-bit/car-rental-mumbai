import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../vendor-booking.html', import.meta.url), 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(inline, 'Vendor booking page must have inline JavaScript');
new Script(inline, { filename: 'vendor-booking-inline.js' }); // syntax only; never execute
assert.match(html, /10:01 PM–5:59 AM/, 'Offer night window copy must match current timing rule');
console.log('Vendor booking JavaScript syntax and displayed night window: PASS');
