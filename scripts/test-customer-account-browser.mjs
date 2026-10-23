import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let signedIn=false, enabled=true, logins=0, savedName='', sends=0;
  const customer=()=>({id:'fixture-customer',mobile:'919999999999',display_name:savedName});
  await page.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url());
    assert.equal(u.origin,'https://preview.test','No external traffic permitted');
    if(u.pathname==='/api/customer-account'){
      if(!enabled)return route.fulfill({status:503,json:{success:false,message:'Customer accounts are not available yet.'}});
      if(request.method()==='GET')return route.fulfill({status:u.search||signedIn?200:401,json:u.search?{success:true,enabled:true}:signedIn?{success:true,customer:customer()}:{success:false,message:'Sign in'}});
      const body=request.postDataJSON();
      if(body.action==='login'){assert.equal(body.proof,'fixture-proof-customer');signedIn=true;logins++;}
      if(body.action==='logout')signedIn=false;
      if(body.action==='profile'){assert.equal(signedIn,true);savedName=body.display_name;}
      return route.fulfill({json:{success:true,customer:customer()}});
    }
    if(u.pathname==='/api/mobile-otp'){
      if(request.method()==='GET')return route.fulfill({json:{success:true,widgetId:'test',tokenAuth:'test'}});
      const body=request.postDataJSON();
      if(body.action==='diagnostic')return route.fulfill({json:{success:true}});
      assert.equal(body.purpose,'customer');assert.equal(body.phone,'919999999999');
      return route.fulfill({json:{success:true,proof:'fixture-proof-customer',expiresAt:Date.now()+600000}});
    }
    assert.ok(/^\/(customer-account\.html|assets\/(css|js)\/[a-z-]+\.(css|js)|logo\.png)$/.test(u.pathname));
    const type=u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.png')?'image/png':'text/html';
    return route.fulfill({contentType:type,body:await readFile(new URL('..'+u.pathname,import.meta.url))});
  });
  await page.addInitScript(()=>{
    window.OTPCredential=class {};
    Object.defineProperty(navigator,'credentials',{value:{get:({signal})=>new Promise((resolve,reject)=>{window.smsConsentRequested=true;window.deliverSms=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));})},configurable:true});
    window.initSendOTP=()=>{};window.getWidgetData=()=>({otpLength:6,retryTime:30,captchaValidations:false});window.isCaptchaVerified=()=>false;
    window.sendOtp=(_phone,ok)=>{window.fixtureSends=(window.fixtureSends||0)+1;ok({reqId:'fixture-req-1234'});setTimeout(()=>window.deliverSms?.({code:'012345'}),30);};
    window.verifyOtp=(otp,ok,fail)=>otp==='012345'?ok({message:'fixture-provider-token'}):fail({message:'Incorrect OTP. Please retry.'});
    window.retryOtp=(_channel,ok)=>ok({reqId:'fixture-req-1234'});
  });
  await page.goto('https://preview.test/customer-account.html');
  await page.locator('#login-form').waitFor({state:'visible'});
  await page.locator('#account-phone').fill('9999999999');
  // A complete phone number triggers one OTP without clicking Send.
  await page.waitForFunction(()=>window.fixtureSends===1);
  await page.waitForFunction(()=>document.querySelector('.otp-digits input')?.value==='0');
  assert.equal(await page.evaluate(()=>smsConsentRequested),true);
  await page.locator('.otp-digits input').first().waitFor({state:'visible'});
  assert.equal(await page.locator('.otp-digits input').evaluateAll(inputs=>inputs.map(i=>i.value).join('')),'012345');
  for (let i=0;i<6;i++) await page.locator('.otp-digits input').nth(i).fill('1');
  await page.getByRole('button',{name:'Verify & Sign In'}).click();
  await page.getByText('Incorrect OTP. Please retry.').waitFor();assert.equal(logins,0);
  for (let i=0;i<6;i++) await page.locator('.otp-digits input').nth(i).fill(String(i));
  await page.getByRole('button',{name:'Verify & Sign In'}).click();
  await page.locator('#profile-panel').waitFor({state:'visible'});assert.equal(logins,1);
  assert.equal(await page.locator('#verified-mobile').innerText(),'+919999999999');
  await page.locator('#display-name').fill('Test Customer');await page.getByRole('button',{name:'Save profile'}).click();
  await page.getByText('Your profile has been saved.').waitFor();assert.equal(savedName,'Test Customer');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await mkdir(new URL('../.test-output/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('../.test-output/customer-account-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  await page.reload();await page.locator('#profile-panel').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('#login-form').waitFor({state:'visible'});
  assert.equal(await page.locator('#display-name').inputValue(),'');
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:new URL('../.test-output/customer-account-desktop.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  // Session expiry must remove the profile rather than claim the save worked.
  signedIn=true;await page.reload();await page.locator('#profile-panel').waitFor({state:'visible'});
  signedIn=false;await page.reload();await page.locator('#login-form').waitFor({state:'visible'});
  sends=await page.evaluate(()=>window.fixtureSends||0);
  enabled=false;await page.reload();await page.getByText('Customer accounts are not available yet.').waitFor();
  assert.equal(await page.locator('#login-form').isVisible(),false);assert.equal(await page.evaluate(()=>window.fixtureSends||0),sends);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile/desktop account UI, wrong OTP, sign in, profile save, reload, logout, expiry, disabled state, no overflow or JS errors. All traffic mocked.');
} finally {await browser.close();}
