import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import handler from '../api/clarity-config.js';

const source = await readFile(new URL('../assets/js/clarity.js', import.meta.url), 'utf8');

async function run({
  url='https://car-rental-mumbai-test-car-with-driver-operation-team.vercel.app/outstation',
  referrer='', consent='granted', enabled=true, environment='testing', privacy=false, fail=false
}={}) {
  const scripts=[],attrs={},buttons=[],store=new Map([['cwd_clarity_consent_v1',consent]]);
  const sensitiveNodes=Array.from({length:3},()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;}}));
  let requests=0,reloads=0;
  const root={setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k]??null};
  const document={referrer,readyState:'complete',documentElement:root,
    head:{appendChild:el=>scripts.push(el)},
    body:{appendChild:el=>buttons.push(el)},
    createElement:tag=>({tag,setAttribute(){},style:{},querySelector(){return {};},getBoundingClientRect(){return {height:120};},remove(){}}),
    querySelector:()=>null,
    querySelectorAll:()=>sensitiveNodes};
  const location=new URL(url); location.reload=()=>reloads++;
  const window={};
  vm.runInNewContext(source,{window,document,location,URL,Set,navigator:{globalPrivacyControl:privacy,doNotTrack:null},
    localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
    fetch:async()=>{requests++;if(fail)throw Error('offline');return {ok:true,json:async()=>({enabled,environment,projectId:'fixture123'})};}});
  await new Promise(resolve=>setImmediate(resolve));
  return {window,scripts,attrs,requests,buttons,store,sensitiveNodes,get reloads(){return reloads;},calls:()=>Array.from(window.clarity?.q||[],args=>Array.from(args))};
}

async function config(env,branch,testingId,productionId,host='fixture.invalid') {
  for (const [key,value] of Object.entries({
    VERCEL_ENV:env,VERCEL_GIT_COMMIT_REF:branch,
    CLARITY_TESTING_PROJECT_ID:testingId,CLARITY_PRODUCTION_PROJECT_ID:productionId
  })) {
    if (value===undefined) delete process.env[key]; else process.env[key]=value;
  }
  return handler(new Request('https://'+host+'/api/clarity-config')).then(r=>r.json());
}

assert.deepEqual(await config('preview','testing','fixture123','prod123','fixture.invalid'),
  {enabled:true,projectId:'fixture123',environment:'testing'});
assert.deepEqual(await config('production','main','fixture123','prod123','carswithdriverindia.com'),
  {enabled:true,projectId:'prod123',environment:'production'});
assert.equal((await config('production','main','fixture123','prod123','other.example')).enabled,false);
assert.equal((await config('preview','main','fixture123','prod123','fixture.invalid')).enabled,false);
assert.equal((await config('production','main','fixture123','','carswithdriverindia.com')).enabled,false);
console.log('PASS config isolates testing preview and production domain/project IDs');

const good=await run();
assert.equal(good.scripts.length,1);
assert.equal(good.attrs['data-clarity-mask'],undefined,'Relaxed project mode must not be overridden by a root mask');
assert.ok(good.sensitiveNodes.every(n=>n.attrs['data-clarity-mask']==='true'),'customer-specific rendered text is masked');
for(const name of ['explore_cabs_click','cab_results_shown','book_car_click','booking_form_opened','otp_requested','otp_verified','booking_request_submitted'])
  good.window.cwdClarity.track(name,{trip_type:'outstation',service_type:'with_driver',name:'Private Person',phone:'9999999999',email:'private@example.com',address:'Private address',value:999,journey_type:'Private Person'});
good.window.cwdClarity.track('private@example.com',{});
assert.equal(good.calls().filter(c=>c[0]==='event').length,7);
assert.doesNotMatch(JSON.stringify(good.calls()),/Private|9999999999|private@example|address|value/);
assert.deepEqual(JSON.parse(JSON.stringify(good.calls().find(c=>c[0]==='consentv2')[1])),
  {analytics_Storage:'granted',ad_Storage:'denied'});
assert.ok(good.calls().some(c=>c[0]==='set'&&c[1]==='environment'&&c[2]==='testing'));
good.window.cwdClarity.revoke();
assert.equal(good.reloads,1);
assert.equal(good.store.get('cwd_clarity_consent_v1'),'denied');
assert.equal(good.calls().at(-1)[0],'stop');
console.log('PASS consent, selective masks, seven-event allowlist and withdrawal');

const prod=await run({url:'https://carswithdriverindia.com/outstation',environment:'production'});
assert.equal(prod.scripts.length,1);
assert.ok(prod.calls().some(c=>c[0]==='set'&&c[1]==='environment'&&c[2]==='production'));

for(const options of [
  {consent:'denied'}, {consent:null}, {enabled:false}, {privacy:true}, {fail:true},
  {url:'https://unrelated.vercel.app/outstation'},
  ...['cwd-admin-5377','customer-invoice','quotation','vendor-booking','vendor-register','self-drive-documents','self-drive-review'].map(path=>({url:'http://localhost/'+path})),
  ...['email=private@example.com','phone=9999999999','address=Private','token=secret','utm_term=Private','gclid=9999999999'].map(q=>({url:'http://localhost/outstation?'+q})),
  {url:'http://localhost/outstation#private@example.com'},
  {referrer:'https://example.com/?email=private@example.com'},
  {referrer:'https://example.com/customer/Private'}
]) assert.equal((await run(options)).scripts.length,0,JSON.stringify(options));

const paid=await run({url:'http://localhost/outstation?utm_source=google&utm_medium=cpc&utm_campaign=Outstation_Mumbai_2026'});
assert.ok(paid.calls().some(c=>c[0]==='set'&&c[1]==='traffic_type'&&c[2]==='google_ads'));
assert.ok(!paid.calls().some(c=>c.includes('utm_source')));
console.log('PASS privacy signals, excluded routes/URLs/referrers and paid campaign filtering');

const csp=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
const directives=Object.fromEntries(csp.split(';').filter(s=>s.trim()).map(s=>{const [key,...values]=s.trim().split(' ');return [key,values];}));
assert.deepEqual(directives['default-src'],["'self'"]);
assert.ok(directives['script-src'].includes('https://*.clarity.ms'));
assert.ok(directives['connect-src'].includes('https://*.clarity.ms'));
assert.ok(directives['connect-src'].includes('https://c.bing.com'));
assert.ok(!source.includes('identify'));
console.log('PASS CSP and no Clarity identify API');
