import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/clarity-config.js';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../assets/js/clarity.js', import.meta.url), 'utf8');

async function config(env, host, projectId='prod123') {
  process.env.VERCEL_ENV = env;
  process.env.CLARITY_PRODUCTION_PROJECT_ID = projectId;
  return handler(new Request('https://' + host + '/api/clarity-config')).then(r => r.json());
}

assert.deepEqual(await config('production','carswithdriverindia.com'),
  {enabled:true,projectId:'prod123',environment:'production'});
assert.deepEqual(await config('production','www.carswithdriverindia.com'),
  {enabled:true,projectId:'prod123',environment:'production'});
assert.equal((await config('preview','carswithdriverindia.com')).enabled,false);
assert.equal((await config('production','example.com')).enabled,false);
assert.equal((await config('production','carswithdriverindia.com','')).enabled,false);

async function run({url='http://localhost/outstation',referrer='',privacy=false,response={enabled:true,environment:'production',projectId:'fixture123'}}={}) {
  const scripts=[],masked=[],attrs={};
  const document={
    referrer,
    readyState:'complete',
    documentElement:{setAttribute:(k,v)=>attrs[k]=v},
    head:{appendChild:el=>scripts.push(el)},
    createElement:()=>({style:{},setAttribute(){}}),
    querySelectorAll:()=>[{setAttribute:(k,v)=>masked.push([k,v])},{setAttribute:(k,v)=>masked.push([k,v])}]
  };
  const location=new URL(url);
  const window={};
  vm.runInNewContext(source,{window,document,location,URL,Set,
    navigator:{globalPrivacyControl:privacy,doNotTrack:null},
    fetch:async()=>({ok:true,json:async()=>response})});
  await new Promise(resolve=>setImmediate(resolve));
  return {window,scripts,masked,attrs};
}

const good=await run();
assert.equal(good.scripts.length,1);
assert.ok(good.masked.some(([k,v])=>k==='data-clarity-mask'&&v==='true'));
for(const name of ['explore_cabs_click','cab_results_shown','book_car_click','booking_form_opened','otp_requested','otp_verified','booking_request_submitted']) {
  good.window.cwdClarity.track(name,{trip_type:'outstation',service_type:'with_driver',journey_type:'round-trip',phone:'9999999999',email:'private@example.com',address:'Private address'});
}
const serialized=JSON.stringify(good.window.clarity.q);
assert.doesNotMatch(serialized,/9999999999|private@example|Private address/);
assert.equal(good.window.clarity.q.filter(c=>c[0]==='event').length,7);

for(const options of [
  {privacy:true},
  {url:'http://localhost/vendor-register'},
  {url:'http://localhost/customer-invoice'},
  {url:'http://localhost/outstation?email=private@example.com'},
  {url:'http://localhost/outstation#private@example.com'}
]) assert.equal((await run(options)).scripts.length,0,JSON.stringify(options));

for(const text of ['cwd-clarity-choice','Analytics preferences','Allow & Continue','No thanks','consentv2','cwd_clarity_consent_v1']) {
  assert.equal(source.includes(text),false,text);
}
console.log('PASS production-only invisible Clarity, selective masks, safe route gates, and no customer-facing analytics UI');
