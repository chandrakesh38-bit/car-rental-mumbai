import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();const html=await readFile('cwd-admin-5377.html','utf8');
 await page.setContent(html.match(/<section id="section-partners"[\s\S]*?<\/section>/)[0].replace('hidden space-y-4','space-y-4'));
 await page.evaluate(()=>{window.fixture={id:'fixture',name:'<img src=x onerror="window.xss=true">',phone:'9999999999',review_status:'pending',review_version:0};window.adminApi=async(path,options)=>{if(options){window.saved=JSON.parse(options.body);Object.assign(window.fixture,{review_status:window.saved.status,review_version:1});return {success:true};}return path.includes('?id=')?{application:window.fixture,documents:[]}:{applications:[window.fixture],hasMore:false};};});
 await page.addScriptTag({content:await readFile('assets/js/admin-partner-applications.js','utf8')});
 await page.evaluate(()=>loadPartnerApplications());await page.getByRole('button',{name:'Review',exact:true}).click();await page.locator('#partner-notes').waitFor();
 assert.equal(await page.locator('#partner-detail img').count(),0);
 await page.getByRole('button',{name:'Reject',exact:true}).click();assert.match(await page.locator('#partner-message').textContent(),/reason/);
 await page.locator('#partner-notes').fill('Documents checked');await page.getByRole('button',{name:'Approve',exact:true}).click();await page.waitForFunction(()=>window.saved?.status==='approved');
 assert.equal(await page.evaluate(()=>window.saved.notes),'Documents checked');assert.equal(await page.evaluate(()=>window.xss),undefined);
 console.log('PASS partner admin detail, safe text rendering, rejection validation and approval payload.');
}finally{await browser.close();}
