import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startServer} from './serve.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {installOfflineUiAssets} from './testing/offline-ui-assets.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=await startServer(undefined,4194),browser=await chromium.launch({channel:'msedge',headless:true});
const dir='.test-output/customer-polish';await mkdir(dir,{recursive:true});
let paid=2000;
const booking=()=>({booking_id:'123456',booking_status:'confirmed',car_name:'Maruti Suzuki Ertiga',total_fare:5000,paid_amount:paid,outstanding:5000-paid,payment_choice:20,created_at:'2026-10-23T03:00:00Z',payments:[],events:[],booking_data:{tripType:'local',localPackage:'10hr_100km',pickupLocation:'Mumbai',pickupAt:'2026-11-12T06:30:00Z',includedKm:100,includedHours:10,customerExtraKmRate:20,customerExtraHourRate:250}});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/api/customer-checkout')return r.fulfill({json:{success:true,booking:booking()}});if(u.pathname.startsWith('/api/'))return r.fulfill({status:401,json:{success:false}});if(u.hostname.endsWith('supabase.co'))return r.fulfill({json:[]});return r.continue();});
 await installOfflineUiAssets(page);
 await page.goto('http://127.0.0.1:4194/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.road-extra-route:visible').count(),0);
 await page.locator('.road-more-routes').click();assert.equal(await page.locator('.road-extra-route:visible').count(),6);
 await page.locator('.road-more-routes').click();assert.equal(await page.locator('.road-extra-route:visible').count(),0);
 for(const mode of ['outstation','local','airport']){await page.locator('#subtab-'+mode).click();await page.waitForFunction(mode=>document.querySelector('.road-banner').dataset.scene===mode,mode);}
 await page.locator('#btn-mode-selfdrive').click();await page.waitForFunction(()=>document.querySelector('.road-banner').dataset.scene==='selfdrive');
 await page.locator('#btn-mode-withdriver').click();await page.locator('#subtab-outstation').click();
 assert.match(await page.locator('.road-banner h2').innerText(),/India Looks Better/);
 await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 await page.screenshot({path:dir+'/home-mobile.png'});
 const bad=await page.locator('a.text-white').evaluateAll(els=>els.filter(e=>e.getClientRects().length&&getComputedStyle(e).color!=='rgb(255, 255, 255)').map(e=>e.textContent));assert.deepEqual(bad,[]);
 // Inspect the actual offer markup with its shipped stylesheet, without sending SMS.
 const source=await readFile('assets/js/results-offer.js','utf8');const offer=source.split('dialog.innerHTML = `')[1].split('`;')[0];
 await page.evaluate(html=>{const d=document.createElement('dialog');d.id='cwd-results-offer';d.innerHTML=html;document.body.append(d);d.showModal();},offer);
 assert.equal(await page.locator('#cwd-offer-title').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
 await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 await page.screenshot({path:dir+'/offer-mobile.png'});
 await page.goto('http://127.0.0.1:4194/booking-confirmation?booking_id=123456');
 await page.locator('.trip-charge-list').waitFor();
 assert.match(await page.locator('.trip-charge-list').innerText(),/100 km included.*10 hours included/s);
 assert.match(await page.locator('.trip-charge-list').innerText(),/₹20\/km/);
 assert.match(await page.locator('.trip-charge-list').innerText(),/₹250\/hour/);
 assert.match(await page.locator('.payment-document-link').innerText(),/Pay outstanding balance/);
 assert.equal(await page.locator('.payment-document-link').getAttribute('href'),'http://127.0.0.1:4194/booking-confirmation?booking_id=123456&pay=1');
 await page.setViewportSize({width:1200,height:900});await page.screenshot({path:dir+'/confirmation-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.payment-document-link').isVisible(),true);
 await page.pdf({path:dir+'/confirmation.pdf',format:'A4',printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'12mm',right:'12mm'}});
 await page.emulateMedia({media:'screen'});
 paid=0;await page.reload();await page.locator('.payment-document-link').waitFor();assert.match(await page.locator('.payment-document-link').innerText(),/Pay for this booking/);
 paid=5000;await page.reload();await page.locator('.trip-charge-list').waitFor();assert.equal(await page.locator('.payment-document-link').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: four service banners, View more six routes, dark-surface text, mobile offer, local charges/cancellation, unpaid/partial/paid PDF payment link states. No real SMS/payment.');
}finally{await browser.close();server.close();}
