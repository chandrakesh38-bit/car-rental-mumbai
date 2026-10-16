import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startServer} from './serve.mjs';
import {mkdir} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await startServer(root,4393),browser=await chromium.launch({headless:true,channel:'msedge'});
const rates=[['Maruti Suzuki Dzire','Sedan',14],['Toyota Innova','SUV',20],['WagonR','Hatchback',12]].map(([full_name,segment,outstation_rate_per_km])=>({full_name,segment,outstation_rate_per_km,driver_allowance_per_day:500,is_active:true,seating_capacity:4,bag_capacity:2}));
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   // Synthetic catalogue exclusively for mocked UI tests; never shipped as fleet evidence.
   window.CWD_VERIFIED_CAR_FUEL={'Sedan (Dzire / Aura)':'CNG','Toyota Innova':'Diesel'};
   window.CWD_VERIFIED_CAR_PHOTOS={'Sedan (Dzire / Aura)':['/logo.png','/logo.png','/logo.png','/logo.png']};
 });
 await page.route('**/*',async route=>{
  const req=route.request(),url=req.url(),json=(data,status=200)=>route.fulfill({json:data,status});
  if(url.includes('supabase.co/rest/'))return json(url.includes('with_driver_rates')?rates:url.includes('pricing_rules')?[{rule_name:'Minimum Outstation KM/Day',rule_value:300}]:[]);
  if(url.endsWith('/api/maps-route')){
   const b=req.postDataJSON();
   if(b.action==='autocomplete')return json({success:true,suggestions:[{placeId:b.input,mainText:b.input,text:b.input,secondaryText:'Maharashtra, India'}]});
   if(b.action==='validate-pickup')return json({success:true,allowed:true,serviceArea:'Mumbai'});
   if(b.action==='route')return json({success:true,journeyType:b.journeyType,routeKmRoundedUp:300,distanceMeters:300000,distanceKmExact:300,legs:[{duration:'1800s'},{duration:'7200s'},{duration:'9000s'}]});
   return json({success:false},400);
  }
  if(url.includes('/api/'))return json({success:false},503);
  if(/google-analytics|googletagmanager|clarity.ms/.test(url))return route.fulfill({body:''});
  assert.equal(req.method(),'GET','No unmocked write traffic allowed');return route.continue();
 });
 await page.goto('http://127.0.0.1:4393/');
 await page.waitForFunction(()=>document.body.classList.contains('cwd-p1-conversion'));
 await page.locator('#wd-out-one-way').click();
 await page.locator('#wd-out-pdate').fill(new Date(Date.now()+3*86400000).toISOString().slice(0,10));
 await page.locator('#wd-out-pickup').fill('Mumbai');await page.locator('#wd-out-pickup-dropdown button').first().click();
 await page.locator('#wd-out-destination').fill('Pune');await page.locator('#wd-out-dest-dropdown button').first().click();
 await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
 await page.locator('#wd-out-phour').selectOption('9');await page.locator('#wd-out-pampm').selectOption('AM');
 await page.locator('#explore-cabs-button').click();await page.waitForFunction(()=>!fareSearchInFlight);
 await page.locator('.cwd-p1-card').first().waitFor();
 assert.equal(await page.locator('.cwd-p1-card:visible').count(),3);
 await page.getByRole('button',{name:'Filter & Sort',exact:true}).click();
 await page.getByRole('dialog',{name:'Filter & Sort',exact:true}).getByLabel('Fuel Type',{exact:true}).selectOption('CNG');
 await page.getByRole('button',{name:'Apply Filters',exact:true}).click();
 assert.equal(await page.locator('.cwd-p1-card:visible').count(),1);
 await page.locator('.cwd-p1-card:visible').scrollIntoViewIfNeeded();
 const scroll=await page.evaluate(()=>scrollY);
 await page.getByRole('button',{name:'View genuine photos of Sedan (Dzire / Aura)',exact:true}).click();
 assert.equal(await page.locator('#booking-modal').isVisible(),false,'Photo must not select car');
 await page.getByText('1 / 4',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Next photo',exact:true}).click();await page.getByText('2 / 4',{exact:true}).waitFor();
 await page.keyboard.press('ArrowLeft');await page.getByText('1 / 4',{exact:true}).waitFor();
 await page.keyboard.press('Escape');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scroll)<3);
 assert.equal(await page.locator('.cwd-p1-card:visible').count(),1,'Gallery preserves filters');
 await page.getByRole('button',{name:'Filter & Sort',exact:true}).click();
 await page.getByRole('button',{name:'CLEAR ALL',exact:true}).click();assert.equal(await page.locator('.cwd-p1-card:visible').count(),3);
 await page.getByRole('button',{name:'Filter & Sort',exact:true}).click();
 await page.getByLabel('Fare Sort',{exact:true}).selectOption('high');await page.getByRole('button',{name:'Apply Filters',exact:true}).click();
 const sorted=await page.locator('.cwd-p1-card').evaluateAll(cards=>cards.sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(c=>Number(c.dataset.cwdP1Fare)));
 assert.deepEqual(sorted,[...sorted].sort((a,b)=>b-a));
 await page.getByRole('button',{name:'Modify Booking',exact:true}).click();
 const summary=await page.locator('.cwd-p1-trip-text').innerText();
 await page.locator('#wd-out-pickup').fill('Unsubmitted edit');
 assert.equal(await page.locator('.cwd-p1-trip-text').innerText(),summary);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.cwd-p1-edit-dialog').count(),0);
 assert.equal(await page.locator('#booking-widget').count(),1);
 await page.locator('#wd-out-pickup').fill('Mumbai');await page.locator('#wd-out-pickup-dropdown button').first().click();
 await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
 await page.locator('.cwd-p1-card[role="button"]').first().press('Enter');
 await page.locator('#booking-modal').waitFor({state:'visible'});
 assert.equal(await page.locator('#first-trip-offer-panel').count(),0,'Withdrawn coupon is absent from HTML');
 await page.locator('#cwd-review-title').getByText('Review Your Booking',{exact:true}).waitFor();
 assert.ok(!(await page.locator('#modal-summary-datetime').innerText()).includes('Return:'));
 await page.locator('#cust-name').fill('Review Fixture');
 const beforeFare=await page.locator('#modal-fare').innerText();
 await page.getByRole('button',{name:'Terms & Conditions',exact:true}).click();
 await page.locator('#cwd-review-terms[open]').waitFor();
 assert.match(await page.locator('#cwd-review-terms-list').innerText(),/300 km per day/);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#cwd-review-terms').isVisible(),false);
 assert.equal(await page.locator('#booking-modal').isVisible(),true);
 assert.equal(await page.locator('#cust-name').inputValue(),'Review Fixture');
 assert.equal(await page.locator('#modal-fare').innerText(),beforeFare);
 for(const mode of ['local','airport','outstation']) {
  await page.evaluate(mode=>{
   currentWDSubTab=mode;
   if(mode==='outstation')currentOutstationJourneyType='round-trip';
   if(mode==='local')document.getElementById('wd-local-package').value='12hr_120km';
   if(mode==='airport'){setAirportTransferType('pickup');document.getElementById('wd-airport-pickup').value='Fixture Hotel';}
   openModal(chosenCarName,4700);
  },mode);
  if(mode==='local')assert.equal(await page.locator('#modal-summary-package').innerText(),'12 Hours / 120 KM');
  if(mode==='airport')assert.equal(await page.locator('#modal-summary-dest').innerText(),'Fixture Hotel');
  if(mode==='outstation')assert.match(await page.locator('#modal-summary-datetime').innerText(),/Return:/);
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.locator('.cwd-review-panel').evaluate(el=>el.scrollWidth>el.clientWidth),false);
   const footerBefore=await page.locator('.cwd-review-footer').boundingBox();
   await page.locator('.cwd-review-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
   const footerAfter=await page.locator('.cwd-review-footer').boundingBox();
   assert.deepEqual(footerAfter,footerBefore,'Footer stays in place during review scrolling');
   assert.ok(footerAfter.y>=0 && footerAfter.y+footerAfter.height<=901,'Footer inside viewport');
   assert.equal(await page.locator('#wd-booking-form button[type="submit"]').count(),1,'One submit action');
   const termsBox=await page.locator('.cwd-review-terms-link').boundingBox();
   assert.ok(termsBox.y+termsBox.height<=footerAfter.y,'Final content can scroll fully above footer');
   assert.equal(await page.locator('.cwd-review-scroll').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  }
 }
 await page.evaluate(()=>{currentWDSubTab='airport';setAirportTransferType('drop');document.getElementById('wd-airport-pickup').value='Fixture Hotel';openModal(chosenCarName,4700);});
 assert.equal(await page.locator('#modal-summary-pickup').innerText(),'Fixture Hotel');
 assert.match(await page.locator('#modal-summary-trip-type').innerText(),/Drop to Airport/);
 if(process.env.TEST_OUTPUT){
  await mkdir(process.env.TEST_OUTPUT,{recursive:true});
  for(const width of [390,1366]){
   await page.setViewportSize({width,height:844});
   await page.locator('.cwd-review-scroll').evaluate(el=>el.scrollTop=0);
   await page.screenshot({path:`${process.env.TEST_OUTPUT}/local-review-${width}-top.png`});
   await page.locator('.cwd-review-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
   await page.screenshot({path:`${process.env.TEST_OUTPUT}/local-review-${width}-bottom.png`});
  }
 }
 await page.evaluate(()=>{currentWDSubTab='outstation';currentOutstationJourneyType='one-way';});

 await page.goBack();await page.locator('#cwd-p1-search-loader.visible').waitFor();
 await page.waitForFunction(()=>!fareSearchInFlight);
 assert.equal(await page.locator('#booking-modal').isVisible(),false);
 assert.equal(await page.locator('.cwd-p1-card:visible').count(),3);
 for(const width of [320,390,768,1366]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);
 console.log('PASS review: all trip types, correct route/date display, terms Escape and preserved contact/fare, responsive 320–1366px; listing: verified-only fuel filters, category cards, price sorting, gallery navigation/scroll/state, no photo-to-booking click, Modify escape and stable summary, keyboard selection, browser Back with real search loader, coupon removed, four widths; no booking/OTP/payment calls.');
}finally{await browser.close();await new Promise(r=>server.close(r));}

