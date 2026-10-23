import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=await readFile(new URL('../assets/js/booking.js',import.meta.url),'utf8');
const css=await readFile(new URL('../assets/css/phase1-redesign.css',import.meta.url),'utf8');
const transition=source.slice(source.indexOf('let carBookingTransitionActive'),source.indexOf('function syncModalState'));
const celebration=source.slice(source.indexOf('let couponAudioContext'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',r=>r.abort());
  await page.setContent('<button id="select">Select car</button><div id="booking" hidden>Booking details</div>');
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:transition+'\n'+celebration+`\nlet openings=0; document.getElementById('select').onclick=()=>showCarBookingTransition(()=>{openings++;document.getElementById('booking').hidden=false;});`});
  await page.clock.install();
  await page.locator('#select').click();
  await page.evaluate(()=>showCarBookingTransition(()=>{throw Error('Duplicate transition');}));
  assert.equal(await page.locator('.cwd-car-transition').count(),1);
  await page.clock.runFor(2900);assert.equal(await page.locator('#booking').isVisible(),false);
  await page.clock.runFor(150);assert.equal(await page.locator('#booking').isVisible(),true);
  assert.equal(await page.evaluate(()=>openings),1);
  assert.equal(await page.locator('.cwd-car-transition').count(),0);
  await page.locator('#select').click();await page.keyboard.press('Escape');
  await page.clock.runFor(3100);assert.equal(await page.evaluate(()=>openings),1);
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  await page.evaluate(()=>celebrateLoginCoupon());
  assert.equal(await page.locator('.cwd-glitter i').count(),180);
  await page.clock.runFor(3050);assert.equal(await page.locator('.cwd-glitter').count(),1);
  await page.clock.runFor(1400);assert.equal(await page.locator('.cwd-glitter').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>celebrateLoginCoupon());assert.equal(await page.locator('.cwd-glitter').count(),0);
  for(const name of ['index','with-driver','cars','outstation','thane-car-rental-with-driver','navi-mumbai-car-rental-with-driver']) {
    const html=await readFile(new URL('../'+name+'.html',import.meta.url),'utf8');
    assert.match(html,/id="wd-local-fields" class="space-y-4 hidden"/);
    assert.match(html,/id="wd-outstation-fields" class="space-y-4"/);
    if(name!=='cars') assert.match(html,/data-booking-tab="outstation"/);
  }
  console.log('PASS: initial Outstation markup, 3-second transition, duplicate selection, Escape cancellation, scroll restoration, 3+ second dense celebration and reduced motion. No external traffic.');
} finally {await browser.close();}
