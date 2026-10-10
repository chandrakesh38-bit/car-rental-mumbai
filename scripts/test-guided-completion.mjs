import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import vm from 'node:vm';
import { startServer } from './serve.mjs';

// Contract tests: mocked current admin rates and Maps responses, no real leads or SMS.
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const clarityTest = false;
const rates = [
  ['Maruti Suzuki Dzire',14,500,400], ['WagonR',11,400,300],
  ['Maruti Suzuki Ertiga',16,500,400], ['Kia Carens',18,500,400],
  ['Toyota Innova',20,500,400], ['Toyota Innova Crysta',22,500,400]
].map(([full_name,outstation_rate_per_km,driver_allowance_per_day,customer_night_charge],i)=>({
  full_name,outstation_rate_per_km,driver_allowance_per_day,customer_night_charge,
  is_active:true,display_order:i,local_pkg_8hr_80km:3000,local_extra_hour_rate:250,airport_t1_rate:1500,airport_t2_rate:2200,airport_nmia_rate:2500,
  segment:'With Driver',seating_capacity:4,bag_capacity:2
}));
const server = await startServer(fileURLToPath(new URL('../',import.meta.url)), 4312);
const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge',
  ...(process.env.LOW_MEMORY_BROWSER === '1' ? {args:['--disable-gpu','--renderer-process-limit=1']} : {})});
try {
  const context = await browser.newContext(process.env.GUIDED_DESKTOP === '1' ? {viewport:{width:1440,height:900},reducedMotion:'reduce'} : {...devices['Pixel 5'],viewport:{width:393,height:851},reducedMotion:'reduce'});
  let delayPickup=0, failPricing=false, delayRoute=0, routeCalls=0, failRoute=false, nextKm=null;
  const cache=new Map(), errors=[];
  await context.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    const json=(body,status=200)=>route.fulfill({status,json:body});
    if (url.endsWith('/api/clarity-config')) return json({enabled:false});
    if (/\.clarity\.ms\//.test(url)) return route.fulfill({contentType:'text/javascript',body:''});
    if (/googletagmanager|google-analytics/.test(url)) return route.fulfill({body:''});
    if (url.includes('supabase.co/rest/')) {
      assert.equal(req.method(),'GET','Never write to the real database');
      if(url.includes('/with_driver_rates'))return json(failPricing?[]:rates);
      if(url.includes('/pricing_rules'))return json([{rule_name:'Minimum Outstation KM/Day',rule_value:200}]);
      return json([]);
    }
    if(url.endsWith('/api/maps-route')) {
      const b=req.postDataJSON();
      if(b.action==='autocomplete') return json({success:true,suggestions:[{placeId:b.input.replaceAll(' ','-'),mainText:b.input,text:b.input,secondaryText:'Maharashtra, India'}]});
      if(b.action==='validate-pickup') {if(delayPickup)await new Promise(r=>setTimeout(r,delayPickup));return json({success:true,allowed:b.placeId!=='Outside',serviceArea:'Mumbai'});}
      if(b.action==='airport-route') {const failure=failRoute,meters=nextKm===null?20000:nextKm*1000; if(delayRoute) await new Promise(r=>setTimeout(r,delayRoute));return failure?json({success:false,message:'Fixture route failure'},503):json({success:true,distanceMeters:meters,distanceKmExact:meters/1000});}
      if(b.action==='route') {
        const failure=failRoute, forcedKm=nextKm; routeCalls++; if(delayRoute) await new Promise(r=>setTimeout(r,delayRoute));
        if(failure) return json({success:false,message:'Fixture route failure'},503);
        const km=forcedKm ?? ({Lonavala:174,Pune:290,Nashik:336}[b.finalDropPlaceId] || 174);
        return json({success:true,journeyType:b.journeyType,routeKmRoundedUp:km,distanceMeters:km*1000,distanceKmExact:km,legs:[]});
      }
      return json({success:false},400);
    }
    if(/\/api\/(booking-enquiry|mobile-otp)/.test(url) && req.method() !== 'GET') throw Error('Booking and OTP calls forbidden in readiness tests');
    if(url.endsWith('/api/mobile-otp')) return json({success:false},503);
    if(url==='https://verify.msg91.com/otp-provider.js') return route.fulfill({body:''});
    if(req.method()!=='GET')throw Error('Unexpected mutation blocked: '+url);
    if(process.env.OFFLINE_FIXTURES === '1' && !url.startsWith('http://127.0.0.1:')) {
      // Offline behavior test only: no CDN, font, Maps or database network access.
      if(url.includes('@supabase/supabase-js')) return route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:(base)=>({from:(table)=>{const q={select:()=>q,eq:()=>q,order:()=>q,abortSignal:()=>q,then:(resolve,reject)=>fetch(base+'/rest/v1/'+table).then(r=>r.json()).then(data=>({data,error:null})).then(resolve,reject)};return q}})};`});
      if(url.includes('cdn.tailwindcss.com')) return route.fulfill({contentType:'text/javascript',body:`const style=document.createElement('style');style.textContent='.hidden{display:none!important} .grid{display:grid} .grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))} .grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))} *{box-sizing:border-box} img,input,select{max-width:100%}';document.head.append(style);`});
      return route.fulfill({body:''});
    }
    if(!url.startsWith('http://127.0.0.1:')) {
      if(!cache.has(url)) cache.set(url,(async()=>{const r=await route.fetch();return {status:r.status(),headers:r.headers(),body:await r.body()};})());
      return route.fulfill(await cache.get(url));
    }
    return route.continue();
  });
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  const go=async()=>{
    await page.goto('http://127.0.0.1:4312/');
    await page.waitForFunction(()=>typeof triggerFareSearch==='function');
  };
  await go();
  const select=async(id,value)=>{await page.locator('#'+id).fill(value);const dd=id==='wd-local-pickup'?'wd-local-dropdown':id==='wd-airport-pickup'?'wd-airport-dropdown':id==='wd-out-destination'?'wd-out-dest-dropdown':id+'-dropdown';await page.locator('#'+dd+' button').filter({hasText:value}).first().click();};
  const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  const ready=()=>page.waitForFunction(()=>driverFareReadinessMessage()==='');
  const actions=page.locator('[data-complete-journey]');
  const guide=async(id,key)=>{
    const action=page.locator('[data-complete-journey][aria-controls="'+id+'"]').first();await action.waitFor({state:'visible'});
    if(key){await action.focus();await action.press(key);}else await action.click();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),id);
    assert.equal(await page.locator('#'+id).evaluate(el=>el.classList.contains('journey-attention')),true);
    assert.equal(await page.locator('#'+id).evaluate(el=>parseFloat(el.style.scrollMarginTop)>=100),true);
    const rect=await page.locator('#'+id).boundingBox();assert.ok(rect && rect.y>=0 && rect.y<await page.evaluate(()=>innerHeight));
    for(const button of await page.locator('#fleet-container > div > button').all())assert.equal(await button.isDisabled(),true);
    assert.equal(await page.locator('#booking-modal').isVisible(),false);
  };
  await page.locator('#subtab-local').click();await select('wd-local-pickup','Mumbai');await page.locator('#wd-local-date').fill(date);await ready();
  await page.locator('button[onclick="triggerFareSearch()"]').click();await page.locator('#fleet').waitFor({state:'visible'});
  await page.locator('#wd-local-pickup').fill('');await guide('wd-local-pickup','Enter');
  await select('wd-local-pickup','Mumbai');await ready();await page.locator('#wd-local-date').fill('');await guide('wd-local-date','Space');
  await page.locator('#wd-local-date').fill(date);await ready();assert.equal(await actions.count(),0);
  await page.locator('#fleet-container > div > button').first().click();assert.equal(await page.locator('#booking-modal').isVisible(),true);await page.evaluate(()=>closeModal());
  await page.locator('#subtab-outstation').click();await guide('wd-out-one-way');
  await page.locator('#wd-out-one-way').click();await guide('wd-out-pickup');
  await select('wd-out-pickup','Mumbai');await guide('wd-out-destination');
  await select('wd-out-destination','Pune');await guide('wd-out-pdate');
  await page.locator('#wd-out-pdate').fill(date);await guide('wd-out-rdate');
  await page.locator('#wd-out-rdate').fill(date);await page.locator('#wd-out-rampm').selectOption('PM');await ready();
  delayRoute=1000;await page.evaluate(()=>{window.pendingRoute=updateOutstationRouteEstimate();});assert.equal(await actions.count(),0);await page.evaluate(()=>window.pendingRoute);await ready();delayRoute=0;
  await page.locator('#subtab-airport').click();await guide('wd-airport-pickup');
  await select('wd-airport-pickup','Mumbai');await guide('wd-airport-date');
  await page.locator('#wd-airport-date').fill(date);await ready();
  await page.evaluate(()=>{document.getElementById('wd-airport-terminal').value='';calculateDriverFare();});await guide('wd-airport-terminal');
  await page.locator('#wd-airport-terminal').selectOption('t1');await ready();
  failRoute=true;await page.locator('#wd-airport-terminal').selectOption('t2');await page.waitForFunction(()=>document.getElementById('wd-airport-location-status').textContent.includes('Fixture route failure'));assert.equal(await actions.count(),0);
  failRoute=false;await page.locator('#wd-airport-terminal').selectOption('t1');await ready();
  await page.locator('#fleet-container > div > button').first().click();assert.equal(await page.locator('#booking-modal').isVisible(),true);await page.evaluate(()=>closeModal());
  await page.locator('#wd-airport-date').fill('');await guide('wd-airport-date');
  await page.screenshot({path:'.test-output/guided-'+(process.env.GUIDED_DESKTOP==='1'?'desktop':'mobile')+'.png',fullPage:false});
  assert.deepEqual(errors,[]);
  console.log('PASS '+(process.env.GUIDED_DESKTOP==='1'?'desktop':'mobile')+': card-to-pickup/date/trip-type/drop/airport focus, Enter/Space, reduced-motion layout, guarded booking, valid recovery; no navigation for pending/failed routes. Offline fixtures.');
} finally {
  await browser.close(); await new Promise(resolve=>server.close(resolve));
}
