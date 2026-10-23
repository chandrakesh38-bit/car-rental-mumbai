import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:4330';
const browser=await chromium.launch({channel:'msedge',headless:true});
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

async function verify(page){await page.locator('#mobile-otp-modal .otp-digits input').first().fill('012345');await page.locator('#mobile-otp-modal [data-verify]').click();await page.waitForFunction(()=>checkoutIdentityRequest===null);}
try{for(const flow of ['phone-first','coupon-first','overlap']){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let sends=0,logins=0;
 page.on('request',r=>{if(r.url().endsWith('/api/mobile-otp')&&r.method()==='POST'&&r.postDataJSON()?.stage==='send_invoked')sends++;if(r.url().endsWith('/api/customer-account')&&r.method()==='POST'&&r.postDataJSON()?.action==='login')logins++;});
 await search(page);await page.locator('.cwd-p1-card').first().click();await page.locator('#booking-modal').waitFor({state:'visible'});
 await page.locator('#cust-name').fill('Single OTP Fixture');await page.locator('#cust-address').fill('Fixture pickup address');
 if(flow==='coupon-first'){await page.locator('#cwd-coupon-apply').click();await page.waitForFunction(()=>document.activeElement.id==='cust-phone');assert.equal(sends,0);}
 const phone='98'+String(Date.now()).slice(-8);await page.locator('#cust-phone').fill(phone);
 if(flow==='overlap')await page.locator('#cwd-coupon-apply').click();
 await page.locator('#mobile-otp-modal .otp-digits input').first().waitFor();await verify(page);
 if(flow!=='overlap')await page.locator('#cwd-coupon-apply').click();
 await page.locator('#cwd-coupon-status').filter({hasText:'Coupon applied'}).waitFor();assert.equal(sends,1);assert.equal(logins,1);
 await page.locator('#cwd-coupon-remove').click();await page.locator('#cwd-coupon-apply').click();await page.locator('#cwd-coupon-status').filter({hasText:'Coupon applied'}).waitFor();assert.equal(sends,1);
 if(flow==='phone-first'){
  await page.locator('#cust-phone').fill('97'+phone.slice(2));await page.locator('#mobile-otp-modal .otp-digits input').first().waitFor({state:'visible'});await verify(page);await page.locator('#cwd-coupon-apply').click();await page.locator('#cwd-coupon-status').filter({hasText:'Coupon applied'}).waitFor();assert.equal(sends,2);assert.equal(logins,2);
 }
 const expected=sends;await page.locator('[data-payment-choice="0"]').click();await page.waitForURL(/booking-confirmation/);await page.getByText('Booking confirmed',{exact:true}).waitFor();assert.equal(sends,expected,'Submitting booking must reuse the verified session');
 console.log('PASS '+flow+': one OTP through coupon and booking; identity change requires fresh verification');await context.close();
}}finally{await browser.close();}
