// Local isolated runner: real API handlers; external providers/database transport emulated.
import http from 'node:http';import path from 'node:path';import {readFile,readdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import bookingConfig from '../../api/booking-config.js';
import {POST as checkout} from '../../api/customer-checkout.js';import account from '../../api/customer-account.js';import bookings from '../../api/customer-bookings.js';import otp from '../../api/mobile-otp.js';import maps from '../../api/maps-route.js';import notifications from '../../api/booking-notifications.js';import {POST as webhook} from '../../api/razorpay-webhook.js';
import {installFixtures,state,config,simulateCapture} from './checkout-fixtures.mjs';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));if(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim()!=='testing')throw Error('testing branch required');installFixtures();
// Public catalogue read on 2026-10-19; all transactional providers stay emulated.
state.tables.with_driver_rates=JSON.parse(await readFile(new URL('./public-fleet-snapshot.json',import.meta.url),'utf8'));
if(process.env.CWD_LOCAL_POSTGRES==='true'){
 const {createLocalDatabase}=await import('./postgres/local-database.mjs');
 const db=await createLocalDatabase('cwd_coupon_preview_'+Date.now());state.databaseFetch=db.fetchDatabase;
 console.log('Local PostgreSQL database: '+db.name);
}
const port=Number(process.env.CWD_PREVIEW_PORT||4312);
const databaseLabel=process.env.CWD_LOCAL_POSTGRES==='true'?'local PostgreSQL':'fixture database';
const sdk=`let mobile='',requestId='';window.initSendOTP=()=>{};window.getWidgetData=()=>({otpLength:6,retryTime:30});window.isCaptchaVerified=()=>true;window.sendOtp=(phone,ok)=>{mobile=String(phone).replace(/[^0-9]/g,'');requestId=crypto.randomUUID();ok({reqId:requestId});};window.retryOtp=(_c,ok)=>{requestId=crypto.randomUUID();ok({reqId:requestId});};window.verifyOtp=(code,ok,fail)=>{if(code!=='012345')return fail({message:'TEST OTP is 012345'});const enc=s=>btoa(JSON.stringify(s)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');ok({'access-token':enc({alg:'HS256'})+'.'+enc({requestId,mobile,exp:Math.floor(Date.now()/1000)+600})+'.fixture-signature'});};
window.supabase={createClient:()=>({from:table=>{const q=new Proxy({},{get:(_,key)=>key==='then'?(resolve,reject)=>fetch('/__test/catalogue?table='+encodeURIComponent(table)).then(r=>r.json()).then(data=>({data,error:null})).then(resolve,reject):()=>q});return q;},auth:{getSession:async()=>({data:{session:null}})}})};
window.Razorpay=class{constructor(options){this.o=options;this.events={};}on(name,fn){this.events[name]=fn;}close(){this.dialog?.remove();}open(){this.dialog=document.createElement('dialog');this.dialog.setAttribute('aria-label','TEST payment provider');this.dialog.innerHTML='<h2>TEST Razorpay provider</h2><p>No money is collected. Amount: INR '+(this.o.amount/100)+'</p><button data-success>Simulate captured payment</button><button data-fail>Simulate failed payment</button><button data-abandon>Abandon payment</button>';document.body.append(this.dialog);this.dialog.showModal();this.dialog.querySelector('[data-success]').onclick=async()=>{const result=await(await fetch('/__test/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order:this.o.order_id})})).json();this.close();this.o.handler(result);};this.dialog.querySelector('[data-fail]').onclick=()=>this.events['payment.failed']?.({});this.dialog.querySelector('[data-abandon]').onclick=()=>{this.close();this.o.modal.ondismiss();};}};
document.addEventListener('DOMContentLoaded',()=>{const banner=document.createElement('div');banner.style='background:#fff1be;padding:8px;color:#153e68;font:12px Arial';banner.textContent='LOCAL TEST: ${databaseLabel}; simulated maps, SMS and payments. Demo OTP 012345.';document.body.prepend(banner);});`;
const handlers={'/api/booking-config':bookingConfig,'/api/customer-checkout':checkout,'/api/customer-account':account,'/api/customer-bookings':bookings,'/api/mobile-otp':otp,'/api/maps-route':maps,'/api/razorpay-webhook':webhook,'/api/booking-notifications':notifications};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{
 const origin=`http://127.0.0.1:${port}`,u=new URL(req.url,origin);if(req.headers.host!==`127.0.0.1:${port}`)throw Error('Invalid host');
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; form-action 'self'; frame-src 'none'; object-src 'none'");
 let raw='';if(req.method==='POST'){for await(const c of req){raw+=c;if(raw.length>30000)throw Error('Too large');}}
 const json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
 if(handlers[u.pathname]){const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,String(v));const r=await handlers[u.pathname](new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:raw}:{})}));res.statusCode=r.status;for(const[k,v]of r.headers)res.setHeader(k,v);res.end(await r.text());return;}
 if(u.pathname==='/api/location-config')return json({success:true,config});if(u.pathname==='/api/clarity-config')return json({enabled:false});
 if(u.pathname==='/__test/catalogue')return json(state.tables[u.searchParams.get('table')]||[]);
 if(u.pathname==='/__test/capture')return json(simulateCapture(JSON.parse(raw).order));
 if(u.pathname==='/__test/sdk.js'){res.setHeader('Content-Type','text/javascript');return res.end(sdk);}
 if(u.pathname==='/coupon-review'){
  const names=(await readdir(path.join(root,'.test-output/login-coupon'))).filter(n=>/^(327|390|1366)-(offer|coupon-ready|applied|payment|confirmed|used)\.png$/.test(n)).sort();
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CWD login coupon review</title><style>body{font:15px system-ui;background:#eef3f8;color:#153e68;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}article{background:white;border-radius:16px;padding:14px}img{width:100%;height:520px;object-fit:contain;object-position:top}a{color:inherit}</style><h1>CWD Login Coupon · visual review</h1><p>CWDLOGIN10: 10% off, maximum ₹500, once per verified mobile. Actual local PostgreSQL; simulated SMS/maps/payments.</p><p><a href="/">Interactive preview</a> · <a href="/coupon-review/report">Test report</a></p><main>'+names.map(n=>`<article><a href="/coupon-review/${n}">${n}<img src="/coupon-review/${n}" alt="${n}"></a></article>`).join('')+'</main></html>');
 }
 if(u.pathname==='/coupon-review/report'){res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end(await readFile(path.join(root,'LOGIN_COUPON_REVIEW.txt')));}
 if(/^\/coupon-review\/(327|390|1366)-(offer|coupon-ready|applied|payment|confirmed|used)\.png$/.test(u.pathname)){
  res.setHeader('Content-Type','image/png');return res.end(await readFile(path.join(root,'.test-output/login-coupon',u.pathname.split('/').pop())));
 }
 if(u.pathname==='/premium-review'){
  const files=(await readdir(path.join(root,'.test-output/premium-ux'))).filter(n=>/^(327|390)-(loader|results|popup|otp|signed-in|dzire|ertiga|crysta|journey)\.(png|webm)$/.test(n)).sort();
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CWD premium UI review</title><style>body{font:15px system-ui;background:#edf3f8;color:#123f6c;padding:20px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:20px}article{background:white;padding:14px;border-radius:16px}img,video{width:100%;height:440px;object-fit:contain;object-position:top}a{color:inherit}</style><h1>CWD premium UI review</h1><p>Actual local results and OTP flow. Videos show the animated loader and the delayed offer invitation. Database and payment providers are simulated.</p><p><a href="/">Open interactive website</a></p><main>'+files.map(n=>`<article><a href="/premium-review/${n}">${n}</a>${n.endsWith('.webm')?`<video controls muted playsinline src="/premium-review/${n}"></video>`:`<a href="/premium-review/${n}"><img loading="lazy" src="/premium-review/${n}" alt="${n}"></a>`}</article>`).join('')+'</main></html>');
 }
 if(/^\/premium-review\/(327|390)-(loader|results|popup|otp|signed-in|dzire|ertiga|crysta|journey)\.(png|webm)$/.test(u.pathname)){
  res.setHeader('Content-Type',u.pathname.endsWith('.webm')?'video/webm':'image/png');return res.end(await readFile(path.join(root,'.test-output/premium-ux',u.pathname.split('/').pop())));
 }
 if(u.pathname==='/screenshots'||u.pathname==='/screenshots/'){
  const groups=['327-0','390-20','1366-100'];let cards='';let count=0;
  for(const group of groups){for(const name of (await readdir(path.join(root,'.test-output/real-checkout',group))).sort()){
   if(!/^\d{2}-[a-z-]+\.png$/.test(name))continue;count++;const url='/screenshots/'+group+'/'+name;
   cards+=`<a href="${url}"><img loading="lazy" src="${url}" alt="${group}: ${name}"><span>${group}: ${name}</span></a>`;
  }}
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CWD checkout screenshots</title><style>body{font:16px Arial;margin:24px;color:#153e68;background:#f4f7fa}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}main a{background:white;padding:12px;overflow:hidden}img{width:100%;height:340px;object-fit:contain;object-position:top}span{display:block;overflow-wrap:anywhere}</style><h1>CWD checkout screenshot archive (${count})</h1><p>Saved test evidence. <a href="/">Open the interactive booking website</a> to make a test booking.</p><main>${cards}</main></html>`);
 }
 if(/^\/screenshots\/(327-0|390-20|1366-100)\/\d{2}-[a-z-]+\.png$/.test(u.pathname)){
  res.setHeader('Content-Type','image/png');return res.end(await readFile(path.join(root,'.test-output/real-checkout',u.pathname.slice('/screenshots/'.length))));
 }
 if(u.pathname==='/ui-review'){
  const files=(await readdir(path.join(root,'.test-output/ui-refresh'))).filter(n=>/^(before|after)-\d+-(destinations|loader|vehicles|dzire|ertiga|crysta)\.png$/.test(n)).sort();
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>CWD UI before and after</title><style>body{font:16px Arial;background:#f5f7fb;color:#123f6c;padding:20px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}img{width:100%;height:400px;object-fit:contain;object-position:top}a{overflow-wrap:anywhere}</style><h1>CWD UI before and after</h1><p><a href="/">Open interactive booking website</a></p><main>'+files.map(n=>`<a href="/ui-review/${n}">${n}<img loading="lazy" src="/ui-review/${n}" alt="${n}"></a>`).join('')+'</main></html>');
 }
 if(/^\/ui-review\/(before|after)-\d+-(destinations|loader|vehicles|dzire|ertiga|crysta)\.png$/.test(u.pathname)){res.setHeader('Content-Type','image/png');return res.end(await readFile(path.join(root,'.test-output/ui-refresh',u.pathname.split('/').pop())));}
 let file;if(u.pathname==='/__test/tailwind.css')file=path.join(root,'.test-output/customer-account-mobile-preview/rendered-homepage.css');
 else{let rel=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';if(!path.extname(rel))rel+='.html';file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!(/^(assets\/|logo|Logo|[^/]+\.html$)/.test(rel)))throw Error('Not found');}
 let content=await readFile(file);if(file.endsWith('.html'))content=content.toString().replace(/<script\b[^>]*src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<script\b[^>]*src="\/assets\/js\/analytics.js"[^>]*><\/script>/g,'').replace(/<link\b[^>]*href="https:[^"]*"[^>]*>/g,'').replace('<head>','<head><script src="/__test/sdk.js"></script><link rel="stylesheet" href="/__test/tailwind.css">');
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(content);
 }catch(e){res.statusCode=500;res.end(String(e.message));console.error(e.message);}});
server.listen(port,'127.0.0.1',()=>console.log(`Actual CWD UI/API test runner: http://127.0.0.1:${port}/ (${databaseLabel}; simulated external providers; no remote deployment)`));
