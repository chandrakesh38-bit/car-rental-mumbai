import {installOfflineUiAssets} from './testing/offline-ui-assets.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await startServer(root,4391);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const output=process.env.TEST_OUTPUT || root+'/.test-output/phase1';
await mkdir(output,{recursive:true});
const rate={full_name:'Maruti Suzuki Dzire',segment:'Sedan',outstation_rate_per_km:14,driver_allowance_per_day:500,is_active:true,local_pkg_8hr_80km:2320,local_extra_hour_rate:150,local_extra_km_rate:14,airport_t1_rate:1500,airport_t2_rate:1600,airport_nmia_rate:2000,seating_capacity:4,bag_capacity:2};
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 let routeCalls=0,rejectPickup=false,failRoute=false,delay=0;
 const errors=[];
 await context.route('**/*',async route=>{
  const req=route.request(),url=req.url(),json=(data,status=200)=>route.fulfill({json:data,status});
  if(url.includes('supabase.co/rest/'))return json(url.includes('with_driver_rates')?[rate]:url.includes('pricing_rules')?[{rule_name:'Minimum Outstation KM/Day',rule_value:300}]:[]);
  if(url.endsWith('/api/maps-route')){
   const b=req.postDataJSON();
   if(b.action==='autocomplete')return json({success:true,suggestions:[{placeId:b.input.replaceAll(' ','-'),mainText:b.input,text:b.input,secondaryText:'Maharashtra, India'}]});
   if(b.action==='validate-pickup'){await new Promise(r=>setTimeout(r,200));return json({success:true,allowed:!rejectPickup,serviceArea:'Mumbai',message:'Pickup unavailable'});}
   if(b.action==='route'){routeCalls++;await new Promise(r=>setTimeout(r,delay));return failRoute?json({success:false,message:'Fixture route unavailable'},503):json({success:true,journeyType:b.journeyType,routeKmRoundedUp:300,distanceMeters:300000,distanceKmExact:300,legs:[{duration:'1800s'},{duration:'7200s'},{duration:'9000s'}]});}
   if(b.action==='airport-route')return json({success:true,distanceMeters:15000,distanceKmExact:15});
   return json({success:false},400);
  }
  if(url.includes('/api/'))return json({success:false},503);
  if(/google-analytics|googletagmanager|clarity.ms/.test(url))return route.fulfill({body:''});
  if(req.method()!=='GET')throw Error('External mutation forbidden: '+url);
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await installOfflineUiAssets(context);
 await page.goto('http://127.0.0.1:4391/');
 await page.waitForFunction(()=>document.body.classList.contains('cwd-p1-conversion'));
 assert.equal(await page.locator('#explore-cabs-button').count(),1);
 const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 await page.locator('#wd-out-round-trip').click();
 await page.locator('#wd-out-pdate').fill(future);
 await page.locator('#wd-out-rdate').fill(future);
 await page.locator('#wd-out-rhour').selectOption('6');
 await page.locator('#wd-out-rampm').selectOption('PM');
 await page.locator('#wd-out-one-way').click();
 assert.equal(await page.locator('#wd-out-rdate').isVisible(),false);
 await page.locator('#wd-out-round-trip').click();
 assert.equal(await page.locator('#wd-out-rdate').inputValue(),future);
 assert.equal(await page.locator('#wd-out-rhour').inputValue(),'6');
 await page.locator('#wd-out-one-way').click();
 assert.equal(await page.locator('#wd-out-one-way').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#wd-out-round-trip').getAttribute('aria-pressed'),'false');
 await page.waitForTimeout(250); // Let the selection's CSS transition settle for screenshots.
 for(const width of [320,360,390,412,768,1366]){
  await page.setViewportSize({width,height:width>=768?768:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const box=await page.locator('#explore-cabs-button').boundingBox();
  assert.ok(box.y+box.height<= (width>=768?768:844),`CTA clipped at ${width}`);
  await page.screenshot({path:output+`/one-way-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_ok,fail)=>fail({code:1})}}));
 await page.locator('#wd-out-pickup').locator('..').locator('.location-current-action').click();
 await page.getByText('Location is blocked for this site.',{exact:false}).waitFor();
 // Rejected pickup must not advance focus; keyboard selection is supported.
 rejectPickup=true;
 await page.locator('#wd-out-pickup').fill('Invalid City');
 await page.locator('#wd-out-pickup-dropdown button').first().press('Enter');
 await page.waitForFunction(()=>document.querySelector('#wd-out-pickup').dataset.pickupAllowed==='false');
 assert.notEqual(await page.evaluate(()=>document.activeElement.id),'wd-out-destination');
 rejectPickup=false;
 await page.locator('#wd-out-pickup').fill('Mumbai');
 await page.locator('#wd-out-pickup-dropdown button').first().click();
 await page.waitForFunction(()=>document.activeElement.id==='wd-out-destination');
 await page.locator('#wd-out-destination').fill('Pune');
 await page.locator('#wd-out-dest-dropdown button').first().press('Enter');
 await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
 await page.locator('#wd-out-phour').selectOption('9');await page.locator('#wd-out-pampm').selectOption('AM');
 await page.waitForFunction(()=>document.activeElement.id==='explore-cabs-button');
 const fare=await page.evaluate(()=>getCarCost(wdFleet[0]));assert.equal(fare,4700);
 // Cached quotes finish immediately; slow requests below verify animation.
 const fastStart=Date.now();
 await page.locator('#explore-cabs-button').click();
 await page.waitForFunction(()=>!fareSearchInFlight);
 assert.ok(Date.now()-fastStart<2000,'Cached results have no artificial delay');
 await page.getByRole('button',{name:'Modify Booking',exact:true}).click();
 const modifyStart=Date.now();
 await page.locator('#explore-cabs-button').click();
 await page.waitForFunction(()=>!fareSearchInFlight);
 assert.ok(Date.now()-modifyStart<2000,'Cached Modify Booking has no artificial delay');
 // Force a route refresh to hold a real search promise open while double clicking.
 await page.evaluate(()=>{wdOutstationRouteQuote=null;});delay=4500;
 const slowStart=Date.now();
 const count=routeCalls;
 await page.locator('#explore-cabs-button').click();
 await page.evaluate(()=>triggerFareSearch());
 await page.locator('#cwd-p1-search-loader.visible').waitFor();
 assert.equal(await page.locator('#explore-cabs-button').isDisabled(),true);
 assert.equal(await page.locator('#cwd-p1-search-loader .cwd-p1-loader-bars span').count(),3);
 const first=await page.locator('.cwd-p1-loader-bars span').evaluateAll(bars=>bars.map(b=>getComputedStyle(b).transform));
 await page.waitForTimeout(180);
 const second=await page.locator('.cwd-p1-loader-bars span').evaluateAll(bars=>bars.map(b=>getComputedStyle(b).transform));
 assert.notDeepEqual(first,second,'Bars animate while a route request is pending');
 await page.waitForFunction(()=>!fareSearchInFlight);
 assert.ok(Date.now()-slowStart>=4500,'Loader must await a slow calculation');
 assert.ok(Date.now()-slowStart<7500,'Do not add four seconds after a slow calculation');
 assert.equal(routeCalls-count,1);assert.equal(await page.locator('#fleet').isVisible(),true);
 assert.equal(await page.locator('#explore-cabs-button').isEnabled(),true);
 // Failure releases the guard and allows a successful retry.
 await page.evaluate(()=>{wdOutstationRouteQuote=null;});failRoute=true;delay=0;
 const errorStart=Date.now();
 await page.evaluate(()=>triggerFareSearch());
 assert.equal(await page.locator('#explore-cabs-button').isEnabled(),true);
 assert.equal(await page.locator('#cwd-p1-search-loader').isVisible(),false);
 assert.ok(Date.now()-errorStart<2000,'Error must skip the four-second minimum');
 failRoute=false;await page.evaluate(()=>triggerFareSearch());
 assert.equal(await page.locator('#fleet').isVisible(),true);
 await page.locator('#subtab-local').click();assert.equal(await page.locator('#wd-local-fields').isVisible(),true);
 await page.locator('#subtab-airport').click();await page.locator('#btn-airport-pickup').click();
 assert.equal(await page.locator('#wd-airport-terminal').isVisible(),true);
 await page.locator('#btn-airport-drop').click();assert.equal(await page.locator('#wd-airport-pickup').isVisible(),true);
 await page.locator('#btn-mode-selfdrive').click();assert.equal(await page.locator('#with-driver-block').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS Phase 1: six widths, one CTA, trip switching/restore, keyboard locations, rejection focus, verified focus, unchanged fixture fare, animated pending-request loader and immediate cached results, one concurrent route request, error/retry, Local/Airport/Self Drive visibility. No booking/OTP/payment traffic.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
