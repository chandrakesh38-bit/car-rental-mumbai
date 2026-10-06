// Isolated mobile UI checks: all requests intercepted, including the mocked SDK.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {chromium,devices}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=await readFile(new URL('../assets/js/clarity.js',import.meta.url),'utf8');
const outstation=await readFile(new URL('../outstation.html',import.meta.url),'utf8');
const output=new URL('../.test-output/clarity-consent-bar/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu','--renderer-process-limit=1']});
const results=[];
try {
  for(const [width,height] of [[393,851],[320,568],[320,360],[851,393]]) {
    const context=await browser.newContext({...devices['Pixel 5'],viewport:{width,height}});
    await context.addInitScript(()=>{
      Object.defineProperty(navigator,'doNotTrack',{get:()=>null});
      Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>false});
    });
    let sdk=0;
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='www.clarity.ms') {sdk++;return route.fulfill({contentType:'text/javascript',body:'/* mocked SDK, no collection */'});}
      if(url.pathname==='/api/clarity-config')return route.fulfill({json:{enabled:true,environment:'testing',projectId:'fixture123'}});
      if(url.pathname==='/clarity.js')return route.fulfill({contentType:'text/javascript',body:source});
      return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:16px system-ui;background:#f8fafc"><main style="padding:16px"><h1>Outstation booking - isolated test</h1><label>Pickup <input id="pickup" style="display:block;font:inherit;max-width:90%"></label><div style="height:850px"></div><button id="book" style="min-height:44px">Continue booking</button></main><footer style="padding:16px">Footer</footer><script src="/clarity.js"></script>'});
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://car-rental-mumbai-git-testing-car-with-driver-operation-team.vercel.app/outstation');
    const bar=page.locator('#cwd-clarity-choice');await bar.waitFor();
    assert.equal(sdk,0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await bar.evaluate(e=>getComputedStyle(e).position),height<500?'static':'fixed');
    if(height>=500)await page.screenshot({path:fileURLToPath(new URL(`${width}x${height}-initial.png`,output))});
    await page.locator('#book').scrollIntoViewIfNeeded();
    // At the end of the page the reserved space keeps the final CTA above the bar.
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    const book=await page.locator('#book').boundingBox(),rect=await bar.boundingBox();
    assert.ok(book.y+book.height<=rect.y,'last booking CTA must clear consent bar');
    await page.locator('#book').click({trial:true});
    await page.locator('#pickup').focus();
    assert.equal(await bar.evaluate(e=>getComputedStyle(e).position),'static');
    await page.locator('#pickup').fill('Synthetic pickup');
    assert.equal(sdk,0,'typing does not grant consent');
    await page.setViewportSize({width,height:280});
    assert.equal(await bar.evaluate(e=>getComputedStyle(e).position),'static');
    await page.locator('#pickup').evaluate(e=>e.blur());
    await page.setViewportSize({width,height});
    await page.waitForFunction(short=>getComputedStyle(document.querySelector('#cwd-clarity-choice')).position===(short?'static':'fixed'),height<500);
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.screenshot({path:fileURLToPath(new URL(`${width}x${height}.png`,output))});
    const allow=bar.getByRole('button',{name:'Allow & Continue',exact:true});
    const decline=bar.getByRole('button',{name:'No thanks',exact:true});
    const a=await allow.boundingBox(),d=await decline.boundingBox();
    assert.ok(Math.abs(a.width-d.width)<1&&a.height>=44&&d.height>=44);
    // Actual checked-in booking markup, with only its layout utility equivalents
    // supplied offline. No application handlers, providers or Tailwind CDN run.
    await page.evaluate(html=>{
      const doc=new DOMParser().parseFromString(html,'text/html');
      const modal=doc.getElementById('booking-modal');
      if(!modal.classList.contains('z-50')||!modal.classList.contains('fixed'))throw Error('Booking modal stacking contract changed');
      for(const el of [modal,...modal.querySelectorAll('*')])for(const attr of [...el.attributes])if(attr.name.startsWith('on'))el.removeAttribute(attr.name);
      modal.style.cssText='position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;background:#0f172ab3;box-sizing:border-box';
      modal.firstElementChild.style.cssText='box-sizing:border-box;background:white;width:100%;max-width:512px;max-height:92vh;overflow-y:auto;padding:24px';
      for(const el of modal.querySelectorAll('input,textarea,form button[type=submit]'))el.style.cssText='box-sizing:border-box;display:block;width:100%;min-height:44px;font:16px system-ui;margin:8px 0';
      document.body.append(modal);
    },outstation);
    const modal=page.locator('#booking-modal');
    await page.evaluate(()=>document.activeElement?.blur());
    assert.equal(await page.evaluate(()=>{
      const b=document.getElementById('cwd-clarity-choice').getBoundingClientRect();
      return document.getElementById('booking-modal').contains(document.elementFromPoint(innerWidth/2,Math.min(innerHeight-2,b.bottom-2)));
    }),true,'z50 booking modal must receive touches above the consent bar');
    for(const [id,value] of [['cust-name','Synthetic Guest'],['cust-phone','9999999999'],['cust-email','fixture@example.invalid'],['cust-address','Synthetic test address']]){
      await page.locator('#'+id).fill(value);
      assert.equal(await bar.evaluate(e=>getComputedStyle(e).position),'static');
    }
    await modal.locator('button[type=submit]').click({trial:true});
    assert.equal(sdk,0,'booking fields must not imply analytics consent');
    await page.screenshot({path:fileURLToPath(new URL(`${width}x${height}-booking-modal.png`,output))});
    await modal.evaluate(e=>e.remove());
    await page.evaluate(()=>document.dispatchEvent(new FocusEvent('focusout')));
    await decline.focus();await page.keyboard.press('Enter');
    assert.equal(await bar.count(),0);assert.equal(sdk,0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('cwd_clarity_consent_v1')),'denied');
    await page.getByRole('button',{name:'Analytics preferences',exact:true}).click();
    await allow.focus();await page.keyboard.press('Tab');
    assert.equal(await decline.evaluate(e=>e===document.activeElement),true);
    await allow.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-session-analytics-status')==='sdk-loaded');
    assert.equal(sdk,1);assert.equal(await bar.count(),0);
    assert.equal(await page.locator('html').getAttribute('data-clarity-mask'),null);
    await page.getByRole('button',{name:'Analytics preferences',exact:true}).click();
    await Promise.all([page.waitForNavigation(),decline.click()]);
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-session-analytics-status')==='declined');
    assert.equal(sdk,1,'withdrawal reload must not request another SDK');
    assert.equal(await bar.count(),0);assert.deepEqual(errors,[]);
    assert.equal(await page.locator('#cwd-session-analytics-status').count(),0);\n    results.push({width,height,passed:true,actualBookingMarkup:true,modalAboveBar:true});console.log(`PASS ${width}x${height}: compact consent, no diagnostics, booking modal touch safety, decline, accept, withdrawal`);
    await context.close();
  }
  await writeFile(new URL('results.json',output),JSON.stringify({liveRequestsMade:0,results},null,2));
} finally {await browser.close();}
