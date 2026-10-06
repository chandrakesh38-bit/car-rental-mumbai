import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
import { startServer } from './serve.mjs';

// Contract tests: mocked current admin rates and Maps/OTP providers, no real leads or SMS.
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
  const context = await browser.newContext({...devices['Pixel 5'],viewport:{width:393,height:851},ignoreHTTPSErrors:true});
  let failPricing=false, delayRoute=0, routeCalls=0, otpReject=false, bookingSuccess=false;
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
        routeCalls++; if(delayRoute) await new Promise(r=>setTimeout(r,delayRoute));
        const km={Lonavala:174,Pune:290,Nashik:336}[b.finalDropPlaceId] || 174;
        return json({success:true,journeyType:b.journeyType,routeKmRoundedUp:km,distanceMeters:km*1000,distanceKmExact:km,legs:[]});
      }
      return json({success:false},400);
    }
    if(url.endsWith('/api/booking-enquiry')) return json(bookingSuccess?{success:true,booking_id:'ISOLATED-TEST-ONLY'}:{success:false,message:'Fixture booking rejected'},bookingSuccess?200:400);
    if(url.endsWith('/api/mobile-otp')) {
      if(req.method()==='GET')return json({success:true,widgetId:'fixture',tokenAuth:'fixture'});
      const b=req.postDataJSON();
      if(b.action==='diagnostic')return json({success:true});
      return json(otpReject?{success:false,message:'Test verification failure'}:{success:true,proof:'fixture-proof',expiresAt:Date.now()+600000},otpReject?403:200);
    }
    if(url==='https://verify.msg91.com/otp-provider.js') return route.fulfill({contentType:'text/javascript',body:`
      window.initSendOTP=()=>{
        window.getWidgetData=()=>({otpLength:6,retryTime:30});
        window.isCaptchaVerified=()=>true;
        window.sendOtp=(phone,ok)=>ok({reqId:'fixture-request'});
        window.retryOtp=(channel,ok)=>ok({reqId:'fixture-request'});
        window.verifyOtp=(otp,ok,fail)=>otp==='012345'?ok({'access-token':'fixture-token'}):fail({message:'Incorrect OTP'});
      };`});
    if(req.method()!=='GET')throw Error('Unexpected mutation blocked: '+url);
    if(!url.startsWith('http://127.0.0.1:')) {
      if(!cache.has(url)) cache.set(url,(async()=>{const r=await route.fetch();return {status:r.status(),headers:r.headers(),body:await r.body()};})());
      return route.fulfill(await cache.get(url));
    }
    return route.continue();
  });
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  const go=async()=>{
    await page.goto('http://127.0.0.1:4312/outstation?utm_source=google&utm_medium=cpc&utm_campaign=clarity_testing');
    await page.waitForFunction(()=>typeof triggerFareSearch==='function');
    if (clarityTest) await page.waitForFunction(()=>Boolean(window.clarity?.q));
    await page.evaluate(()=>{
      window.testEvents=[];
      const original=window.cwdTrackEvent;
      window.cwdTrackEvent=(name,params)=>{original(name,params);window.testEvents.push({name,params});};
    });
  };
  await go();
  await page.locator('#explore-cabs-button').click();
  assert.equal(await page.locator('#wd-out-trip-type-fieldset').getAttribute('aria-invalid'),'true');
  assert.equal(await page.locator('#fleet').isVisible(),false);
  assert.equal(await page.evaluate(()=>testEvents.filter(e=>e.name==='fare_validation_failed').length),1);
  for(const destination of ['Lonavala','Pune','Nashik']) for(const journey of ['one-way','round-trip']) {
    await go(); await page.locator('#wd-out-'+journey).click();
    for(const [id,value] of [['wd-out-pickup','Vikhroli West'],['wd-out-destination',destination]]) {
      await page.locator('#'+id).fill(value);
      await page.locator('#'+(id==='wd-out-destination'?'wd-out-dest':id)+'-dropdown button').first().click();
    }
    const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
    for(const id of ['wd-out-pdate','wd-out-rdate'])await page.locator('#'+id).fill(date);
    await page.locator('#wd-out-phour').selectOption('9');
    await page.locator('#wd-out-pampm').selectOption('AM');
    await page.locator('#wd-out-rhour').selectOption('6');
    await page.locator('#wd-out-rampm').selectOption('PM');
    await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
    delayRoute=600;
    // Force a slow route refresh so the actual button feedback and double-tap guard run.
    await page.evaluate(()=>{wdOutstationRouteQuote=null;window.testEvents=[];});
    await page.locator('#explore-cabs-button').click();
    assert.equal(await page.locator('#explore-cabs-button').isDisabled(),true);
    await page.evaluate(()=>triggerFareSearch());
    await page.waitForFunction(()=>!document.getElementById('explore-cabs-button').disabled);
    delayRoute=0;
    assert.equal(await page.locator('#fleet-container > div').count(),6);
    const km={Lonavala:240,Pune:290,Nashik:336}[destination];
    const regular=km*14+500, discounted=regular-Math.round(regular*.05);
    assert.match(await page.locator('#fleet-container > div').first().innerText(),new RegExp(discounted.toLocaleString('en-IN')+' with FIRSTTRIP'));
    await page.locator('#fleet-container').getByRole('button',{name:'Book This Car',exact:true}).first().click();
    assert.equal(await page.locator('#booking-modal').isVisible(),true);
    assert.equal(await page.locator('#modal-fare').innerText(),'₹'+discounted.toLocaleString('en-IN'));
    const events=await page.evaluate(()=>testEvents);
    for(const name of ['explore_cabs_click','cab_results_shown','book_car_click','booking_form_opened'])assert.equal(events.filter(e=>e.name===name).length,1,name);
    if (clarityTest) {
      const calls=await page.evaluate(()=>window.clarity.q.map(args=>Array.from(args)));
      for(const name of ['cab_results_shown','book_car_click','booking_form_opened']) assert.equal(calls.filter(c=>c[0]==='event'&&c[1]===name).length,1,'Clarity '+name);
      assert.equal(await page.locator('html').getAttribute('data-clarity-mask'),null);
      assert.equal(await page.locator('#modal-summary-pickup').getAttribute('data-clarity-mask'),'true');
      assert.equal(calls.some(c=>c[0]==='set'&&c[1]==='traffic_type'&&c[2]==='google_ads'),true);
    }
  assert.equal(events.some(e=>e.name==='booking_request_submitted'),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    console.log(`PASS mobile ${destination} ${journey}: live-rate fixture, minimum km, discount, delayed feedback, duplicate tap, results and modal events`);
  }
  await page.locator('#cust-phone').fill('9999999999');
  await page.evaluate(async()=>{const mod=await import('/assets/js/mobile-otp.js');window.testOtpPromise=mod.requestFormOtp(document.querySelector('#cust-phone').form,'cust-phone','booking').catch(e=>e.message);});
  await page.locator('#mobile-otp-modal [data-digits] input').first().waitFor();
  assert.equal(await page.evaluate(()=>testEvents.filter(e=>e.name==='otp_requested').length),1);
  for(const [i,digit] of [...'012345'].entries()) await page.locator('#mobile-otp-modal [data-digits] input').nth(i).fill(digit);
  otpReject=true; await page.locator('#mobile-otp-modal [data-verify]').click();
  await page.getByText('Test verification failure',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>testEvents.filter(e=>e.name==='otp_verified').length),0);
  otpReject=false; await page.locator('#mobile-otp-modal [data-verify]').click();
  await page.locator('#mobile-otp-modal').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>testEvents.filter(e=>e.name==='otp_verified').length),1);
  assert.equal(await page.evaluate(()=>testEvents.filter(e=>e.name==='booking_request_submitted').length),0);
  console.log('PASS OTP events require successful provider send and server verification; no booking event from OTP alone');
  const submitFixture=()=>page.evaluate(()=>sendEmailNotification(document.querySelector('#cust-phone').form,'ISOLATED-TEST-ONLY','Fixture','9999999999','fixture@example.com','Fixture trip',()=>{},'withdriver','fixture-proof',{tripType:'outstation'}));
  await submitFixture();
  assert.equal(await page.evaluate(()=>testEvents.filter(e=>e.name==='booking_request_submitted').length),0);
  bookingSuccess=true; await submitFixture();
  assert.equal(await page.evaluate(()=>testEvents.filter(e=>e.name==='booking_request_submitted').length),1);
  console.log('PASS booking conversion occurs only after a successful mocked booking API response, never on rejection');
  if (clarityTest) {
    const calls=await page.evaluate(()=>window.clarity.q.map(args=>Array.from(args)));
    for(const name of ['otp_requested','otp_verified','booking_request_submitted']) assert.equal(calls.filter(c=>c[0]==='event'&&c[1]===name).length,1,'Clarity '+name);
    const serialized=JSON.stringify(calls);
    for(const sensitive of ['9999999999','fixture@example.com','ISOLATED-TEST-ONLY','fixture-proof','012345']) assert.ok(!serialized.includes(sensitive));
    console.log('PASS Clarity seven-event Android funnel, selective sensitive masking, paid filter, and no PII in custom payloads');
  }
  failPricing=true; await go(); await page.locator('#wd-out-one-way').click(); await page.locator('#explore-cabs-button').click();
  await page.waitForFunction(()=>!document.getElementById('explore-cabs-button').disabled);
  assert.equal(await page.locator('#fleet-container > div').count(),0);
  assert.match(await page.locator('#explore-cabs-status').innerText(),/Could not load live fares/);
  console.log('PASS unavailable admin rates cannot expose stale fallback fares');
  if (clarityTest) {
    // Remove the persisted consent initializer for the preference UI checks.
    const preferenceContext=await browser.newContext({...devices['Pixel 5'],ignoreHTTPSErrors:true});
    await preferenceContext.route('**/*',async route=>{
      const url=route.request().url();
      if(url.endsWith('/api/clarity-config'))return route.fulfill({json:{enabled:true,environment:'testing',projectId:'fixture123'}});
      if(/\.clarity\.ms\//.test(url))return route.fulfill({contentType:'text/javascript',body:''});
      if(/googletagmanager|google-analytics/.test(url))return route.fulfill({body:''});
      if(!url.startsWith('http://127.0.0.1:')) {
        if(!cache.has(url))cache.set(url,(async()=>{const r=await route.fetch();return {status:r.status(),headers:r.headers(),body:await r.body()};})());
        return route.fulfill(await cache.get(url));
      }
      return route.continue();
    });
    const choicePage=await preferenceContext.newPage();
    await choicePage.goto('http://127.0.0.1:4312/privacy-policy');
    await choicePage.getByRole('button',{name:'No thanks',exact:true}).waitFor();
    assert.equal(await choicePage.locator('#cwd-clarity-sdk').count(),0);
    await mkdir(new URL('../.test-output/',import.meta.url),{recursive:true});
    await choicePage.screenshot({path:fileURLToPath(new URL('../.test-output/clarity-mobile-consent.png',import.meta.url))});
    await choicePage.getByRole('button',{name:'No thanks',exact:true}).click();
    await choicePage.reload();
    await choicePage.getByRole('button',{name:'Analytics preferences',exact:true}).waitFor();
    assert.equal(await choicePage.locator('#cwd-clarity-sdk').count(),0);
    await choicePage.getByRole('button',{name:'Analytics preferences',exact:true}).click();
    await choicePage.getByRole('button',{name:'Allow & Continue',exact:true}).click();
    await choicePage.locator('#cwd-clarity-sdk').waitFor({state:'attached'});
    assert.equal(await choicePage.locator('html').getAttribute('data-clarity-mask'),'true');
    await choicePage.getByRole('button',{name:'Analytics preferences',exact:true}).click();
    await choicePage.getByRole('button',{name:'No thanks',exact:true}).click();
    await choicePage.getByRole('button',{name:'Analytics preferences',exact:true}).waitFor();
    assert.equal(await choicePage.locator('#cwd-clarity-sdk').count(),0);
    await preferenceContext.close();
    console.log('PASS mobile consent UI: no SDK before consent or after decline; accept loads once; withdrawal persists across reload');
  }
  assert.deepEqual(errors,[]);
  const source=await readFile(new URL('../assets/js/analytics.js',import.meta.url),'utf8');
  for(const hostname of ['carswithdriverindia.com','preview.vercel.app']){
    const calls=[],window={gtag:(...args)=>calls.push(args)};
    vm.runInNewContext(source,{window,location:{hostname,pathname:'/outstation',href:'https://'+hostname+'/outstation'},document:{referrer:'',addEventListener(){}},URL});
    window.cwdTrackEvent('booking_form_opened',{service_type:'with_driver',name:'Private Name',phone:'9999999999',email:'private@example.com',address:'Private address',page_path:'/outstation?phone=9999999999'});
    const event=calls.find(c=>c[0]==='event');
    if(hostname.endsWith('vercel.app'))assert.equal(event,undefined);
    else assert.deepEqual(JSON.parse(JSON.stringify(event[2])),{service_type:'with_driver',page_path:'/outstation'});
  }
  console.log('PASS analytics allowlist excludes PII and query strings; preview sends no production events');
} finally {await browser.close();server.close();}
