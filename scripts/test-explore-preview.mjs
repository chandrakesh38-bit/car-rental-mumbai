import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='.test-output/explore-preview';
await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report=[];
try {
 for(const [width,height] of [[436,506],[327,464],[390,844],[1366,768]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:width===327?'reduce':'no-preference'});
  await context.addInitScript(()=>sessionStorage.setItem('cwd-results-offer-seen-v1','1'));
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4331/');
  const frame=await page.locator('iframe').elementHandle().then(e=>e.contentFrame());
  await frame.waitForFunction(()=>withDriverRatesLoadedFromDb&&publicOutstationMinimumLoaded);
  const button=frame.locator('#explore-cabs-button');
  const box=await button.boundingBox();
  assert.ok(box&&box.y>=0&&box.y+box.height<=height,'CTA fully within outer viewport without scrolling');
  await page.screenshot({path:`${root}/${width}-visible.png`});
  await frame.locator('#wd-out-round-trip').click();
  for(const [id,value,dd] of [['wd-out-pickup','Mumbai','wd-out-pickup-dropdown'],['wd-out-destination','Pune','wd-out-dest-dropdown']]){
   await frame.locator('#'+id).fill(value);await frame.locator('#'+dd+' button').first().click();
  }
  const day=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
  for(const id of ['wd-out-pdate','wd-out-rdate'])await frame.locator('#'+id).fill(day);
  await frame.locator('#wd-out-phour').selectOption('9');await frame.locator('#wd-out-pampm').selectOption('AM');
  await frame.locator('#wd-out-rhour').selectOption('6');await frame.locator('#wd-out-rampm').selectOption('PM');
  await frame.waitForFunction(()=>wdOutstationRouteQuote!==null);
  await page.route('**/api/maps-route',async route=>{if(route.request().postDataJSON()?.action==='route')await new Promise(r=>setTimeout(r,1200));await route.continue();});
  await frame.evaluate(()=>{wdOutstationRouteQuote=null;});
  const ready=await button.boundingBox();
  assert.ok(ready.y>=0&&ready.y+ready.height<=height,'CTA remains visible after entering route');
  // Physical click does not auto-scroll the iframe to conceal a viewport bug.
  await frame.evaluate(()=>{
   window.searchTiming={};
   const observer=new MutationObserver(()=>{
    const visible=document.getElementById('cwd-p1-search-loader')?.classList.contains('visible');
    if(visible && !window.searchTiming.start)window.searchTiming.start=performance.now();
    if(!visible && window.searchTiming.start && !window.searchTiming.end){window.searchTiming.end=performance.now();observer.disconnect();}
   });
   observer.observe(document.body,{subtree:true,attributes:true,childList:true});
  });
  await page.mouse.click(ready.x+ready.width/2,ready.y+ready.height/2);
  await frame.locator('#cwd-p1-search-loader.visible').waitFor();
  const sample=()=>frame.locator('.cwd-p1-loader-bars span').evaluateAll(b=>b.map(x=>getComputedStyle(x).transform));
  const a=await sample();await page.screenshot({path:`${root}/${width}-animation.png`});
  await page.waitForTimeout(130);const b=await sample();assert.notDeepEqual(a,b,'Loader animates after actual button click');
  for(let i=0;i<3;i++) {
   const translateY=matrix=>Number(matrix.slice(7,-1).split(',')[5]);
   assert.ok(Math.abs(translateY(a[i])-translateY(b[i]))>0.1,`Bar ${i+1} moves vertically`);
  }
  await frame.waitForFunction(()=>!fareSearchInFlight);await frame.locator('.cwd-p1-card').first().waitFor();
  const loaderMs=await frame.evaluate(()=>searchTiming.end-searchTiming.start);
  assert.ok(loaderMs>=3990,`Loader stays visible at least four seconds: ${loaderMs}`);
  report.push({width,height,button:box,animation:true,results:true,loaderMs});
  await context.close();
 }
 await writeFile(`${root}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser.close();}
