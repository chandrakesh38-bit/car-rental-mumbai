import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startServer} from './serve.mjs';
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
 await page.goBack();await page.locator('#cwd-p1-search-loader.visible').waitFor();
 await page.waitForFunction(()=>!fareSearchInFlight);
 assert.equal(await page.locator('#booking-modal').isVisible(),false);
 assert.equal(await page.locator('.cwd-p1-card:visible').count(),3);
 for(const width of [320,390,768,1366]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);
 console.log('PASS listing: verified-only fuel filters, category cards, price sorting, gallery navigation/scroll/state, no photo-to-booking click, Modify escape and stable summary, keyboard selection, browser Back with real search loader, coupon removed, four widths; no booking/OTP/payment calls.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
