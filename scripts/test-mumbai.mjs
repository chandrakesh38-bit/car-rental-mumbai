import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.TEST_OUTPUT || path.join(root,'.test-output/mumbai');
const baseline = process.env.BASELINE_DIR;
await mkdir(output,{recursive:true});
const completed=[];
const check=async(name,fn)=>{await fn();completed.push(name);console.log('PASS '+name);};
async function files(dir,prefix='') {
  const list=[];
  for(const entry of await readdir(path.join(dir,prefix),{withFileTypes:true})) {
    if(['.git','node_modules','.test-output'].includes(entry.name)) continue;
    const name=path.join(prefix,entry.name);
    if(entry.isDirectory()) list.push(...await files(dir,name));else list.push(name);
  }
  return list;
}
if(baseline) await check('other eight pages and all existing business code unchanged byte-for-byte',async()=>{
  const allowed=new Set(['mumbai-car-rental.html','scripts/build.mjs','src/pages.json']);
  for(const name of await files(baseline)) {
    if(!allowed.has(name.replaceAll('\\','/'))) assert.deepEqual(await readFile(path.join(root,name)),await readFile(path.join(baseline,name)),name);
  }
  const oldPages=JSON.parse(await readFile(path.join(baseline,'src/pages.json'),'utf8'));
  const newPages=JSON.parse(await readFile(path.join(root,'src/pages.json'),'utf8'));
  assert.deepEqual(newPages.filter(p=>p.slug!=='mumbai-car-rental'),oldPages.filter(p=>p.slug!=='mumbai-car-rental'));
});
const server=await startServer(root,4175);
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
const errors=[];
const consoleErrors=[];
const failedRequests=[];
const cache=new Map();
await context.route('**/*',async route=>{
  const req=route.request();const url=req.url();
  if(/googletagmanager|google-analytics/.test(url)) return route.fulfill({status:200,body:''});
  if(req.method()!=='GET') return route.abort(); // No real bookings, messages or uploads.
  if(!url.startsWith('http://127.0.0.1:')) {
    if(!cache.has(url)) cache.set(url,(async()=>{const res=await route.fetch();return {status:res.status(),headers:res.headers(),body:await res.body()};})());
    return route.fulfill(await cache.get(url));
  }
  return route.continue();
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
page.on('requestfailed',req=>failedRequests.push({url:req.url(),error:req.failure()?.errorText}));
const url='http://127.0.0.1:4175/mumbai-car-rental';
const go=()=>page.goto(url,{waitUntil:'load'});
try {
  await go();
  await check('unique SEO metadata, single H1, heading structure, canonical, robots and Open Graph',async()=>{
    const config=JSON.parse(await readFile(path.join(root,'src/pages.json'),'utf8'));
    const mumbai=config.find(p=>p.slug==='mumbai-car-rental');
    assert.equal(new Set(config.map(p=>p.description)).size,9);
    assert.equal(new Set(config.map(p=>p.title)).size,9);
    assert.equal(await page.title(),mumbai.title);
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('h1').innerText(),'Mumbai Car Rental – With Driver & Self Drive');
    assert.equal(await page.locator('meta[name="description"]').getAttribute('content'),mumbai.description);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://carswithdriverindia.com/mumbai-car-rental');
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'index, follow');
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),mumbai.title);
    assert.equal(await page.locator('meta[property="og:description"]').getAttribute('content'),mumbai.description);
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'),'https://carswithdriverindia.com/mumbai-car-rental');
    const levels=await page.locator('main h1,main h2,main h3,main h4').evaluateAll(els=>els.map(e=>Number(e.tagName[1])));
    levels.forEach((level,i)=>{if(i)assert.ok(level<=levels[i-1]+1,'heading levels do not skip');});
    assert.equal(await page.locator('main h2').count(),10);
    assert.equal(await page.locator('main form').count(),0);
  });
  await check('JSON-LD syntax, supported types and factual fields without invented ratings or prices',async()=>{
    const data=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    assert.equal(data['@context'],'https://schema.org');
    assert.deepEqual(data['@graph'].map(item=>item['@type']),['AutoRental','Service','BreadcrumbList']);
    assert.equal(data['@graph'][0].telephone,'+919702988465');
    assert.equal(data['@graph'][0].address.postalCode,'400079');
    const body=await page.locator('main').innerText();
    assert.ok(body.includes(data['@graph'][0].address.streetAddress));
    assert.ok(!/aggregateRating|priceRange|review|offers/.test(JSON.stringify(data)));
    assert.deepEqual(data['@graph'][2].itemListElement.map(i=>i.position),[1,2]);
  });
  await check('every unique internal route and on-page link works',async()=>{
    const hrefs=await page.locator('a[href]').evaluateAll(els=>[...new Set(els.map(e=>e.getAttribute('href')).filter(h=>h.startsWith('/')||h.startsWith('#')))]);
    for(const expected of ['/','/with-driver','/self-drive','/airport-transfer','/outstation','/cars','/faq','/contact']) assert.ok(hrefs.includes(expected));
    for(const href of hrefs) {
      await go();
      if(href.startsWith('#')) {
        assert.equal(await page.locator(href).count(),1);
        await page.locator(`main a[href="${href}"]`).click();
        assert.equal(new URL(page.url()).hash,href);
      } else {
        const link=page.locator(`a[href="${href}"]`).filter({visible:true}).first();
        await link.click();await page.waitForLoadState('load');
        assert.equal(new URL(page.url()).pathname,href);
        assert.equal((await page.request.get(page.url())).status(),200);
      }
    }
    await go();
    await page.locator('main a[href="/self-drive"]').first().click();await page.waitForLoadState('load');
    assert.equal(await page.evaluate(()=>currentMainMode),'selfdrive');
    await page.goBack();await page.waitForLoadState('load');
    await page.locator('main a[href="/airport-transfer"]').first().click();await page.waitForLoadState('load');
    assert.equal(await page.evaluate(()=>currentWDSubTab),'airport');
  });
  await check('native FAQ controls, all five reused benefit modals and partner navigation',async()=>{
    await go();
    const details=page.locator('main details');assert.equal(await details.count(),7);
    for(let i=0;i<7;i++) {
      await details.nth(i).locator('summary').click();
      const isOpen=await details.nth(i).evaluate(e=>e.open);
      assert.equal(isOpen,i!==0);
    }
    for(const type of ['driver','pricing','doorstep','fleet','support']) {
      await page.locator(`main button[onclick="openWhyChooseModal('${type}')"]`).click();
      assert.equal(await page.locator('#why-choose-modal').isVisible(),true);
      assert.ok((await page.locator('#why-modal-details li').count())>0);
      await page.keyboard.press('Escape');
    }
    await page.locator('#nav-menu-button').click();
    await page.locator('#nav-drawer button').filter({hasText:'Become a Partner'}).click();
    assert.equal(await page.locator('#partner-modal').isVisible(),true);
    assert.equal(await page.locator('#part-rc-picker').count(),1);
    await page.evaluate(()=>closePartnerModal());
    await page.waitForFunction(()=>document.getElementById('nav-drawer-overlay').classList.contains('hidden'));
  });
  await check('mobile and desktop layouts, image loading and descriptive alt text',async()=>{
    await go();
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}px`);
      for(const img of await page.locator('main img').all()) {
        assert.ok((await img.getAttribute('alt')).length>20);
        await img.scrollIntoViewIfNeeded();
        await img.evaluate(el=>el.decode());
        assert.equal(await img.getAttribute('loading'),'lazy');
        assert.ok(Number(await img.getAttribute('width'))>0);
      }
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(output,`mumbai-${width}.png`),fullPage:true});
      if(width===1440||width===390) await page.screenshot({path:path.join(output,`mumbai-${width}-hero.png`)});
    }
  });
  await check('important content and fleet remain in HTML with JavaScript disabled',async()=>{
    const nojs=await browser.newContext({javaScriptEnabled:false,ignoreHTTPSErrors:true});
    const p=await nojs.newPage();await p.goto(url,{waitUntil:'domcontentloaded'});
    assert.equal(await p.locator('main h2').count(),10);
    assert.equal(await p.locator('main details').count(),7);
    assert.equal(await p.locator('main img').count(),3);
    assert.ok((await p.locator('main').textContent()).includes('Powai'));
    await p.locator('main details').nth(1).locator('summary').click();
    assert.equal(await p.locator('main details').nth(1).evaluate(e=>e.open),true);
    await nojs.close();
  });
  assert.deepEqual(errors,[],'JavaScript errors');
  assert.deepEqual(consoleErrors,[],'console errors');
  assert.deepEqual(failedRequests,[],'failed asset requests');
  await writeFile(path.join(output,'results.json'),JSON.stringify({completed,errors,consoleErrors,failedRequests,baselineCompared:!!baseline},null,2));
  console.log('All Mumbai landing-page checks passed. No external submissions made.');
} finally {await browser.close();server.close();}
