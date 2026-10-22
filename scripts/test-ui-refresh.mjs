import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const before=process.argv.includes('--before'),phase=before?'before':'after';
const root='.test-output/ui-refresh';await mkdir(root,{recursive:true});
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4312';
assert.equal(new URL(base).hostname,'127.0.0.1','Use the isolated local preview');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu','--renderer-process-limit=2']});const report=[];
try{for(const [width,height] of [[327,464],[390,844],[1366,900]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,reducedMotion:'no-preference'});
 // Offer timing/login is exercised separately by test-results-offer.mjs.
 await context.addInitScript(()=>sessionStorage.setItem('cwd-results-offer-seen-v1','1'));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Use the real public-catalogue snapshot via the preview, without injecting cards or rows.
 await page.goto(base+'/');await page.waitForFunction(()=>withDriverRatesLoadedFromDb&&publicOutstationMinimumLoaded);
 // Exclude unrelated fixed chrome from the full-section capture only.
 await page.locator('#quick-plan-routes').screenshot({path:`${root}/${phase}-${width}-destinations.png`,style:'nav,#explore-cabs-button,#explore-cabs-status,#with-driver-block > .mt-6 {transition:none !important;visibility:hidden !important;}'});
 await page.locator('#wd-out-round-trip').click();
 for(const [id,value,dd] of [['wd-out-pickup','Mumbai','wd-out-pickup-dropdown'],['wd-out-destination','Pune','wd-out-dest-dropdown']]){await page.locator('#'+id).fill(value);await page.locator('#'+dd+' button').first().click();}
 const day=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 for(const id of ['wd-out-pdate','wd-out-rdate'])await page.locator('#'+id).fill(day);
 await page.locator('#wd-out-phour').selectOption('9');await page.locator('#wd-out-pampm').selectOption('AM');await page.locator('#wd-out-rhour').selectOption('6');await page.locator('#wd-out-rampm').selectOption('PM');
 await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
 // Hold the actual route HTTP response to observe loading under a slow provider.
 await page.route('**/api/maps-route',async route=>{if(route.request().postDataJSON()?.action==='route')await new Promise(r=>setTimeout(r,1200));await route.continue();});
 await page.evaluate(()=>{wdOutstationRouteQuote=null;});
 await page.locator('#explore-cabs-button').click();await page.locator('#cwd-p1-search-loader.visible').waitFor();
 const sample=()=>page.locator('.cwd-p1-loader-bars span').evaluateAll(b=>b.map(x=>getComputedStyle(x).transform));
 const a=await sample();await page.screenshot({path:`${root}/${phase}-${width}-loader.png`});await page.waitForTimeout(180);const b=await sample();
 assert.notDeepEqual(a,b,'Bars animate during real delayed HTTP request');
 await page.waitForFunction(()=>!fareSearchInFlight);await page.locator('.cwd-p1-card').first().waitFor();
 // Hide sticky navigation only for the element capture; it otherwise obscures a tall card screenshot.
 await page.locator('#fleet-container').screenshot({path:`${root}/${phase}-${width}-vehicles.png`,style:'nav,.cwd-p1-toolbar {visibility:hidden !important;}'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(!before){
  assert.equal(await page.locator('.cwd-destination-card img').count(),4);
  assert.ok(await page.locator('.cwd-destination-card img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
  assert.ok(await page.getByText('Best Value',{exact:true}).count());assert.ok(await page.getByText('Family Choice',{exact:true}).count());
  assert.ok(await page.getByText('Premium Comfort',{exact:true}).count());
  assert.equal(await page.locator('.cwd-destination-description,.cwd-destination-estimate').count(),0);
  const destinations=await page.locator('.cwd-destination-card').evaluateAll(cards=>cards.map(c=>({height:c.getBoundingClientRect().height,text:c.innerText})));
  assert.ok(Math.max(...destinations.map(c=>c.height))-Math.min(...destinations.map(c=>c.height))<2,'Equal destination card heights');
  assert.ok(destinations.every(c=>!/(Indicative|~\d+|\bkm\b)/i.test(c.text)),'No distance or trip estimate text in cards');
  const vehicles=await page.locator('.cwd-p1-card').evaluateAll(cards=>cards.map(c=>{
   const box=c.querySelector('.cwd-p1-car-photo'),rect=box.getBoundingClientRect(),img=box.querySelector('img'),badge=box.querySelector('.cwd-p1-vehicle-badge'),b=badge?.getBoundingClientRect();
   return {name:c.querySelector('h3').textContent,badge:badge?.textContent||'',width:rect.width,height:rect.height,fit:img?getComputedStyle(img).objectFit:null,imageLoaded:img?img.complete&&img.naturalWidth>0:null,badgeInside:b?b.left>=rect.left&&b.top>=rect.top&&b.right<=rect.right&&b.bottom<=rect.bottom:true};
  }));
  for(const v of vehicles){
   assert.ok(Math.abs(v.width-v.height)<1,`${v.name}: square image container`);
   if(v.fit){assert.equal(v.fit,'contain');assert.equal(v.imageLoaded,true);}
   assert.equal(v.badgeInside,true,`${v.name}: badge stays inside image`);
   const expected={'Sedan (Dzire / Aura)':'Best Value','Maruti Suzuki Dzire':'Best Value','Maruti Suzuki Ertiga':'Family Choice','Toyota Innova Crysta':'Premium Comfort'}[v.name]||'';
   assert.equal(v.badge,expected,`${v.name}: exact badge or no unrelated label`);
  }
  for(const [slug,label] of [['dzire','Best Value'],['ertiga','Family Choice'],['crysta','Premium Comfort']]){
   const card=page.locator('.cwd-p1-card').filter({has:page.getByText(label,{exact:true})});
   assert.equal(await card.count(),1);await card.screenshot({path:`${root}/${phase}-${width}-${slug}.png`,style:'nav,.cwd-p1-toolbar {visibility:hidden !important;}'});
  }
  report.push({width,vehicles,destinations});
  const overlap=await page.locator('.cwd-p1-labelled-photo').evaluateAll(boxes=>boxes.some(box=>{const label=box.querySelector('.cwd-p1-vehicle-badge').getBoundingClientRect(),img=box.querySelector('img')?.getBoundingClientRect();return img&&label.bottom>img.top;}));assert.equal(overlap,false,'Badges do not overlap vehicle images');
  await page.unroute('**/api/maps-route');
  const fast=await page.evaluate(async()=>{const t=performance.now();await triggerFareSearch();return performance.now()-t;});assert.ok(fast<1800,`No artificial delay: ${fast}ms`);
  for(const name of ['Shirdi','Lonavala','Mahabaleshwar','Trimbakeshwar']){
   await page.evaluate(()=>{document.body.classList.remove('cwd-p1-results-open');});
   await page.locator(`[data-destination="${name}"]`).click();
   await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
   assert.equal(await page.locator('#wd-out-destination').inputValue(),name);assert.equal(await page.evaluate(()=>currentOutstationJourneyType),'round-trip');
  }
  if(width===390){
   // Duplicate programmatic submissions exercise the same guard as double taps.
   let requests=0;
   await page.route('**/api/maps-route',async route=>{if(route.request().postDataJSON()?.action==='route'){requests++;await new Promise(r=>setTimeout(r,900));}await route.continue();});
   await page.evaluate(()=>{wdOutstationRouteQuote=null;window.__doubleSearch=Promise.all([triggerFareSearch(),triggerFareSearch()]);});
   await page.locator('#cwd-p1-search-loader.visible').waitFor();assert.equal(await page.locator('#explore-cabs-button').isDisabled(),true);
   await page.evaluate(()=>window.__doubleSearch);assert.equal(requests,1,'Only one route request for duplicate submissions');
   await page.unroute('**/api/maps-route');
   for(const failure of ['503','timeout']){
    await page.route('**/api/maps-route',async route=>{
     if(route.request().postDataJSON()?.action!=='route')return route.continue();
     if(failure==='503')return route.fulfill({status:503,json:{success:false,message:'Test route provider unavailable'}});
     // Real fetch AbortSignal.timeout(15000) must release the UI without a mocked clock.
     await new Promise(r=>setTimeout(r,16000));try{await route.abort();}catch{}
    });
    await page.evaluate(()=>{wdOutstationRouteQuote=null;void triggerFareSearch();});
    await page.waitForFunction(()=>!fareSearchInFlight,{}, {timeout:22000});
    assert.equal(await page.locator('#cwd-p1-search-loader').isVisible(),false);
    assert.equal(await page.locator('#explore-cabs-button').isEnabled(),true);
    assert.match(await page.locator('#wd-out-route-status').textContent(),failure==='503'?/unavailable/:/timed out/);
    await page.unroute('**/api/maps-route');
   }
   await page.evaluate(()=>triggerFareSearch());assert.match(await page.locator('#explore-cabs-status').innerText(),/Live fares ready/);
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.locator('.cwd-p1-loader-bars span').evaluateAll(b=>b.every(x=>getComputedStyle(x).animationName==='none')));
  assert.deepEqual(errors,[]);
 }
 report.push({width,height,phase,passed:true,errors,animationSamples:[a,b]});await context.close();
}}finally{await browser.close();await writeFile(`${root}/${phase}-report.json`,JSON.stringify(report,null,2));}
console.log('PASS '+phase+' UI capture and interaction at all three viewports');
