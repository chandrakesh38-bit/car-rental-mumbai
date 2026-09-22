import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { setupOtpRoutes, verifyPhone } from './otp-browser-fixture.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await startServer(fileURLToPath(new URL('../', import.meta.url)), 4298);
const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
try {
  const page = await browser.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:true}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let submissions=0;
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.includes('supabase.co/rest/'))return route.fulfill({json:[]});
    if(/google-analytics|googletagmanager/.test(url))return route.fulfill({body:''});
    if(url.endsWith('/api/partner-application')) {submissions++;assert.match(route.request().postData(),/test-proof-partner-919999999999/);return route.fulfill({json:{success:true,application_number:'CWD-P-TEST',customer_email_sent:true,admin_email_sent:true}});}
    return route.continue();
  });
  await setupOtpRoutes(page);
  await page.goto('http://127.0.0.1:4298/with-driver');
  await page.evaluate(()=>openPartnerModal());
  await page.locator('#part-phone').fill('9999999999');
  const box=page.locator('#part-phone + .mobile-otp');await box.waitFor();
  // Invoke the real submit handler: even programmatic submission must be gated.
  await page.evaluate(async()=>{window.testAlerts=[];window.showCustomAlert=text=>window.testAlerts.push(text);await handlePartnerFormSubmit({preventDefault(){},target:document.querySelector('#partner-modal form')});});
  assert.equal(submissions,0);assert.match(await box.locator('.otp-message').innerText(),/verify your mobile/);
  await box.locator('[data-send]').click();await box.locator('.otp-digits input').first().waitFor({state:'visible'});
  assert.equal(await box.locator('.otp-digits input').count(),6);assert.equal(await box.locator('[data-resend]').isDisabled(),true);
  await box.locator('.otp-digits input').first().fill('111111');await box.locator('[data-verify]').click();await box.getByText(/Incorrect or expired/).waitFor();
  await page.clock.install();await page.clock.fastForward(31000);await box.locator('[data-resend]').click();assert.equal(await page.evaluate(()=>window.testOtpRetries),1);
  await box.locator('.otp-digits input').first().fill('012345');await box.locator('[data-verify]').click();await box.getByText('Mobile number verified ✓').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#part-phone').fill('8888888888');assert.equal(await box.locator('[data-send]').isVisible(),true);assert.doesNotMatch(await box.innerText(),/verified ✓/);
  // Late SDK callbacks cannot verify a number edited during a request.
  await page.evaluate(()=>window.testOtpDelay=1000);await box.locator('[data-send]').click();await page.locator('#part-phone').fill('9999999999');await page.clock.fastForward(1100);assert.equal(await box.locator('[data-code]').isVisible(),false);
  await page.evaluate(()=>window.testOtpDelay=0);await verifyPhone(page,'part-phone');
  // The booking component has independent state; a partner proof cannot unlock it.
  await page.evaluate(()=>{closePartnerModal();openModal('Sedan',3000);});await page.locator('#cust-phone').fill('9999999999');
  assert.match(await page.locator('#cust-phone + .mobile-otp').innerText(),/Verify your mobile/);await verifyPhone(page,'cust-phone');
  await page.evaluate(()=>{closeModal();openPartnerModal();});
  for(const[id,value]of Object.entries({'part-name':'Test Owner','part-email':'test@example.com','part-alt-phone':'8888888888','part-car-model':'Nexon'}))await page.locator('#'+id).fill(value);
  const pdf={name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nTest')};
  for(const kind of ['rc','insurance','puc','dl','aadhaar','pan'])await page.locator('#part-'+kind).setInputFiles(pdf);
  await page.clock.resume();
  await page.evaluate(async()=>{const event={preventDefault(){},target:document.querySelector('#partner-modal form')};await Promise.all([handlePartnerFormSubmit(event),handlePartnerFormSubmit(event)]);});
  assert.equal(submissions,1,'Verified partner submits once');assert.equal(await box.locator('[data-send]').isVisible(),false,'Modal closed after success');
  await page.evaluate(()=>openPartnerModal());assert.equal(await box.locator('[data-send]').isVisible(),true,'Form reset clears verification');
  assert.deepEqual(errors,[]);
  console.log('PASS: digit boxes/leading zero, incorrect OTP, resend countdown, phone edits, stale callbacks, separate form state, mobile layout, missing-proof submission block, verified partner submission and duplicate prevention.');
} finally {await browser.close();server.close();}
