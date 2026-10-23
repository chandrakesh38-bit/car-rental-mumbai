import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {startServer} from './serve.mjs';
import {installOfflineUiAssets} from './testing/offline-ui-assets.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=await startServer(undefined,4195),browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('.test-output/service-plans',{recursive:true});
const rates=[{full_name:'WagonR',segment:'Hatchback',is_active:true,seating_capacity:4,local_pkg_8hr_80km:2400,local_extra_hour_rate:200,local_extra_km_rate:15,outstation_rate_per_km:12,driver_allowance_per_day:500}];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname.endsWith('supabase.co'))return r.fulfill({json:u.pathname.endsWith('with_driver_rates')?rates:u.pathname.endsWith('pricing_rules')?[{rule_name:'Minimum Outstation KM/Day',rule_value:300}]:[]});if(u.pathname.startsWith('/api/'))return r.fulfill({status:503,json:{success:false}});if(/google-analytics|googletagmanager|clarity.ms/.test(u.hostname))return r.fulfill({body:''});assert.equal(r.request().method(),'GET');return r.continue();});
 await installOfflineUiAssets(page);
 for(const path of ['/','/airport-transfer','/self-drive']){
  await page.goto('http://127.0.0.1:4195'+path,{waitUntil:'networkidle'});
  const expected=path==='/airport-transfer'?'airport':path==='/self-drive'?'selfdrive':'outstation';
  await page.waitForFunction(mode=>document.querySelector('.road-banner').dataset.scene===mode,expected);
  assert.equal(await page.locator('[data-road-plans]:visible').count(),expected==='selfdrive'?0:1);
  if(expected!=='selfdrive')assert.equal(await page.locator('[data-road-plans]:visible').getAttribute('data-road-plans'),expected);
 }
 await page.goto('http://127.0.0.1:4195/',{waitUntil:'networkidle'});
 await page.locator('.road-more-routes').click();assert.equal(await page.locator('.road-extra-route:visible').count(),6);
 assert.equal(await page.locator('[data-destination="Goa"]').isVisible(),true);
 await page.locator('#subtab-local').click();await page.locator('[data-road-plans="local"]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-road-plans="outstation"]').isVisible(),false);
 await page.waitForFunction(()=>document.querySelector('[data-local-plan-fare]').textContent.includes('2,400'));
 await page.locator('#wd-local-pickup').fill('Powai, Mumbai');
 await page.locator('[data-local-plan]').first().click();
 assert.equal(await page.locator('#wd-local-pickup').inputValue(),'Powai, Mumbai');
 assert.equal(await page.locator('#wd-local-package').inputValue(),'8hr_80km');
 assert.equal(await page.locator('#subtab-local').evaluate(e=>e.classList.contains('subtab-active')),true);
 for(const mode of ['local','airport','outstation']){
  await page.locator('#subtab-'+mode).click();await page.locator('[data-road-plans="'+mode+'"]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-road-plans]:visible').count(),1);
  const broken=await page.locator('[data-road-plans="'+mode+'"] img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));return imgs.filter(i=>!i.naturalWidth).map(i=>i.src);});assert.deepEqual(broken,[]);
  await page.locator('#quick-plan-routes').scrollIntoViewIfNeeded();await page.screenshot({path:'.test-output/service-plans/'+mode+'-mobile.png'});
 }
 for(const width of [320,390,1366]){
  await page.setViewportSize({width,height:900});
  for(const mode of ['local','airport','selfdrive']){
   if(mode==='selfdrive')await page.locator('#btn-mode-selfdrive').click();else{await page.locator('#btn-mode-withdriver').click();await page.locator('#subtab-'+mode).click();}
   await page.waitForFunction(mode=>document.querySelector('.road-banner').dataset.scene===mode,mode);
   assert.match(await page.locator('.road-banner').evaluate(e=>getComputedStyle(e).backgroundImage),new RegExp(mode+'\\.webp'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal overflow');
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'.test-output/service-plans/'+mode+'-'+width+'.png'});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: initial service routes, six extra destinations including Goa, live local rates, preserved pickup/package, tab isolation, images, mobile/desktop overflow. No SMS or payments.');
}finally{await browser.close();server.close();}
