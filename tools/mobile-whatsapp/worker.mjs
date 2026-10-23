import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.umask(0o077);
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
// libsignal prints key material through console independently of pino.
// Keep application status output separate; never print dependency objects.
const output=console.log.bind(console);
for(const method of ['log','info','warn','debug','error']) console[method]=()=>{};
const log=message=>output(new Date().toISOString()+' '+message);
const {default:makeWASocket,useMultiFileAuthState,Browsers}=await import('@whiskeysockets/baileys');
const {default:pino}=await import('pino');
const cfg=JSON.parse(fs.readFileSync('worker-config.json','utf8'));
if(!/^[a-f0-9]{64}$/.test(cfg.token)) throw new Error('Invalid worker token');
const url='https://pwciaihqkfnlenxxiown.supabase.co/rest/v1/rpc/cwd_mobile_whatsapp';
const apikey='sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz';
const journalPath='worker-journal.json';
const journal=fs.existsSync(journalPath)?JSON.parse(fs.readFileSync(journalPath,'utf8')):{};
function save(){fs.writeFileSync(journalPath+'.tmp',JSON.stringify(journal),{mode:0o600});fs.renameSync(journalPath+'.tmp',journalPath);}
async function rpc(action,job={}){
 const r=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey,'Content-Type':'application/json'},
 body:JSON.stringify({p_token:cfg.token,p_action:action,p_id:job.id||null,p_lease:job.lease||null,p_message_id:job.messageId||null})});
 if(!r.ok)throw new Error('Queue request failed');return r.json();
}
// An interrupted send has an unknown outcome. Never automatically resend it.
for(const job of Object.values(journal)){if(job.state==='dispatching'){job.state='uncertain';job.synced=false;}}
save();
const {state,saveCreds}=await useMultiFileAuthState('./auth');
if(!state.creds.registered){log('NOT PAIRED: run pairing first.');process.exit(2);}
const sock=makeWASocket({auth:state,logger:pino({level:'silent'}),browser:Browsers.ubuntu('Chrome'),
 markOnlineOnConnect:false,syncFullHistory:false,
 getMessage:async key=>Object.values(journal).find(j=>j.messageId===key.id)?.wireMessage});
sock.ev.on('creds.update',saveCreds);
let ready=false,busy=false;
sock.ev.on('connection.update',({connection})=>{
 if(connection==='open'){ready=true;log('CONNECTED: waiting for website jobs.');void tick();}
 if(connection==='close'){ready=false;log('DISCONNECTED: supervisor will reconnect.');setTimeout(()=>process.exit(1),1000);}
});
function delivered(id){
 const job=Object.values(journal).find(j=>j.messageId===id);
 if(job){job.state='delivered';job.synced=false;save();}
}
sock.ev.on('messages.update',items=>{for(const {key,update} of items){if(Number(update.status)>=3)delivered(key.id);}});
sock.ev.on('message-receipt.update',items=>{for(const {key,receipt} of items){if(receipt.receiptTimestamp||receipt.readTimestamp)delivered(key.id);}});
async function flush(){
 for(const job of Object.values(journal)){
  if(!job.synced&&['accepted','delivered','uncertain'].includes(job.state)){
   const state=job.state,r=await rpc(state,job);
   if(!r?.ok)throw new Error('Acknowledgement rejected');
   if(job.state===state){job.synced=true;save();}
  }
 }
}
async function tick(){
 if(!ready||busy)return;busy=true;
 try{
  await flush();
  const job=await rpc('claim');if(!job)return;
  if(journal[job.id]){log('Existing local job retained for review.');return;}
  if(!/^91[6-9][0-9]{9}$/.test(job.recipient)||typeof job.message!=='string'||job.message.length>4000)throw new Error('Invalid job');
  const r=await rpc('begin',job);if(!r?.ok)return;
  journal[job.id]={id:job.id,lease:job.lease,state:'dispatching',synced:false};save();
  try{
   const sent=await sock.sendMessage(job.recipient+'@s.whatsapp.net',{text:job.message});
   if(!sent?.key?.id)throw new Error('Missing message ID');
   Object.assign(journal[job.id],{state:'accepted',messageId:sent.key.id,wireMessage:sent.message});save();
   log('SENT: website notification.');
  }catch{
   journal[job.id].state='uncertain';save();log('SEND UNCERTAIN: held for review; no automatic duplicate.');
  }
  await flush();
 }catch{log('QUEUE UNAVAILABLE: will retry; check activation/network if this continues.');}
 finally{busy=false;}
}
setInterval(()=>void tick(),30000);
setTimeout(()=>{if(!ready){log('Connection timeout: restarting.');process.exit(1);}},120000).unref();
process.on('SIGTERM',()=>{save();process.exit(0);});
process.on('SIGINT',()=>{save();process.exit(0);});
process.on('uncaughtException',()=>{log('Worker stopped; supervisor will restart.');process.exit(1);});
process.on('unhandledRejection',()=>{log('Worker stopped; supervisor will restart.');process.exit(1);});
