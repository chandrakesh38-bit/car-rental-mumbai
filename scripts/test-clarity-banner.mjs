// Offline diagnostics only: every browser request is intercepted; no real SDK,
// live site, SMS, booking or provider request is made.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import handler from '../api/clarity-config.js';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const analytics = await readFile(new URL('../assets/js/analytics.js', import.meta.url), 'utf8');
const clarity = await readFile(new URL('../assets/js/clarity.js', import.meta.url), 'utf8');
const hosts = ['car-rental-mumbai-ez0yik8mm-car-with-driver-operation-team.vercel.app',
  'car-rental-mumbai-git-testing-car-with-driver-operation-team.vercel.app'];
const output = new URL('../.test-output/clarity-banner/', import.meta.url);
await mkdir(output, { recursive: true });
const records = [];

async function config(env,branch,id) {
  for(const [key,value] of Object.entries({VERCEL_ENV:env,VERCEL_GIT_COMMIT_REF:branch,CLARITY_TESTING_PROJECT_ID:id})) {
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  return JSON.parse(await handler(new Request('https://fixture.invalid/api/clarity-config')).text());
}
const configs = {
  enabled:await config('preview','testing','fixture123'),
  missingBranch:await config('preview',undefined,'fixture123'),
  missingEnvironment:await config(undefined,'testing','fixture123'),
  missingProjectId:await config('preview','testing',''),
  production:await config('production','main','fixture123')
};
assert.equal(configs.enabled.enabled,true);
for(const name of ['missingBranch','missingEnvironment','missingProjectId','production'])assert.equal(configs[name].enabled,false,name);

const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome',args:['--disable-gpu','--renderer-process-limit=1']});
try {
  async function scenario(host,name,{response=configs.enabled,abort=false,htmlResponse=false,dnt=false,gpc=false,stored=null,path='/outstation',referrer='',late=false,loaderError=false,stallLoader=false,stallConfig=false,unknownStatus=false}={}) {
    const context = await browser.newContext({...devices['Pixel 5'],viewport:{width:393,height:851}});
    const requests=[],errors=[];
    await context.addInitScript(({dnt,gpc,stored,referrer})=>{
      // Synthetic new test profile only; no user's browser preferences are changed.
      Object.defineProperty(navigator,'doNotTrack',{get:()=>dnt?'1':null});
      Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>gpc});
      Object.defineProperty(document,'referrer',{get:()=>referrer});
      if(stored!==null)localStorage.setItem('cwd_clarity_testing_consent_v1',stored);
    },{dnt,gpc,stored,referrer});
    await context.route('**/*',async route=>{
      const url = new URL(route.request().url());
      requests.push(url.pathname);
      if(url.hostname!==host)throw Error('Unexpected external request: '+url.hostname);
      if(url.pathname==='/assets/js/analytics.js')return route.fulfill({contentType:'text/javascript',body:analytics});
      if(url.pathname==='/assets/js/clarity.js'){
        if(loaderError)return route.abort('blockedbyclient');
        if(stallLoader)return; // Keep the synthetic request paused until context closes.
        if(late)await new Promise(resolve=>setTimeout(resolve,100));
        return route.fulfill({contentType:'text/javascript',body:clarity});
      }
      if(url.pathname==='/api/clarity-config'){
        // Top-level navigation can work even when this page's fetch is blocked.
        if(route.request().isNavigationRequest())return route.fulfill({json:configs.enabled});
        if(stallConfig)return;
        if(abort)return route.abort('blockedbyclient');
        if(htmlResponse)return route.fulfill({contentType:'text/html',body:'<p>Authentication required</p>'});
        return route.fulfill({json:response});
      }
      return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/assets/js/analytics.js"></script></head><body style="margin:0;font-family:system-ui"><main style="padding:16px;min-height:1200px"><h1>Local synthetic outstation page</h1><p>No booking controls or customer information.</p></main><footer><nav aria-label="Footer navigation"></nav></footer></body></html>'});
    });
    const page = await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://'+host+path,{waitUntil:'domcontentloaded'});
    const production=host==='carswithdriverindia.com';
    if(production){
      assert.equal(await page.locator('#cwd-session-analytics-status').count(),0);
      assert.equal(requests.some(p=>p.includes('clarity')),false);
      records.push({host,name,diagnosticAbsent:true});
      await context.close();return;
    }
    await page.locator('#cwd-session-analytics-status').waitFor();
    if(!stallLoader&&!stallConfig)
    await page.waitForFunction(()=>{
      const s=document.documentElement.getAttribute('data-session-analytics-status');
      return s&&s!=='loading';
    });
    if(stallLoader||stallConfig){await page.clock.install();await page.clock.fastForward(11000);}
    if(unknownStatus)await page.evaluate(()=>document.documentElement.setAttribute('data-session-analytics-status','private-person@example.invalid'));
    const result = await page.evaluate(()=>{
      const banner=document.querySelector('#cwd-clarity-choice');
      const buttons=banner?Array.from(banner.querySelectorAll('button')).map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}):[];
      return {status:document.documentElement.getAttribute('data-session-analytics-status'),banner:!!banner,buttons,preference:localStorage.getItem('cwd_clarity_testing_consent_v1'),overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,height:innerHeight,sdk:!!document.querySelector('#cwd-clarity-sdk')};
    });
    assert.deepEqual(errors,[]);
    assert.equal(result.sdk,false);
    const record={host,name,...result,configRequests:requests.filter(p=>p==='/api/clarity-config').length};
    if(name==='fresh'||name==='after-dom-ready'){
      assert.equal(result.status,'awaiting-consent');assert.equal(result.banner,true);assert.equal(result.preference,null);assert.equal(result.overflow,false);assert.equal(record.configRequests,1);
      for(const b of result.buttons){assert.ok(b.x>=0&&b.right<=393&&b.y>=0&&b.bottom<=851);}
      await page.getByRole('button',{name:'Allow analytics',exact:true}).click({trial:true});
      await page.getByRole('button',{name:'No thanks',exact:true}).click({trial:true});
      if(name==='fresh')await page.screenshot({path:fileURLToPath(new URL(host.includes('git-testing')?'stable-mobile.png':'immutable-mobile.png',output))});
    } else assert.equal(result.banner,false,name);
    const before=await page.evaluate(()=>({storage:localStorage.getItem('cwd_clarity_testing_consent_v1'),calls:window.dataLayer.length,sdk:!!document.getElementById('cwd-clarity-sdk')}));
    const beforeRequests=requests.length;
    // Keyboard activation also verifies native-button accessibility when the real
    // consent overlay is present. Missing-banner cases use an actual mobile tap.
    if(result.banner)await page.locator('#cwd-session-analytics-status').press('Enter');
    else await page.getByRole('button',{name:'Session analytics status',exact:true}).click();
    const panel=page.locator('#cwd-session-analytics-details');
    await panel.waitFor({state:'visible'});
    const diagnostic=await panel.innerText();
    if(unknownStatus){assert.match(diagnostic,/Status: unknown/);assert.doesNotMatch(diagnostic,/private-person/);}
    else assert.ok(diagnostic.includes('Status: '+result.status+'.'));
    assert.match(diagnostic,/SDK element: absent/);
    assert.doesNotMatch(diagnostic,/fixture123|ysx30apjfr|https?:\/\/|google|example\.invalid|mobile_test|granted|denied/);
    if(stallConfig||stallLoader)assert.match(diagnostic,/after 10 seconds; the cause is unknown/);
    if(stallLoader)assert.match(diagnostic,/local loader has not finished/);
    if(stallConfig)assert.match(diagnostic,/local loader finished/);
    if(result.banner)await panel.getByRole('button',{name:'Refresh status',exact:true}).press('Enter');
    else await panel.getByRole('button',{name:'Refresh status',exact:true}).click();
    const after=await page.evaluate(()=>({storage:localStorage.getItem('cwd_clarity_testing_consent_v1'),calls:window.dataLayer.length,sdk:!!document.getElementById('cwd-clarity-sdk')}));
    assert.deepEqual(after,before,'diagnostic must not change storage, emit telemetry, or initialize SDK');
    assert.equal(requests.length,beforeRequests,'diagnostic must not make requests');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(name==='config-blocked'){
      const topLevel=await context.newPage();
      await topLevel.goto('https://'+host+'/api/clarity-config');
      assert.equal(JSON.parse(await topLevel.locator('body').innerText()).enabled,true);
      await topLevel.close();
      await page.screenshot({path:fileURLToPath(new URL(host.includes('git-testing')?'stable-diagnostic.png':'immutable-diagnostic.png',output))});
    }
    record.diagnostic=diagnostic;
    records.push(record);console.log('PASS '+name+' '+host+': '+result.status+'; config requests='+record.configRequests);
    await context.close();
    return record;
  }
  for(const host of hosts){
    await scenario(host,'fresh');
    await scenario(host,'after-dom-ready',{late:true});
    for(const key of ['missingBranch','missingEnvironment','missingProjectId','production'])assert.equal((await scenario(host,key,{response:configs[key]})).status,'not-configured');
    assert.equal((await scenario(host,'config-blocked',{abort:true})).status,'config-unavailable');
    assert.equal((await scenario(host,'config-login-html',{htmlResponse:true})).status,'config-unavailable');
    assert.equal((await scenario(host,'dnt',{dnt:true})).configRequests,0);
    assert.equal((await scenario(host,'gpc',{gpc:true})).configRequests,0);
    assert.equal((await scenario(host,'declined',{stored:'denied'})).status,'declined');
    assert.equal((await scenario(host,'unknown-query',{path:'/outstation?utm_campaign=mobile_test'})).status,'url-excluded');
    assert.equal((await scenario(host,'detailed-referrer',{referrer:'https://example.invalid/some-page'})).status,'url-excluded');
    assert.equal((await scenario(host,'loader-error',{loaderError:true})).status,'loader-blocked');
    assert.equal((await scenario(host,'loader-pending',{stallLoader:true})).status,'loading');
    assert.equal((await scenario(host,'config-pending',{stallConfig:true})).status,'loading');
    await scenario(host,'unknown-status',{response:configs.production,unknownStatus:true});
    await scenario(host,'saved-choice-config-off',{response:configs.production,stored:'granted'});
  }
  await scenario('carswithdriverindia.com','production-host');
  await writeFile(new URL('results.json',output),JSON.stringify({liveRequestsMade:0,configFixtures:configs,records},null,2));
} finally {await browser.close();}
