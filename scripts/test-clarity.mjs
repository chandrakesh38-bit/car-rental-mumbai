import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import handler from '../api/clarity-config.js';

const source = await readFile(new URL('../assets/js/clarity.js', import.meta.url), 'utf8');
async function run({url='https://car-rental-mumbai-test-car-with-driver-operation-team.vercel.app/outstation',referrer='',consent='granted',enabled=true,unmask=false,privacy=false,fail=false}={}) {
  const scripts=[],attrs={},buttons=[],store=new Map([['cwd_clarity_testing_consent_v1',consent]]);
  let requests=0,reloads=0;
  const root={setAttribute:(k,v)=>attrs[k]=v};
  const document={referrer,readyState:'complete',documentElement:root,
    head:{appendChild:el=>{assert.equal(attrs['data-clarity-mask'],'true');scripts.push(el);}},
    body:{appendChild:el=>buttons.push(el)},
    createElement:tag=>({tag,setAttribute(){},style:{},querySelector(){return {};},remove(){}}),
    querySelector:selector=>selector==='[data-clarity-unmask]'?unmask:null};
  const location=new URL(url); location.reload=()=>reloads++;
  const window={};
  vm.runInNewContext(source,{window,document,location,URL,Set,navigator:{globalPrivacyControl:privacy},
    localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
    fetch:async()=>{requests++;if(fail)throw Error('offline');return {ok:true,json:async()=>({enabled,environment:'testing',projectId:'fixture123'})};}});
  await new Promise(resolve=>setImmediate(resolve));
  return {window,scripts,attrs,requests,buttons,store,get reloads(){return reloads;},calls:()=>Array.from(window.clarity?.q||[],args=>Array.from(args))};
}

for(const env of ['production','development','preview']) for(const branch of ['main','testing','codex/clarity-testing','unrelated']) {
  process.env.VERCEL_ENV=env;process.env.VERCEL_GIT_COMMIT_REF=branch;process.env.CLARITY_TESTING_PROJECT_ID='fixture123';
  const result=await handler(new Request('https://test.invalid/api/clarity-config')).json();
  assert.equal(result.enabled,env==='preview'&&['testing','codex/clarity-testing'].includes(branch));
  if(!result.enabled)assert.equal(result.projectId,undefined);
}
process.env.CLARITY_TESTING_PROJECT_ID='';
assert.equal((await handler(new Request('https://test.invalid')).json()).enabled,false);
console.log('PASS config fails closed without ID; production/main/unrelated deployments cannot enable testing');

const good=await run();
assert.equal(good.scripts.length,1);
for(const name of ['explore_cabs_click','cab_results_shown','book_car_click','booking_form_opened','otp_requested','otp_verified','booking_request_submitted']) good.window.cwdClarity.track(name,{trip_type:'outstation',service_type:'with_driver',name:'Private Person',phone:'9999999999',email:'private@example.com',address:'Private address',value:999,journey_type:'Private Person'});
good.window.cwdClarity.track('private@example.com',{});
assert.equal(good.calls().filter(c=>c[0]==='event').length,7);
assert.doesNotMatch(JSON.stringify(good.calls()),/Private|9999999999|private@example|address|value/);
assert.deepEqual(JSON.parse(JSON.stringify(good.calls().find(c=>c[0]==='consentv2')[1])),{analytics_Storage:'granted',ad_Storage:'denied'});
good.window.cwdClarity.revoke();
assert.equal(good.reloads,1);
assert.equal(good.store.get('cwd_clarity_testing_consent_v1'),'denied');
assert.equal(good.calls().at(-1)[0],'stop');
console.log('PASS seven events and fixed tags only, consent before SDK, mask before SDK, revoke stops and reloads');

for(const options of [
  {consent:'denied'}, {consent:null}, {enabled:false}, {privacy:true}, {unmask:true}, {fail:true},
  {url:'https://carswithdriverindia.com/outstation'},
  {url:'https://www.carswithdriverindia.com/outstation'},
  {url:'https://unrelated.vercel.app/outstation'},
  ...['cwd-admin-5377','customer-invoice','quotation','vendor-booking','vendor-register','self-drive-documents','self-drive-review'].map(path=>({url:'http://localhost/'+path})),
  ...['email=private@example.com','phone=9999999999','address=Private','token=secret','utm_term=Private','utm_campaign=Private','gclid=9999999999'].map(q=>({url:'http://localhost/outstation?'+q})),
  {url:'http://localhost/outstation#private@example.com'},
  {referrer:'https://example.com/?email=private@example.com'},
  {referrer:'https://example.com/customer/Private'}
]) assert.equal((await run(options)).scripts.length,0,JSON.stringify(options));
const paid=await run({url:'http://localhost/outstation?utm_source=google&utm_medium=cpc&utm_campaign=clarity_testing'});
assert.ok(paid.calls().some(c=>c[0]==='set'&&c[1]==='traffic_type'&&c[2]==='google_ads'));
assert.ok(!paid.calls().some(c=>c.includes('utm_source')));
console.log('PASS consent, privacy signals, sensitive pages/URLs/referrers, invalid config, and duplicate/unmask guards');

const csp=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
const directives=Object.fromEntries(csp.split(';').filter(s=>s.trim()).map(s=>{const [key,...values]=s.trim().split(' ');return [key,values];}));
assert.deepEqual(directives['default-src'],["'self'"]);
assert.ok(directives['script-src'].includes('https://*.clarity.ms'));
assert.ok(!directives['script-src'].includes('https://c.bing.com'));
assert.ok(directives['connect-src'].includes('https://*.clarity.ms'));
assert.ok(directives['connect-src'].includes('https://c.bing.com'));
assert.ok(directives['frame-src'].includes('https://*.hcaptcha.com'));
assert.ok(!source.includes('identify'));
console.log('PASS CSP adds Clarity only to script/connect directives; existing image HTTPS allowance is sufficient');
