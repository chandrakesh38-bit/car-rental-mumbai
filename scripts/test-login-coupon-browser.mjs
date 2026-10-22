import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4330';assert.equal(new URL(base).hostname,'127.0.0.1');
const out='.test-output/login-coupon';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const report=[];
async function search(page){
 await page.goto(base);await page.waitForFunction(()=>withDriverRatesLoadedFromDb&&publicOutstationMinimumLoaded);
 await page.locator('#wd-out-round-trip').click();
 for(const [id,value,dd] of [['wd-out-pickup','Mumbai','wd-out-pickup-dropdown'],['wd-out-destination','Pune','wd-out-dest-dropdown']]){await page.locator('#'+id).fill(value);await page.locator('#'+dd+' button').first().click();}
 const day=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 for(const id of ['wd-out-pdate','wd-out-rdate'])await page.locator('#'+id).fill(day);
 for(const [id,v] of [['wd-out-phour','9'],['wd-out-pampm','AM'],['wd-out-rhour','6'],['wd-out-rampm','PM']])await page.locator('#'+id).selectOption(v);
 await page.waitForFunction(()=>wdOutstationRouteQuote!==null);await page.locator('#explore-cabs-button').click();
 await page.waitForFunction(()=>!fareSearchInFlight&&document.body.classList.contains('cwd-p1-results-open'));
}
async function otp(page,label){await page.locator('.otp-digits input').first().waitFor();for(let i=0;i<6;i++)await page.locator('.otp-digits input').nth(i).fill('012345'[i]);await page.getByRole('button',{name:label,exact:true}).click();}
try{for(const [width,height,choice,label] of [[327,464,0,'Best Value'],[390,844,20,'Family Choice'],[1366,900,100,'Premium Comfort']]){
 if(process.env.TEST_WIDTH && width!==Number(process.env.TEST_WIDTH))continue;
 const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage(),errors=[],external=[];let quote;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url());});
 const shot=async name=>page.screenshot({path:`${out}/${width}-${name}.png`,animations:'disabled'});
 const phone='97'+String(Date.now()).slice(-6)+String(choice).padStart(2,'0').slice(-2);
 try{
 await search(page);await page.locator('.cwd-p1-card').first().scrollIntoViewIfNeeded();const resultNames=await page.locator('.cwd-p1-car-name').allTextContents();
 const scroll=await page.evaluate(()=>scrollY);
 const offer=page.locator('#cwd-results-offer');await offer.waitFor({state:'visible',timeout:50000});await shot('offer');
 await offer.locator('input').fill(phone);await offer.locator('[type=submit]').click();
 await offer.locator('.otp-digits input').first().waitFor();
 assert.equal(await offer.locator('.otp-digits input').count(),6);
 assert.equal(await offer.locator('[data-resend]').isDisabled(),true);
 await shot('otp');
 if(width===327){
  for(let i=0;i<6;i++)await offer.locator('.otp-digits input').nth(i).fill('9');
  await offer.getByRole('button',{name:'Verify & Sign In',exact:true}).click();
  await offer.locator('.otp-error').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#cwd-results-offer [data-resend]').disabled,{},{timeout:35000});
  await offer.locator('[data-resend]').click();
  await page.waitForFunction(()=>document.querySelector('#cwd-results-offer [data-resend]').disabled);
  await offer.getByRole('button',{name:'Edit mobile number',exact:true}).click();
  await offer.locator('#account-phone').waitFor({state:'visible'});
  assert.equal(await offer.locator('#account-phone').inputValue(),phone);
  await offer.locator('[type=submit]').click();
 }
 await otp(page,'Verify & Sign In');
 await offer.getByText('10% OFF unlocked!',{exact:true}).waitFor();await shot('unlocked');
 await offer.getByRole('button',{name:'Continue to Book Your Cab'}).click();
 await offer.waitFor({state:'hidden'});await page.getByRole('button',{name:'Copy',exact:true}).waitFor();
 assert.ok(Math.abs((await page.evaluate(()=>scrollY))-scroll)<=2,'Results scroll restored');
 assert.deepEqual(await page.locator('.cwd-p1-car-name').allTextContents(),resultNames);
 await page.getByRole('button',{name:'Copy',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'CWDLOGIN10');await page.getByText('Coupon copied successfully.',{exact:true}).waitFor();assert.equal(await page.locator('.cwd-login-coupon-banner').count(),0);await shot('coupon-ready');
 const card=page.locator('.cwd-p1-card').filter({has:page.getByText(label,{exact:true})});
 const grossPaise=Math.round(Number(await card.getAttribute('data-cwd-p1-fare'))*100);
 await card.click();await page.locator('#booking-modal').waitFor({state:'visible'});
 await page.locator('#cust-name').fill('Coupon Preview');await page.waitForFunction(p=>document.getElementById('cust-phone').value===p,phone);await page.locator('#cust-email').fill('coupon@example.invalid');await page.locator('#cust-address').fill('Local test pickup');
 await page.locator('#cwd-coupon-code').fill('BADCODE');await page.locator('#cwd-coupon-apply').click();await page.getByText('Enter a valid coupon code.',{exact:true}).waitFor();
 await page.locator('#cwd-coupon-code').fill('CWDLOGIN10');
 const response=page.waitForResponse(r=>r.url().includes('/api/customer-checkout')&&r.request().postDataJSON()?.action==='quote');
 await page.locator('#cwd-coupon-apply').click();quote=(await (await response).json()).quote;
 await page.locator('#cwd-coupon-status').filter({hasText:'Coupon applied'}).waitFor();
 assert.ok(await page.locator('.cwd-glitter').count()>0,'Coupon glitter visible');
 assert.equal(await page.locator('#cwd-original-fare').isVisible(),true);
 assert.equal(quote.grossPaise,grossPaise);assert.equal(quote.discountPaise,Math.min(50000,Math.round(grossPaise/10)));
 assert.equal(await page.locator('#modal-fare').innerText(),'₹'+(quote.totalPaise/100).toLocaleString('en-IN'));
 assert.equal(await page.locator('#cwd-checkout-advance').innerText(),'₹'+(Math.round(quote.totalPaise*.2)/100).toLocaleString('en-IN'));
 await page.locator('.cwd-coupon-checkout').scrollIntoViewIfNeeded();await shot('applied');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator(`[data-payment-choice="${choice}"]`).click();await page.waitForURL(/booking-confirmation/);
 if(choice){
  await page.getByRole('button',{name:'Simulate captured payment'}).waitFor();await shot('payment');
  if(choice===20){await page.getByRole('button',{name:'Simulate failed payment'}).click();await page.getByText(/Payment failed/).waitFor();await page.getByRole('button',{name:/Continue selected payment/}).click();}
  await page.getByRole('button',{name:'Simulate captured payment'}).click();
 }
 await page.getByRole('heading',{name:'Booking Confirmed!',exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${width}-confirmed.png`,fullPage:true,animations:'disabled'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.match(new URL(page.url()).searchParams.get('booking_id'),/^[1-9]\d{5}$/);
 assert.match(await page.locator('.booking-card').innerText(),/CWDLOGIN10/);
 await search(page);await page.locator('.cwd-login-coupon-banner').filter({hasText:'already been used'}).waitFor();
 await page.locator('.cwd-p1-card').filter({has:page.getByText(label,{exact:true})}).click();
 await page.locator('#cwd-coupon-code').fill('CWDLOGIN10');await page.locator('#cwd-coupon-apply').click();
 await page.locator('#cwd-coupon-status').filter({hasText:'already been used'}).waitFor();await shot('used');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 report.push({width,height,choice,passed:true,quote,scrollRestored:true,copyVerified:true,repeatRejected:true,errors});console.log(`PASS ${width}px: login return, Copy, quote, ${choice}% payment, confirmation, repeat rejection`);
 }catch(e){await shot('failure');throw e;}finally{await context.close();}
}}finally{await browser.close();await writeFile(out+'/browser-report.json',JSON.stringify(report,null,2));}
