import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

// Install Playwright locally, or provide PLAYWRIGHT_MODULE and BROWSER_CHANNEL.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const pages = JSON.parse(await readFile(path.join(root,'src/pages.json'),'utf8'));
const baseline = process.env.BASELINE_DIR;
const testPort = Number(process.env.TEST_PORT || 4173);
const reports = process.env.TEST_OUTPUT || path.join(root, '.test-output');
await mkdir(reports,{recursive:true});
const servers = [await startServer(root,testPort)];
if (baseline) servers.push(await startServer(baseline,4174));
const browser = await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
const context = await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
const errors=[];
const emails=[];
const applications=[];
const completed=[];
const assetCache=new Map();
await context.route('**/*',async route=>{
  const req=route.request(); const url=req.url();
  if (/googletagmanager|google-analytics/.test(url)) return route.fulfill({status:200,body:''});
  if (url==='https://api.web3forms.com/submit') {
    emails.push(req.postDataJSON());
    return route.fulfill({status:200,contentType:'application/json',body:'{"success":true}'});
  }
  if(url.endsWith('/api/partner-application')) {
    applications.push(req.postData());
    return route.fulfill({status:200,contentType:'application/json',body:'{"success":true,"application_number":"TEST-ONLY-123"}'});
  }
  if (req.method()!=='GET') throw new Error(`Unexpected external mutation blocked: ${url}`);
  if (!url.startsWith('http://127.0.0.1:')) {
    if (!assetCache.has(url)) assetCache.set(url, (async()=>{
      const response=await route.fetch();
      return {status:response.status(),headers:response.headers(),body:await response.body()};
    })());
    return route.fulfill(await assetCache.get(url));
  }
  return route.continue();
});
const page=await context.newPage();
page.on('pageerror',err=>errors.push(err.message));
page.on('dialog',dialog=>dialog.dismiss());
const check=async(name,fn)=>{
  if(process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) return;
  await fn(); completed.push(name); console.log('PASS '+name);
};
const go=async(slug='',port=testPort)=>{
  const response=await page.goto(`http://127.0.0.1:${port}/${slug}`,{waitUntil:'load'});
  assert.equal(response.status(),200);
  if (port === testPort) await page.waitForFunction(() => !document.getElementById('booking-widget') || fleetRequest === null);
};
const visible=async id=>assert.equal(await page.locator('#'+id).isVisible(),true,id);
const fill=async(id,value)=>page.locator('#'+id).fill(value);
const snapshot=()=>page.evaluate(()=>({
  fares:wdFleet.map(getCarCost), km:wdOutstationKm, days:wdOutstationDays,
  mode:currentMainMode, tab:currentWDSubTab, airport:currentAirportType,
  filtered:filteredSDCarsList.map(c=>c.fullName),
  modal:document.getElementById('booking-modal').innerText,
  sdModal:document.getElementById('sd-booking-modal').innerText
}));

try {
  await check('outstation search explains missing trip type before route calculation',async()=>{
    await go('outstation');
    await page.evaluate(()=>triggerFareSearch());
    assert.equal(await page.locator('#wd-out-trip-type-fieldset').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#wd-out-trip-type-error').isVisible(),true);
    assert.match(await page.locator('#custom-floating-alert').innerText(),/select One-way or Round trip to view fares/i);
    assert.equal(await page.evaluate(()=>currentOutstationJourneyType),'');
    assert.equal(await page.evaluate(()=>wdOutstationRouteQuote),null);
    assert.equal(await page.locator('#wd-out-route-status').innerText(),'');
    assert.equal(await page.locator('#fleet').isVisible(),false);
    await page.locator('#wd-out-one-way').click();
    assert.equal(await page.locator('#wd-out-trip-type-fieldset').getAttribute('aria-invalid'),'false');
    assert.equal(await page.locator('#wd-out-trip-type-error').isVisible(),false);
  });
  await check('coupon requires a typed code and applies First Trip discount',async()=>{
    await go('with-driver');
    await page.evaluate(()=>{
      firstTripFareBeforeDiscount=7385;
      document.getElementById('booking-modal').classList.remove('hidden');
      renderFirstTripOffer();
    });
    await page.locator('#first-trip-coupon-code').fill('wrong-code');
    await page.locator('#first-trip-coupon-apply').click();
    assert.equal(await page.locator('#first-trip-coupon-error').isVisible(),true);
    assert.equal(await page.evaluate(()=>firstTripOfferApplied),false);
    await page.locator('#first-trip-coupon-code').fill('firsttrip');
    await page.locator('#first-trip-coupon-apply').click();
    assert.equal(await page.evaluate(()=>firstTripOfferApplied),true);
    assert.equal(await page.locator('#first-trip-coupon-apply').innerText(),'APPLIED ✓');
    assert.equal(await page.locator('#modal-fare').innerText(),'₹7,016');
  });
  if(baseline) await check('original CSS, all inline scripts, Supabase/API, admin and destination pages preserved',async()=>{
    const html=(await readFile(path.join(baseline,'index.html'),'utf8')).replace(/\r\n/g,'\n');
    const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    for(const [i,name] of ['analytics','booking','partner-documents','application-id'].entries()) {
      assert.equal(await readFile(path.join(root,`assets/js/${name}.js`),'utf8'),scripts[i]);
    }
    assert.equal(await readFile(path.join(root,'assets/css/site.css'),'utf8'),html.match(/<style>([\s\S]*?)<\/style>/)[1]);
    for(const name of ['vercel.json','api/partner-application.js','cwd-admin-5377.html','Logo.jpeg','logo.png',...['lonavala','shirdi','trimbakeshwar'].map(n=>`mumbai-to-${n}-car-rental.html`)]) {
      assert.deepEqual(await readFile(path.join(root,name)),await readFile(path.join(baseline,name)),name);
    }
  });
  for(const config of pages) await check(`route /${config.slug}: SEO, content, navigation, partner modal, desktop and mobile`,async()=>{
    await go(config.slug);
    assert.equal(await page.title(),config.title);
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('h1').innerText(),config.h1);
    assert.equal(await page.locator('meta[name="description"]').getAttribute('content'),config.description);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://carswithdriverindia.com/'+config.slug);
    assert.equal(await page.evaluate(()=>new Set([...document.querySelectorAll('[id]')].map(e=>e.id)).size===document.querySelectorAll('[id]').length),true,'duplicate IDs');
    if(config.mode) {
      assert.equal(await page.evaluate(()=>currentMainMode),config.mode);
      assert.equal(await page.evaluate(()=>currentWDSubTab),config.tab);
      await visible(config.mode==='selfdrive'?'self-drive-block':`wd-${config.tab}-fields`);
      assert.equal(await page.locator('#fleet').isVisible(),false,'with-driver fleet stays hidden before Explore Cabs');
      assert.equal(await page.locator('#fleet-container > div').count(),6);
      assert.equal(await page.locator('#selfdrive-cars-grid > div').count(),6);
    } else assert.equal(await page.locator('#booking-widget').count(),0);
    assert.equal(await page.evaluate(()=>!!supabasePublic),true,'Supabase SDK/client initialized');
    for(const target of pages) {
      assert.equal(await page.locator(`#nav-drawer a[href="/${target.slug}"]`).count(),1);
      assert.equal(await page.locator(`footer a[href="/${target.slug}"]`).count(),1);
    }
    await page.locator('#nav-menu-button').click();
    await page.waitForFunction(()=>document.getElementById('nav-drawer').getBoundingClientRect().right<=innerWidth+1);
    await visible('nav-drawer');
    await page.locator('#nav-drawer').getByRole('button',{name:'Become a Partner'}).click();
    await visible('partner-modal');
    assert.equal(await page.locator('#part-rc-picker').count(),1);
    await page.evaluate(()=>closePartnerModal());
    await page.waitForFunction(()=>document.getElementById('nav-drawer-overlay').classList.contains('hidden'));
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(reports,`${config.slug||'home'}-mobile.png`),fullPage:true});
    await page.locator('#nav-menu-button').click();
    await page.waitForFunction(()=>document.getElementById('nav-drawer').getBoundingClientRect().right<=innerWidth+1);
    await page.locator('#nav-drawer a[href="/contact"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(reports,'navigation-mobile.png')});
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.getElementById('nav-drawer-overlay').classList.contains('hidden'));
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:path.join(reports,`${config.slug||'home'}-desktop.png`),fullPage:true});
  });
  await check('all 81 page-to-page navigation combinations',async()=>{
    for(const source of pages) for(const target of pages) {
      await go(source.slug);
      await page.locator('#nav-menu-button').click();
      await page.locator(`#nav-drawer a[href="/${target.slug}"]`).click();
      await page.waitForURL(`http://127.0.0.1:${testPort}/${target.slug}`);
      await page.waitForLoadState('load');
      assert.equal(await page.title(),target.title);
    }
  });
  async function driverScenario(slug,tab,port) {
    await go(slug,port);
    if(port===4174) await page.evaluate(tab=>{setServiceMode('withdriver');setWDSubTab(tab)},tab);
    assert.equal(await page.evaluate(()=>validateJourneyAndOpenBooking()),false);
    assert.equal(await page.locator('#booking-modal').isVisible(),false);
    if(tab==='local') {
      await fill('wd-local-pickup','Thane');await fill('wd-local-date','2026-12-10');
      await page.locator('#pkg-card-12hr').click();
    } else if(tab==='outstation') {
      await fill('wd-out-pickup','Thane');await fill('wd-out-destination','Shirdi');
      await fill('wd-out-pdate','2026-12-10');await fill('wd-out-rdate','2026-12-12');
      await page.evaluate(()=>calculateDriverFare());
    } else {
      await page.locator('#btn-airport-pickup').click();
      await fill('wd-airport-pickup','Thane');await fill('wd-airport-date','2026-12-10');
      await page.selectOption('#wd-airport-terminal','nmia');
    }
    await page.evaluate(()=>showCabSearchTransition(calculateDriverFare,'fleet'));
    await visible('fleet');
    await page.locator('#fleet-container button').filter({hasText:'Book'}).first().click();
    await visible('booking-modal');
    assert.equal(await page.locator('#wd-booking-form').evaluate(f=>f.checkValidity()),false);
    const state=await snapshot();
    for(const [id,val] of Object.entries({'cust-name':'Test Customer','cust-phone':'9999999999','cust-email':'test@example.invalid','cust-address':'Test address'})) await fill(id,val);
    await page.locator('#wd-booking-form button[type="submit"]').click();
    await visible('success-confirmation-modal');
    return state;
  }
  for(const [slug,tab] of [['with-driver','local'],['outstation','outstation'],['airport-transfer','airport']]) await check(`${tab} validation, fares, booking modal and mocked email; baseline parity`,async()=>{
    const updated=await driverScenario(slug,tab,testPort);
    if(baseline) assert.deepEqual(updated,await driverScenario('',tab,4174));
  });
  await check('Explore Cabs reveals the with-driver fleet only after valid trip details',async()=>{
    await go('with-driver');
    assert.equal(await page.locator('#fleet').isVisible(),false);
    await fill('wd-local-pickup','Vikhroli West, Mumbai');
    await page.locator('#wd-local-pickup').evaluate(input=>{input.dataset.googlePlaceId='test-pickup';input.dataset.pickupAllowed='true';});
    await fill('wd-local-date','2026-12-10');
    await page.locator('#search-btn-text').click();
    await visible('fleet');
    assert.match(await page.locator('#fleet-container').innerText(),/Estimated Fare/);
  });
  await check('local packages, all airport terminals/directions, quick routes and fare details',async()=>{
    await go('with-driver');
    assert.equal(await page.evaluate(()=>getCarCost(wdFleet[0])),3000);
    await page.locator('#pkg-card-12hr').click();
    assert.equal(await page.evaluate(()=>getCarCost(wdFleet[0])),4000);
    await page.evaluate(()=>selectQuickRoute('Shirdi'));
    assert.equal(await page.inputValue('#wd-out-destination'),'Shirdi');
    assert.equal(await page.evaluate(()=>wdOutstationKm),480);
    await page.evaluate(()=>setWDSubTab('airport'));
    for(const type of ['pickup','drop']) for(const [terminal,fare] of [['t1',1500],['t2',1600],['nmia',2000]]) {
      await page.evaluate(type=>setAirportTransferType(type),type);
      await page.selectOption('#wd-airport-terminal',terminal);
      assert.equal(await page.evaluate(()=>getCarCost(wdFleet[0])),fare);
    }
    await page.evaluate(()=>openFareBreakdownModal());await visible('fare-breakdown-modal');
    await page.evaluate(()=>closeFareBreakdownModal());
  });
  async function selfDriveScenario(slug,port) {
    await go(slug,port);
    if(port===4174) await page.evaluate(()=>setServiceMode('selfdrive'));
    assert.equal(await page.evaluate(()=>validateSelfDriveJourney()),false);
    await fill('sd-pdate','2026-12-10');await fill('sd-rdate','2026-12-12');
    await page.locator('#sd-search-box').fill('Nexon');
    assert.equal(await page.locator('#selfdrive-cars-grid > div').count(),1);
    await page.locator('#selfdrive-cars-grid button').first().click();await visible('sd-booking-modal');
    await fill('sd-delivery-location-input','Thane');
    const state=await snapshot();
    await fill('sd-delivery-location-input','Karjat');await visible('sd-serviceability-modal');
    await page.evaluate(()=>closeSDServiceabilityModal());
    await page.locator('input[name="sd-delivery-mode"][value="self"]').check();
    assert.equal(await page.locator('#sd-review-delivery-charge-row').isVisible(),false);
    await page.evaluate(()=>closeSDModal());
    return state;
  }
  await check('self-drive validation, filtering, fare review, delivery and serviceability; baseline parity',async()=>{
    const updated=await selfDriveScenario('self-drive',testPort);
    if(baseline) assert.deepEqual(updated,await selfDriveScenario('',4174));
  });
  await check('self-drive filters, sort, pagination, no-results and reset',async()=>{
    await go('self-drive');
    await page.evaluate(()=>toggleSDFiltersPanel());
    for(const [id,value,property] of [['sd-filter-fuel','Diesel','fuel'],['sd-filter-transmission','Automatic','transmission'],['sd-filter-seats','7','seats'],['sd-filter-segment','SUV','segment'],['sd-filter-brand','Tata','brand']]) {
      await page.evaluate(()=>resetSDFilters());await page.selectOption('#'+id,value);
      assert.equal(await page.evaluate(({property,value})=>filteredSDCarsList.length>0&&filteredSDCarsList.every(c=>String(c[property]).includes(value)),{property,value}),true);
    }
    await page.evaluate(()=>resetSDFilters());await page.selectOption('#sd-sort-by','price-asc');
    assert.equal(await page.evaluate(()=>filteredSDCarsList.every((c,i,a)=>!i||c.rateVal>=a[i-1].rateVal)),true);
    await page.evaluate(()=>changeSDPage(2));assert.match(await page.locator('#sd-pagination-info').innerText(),/7 to 12/);
    await fill('sd-search-box','nonexistent');assert.match(await page.locator('#selfdrive-cars-grid').innerText(),/No cars found/);
    await page.evaluate(()=>resetSDFilters());assert.match(await page.locator('#sd-pagination-info').innerText(),/of 32 cars/);
  });
  await check('self-drive form validation and mocked email submission',async()=>{
    await go('self-drive');
    await fill('sd-pdate','2026-12-10');await fill('sd-rdate','2026-12-12');
    await page.locator('#selfdrive-cars-grid button').first().click();
    const form=page.locator('#sd-booking-modal form');
    assert.equal(await form.evaluate(f=>f.checkValidity()),false);
    for(const [id,val] of Object.entries({'sd-cust-name':'Test Customer','sd-cust-phone':'9999999999','sd-cust-email':'test@example.invalid','sd-delivery-location-input':'Thane','sd-cust-address':'Test address','sd-cust-city':'Thane','sd-cust-state':'Maharashtra','sd-cust-pincode':'400601'})) await fill(id,val);
    const previous=emails.length;
    await form.locator('button[type="submit"]').click();
    await visible('success-confirmation-modal');
    assert.equal(emails.length,previous+1);
    assert.match(emails.at(-1).subject,/Self-Drive Booking/);
  });
  await check('FAQ expand/collapse and contact links',async()=>{
    await go('faq');
    assert.equal(await page.locator('.faq-more').first().isVisible(),false);
    await page.locator('#faq-toggle-btn').click();assert.equal(await page.locator('.faq-more').first().isVisible(),true);
    await page.locator('#faq-toggle-btn').click();assert.equal(await page.locator('.faq-more').first().isVisible(),false);
    assert.match(await page.locator('#faq-accordion').innerText(),/Who can rent a car/);
    await go('contact');
    for(const prefix of ['tel:','mailto:','https://wa.me/']) assert.ok(await page.locator(`#reach-us a[href^="${prefix}"]`).count());
  });
  await check('partner document previews, multipart upload and confirmation (mocked API)',async()=>{
    await go('contact');await page.evaluate(()=>openPartnerModal());
    for(const [id,val] of Object.entries({'part-name':'Test Owner','part-phone':'9999999999','part-email':'test@example.invalid','part-alt-phone':'9999999998','part-car-model':'Test car'})) await fill(id,val);
    await page.selectOption('#part-car-brand-select',{label:'Tata'});
    await page.selectOption('#part-car-year','2025');
    for(const id of ['rc','insurance','puc','dl','aadhaar','pan']) {
      await page.locator(`#part-${id}-picker`).setInputFiles({name:`test-${id}.pdf`,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nTest fixture only\n%%EOF')});
    }
    const rcWrapper=page.locator('#part-rc').locator('..');
    await rcWrapper.locator('[data-remove]').click();
    assert.equal(await rcWrapper.locator('[data-remove]').count(),0);
    await page.locator('#part-rc-picker').setInputFiles({name:'changed-rc.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nChanged test fixture\n%%EOF')});
    const image=await page.locator('#site-logo-container').screenshot();
    await page.locator('#vehicle-photo-0').setInputFiles({name:'test-car.png',mimeType:'image/png',buffer:image});
    await page.waitForFunction(()=>document.querySelector('#vehicle-photo-0').parentElement.querySelector('img[alt="Preview"]'));
    await page.locator('#partner-modal button[type="submit"]').click();
    await page.waitForFunction(()=>!document.getElementById('success-confirmation-modal').classList.contains('hidden'));
    assert.equal(await page.locator('#success-application-number').innerText(),'TEST-ONLY-123');
    assert.equal(applications.length,1);
    for(const field of ['rc','insurance','puc','dl','aadhaar','pan']) assert.ok(applications[0].includes(`name="${field}"`));
    assert.ok(applications[0].includes('filename="changed-rc.pdf"'));
    assert.ok(applications[0].includes('filename="test-car.jpg"'),'image compression preserved');
  });
  assert.deepEqual(errors,[],'uncaught JavaScript errors');
  await writeFile(path.join(reports,'results.json'),JSON.stringify({filter:process.env.TEST_FILTER||null,completed,uncaughtJavaScriptErrors:errors,mockedEmails:emails.length,mockedPartnerApplications:applications.length,baselineParity:!!baseline},null,2));
  console.log('All checks passed. External submissions were intercepted; no real bookings or uploads were sent.');
} finally {
  await context.unrouteAll({behavior: 'ignoreErrors'});
  await browser.close();for(const server of servers) server.close();
}
