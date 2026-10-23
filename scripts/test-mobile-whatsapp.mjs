import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync('tools/mobile-whatsapp/worker.mjs','utf8');
for(const scenario of ['success','uncertain','recovery']){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cwd-wa-test-'));
 try{
  fs.writeFileSync(path.join(dir,'worker-config.json'),JSON.stringify({token:'a'.repeat(64)}));
  if(scenario==='recovery')fs.writeFileSync(path.join(dir,'worker-journal.json'),JSON.stringify({job:{id:'job',lease:'lease',state:'dispatching',synced:false}}));
  const mock=`
let calls=[],sends=0,claimed=false;
globalThis.fetch=async (_url,options)=>{
 const body=JSON.parse(options.body);calls.push(body.p_action);
 if(body.p_action==='claim')return {ok:true,json:async()=>claimed||'${scenario}'==='recovery'?null:(claimed=true,{id:'job',lease:'lease',recipient:'918082788465',message:'test'})};
 return {ok:true,json:async()=>({ok:true})};
};
setTimeout(()=>{fs.writeFileSync('result.json',JSON.stringify({calls,sends}));process.exit(0)},350);
`;
  const imports=`
const handlers={};
const makeWASocket=()=>{
 setTimeout(()=>handlers['connection.update']({connection:'open'}),10);
 return {ev:{on:(event,fn)=>handlers[event]=fn},sendMessage:async()=>{
  sends++; if('${scenario}'==='uncertain')throw new Error('timeout');
  setTimeout(()=>handlers['messages.update']([{key:{id:'sent-id'},update:{status:3}}]),20);
  return {key:{id:'sent-id'},message:{conversation:'test'}};
 }};
};
const useMultiFileAuthState=async()=>({state:{creds:{registered:true}},saveCreds:()=>{}});
const Browsers={ubuntu:()=>[]};const pino=()=>({});
`;
  let code=source.replace("const {default:makeWASocket,useMultiFileAuthState,Browsers}=await import('@whiskeysockets/baileys');",mock+imports)
   .replace("const {default:pino}=await import('pino');",'')
   .replace('setInterval(()=>void tick(),30000)','setInterval(()=>void tick(),30)');
  fs.writeFileSync(path.join(dir,'worker.mjs'),code);
  const run=spawnSync(process.execPath,[path.join(dir,'worker.mjs')],{encoding:'utf8',timeout:5000});
  assert.equal(run.status,0,run.stderr);
  const r=JSON.parse(fs.readFileSync(path.join(dir,'result.json')));
  const j=JSON.parse(fs.readFileSync(path.join(dir,'worker-journal.json')));
  assert.equal(r.sends,scenario==='recovery'?0:1);
  assert.equal(j.job.state,scenario==='success'?'delivered':'uncertain');
  assert.equal(j.job.synced,true);
  assert(r.calls.includes(scenario==='success'?'delivered':'uncertain'));
  console.log('PASS '+scenario);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
