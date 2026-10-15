import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer(fileURLToPath(new URL('../',import.meta.url)),4392);
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let exchanges=0;
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  assert.equal(url.hostname,'127.0.0.1','All external traffic forbidden');
  if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<form><input id="phone" value="9999999999"></form>'});
  if(url.pathname==='/api/mobile-otp') {
   if(req.method()==='GET')return route.fulfill({json:{success:true,widgetId:'fixture',tokenAuth:'fixture'}});
   const body=req.postDataJSON();
   if(body.action==='diagnostic')return route.fulfill({json:{success:true}});
   exchanges++;
   return route.fulfill({json:{success:true,proof:'proof-'+body.phone,expiresAt:Date.now()+600000}});
  }
  return route.continue();
 });
 await page.goto('http://127.0.0.1:4392/fixture');
 await page.evaluate(async()=>{
  window.initSendOTP=()=>{};window.getWidgetData=()=>({otpLength:6,retryTime:30});window.isCaptchaVerified=()=>true;
  window.sendOtp=(phone,ok)=>{window.sends=(window.sends||0)+1;ok({reqId:'fixture-'+window.sends});};
  window.verifyOtp=(otp,ok,fail)=>{
   if(otp!=='012345')return fail({message:'Incorrect or expired OTP.'});
   if(window.holdVerify){window.finishVerify=()=>ok({message:'fixture-token'});return;}
   ok({message:'fixture-token'});
  };
  const module=await import('/assets/js/mobile-otp.js');
  window.startOtp=()=>{window.outcome=null;module.requestFormOtp(document.querySelector('form'),'phone','booking').then(proof=>window.outcome={proof},error=>window.outcome={cancelled:error.cancelled,message:error.message});};
 });
 const start=async()=>{await page.evaluate(()=>startOtp());await page.locator('[data-digits] input').first().waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-verify]').disabled);};
 const verify=async(code='012345')=>{for(let i=0;i<6;i++)await page.locator('[data-digits] input').nth(i).fill(code[i]);await page.locator('[data-verify]').click();};
 await start();await verify('111111');await page.getByText('Incorrect or expired OTP.').waitFor();assert.equal(exchanges,0);
 await verify();await page.waitForFunction(()=>window.outcome?.proof);assert.equal((await page.evaluate(()=>outcome)).proof,'proof-919999999999');
 await page.evaluate(()=>startOtp());await page.waitForFunction(()=>window.outcome?.proof);assert.equal(await page.evaluate(()=>sends),1,'Unchanged phone reuses unexpired proof');
 await page.locator('#phone').fill('8888888888');await page.locator('#phone').fill('9999999999');
 await start();assert.equal(await page.evaluate(()=>sends),2,'Changing away and back requires fresh OTP');
 await page.evaluate(()=>window.holdVerify=true);await verify();
 await page.locator('#phone').evaluate(el=>{el.value='8888888888';el.dispatchEvent(new Event('input'));});
 await page.waitForFunction(()=>window.outcome?.cancelled);
 await start();assert.equal(await page.evaluate(()=>sends),3);
 await page.evaluate(()=>finishVerify());assert.equal(exchanges,1,'Late callback from old phone is discarded');
 await page.evaluate(()=>window.holdVerify=false);await verify();await page.waitForFunction(()=>window.outcome?.proof);
 assert.equal((await page.evaluate(()=>outcome)).proof,'proof-918888888888');assert.equal(exchanges,2);
 await page.clock.install();await page.clock.fastForward(601000);await start();assert.equal(await page.evaluate(()=>sends),4,'Expired proof requires fresh OTP');
 console.log('PASS customer OTP browser: existing modal, leading zero, invalid OTP, cached proof, phone edit/revert, mid-verification edit, stale callback, new phone and expired proof. All traffic local/mocked.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
