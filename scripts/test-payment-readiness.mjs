import assert from 'node:assert/strict';
import {installFixtures,state} from './testing/checkout-fixtures.mjs';
import {GET as handler} from '../api/customer-checkout.mjs';
import {customerOutstationBreakdown} from '../lib/cwd-pricing.mjs';
installFixtures();
const fixture=globalThis.fetch;
globalThis.fetch=async(url,options)=>String(url).includes('api.razorpay.com')?Response.json({error:{code:'BAD_REQUEST_ERROR'}},{status:401}):fixture(url,options);
const response=await handler(new Request('https://preview.test/api/customer-checkout?config=1&payment=1'));
assert.equal(response.status,502);assert.match((await response.json()).message,/authentication failed/);
assert.equal((await handler(new Request('https://preview.test/api/customer-checkout?config=1'))).status,200);
assert.equal(state.tables.cwd_checkout_bookings,undefined);
globalThis.fetch=fixture;
assert.equal((await handler(new Request('https://preview.test/api/customer-checkout?config=1&payment=1'))).status,200);
for(const [base,extra] of [[18,19],[20,21],[22,24],[27,28]]){
 const priced=customerOutstationBreakdown({km:350,kmRate:base,extraRate:extra,driverAllowance:500});
 assert.equal(priced.fare,300*base+50*extra+500);
}
const {startPayment}=await import('../assets/js/customer-checkout.js');
globalThis.sessionStorage={getItem:()=>''};
for(const amount of [124600,623000]){
 let opened=false;
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);return Response.json(body.action==='order'?{success:true,key:'rzp_test_fixture',order:{razorpay_order_id:'order_fixture',amount_paise:amount}}:{success:true});};
 globalThis.window={Razorpay:class{constructor(options){this.options=options;assert.equal(options.amount,amount);assert.equal(options.order_id,'order_fixture');}on(){}open(){opened=true;this.options.handler({razorpay_order_id:'order_fixture'});}}};
 await startPayment('800712');assert.equal(opened,true);
}
console.log('PASS payment preflight failure before booking, zero-pay independence, explicit increased extra rates, 20% and full Razorpay window opening (mock provider).');
