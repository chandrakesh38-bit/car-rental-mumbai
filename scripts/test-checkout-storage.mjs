import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../assets/js/customer-checkout.js',import.meta.url),'utf8');
const checkout=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
globalThis.sessionStorage={getItem(){throw new DOMException('Blocked','SecurityError');},setItem(){throw new DOMException('Blocked','SecurityError');}};
let navigation='',calls=[];
globalThis.location={assign:url=>navigation=url};
globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json(options.method==='POST'?{success:true,booking_id:'123456',access_token:'fixture'}:{success:true,booking:{booking_id:'123456'}});};
const form={dataset:{}};
for(const paymentChoice of [0,20,100]){
 await checkout.submitCheckout({paymentChoice},form);
 assert.equal(navigation,'/booking-confirmation?booking_id=123456'+(paymentChoice?'&pay=1':''));
}
assert.equal(new Set(calls.map(c=>JSON.parse(c.options.body).submissionKey)).size,1,'Retry retains idempotency key');
assert.equal((await checkout.getBooking('123456')).booking_id,'123456');
assert.equal(calls.at(-1).options.credentials,'same-origin','Read falls back to authenticated cookie');
assert.equal(calls.at(-1).options.headers.Authorization,undefined);
console.log('PASS: blocked browser storage cannot prevent saved-booking navigation; 0/20/100 payment destinations and session-cookie fallback.');
