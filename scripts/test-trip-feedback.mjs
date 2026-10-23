import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import handler from '../api/trip-feedback.js';
import {startServer} from './serve.mjs';
const token='a'.repeat(64),origin='https://carswithdriverindia.com';
const req=(method='GET',body,extra={})=>new Request(origin+'/api/trip-feedback',{method,headers:{'x-feedback-token':token,'Content-Type':'application/json',Origin:origin,...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
assert.equal((await handler(new Request(origin+'/api/trip-feedback'))).status,400);
assert.equal((await handler(req('POST',{rating:5,comment:''},{Origin:'https://example.com'}))).status,403);
assert.equal((await handler(req('POST',{rating:6,comment:''}))).status,400);
assert.equal((await handler(req('POST',null))).status,400);
process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.p_token,token);return Response.json({booking_id:'TEST-1',submitted:body.p_rating!==null});};
assert.equal((await (await handler(req('POST',{rating:1,comment:'Poor service'}))).json()).submitted,true);
assert.equal((await (await handler(req())).json()).submitted,false);
globalThis.fetch=oldFetch;
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer(undefined,0);const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let submits=0;
 await page.route('**/api/trip-feedback',async route=>{
  assert.equal(route.request().headers()['x-feedback-token'],token);
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();assert.equal(body.rating,1);submits++;}
  await route.fulfill({json:{success:true,booking_id:'TEST-1',submitted:submits>0}});
 });
 await page.goto(base+'/trip-feedback#t='+token);
 await page.locator('#feedback-form').waitFor({state:'visible'});
 await page.getByRole('radio',{name:'1 ★',exact:true}).check();
 assert.equal(await page.getByRole('link',{name:'Write a Google review'}).isVisible(),true);
 await page.locator('#comment').fill('Driver arrived late.');
 await page.getByRole('button',{name:'Submit feedback'}).click();
 await page.getByText('Thank you! Your feedback has been recorded.').waitFor();
 assert.equal(submits,1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 fs.mkdirSync('.test-output/feedback',{recursive:true});await page.screenshot({path:'.test-output/feedback/mobile.png',fullPage:true});
 await page.setContent('<p id="feedback-message"></p><div id="feedback-list"></div><button id="feedback-prev"></button><button id="feedback-next"></button>');
 await page.evaluate(()=>{window.adminApi=async()=>({feedback:[{customer_name:'Rahul',booking_id:'TEST-1',rating:1,comment:'<img src=x onerror=alert(1)>',submitted_at:new Date().toISOString()}],hasMore:false});});
 await page.addScriptTag({content:fs.readFileSync('assets/js/admin-trip-feedback.js','utf8')});
 await page.evaluate(()=>loadTripFeedback(0));
 assert.equal(await page.locator('#feedback-list img').count(),0);
 assert.ok((await page.locator('#feedback-list').innerText()).includes('<img'));
 console.log('PASS: token validation, origin checks, rating validation, low-rating submission, Google link visible, mobile layout, admin safe rendering');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
