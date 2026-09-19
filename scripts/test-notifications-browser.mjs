import { setupOtpRoutes, verifyPhone } from './otp-browser-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await startServer(fileURLToPath(new URL('../',import.meta.url)),4295);
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true});const errors=[],requests=[];let sent=true,admin=true;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const req=r.request(),url=req.url();if(url.includes('supabase.co/rest/'))return r.fulfill({contentType:'application/json',body:'[]'});if(/googletagmanager|google-analytics/.test(url))return r.fulfill({body:''});if(url.endsWith('/api/booking-enquiry')){const data=req.postDataJSON();requests.push(data);return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,booking_id:data.bookingId,customer_email_sent:sent,admin_email_sent:admin,...(data.serviceMode==='selfdrive'?{upload_url:'http://127.0.0.1:4295/self-drive-documents#booking='+data.bookingId+'&token='+'a'.repeat(64)}:{})})});}if(req.method()!=='GET')throw Error('Unexpected mutation');return r.continue();});
 await setupOtpRoutes(page);
 await page.goto('http://127.0.0.1:4295/with-driver');
 for(const mode of ['local','outstation','airport','selfdrive']) {
  await page.evaluate(mode=>{setServiceMode(mode==='selfdrive'?'selfdrive':'withdriver');if(mode!=='selfdrive')setWDSubTab(mode);for(const[id,value]of Object.entries({'wd-local-pickup':'Mumbai','wd-local-date':'2099-01-01','wd-out-pickup':'Mumbai','wd-out-destination':'Pune','wd-out-pdate':'2099-01-01','wd-out-rdate':'2099-01-02','wd-airport-pickup':'Vikhroli','wd-airport-date':'2099-01-01','sd-pdate':'2099-01-01','sd-rdate':'2099-01-02'})){const el=document.getElementById(id);if(el)el.value=value;}if(mode==='selfdrive')openSDModal({fullName:'Test Car',brand:'Test',rateHour:'100/hour',rateVal:100,depositVal:3000});else openModal('Sedan',3000);},mode);
  const prefix=mode==='selfdrive'?'sd-cust':'cust';for(const[field,value]of Object.entries({name:'Test Customer',phone:'9999999999',email:'test@example.com',address:'Test address'}))await page.locator('#'+prefix+'-'+field).fill(value);
  if(mode==='selfdrive')await page.evaluate(()=>{document.querySelector('input[name="sd-delivery-mode"][value="self"]').checked=true;onSDDeliveryOptionChange();});
  await verifyPhone(page, prefix+'-phone');
  sent=mode!=='outstation';admin=mode!=='airport';
  await page.evaluate(async mode=>{const form=document.querySelector(mode==='selfdrive'?'#sd-booking-modal form':'#wd-booking-form');await (mode==='selfdrive'?handleSDBookingSubmit:handleBookingSubmit)({preventDefault(){},target:form});},mode);
  assert.equal(requests.length,1,mode+' request');requests.length=0;
  const message=await page.locator('#success-confirmation-modal h3 + p').innerText();if(mode!=='selfdrive')assert.equal(await page.locator('[data-document-upload]').count(),0);if(mode==='selfdrive'){assert.match(message,/manual verification/);assert.equal(await page.locator('[data-document-upload]').count(),1);assert.equal(await page.locator('#success-confirmation-modal h3').innerText(),'Booking Request Received');}else if(!admin)assert.match(message,/team email could not be sent/);else if(sent)assert.match(message,/acknowledgement has been sent/);else assert.match(message,/could not be sent/);
  assert.match(await page.locator('#success-application-number').innerText(),/^CWD-WD-/);await page.evaluate(()=>closeSuccessModal());
 }
 await page.evaluate(()=>showSuccessModal('TEST-PARTNER',{customer_email_sent:false}));assert.equal(await page.locator('[data-document-upload]').count(),0);assert.doesNotMatch(await page.locator('#success-confirmation-modal h3 + p').innerText(),/has been sent/);
 await page.evaluate(()=>showSuccessModal('TEST-PARTNER',{customer_email_sent:true}));assert.match(await page.locator('#success-confirmation-modal h3 + p').innerText(),/acknowledgement has been sent/);
 assert.deepEqual(errors,[]);console.log('PASS: real browser submission flows for Local, Outstation, Airport, Self Drive and conditional booking/partner email success copy; no JavaScript errors.');
} finally {await browser.close();server.close();}
