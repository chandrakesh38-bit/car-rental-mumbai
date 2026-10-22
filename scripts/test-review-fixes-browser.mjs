import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4330';assert.equal(new URL(base).hostname,'127.0.0.1');
const out='.test-output/review-fixes';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const report=[];
async function search(page){
 await page.goto(base);await page.waitForFunction(()=>withDriverRatesLoadedFromDb&&publicOutstationMinimumLoaded);
 await page.locator('#wd-out-round-trip').click();
 for(const [id,value,dd] of [['wd-out-pickup','Mumbai','wd-out-pickup-dropdown'],['wd-out-destination','Pune','wd-out-dest-dropdown']]){await page.locator('#'+id).fill(value);await page.locator('#'+dd+' button').first().click();}
 const day=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 for(const id of ['wd-out-pdate','wd-out-rdate'])await page.locator('#'+id).fill(day);
 for(const [id,v] of [['wd-out-phour','9'],['wd-out-pampm','AM'],['wd-out-rhour','6'],['wd-out-rampm','PM']])await page.locator('#'+id).selectOption(v);
 await page.waitForFunction(()=>wdOutstationRouteQuote!==null);await page.locator('#explore-cabs-button').click();
 await page.waitForFunction(()=>!fareSearchInFlight&&document.body.classList.contains('cwd-p1-results-open'));
}
async function otp(page,label){await page.locator('.otp-digits input').first().waitFor();for(let i=0;i<6;i++)await page.locator('.otp-digits input').nth(i).fill('012345'[i]);await page.getByRole('button',{name:label,exact:true}).click();}

try {
 for(const width of [390,1366]) {
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('cwd-p1')));
  assert.equal(await page.locator('link[href="/assets/css/phase1-redesign.css"]').count(),1);
  await search(page);
  assert.equal(await page.getByText('Toyota Innova',{exact:true}).count(),0);
  const xl6=page.locator('.cwd-p1-card').filter({has:page.getByText('Maruti Suzuki XL6',{exact:true})});
  await xl6.waitFor();
  assert.match(await xl6.locator('img').getAttribute('src'),/models\/xl6.png$/);
  assert.equal(await xl6.locator('img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
  const angle=()=>xl6.evaluate(el=>getComputedStyle(el,'::after').getPropertyValue('--cwd-border-angle'));
  await xl6.scrollIntoViewIfNeeded();await page.waitForTimeout(100);const first=await angle();await page.waitForTimeout(350);assert.notEqual(await angle(),first,'Full-card border moves');
  await xl6.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+width+'-cards.png'});
  await context.route('**/api/customer-account',async route=>route.fulfill({json:route.request().method()==='POST'?{success:true}:{success:true,customer:{mobile:'919999999999'}}}));
  await page.goto(base+'/my-bookings');await page.getByRole('button',{name:'Logout',exact:true}).waitFor();
  await page.evaluate(()=>{sessionStorage.setItem('cwd-booking:test','secret');sessionStorage.setItem('trip-draft','preserve')});
  await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL(/customer-account/);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('cwd-booking:test')),null);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('trip-draft')),'preserve');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+width+'px static presentation, XL6 image, no Innova, moving card border and logout');
 }
} finally {await browser.close();}
