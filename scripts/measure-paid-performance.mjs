import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const servers=[await startServer(root+'/.test-output/baseline-main',4314),await startServer(root,4315)];
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'}),results=[];
try {
  for(const [label,url] of [['production','https://carswithdriverindia.com/outstation'],['before-local','http://127.0.0.1:4314/outstation'],['after-local','http://127.0.0.1:4315/outstation']]) for(let run=1;run<=3;run++) {
    const context=await browser.newContext({viewport:{width:393,height:851},deviceScaleFactor:1,isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
    // Load the actual GTAG script but prevent synthetic QA from entering live reports.
    await context.route(/google-analytics\.com\/.*collect|analytics\.google\.com\/.*collect/,r=>r.fulfill({status:204}));
    const page=await context.newPage(),session=await context.newCDPSession(page),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750,connectionType:'cellular3g'});
    await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.addInitScript(()=>{
      window.lab={lcp:0,cls:0,longTaskBlocking:0,maxInteractionDuration:0};
      new PerformanceObserver(l=>{for(const e of l.getEntries())window.lab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.lab.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
      new PerformanceObserver(l=>{for(const e of l.getEntries())window.lab.longTaskBlocking+=Math.max(0,e.duration-50);}).observe({type:'longtask',buffered:true});
      new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.interactionId)window.lab.maxInteractionDuration=Math.max(window.lab.maxInteractionDuration,e.duration);}).observe({type:'event',durationThreshold:16,buffered:true});
    });
    await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForTimeout(7000);
    const load=await page.evaluate(()=>({...window.lab,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,domNodes:document.querySelectorAll('*').length,resources:performance.getEntriesByType('resource').map(e=>({name:e.name,bytes:e.transferSize,duration:e.duration}))}));
    await page.locator('#wd-out-one-way').click();
    await page.waitForTimeout(600);
    load.maxInteractionDuration=await page.evaluate(()=>window.lab.maxInteractionDuration);
    results.push({label,run,...load,errors}); console.log(JSON.stringify({label,run,lcp:load.lcp,fcp:load.fcp,cls:load.cls,blocking:load.longTaskBlocking,interaction:load.maxInteractionDuration,errors}));
    await context.close();
  }
  await mkdir(root+'/.test-output',{recursive:true});await writeFile(root+'/.test-output/mobile-performance.json',JSON.stringify(results,null,2));
} finally {await browser.close();for(const s of servers)s.close();}
