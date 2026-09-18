import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await startServer(root,4187);
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
const context=await browser.newContext({ignoreHTTPSErrors:true});
let rows=[{id:'test-car',brand:'Test Brand',model:'Car',full_name:'Test Brand Car',segment:'Hatchback',service_type:'Self-Drive',transmission:'Manual',fuel_type:'Petrol',seating_capacity:5,rate_per_hour:100,refundable_deposit:3000,image_url:'https://example.com/car.png',display_order:1,is_active:true}];
let failRead=false, failWrite=false, emptyWrite=false; const writes=[],errors=[],dialogs=[];
const cache=new Map();
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(url.hostname.endsWith('supabase.co')) {
  if(url.pathname.startsWith('/auth/v1/')) return json({access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user:{id:'test-admin',email:'test@example.com'}});
  if(url.pathname.includes('/storage/v1/object/vehicle-images/')) { writes.push({method:req.method(),path:url.pathname});return json({Key:'test-image'}); }
  if(!url.pathname.endsWith('/vehicles')) return json([]);
  if(req.method()==='GET') {
   if(failRead)return json({message:'Test read failure'},503);
   let result=rows;
   if(url.searchParams.has('is_active'))result=result.filter(r=>r.is_active);
   if(url.searchParams.has('service_type'))result=result.filter(r=>['Self-Drive','Both'].includes(r.service_type));
   return json(result);
  }
  const body=req.postDataJSON(); writes.push({method:req.method(),body});
  if(failWrite)return json({message:'Test permission denied'},403);
  if(emptyWrite)return json([]);
  if(req.method()==='POST'){const car={...body[0],id:'added-car'};rows.push(car);return json([car],201);}
  const id=url.searchParams.get('id')?.replace('eq.',''); const car=rows.find(r=>r.id===id);
  if(req.method()==='PATCH')Object.assign(car,body);
  if(req.method()==='DELETE')rows=rows.filter(r=>r.id!==id);
  return json(car?[car]:[]);
 }
 if(url.hostname==='127.0.0.1')return route.continue();
 if(req.method()!=='GET')throw new Error('Unexpected external write: '+url);
 if(/google-analytics|googletagmanager/.test(url.hostname))return route.fulfill({body:''});
 if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#ddd"/></svg>'});
 if(!cache.has(url.href))cache.set(url.href,(async()=>{const r=await route.fetch();return {status:r.status(),headers:r.headers(),body:await r.body()};})());
 return route.fulfill(await cache.get(url.href));
});
const site=await context.newPage(),admin=await context.newPage();
for(const page of [site,admin]){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});}
const go=async(slug='self-drive')=>{await site.goto('http://127.0.0.1:4187/'+slug);await site.waitForFunction(()=>!document.getElementById('booking-widget') && !document.getElementById('mumbai-selfdrive-fleet') || fleetRequest===null);};
const save=async()=>{await admin.locator('#vehicle-modal button[type=submit]').click();await admin.waitForFunction(()=>document.querySelector('#vehicle-modal button[type=submit]').disabled===false);};
try {
 await go();assert.equal(await site.locator('[data-book-self-drive]').count(),1);
 await admin.goto('http://127.0.0.1:4187/cwd-admin-5377');
 await admin.locator('#login-email').fill('test@example.com');await admin.locator('#login-password').fill('test-password');await admin.locator('#btn-login-submit').click();await admin.locator('#admin-vehicles-table-body button').first().waitFor();
 await admin.locator('#admin-vehicles-table-body button').filter({hasText:'Edit'}).first().click();
 await admin.locator('#v-full-name').fill('Updated "Car" <safe>');await admin.locator('#v-rate-hour').fill('150');await admin.locator('#v-deposit').fill('4000');await admin.locator('#v-brand').fill('New Brand');await admin.locator('#v-model').fill('New Model');await admin.locator('#v-seats').fill('7');await admin.locator('#v-transmission').selectOption('Automatic');await admin.locator('#v-fuel').selectOption('Diesel');await admin.locator('#v-segment').selectOption('SUV');await admin.locator('#v-img-url').fill('https://example.com/updated.png');await save();
 await go();assert.match(await site.locator('#selfdrive-cars-grid').innerText(),/Updated "Car" <safe>/);assert.equal(await site.locator('#selfdrive-cars-grid safe').count(),0);
 assert.deepEqual(await site.evaluate(()=>[excelCarsData[0].rateVal,excelCarsData[0].depositVal,excelCarsData[0].seats,excelCarsData[0].transmission,excelCarsData[0].fuel,excelCarsData[0].model]),[150,4000,7,'Automatic','Diesel','New Model']);
 assert.equal(await site.locator('#selfdrive-cars-grid img').getAttribute('src'),'https://example.com/updated.png');
 await site.locator('#sd-filter-brand').selectOption('New Brand',{force:true});assert.equal(await site.locator('[data-book-self-drive]').count(),1);
 const fare=await site.evaluate(()=>{selectedCarObj=excelCarsData[0];currentDeliveryMode='self';updateSDFareReview();return document.getElementById('disp-total-final-fare').innerText;});assert.match(fare,/7,600/);
 await go('mumbai-car-rental');assert.match(await site.locator('#mumbai-selfdrive-fleet').innerText(),/Updated "Car" <safe>/);
 await admin.locator('#admin-vehicles-table-body button').filter({hasText:/^Active$/}).click();await admin.locator('#admin-vehicles-table-body button').filter({hasText:'Inactive'}).waitFor();await go();assert.equal(await site.locator('[data-book-self-drive]').count(),0);
 await admin.locator('#admin-vehicles-table-body button').filter({hasText:'Inactive'}).click();await admin.locator('#admin-vehicles-table-body button').filter({hasText:/^Active$/}).waitFor();await go();assert.equal(await site.locator('[data-book-self-drive]').count(),1);
 await admin.evaluate(()=>openVehicleModal());await admin.locator('#v-brand').fill('Added');await admin.locator('#v-model').fill('Vehicle');await save();await go();assert.equal(await site.locator('[data-book-self-drive]').count(),2);
 const added=admin.locator('#admin-vehicles-table-body tr').filter({hasText:'Added Vehicle'});await added.getByText('Delete',{exact:true}).click();await added.waitFor({state:'detached'});await go();assert.equal(await site.locator('[data-book-self-drive]').count(),1);
 failWrite=true;await admin.locator('#admin-vehicles-table-body button').filter({hasText:'Edit'}).click();await save();assert.ok(dialogs.some(x=>x.includes('Test permission denied')));failWrite=false;
 emptyWrite=true;await save();assert.ok(dialogs.some(x=>x.includes('No vehicle was saved')));emptyWrite=false;
 await admin.locator('#v-rate-hour').fill('-1');await save();assert.ok(dialogs.some(x=>x.includes('non-negative')));
 await admin.locator('#v-rate-hour').fill('150');
 await admin.locator('#v-img-file').setInputFiles({name:'car.png',mimeType:'image/png',buffer:Buffer.from('test-image')});
 await admin.waitForFunction(()=>document.getElementById('upload-status').textContent.includes('Image uploaded'));
 await save();await go();assert.match(await site.locator('#selfdrive-cars-grid img').getAttribute('src'),/storage\/v1\/object\/public\/vehicle-images\/cars\//);
 failRead=true;await go();assert.match(await site.locator('#selfdrive-cars-grid').innerText(),/Unable to load/);failRead=false;await site.locator('#selfdrive-cars-grid button').click({force:true});await site.locator('[data-book-self-drive]').waitFor({state:'attached'});
 rows.push({...rows[0],id:'driver-only',service_type:'With Driver',full_name:'Driver only'});await go();assert.equal(await site.locator('[data-book-self-drive]').count(),1);
 for(const slug of ['', 'with-driver','self-drive','airport-transfer','outstation','cars','mumbai-car-rental','faq','contact']) {
  await go(slug);assert.equal(await site.locator('h1').count(),1);
  await site.setViewportSize({width:390,height:844});assert.ok(await site.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await site.setViewportSize({width:1440,height:1000});
 }
 assert.deepEqual(errors,[]);assert.ok(writes.some(w=>w.method==='POST'));assert.ok(writes.some(w=>w.method==='PATCH'));assert.ok(writes.some(w=>w.method==='DELETE'));
 console.log('PASS fleet admin create/edit/deactivate/reactivate/delete, field mapping, image URL, filters, unchanged fare formula, Mumbai cards, empty/error/retry, write failures, safe rendering, all nine routes and mobile overflow. Supabase writes/auth mocked; no live mutations.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
