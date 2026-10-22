import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4317';
assert.equal(new URL(base).hostname,'127.0.0.1');
const output='.test-output/premium-ux';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu','--renderer-process-limit=2']});
const report=[];
async function prepare(page) {
 await page.goto(base+'/');
 await page.waitForFunction(()=>withDriverRatesLoadedFromDb&&publicOutstationMinimumLoaded);
 await page.locator('#wd-out-round-trip').click();
 for(const [id,value,dropdown] of [['wd-out-pickup','Mumbai','wd-out-pickup-dropdown'],['wd-out-destination','Pune','wd-out-dest-dropdown']]){
  await page.locator('#'+id).fill(value);await page.locator('#'+dropdown+' button').first().click();
 }
 const day=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 for(const id of ['wd-out-pdate','wd-out-rdate'])await page.locator('#'+id).fill(day);
 await page.locator('#wd-out-phour').selectOption('9');await page.locator('#wd-out-pampm').selectOption('AM');
 await page.locator('#wd-out-rhour').selectOption('6');await page.locator('#wd-out-rampm').selectOption('PM');
 await page.waitForFunction(()=>wdOutstationRouteQuote!==null);
}
async function search(page) {
 await page.locator('#explore-cabs-button').click();
 await page.waitForFunction(()=>!fareSearchInFlight&&document.body.classList.contains('cwd-p1-results-open'));
 await page.locator('.cwd-p1-card').first().waitFor();
}
try {
 for(const [width,height] of [[327,464],[390,844]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'no-preference',recordVideo:{dir:output,size:{width,height}}});
  const page=await context.newPage(),video=page.video(),errors=[];let loginRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().endsWith('/api/customer-account')&&r.method()==='POST'&&r.postDataJSON()?.action==='login')loginRequests++;});
  await prepare(page);
  await page.route('**/api/maps-route',async route=>{if(route.request().postDataJSON()?.action==='route')await new Promise(r=>setTimeout(r,1200));await route.continue();});
  await page.evaluate(()=>{wdOutstationRouteQuote=null;});
  assert.equal(await page.locator('#cwd-results-offer[open]').count(),0,'No popup before results');
  await page.evaluate(()=>{
   window.__loaderFrames=[];
   const loop=()=>{const overlay=document.getElementById('cwd-p1-search-loader');if(overlay?.classList.contains('visible'))window.__loaderFrames.push({time:performance.now(),bars:[...overlay.querySelectorAll('.cwd-p1-loader-bars span')].map(b=>getComputedStyle(b).transform)});if(!window.__stopLoaderCapture)requestAnimationFrame(loop);};requestAnimationFrame(loop);
  });
  await page.locator('#explore-cabs-button').click();
  assert.equal(await page.locator('#cwd-p1-search-loader').isVisible(),true);
  assert.equal(await page.locator('#explore-cabs-button').isDisabled(),true);
  await page.evaluate(()=>triggerFareSearch()); // duplicate is ignored while busy
  await page.screenshot({path:`${output}/${width}-loader.png`});
  await page.waitForFunction(()=>!fareSearchInFlight);
  const resultAt=Date.now();
  const frames=await page.evaluate(()=>{window.__stopLoaderCapture=true;return window.__loaderFrames;});
  assert.ok(frames.length>=8,'Slow responses paint animation frames');
  assert.ok(frames.at(-1).time-frames[0].time>=700,'Loader remains visible while the provider response is pending');
  for(let bar=0;bar<3;bar++)assert.ok(new Set(frames.map(f=>f.bars[bar])).size>3,`Bar ${bar+1} visibly animates`);
  const fareBefore=await page.locator('.cwd-p1-card').evaluateAll(cards=>cards.map(c=>c.dataset.cwdP1Fare));
  const captureStyle='nav,.cwd-p1-toolbar {visibility:hidden!important;transition:none!important;}';
  await page.locator('#fleet-container').screenshot({path:`${output}/${width}-results.png`,style:captureStyle});
  for(const [slug,label] of [['dzire','Best Value'],['ertiga','Family Choice'],['crysta','Premium Comfort']]){
   const card=page.locator('.cwd-p1-card').filter({has:page.getByText(label,{exact:true})});
   assert.equal(await card.count(),1);
   assert.equal(await card.locator('.cwd-p1-vehicle-badge').evaluate(b=>getComputedStyle(b).borderRadius),'8px');
   await card.screenshot({path:`${output}/${width}-${slug}.png`,style:captureStyle});
  }
  const offer=page.locator('#cwd-results-offer');
  await page.locator('#cwd-results-offer[open]').waitFor({timeout:20000});
  assert.ok(Date.now()-resultAt>=9000,'Offer waits for real engagement, without a mocked clock');
  assert.equal(await page.locator('#cwd-offer-title').innerText(),'Your next ride, 10% less');
  const expert=offer.getByRole('link',{name:'Speak to Expert'});
  assert.match(await expert.getAttribute('href'),/^https:\/\/wa\.me\/919702988465\?/);
  await page.screenshot({path:`${output}/${width}-popup.png`,animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await offer.evaluate(d=>d.contains(document.activeElement)),true,'Native dialog traps keyboard focus');
  await offer.locator('input').fill('12345');
  await offer.locator('form').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(loginRequests,0,'Invalid numbers do not start login');
  await offer.locator('input').fill(width===327?'9999999327':'9999999390');
  await offer.getByRole('button',{name:'Continue with mobile OTP'}).click();
  await page.locator('.otp-digits input').first().waitFor();
  assert.equal(await offer.isVisible(),false,'OTP is not covered by a native dialog');
  await page.keyboard.press('Escape');
  await offer.getByText(/Verification cancelled/).waitFor();
  await offer.locator('form').evaluate(f=>{for(let i=0;i<2;i++)f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.locator('.otp-digits input').first().waitFor();
  await page.screenshot({path:`${output}/${width}-otp.png`});
  for(let i=0;i<6;i++)await page.locator('.otp-digits input').nth(i).fill('012345'[i]);
  await page.getByRole('button',{name:'Verify & Sign In',exact:true}).click();
  await offer.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Copy',exact:true}).waitFor();
  assert.equal(loginRequests,1,'Duplicate submit cannot mint duplicate sessions');
  await page.screenshot({path:`${output}/${width}-signed-in.png`});
  assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/customer-account');return r.status;}),200,'Existing account cookie is established');
  assert.equal(await offer.isVisible(),false,'Login automatically returns to results');
  assert.deepEqual(await page.locator('.cwd-p1-card').evaluateAll(cards=>cards.map(c=>c.dataset.cwdP1Fare)),fareBefore,'Sign-in leaves quoted fares unchanged');
  await page.locator('.cwd-p1-card[role="button"]').first().click();
  await page.locator('#booking-modal').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-payment-choice]').count(),3,'Checkout retains all payment choices after offer login');
  await page.goto(base+'/customer-account');await page.locator('#profile-panel').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
  report.push({width,height,passed:true,animationFrames:frames,loginRequests,fareBefore,accountSessionVerified:true});
  await context.close();await video.saveAs(`${output}/${width}-journey.webm`);
  console.log(`PASS ${width}px: animated cached search, real 10s results trigger, premium badges, OTP cancel/retry/login, unchanged fares and checkout`);
 }
 // A dismissed invitation stays dismissed across searches and reloads in this tab.
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();await prepare(page);await search(page);
 await page.locator('#cwd-results-offer[open]').waitFor({timeout:20000});
 await page.getByRole('button',{name:'Close offer',exact:true}).click();
 await page.evaluate(()=>triggerFareSearch());await page.waitForTimeout(11000);
 assert.equal(await page.locator('#cwd-results-offer[open]').count(),0,'No repeat after dismissal');
 await prepare(page);await search(page);await page.waitForTimeout(11000);
 assert.equal(await page.locator('#cwd-results-offer[open]').count(),0,'Dismissal survives reload');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>triggerFareSearch());
 assert.ok(await page.locator('.cwd-p1-loader-bars span').evaluateAll(b=>b.every(x=>getComputedStyle(x).animationName==='none')));
 await context.close();
 report.push({dismissalAcrossSearchAndReload:true,reducedMotion:true});
} finally {await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));}
console.log('PASS premium mobile UX; real app/API handlers, isolated database/OTP/payment providers');
