import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let orders=0,releaseOrder,failOrder=false,paid=false;
 const booking=()=>({booking_id:'FIXTURE-PROGRESS',booking_status:'confirmed',car_name:'Fixture cab',total_fare:600,paid_amount:paid?600:0,outstanding:paid?0:600,booking_data:{},payments:[],events:[]});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://fixture.test','External requests forbidden');
  if(url.pathname==='/api/customer-checkout'){
   if(req.method()==='GET')return route.fulfill({json:{success:true,booking:booking()}});
   const body=req.postDataJSON();
   if(body.action==='order'){
    orders++;assert.equal(body.booking_id,'FIXTURE-PROGRESS');assert.equal(body.balance,true);
    await new Promise(resolve=>releaseOrder=resolve);
    return route.fulfill(failOrder?{status:503,json:{success:false,message:'Payment preparation unavailable. Please retry.'}}:{json:{success:true,key:'fixture-key',order:{razorpay_order_id:'fixture-order',amount_paise:60000}}});
   }
   assert.equal(body.action,'verify');paid=true;return route.fulfill({json:{success:true}});
  }
  assert.equal(req.method(),'GET');
  if(/\/(account-nav|road-app)\.js$/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
  return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
 });
 await page.addInitScript(()=>{window.Razorpay=class{constructor(options){window.gatewayOptions=options;}on(name,callback){window.gatewayFailure=callback;}open(){window.gatewayOpened=true;}close(){} };});
 const button=page.locator('[data-pay]');
 async function busy(){await page.waitForFunction(()=>document.querySelector('[data-pay]')?.getAttribute('aria-busy')==='true');assert.equal(await button.isDisabled(),true);assert.match(await button.innerText(),/Preparing secure payment/);assert.equal(await page.locator('.payment-spinner').isVisible(),true);}
 async function idle(){await page.waitForFunction(()=>!document.querySelector('[data-pay]')?.disabled);assert.match(await button.innerText(),/Pay Now/);assert.equal(await button.getAttribute('aria-busy'),null);}
 await page.goto('https://fixture.test/booking-confirmation.html?booking_id=FIXTURE-PROGRESS');await button.click();await busy();
 await page.waitForTimeout(200);assert.equal(orders,1);assert.equal(await page.evaluate(()=>!!window.gatewayOpened),false);
 await button.dispatchEvent('click');assert.equal(orders,1);releaseOrder();await page.waitForFunction(()=>window.gatewayOpened);
 assert.equal(await page.evaluate(()=>gatewayOptions.amount),60000);
 await page.evaluate(()=>gatewayOptions.modal.ondismiss());await idle();assert.match(await page.locator('[data-payment-error]').innerText(),/Payment not completed/);
 failOrder=true;await button.click();await busy();await page.waitForTimeout(50);releaseOrder();await idle();assert.match(await page.locator('[data-payment-error]').innerText(),/preparation unavailable/);
 failOrder=false;await button.click();await busy();await page.waitForTimeout(50);releaseOrder();await page.waitForTimeout(50);await page.evaluate(()=>gatewayFailure());await idle();assert.match(await page.locator('[data-payment-error]').innerText(),/Payment failed/);
 await page.goto('https://fixture.test/booking-confirmation.html?booking_id=FIXTURE-PROGRESS&pay=1');await busy();assert.ok(!page.url().includes('pay=1'));await page.waitForTimeout(50);const before=orders;await button.dispatchEvent('click');assert.equal(orders,before);releaseOrder();await page.waitForFunction(()=>window.gatewayOpened);await page.evaluate(()=>gatewayOptions.handler({razorpay_payment_id:'fixture-payment'}));await page.waitForFunction(()=>!document.querySelector('[data-pay]'));assert.equal(await page.locator('[data-payment-error]').count(),0);
 console.log('PASS immediate progress, pending guard, delayed order, order failure, dismissal, gateway failure, retries, deep link, unchanged amount and paid refresh (all mocked)');
}finally{await browser.close();}
