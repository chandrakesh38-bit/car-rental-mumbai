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
  is_active:true,display_order:i,local_pkg_8hr_80km:3000,local_extra_hour_rate:250,
  segment:'With Driver',seating_capacity:4,bag_capacity:2
}));
const server = await startServer(fileURLToPath(new URL('../',import.meta.url)), 4312);
const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge',
  ...(process.env.LOW_MEMORY_BROWSER === '1' ? {args:['--disable-gpu','--renderer-process-limit=1']} : {})});
try {
  const context = await browser.newContext({...devices['Pixel 5'],viewport:{width:393,height:851}});
  let failPricing=false, delayRoute=0, routeCalls=0, failRoute=false, nextKm=null;
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
      if(url.includes('/pricing_rules'))return json([{rule_name:'Minimum Outstation KM/Day',rule_value:240}]);
      return json([]);
    }
    if(url.endsWith('/api/maps-route')) {
      const b=req.postDataJSON();
      if(b.action==='autocomplete') return json({success:true,suggestions:[{placeId:b.input.replaceAll(' ','-'),mainText:b.input,text:b.input,secondaryText:'Maharashtra, India'}]});
      if(b.action==='validate-pickup') return json({success:true,allowed:true,serviceArea:'Mumbai'});
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
  const buttons=page.locator('#fleet-container > div > button');
  const blocked=async()=>{
    assert.ok(await buttons.count()>0);
    for(const button of await buttons.all()) assert.equal(await button.isDisabled(),true);
    assert.equal(await page.evaluate(()=>wdFleet.every(car=>getCarCost(car)===null)),true);
    assert.doesNotMatch(await page.locator('#fleet-container').innerText(),/with FIRSTTRIP/);
  };
  const ready=async()=>{
    await page.waitForFunction(()=>outstationFareReadinessMessage()==='');
    for(const button of await buttons.all()) assert.equal(await button.isEnabled(),true);
  };
  const selectPlace=async(id,value)=>{
    await page.locator('#'+id).fill(value);
    await page.locator('#'+(id==='wd-local-pickup'?'wd-local':id==='wd-out-destination'?'wd-out-dest':id)+'-dropdown button').first().click();
  };
  const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  const dates=async()=>{
    for(const id of ['wd-out-pdate','wd-out-rdate'])await page.locator('#'+id).fill(date);
    for(const [id,value] of [['wd-out-phour','9'],['wd-out-pampm','AM'],['wd-out-rhour','6'],['wd-out-rampm','PM']]) await page.locator('#'+id).selectOption(value);
  };
  await page.locator('#subtab-local').click();
  await selectPlace('wd-local-pickup','Vikhroli West');
  await page.locator('#wd-local-date').fill(date);
  await page.locator('button[onclick="triggerFareSearch()"]').click();
  await page.locator('#fleet').waitFor({state:'visible'});
  assert.equal(await page.locator('#fleet').isVisible(),true);
  const localFares=await page.evaluate(()=>wdFleet.map(getCarCost));
  assert.ok(localFares.every(Number.isFinite));
  await page.locator('#subtab-outstation').click();
  await page.locator('#wd-out-round-trip').click();
  await blocked();
  console.log('PASS mobile Local results -> Outstation Round trip: incomplete form hides fares and disables every CTA');
  await selectPlace('wd-out-pickup','Vikhroli West');
  await selectPlace('wd-out-destination','Lonavala');
  await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
  await blocked();
  await dates(); await ready();
  assert.equal(await page.evaluate(()=>getCarCost(wdFleet[0])),240*14+500);
  console.log('PASS complete route alone remains blocked; valid dates auto-enable original minimum-km fare');
  await page.locator('#wd-out-rdate').fill(''); await blocked();
  await page.locator('#wd-out-rdate').fill(date); await ready();
  await page.locator('#wd-out-rhour').selectOption('8');
  await page.locator('#wd-out-rampm').selectOption('AM'); await blocked();
  await dates(); await ready();
  delayRoute=1200;
  await selectPlace('wd-out-destination','Pune'); await blocked();
  await ready(); delayRoute=0;
  assert.equal(await page.evaluate(()=>getCarCost(wdFleet[0])),290*14+500);
  console.log('PASS cleared/invalid dates disable fares; valid date and delayed drop changes recover without Explore');
  failRoute=true;
  await selectPlace('wd-out-destination','Nashik');
  await page.waitForFunction(()=>document.getElementById('wd-out-route-status').textContent.includes('Fixture route failure'));
  await blocked(); failRoute=false;
  await page.evaluate(()=>updateOutstationRouteEstimate()); await ready();
  assert.equal(await page.evaluate(()=>getCarCost(wdFleet[0])),336*14+500);
  nextKm=0; await page.evaluate(()=>updateOutstationRouteEstimate()); await blocked();
  nextKm=null; await page.evaluate(()=>updateOutstationRouteEstimate()); await ready();
  console.log('PASS failed/zero-distance route stays disabled and retry restores CTA');
  delayRoute=1600;
  await page.evaluate(()=>{window.oldRoute=updateOutstationRouteEstimate();}); await blocked();
  delayRoute=0;
  await selectPlace('wd-out-destination','Pune'); await ready();
  await page.evaluate(()=>window.oldRoute);
  assert.equal(await page.evaluate(()=>wdOutstationKm),290);
  await page.locator('#wd-out-one-way').click(); await ready();
  assert.equal(await page.evaluate(()=>wdOutstationRouteQuote.journeyType),'one-way');
  console.log('PASS older async route cannot overwrite new selection; one-way recalculation recovers');
  await buttons.first().click();
  assert.equal(await page.locator('#booking-modal').isVisible(),true);
  await page.evaluate(()=>closeModal());
  await page.locator('#wd-out-pdate').fill('2000-01-01'); await blocked();
  await page.evaluate(()=>handleBookThisCarClick(wdFleet[0].name,1));
  assert.equal(await page.locator('#booking-modal').isVisible(),false);
  await page.locator('#subtab-local').click();
  assert.deepEqual(await page.evaluate(()=>wdFleet.map(getCarCost)),localFares);
  assert.equal(await buttons.first().isEnabled(),true);
  await buttons.first().click();
  assert.equal(await page.locator('#booking-modal').isVisible(),true);
  await page.evaluate(()=>closeModal());
  await page.locator('#subtab-outstation').click();
  await mkdir('.test-output',{recursive:true});
  await page.screenshot({path:'.test-output/outstation-readiness-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS mobile CTA opens valid booking form, blocks stale direct call, Local fares/workflow unchanged, no horizontal overflow or JS errors');
} finally {
  await browser.close(); await new Promise(resolve=>server.close(resolve));
}
