import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.PREVIEW_URL;
if(!url||!new URL(url).hostname.endsWith('-car-with-driver-operation-team.vercel.app'))throw Error('An explicit testing preview URL is required');
const output=process.env.TEST_OUTPUT;
if(!output)throw Error('TEST_OUTPUT is required');
await mkdir(output,{recursive:true});
const baseline=process.env.BASELINE==='1';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 for(const mode of (baseline?['desktop']:['desktop','android-emulation'])) {
  const mobile=mode!=='desktop';
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,reducedMotion:'no-preference',...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{})});
  const page=await context.newPage(),errors=[],network=[],consoleErrors=[],failedRequests=[];let failRoute=false;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('requestfailed',r=>failedRequests.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
  page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))network.push({path:new URL(r.url()).pathname,status:r.status(),action:r.request().postDataJSON()?.action});});
  await page.route('**/*',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(/^\/api\/(booking-enquiry|mobile-otp|.*razorpay|partner-application)/.test(path)||/verify.msg91.com|api.razorpay.com/.test(request.url()))throw Error('Transactional traffic prohibited: '+path);
   if(/google-analytics|googletagmanager|clarity.ms/.test(request.url()))return route.fulfill({body:''});
   if(failRoute&&path==='/api/maps-route'&&request.postDataJSON()?.action==='route')return route.fulfill({status:503,json:{success:false,message:'Regression fixture: route temporarily unavailable'}});
   return route.continue();
  });
  await page.addInitScript(()=>{
   window.__loaderFrames=[];window.__loaderChanges=[];window.__searchClicks=0;
   document.addEventListener('click',e=>{if(e.target.closest?.('#explore-cabs-button'))window.__searchClicks++;},true);
   const sample=()=>{
    const el=document.getElementById('cwd-p1-search-loader');
    if(el?.classList.contains('visible')){
     const css=getComputedStyle(el),box=el.getBoundingClientRect();
     window.__loaderFrames.push({time:performance.now(),display:css.display,visibility:css.visibility,opacity:css.opacity,zIndex:css.zIndex,position:css.position,width:box.width,height:box.height,disabled:document.getElementById('explore-cabs-button').disabled,bars:[...el.querySelectorAll('.cwd-p1-loader-bars span')].map(b=>({transform:getComputedStyle(b).transform,animation:getComputedStyle(b).animationName,height:b.getBoundingClientRect().height}))});
    }
    requestAnimationFrame(sample);
   };requestAnimationFrame(sample);
   new MutationObserver(records=>{for(const record of records)if(record.target.id==='cwd-p1-search-loader'&&record.attributeName==='class')window.__loaderChanges.push({time:performance.now(),visible:record.target.classList.contains('visible')});}).observe(document,{subtree:true,attributes:true,attributeFilter:['class']});
  });
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.body.classList.contains('cwd-p1-conversion'));
  const markup=await page.evaluate(()=>({buttonCount:document.querySelectorAll('#explore-cabs-button').length,onclick:document.querySelector('#explore-cabs-button').getAttribute('onclick'),scripts:[...document.scripts].map(s=>s.src?new URL(s.src).pathname:'inline'),loaderStyles:[...document.styleSheets].filter(s=>s.ownerNode.id==='cwd-p1-fare-loader-style').length}));
  assert.equal(markup.buttonCount,1);assert.equal(markup.onclick,'triggerFareSearch()');
  await page.locator('#wd-out-one-way').click();
  await page.locator('#wd-out-pickup').fill('Vikhroli Mumbai');
  await page.locator('#wd-out-pickup-dropdown button').first().click();
  await page.waitForFunction(()=>document.querySelector('#wd-out-pickup').dataset.pickupAllowed==='true');
  await page.locator('#wd-out-destination').fill('Pune');
  await page.locator('#wd-out-dest-dropdown button').first().click();
  await page.waitForFunction(()=>wdOutstationRouteQuote!==null,{},{timeout:30000});
  await page.locator('#wd-out-pdate').fill(new Date(Date.now()+5*86400000).toISOString().slice(0,10));
  await page.locator('#wd-out-phour').selectOption('9');await page.locator('#wd-out-pampm').selectOption('AM');
  await page.screenshot({path:`${output}/${mode}-before-click.png`});
  const start=await page.evaluate(()=>performance.now());
  await page.locator('#explore-cabs-button').click();
  if(!baseline){
   await page.locator('#cwd-p1-search-loader.visible').waitFor({state:'visible'});
   await page.screenshot({path:`${output}/${mode}-bars-frame-1.png`});
   await page.waitForTimeout(130);
   await page.screenshot({path:`${output}/${mode}-bars-frame-2.png`});
  }
  await page.waitForFunction(()=>!fareSearchInFlight);
  await page.locator('#fleet').waitFor({state:'visible'});
  await page.screenshot({path:`${output}/${mode}-results.png`});
  const evidence=await page.evaluate(()=>({frames:window.__loaderFrames,changes:window.__loaderChanges,clicks:window.__searchClicks,result:document.querySelector('#explore-cabs-status').textContent,cards:document.querySelectorAll('#fleet-container > *').length,oldOverlayVisible:document.querySelector('#explore-cabs-overlay').classList.contains('visible')}));
  const duration=evidence.changes.length>=2?evidence.changes.at(-1).time-evidence.changes[0].time:0;
  assert.equal(evidence.clicks,1);assert.match(evidence.result,/Live fares ready/);assert.equal(evidence.oldOverlayVisible,false);
  if(!baseline){
   assert.ok(duration>=600,`Loader visible for only ${duration}ms`);
   assert.ok(evidence.frames.length>=10,'Too few painted animation frames');
   for(let bar=0;bar<3;bar++)assert.ok(new Set(evidence.frames.map(f=>f.bars[bar]?.transform)).size>3,`Bar ${bar+1} did not animate`);
   assert.ok(evidence.frames.every(f=>f.display==='flex'&&f.visibility==='visible'&&f.opacity==='1'&&f.position==='fixed'&&f.disabled));
   // A validation failure on deployed code must release the overlay and guard.
   await page.locator('#subtab-outstation').click();await page.locator('#wd-out-pdate').fill('');
   await page.locator('#explore-cabs-button').click();await page.waitForFunction(()=>!fareSearchInFlight);
   assert.equal(await page.locator('#cwd-p1-search-loader').isVisible(),false);assert.equal(await page.locator('#explore-cabs-button').isEnabled(),true);
   await page.screenshot({path:`${output}/${mode}-validation-retry.png`});
   await page.locator('#wd-out-pdate').fill(new Date(Date.now()+5*86400000).toISOString().slice(0,10));
   // Inject an API failure in this browser only; successful searches use live APIs.
   failRoute=true;
   await page.locator('#wd-out-destination').fill('Pune');await page.locator('#wd-out-dest-dropdown button').first().click();
   await page.waitForFunction(()=>document.querySelector('#wd-out-route-status').textContent.includes('temporarily unavailable'));
   await page.locator('#explore-cabs-button').click();await page.waitForFunction(()=>!fareSearchInFlight);
   assert.equal(await page.locator('#cwd-p1-search-loader').isVisible(),false);assert.equal(await page.locator('#explore-cabs-button').isEnabled(),true);
   await page.screenshot({path:`${output}/${mode}-api-error-retry.png`});
   failRoute=false;const beforeRetry=network.filter(r=>r.action==='route').length;
   await page.locator('#explore-cabs-button').click();
   // Duplicate user taps land on the modal overlay rather than the search button.
   await page.mouse.click(195,790);await page.mouse.click(195,790);
   await page.waitForFunction(()=>!fareSearchInFlight);
   assert.match(await page.locator('#explore-cabs-status').innerText(),/Live fares ready/);
   assert.equal(network.filter(r=>r.action==='route').length-beforeRetry,1,'Duplicate taps must not start extra route requests');
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/${mode}-evidence.json`,JSON.stringify({mode,browser:browser.version(),physicalAndroid:false,url:new URL(url).origin,markup,start,durationMs:duration,...evidence,network,errors,consoleErrors,failedRequests},null,2));
  console.log(JSON.stringify({mode,baseline,durationMs:Math.round(duration),paintedFrames:evidence.frames.length,barStates:[0,1,2].map(i=>new Set(evidence.frames.map(f=>f.bars[i]?.transform)).size),clicks:evidence.clicks,result:evidence.result,errors}));
  await context.close();
 }
}finally{await browser.close();}
