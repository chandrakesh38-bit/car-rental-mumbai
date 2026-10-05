import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.html'));
for(const file of files){
  const before=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),after=readFileSync(file,'utf8');
  const corrected=s=>s.replaceAll('minimum billing standard of 300 KM per day','minimum daily distance shown in the live fare').replaceAll('(300 KM/day)','(as shown in your live fare)');
  for(const re of [/<title>[\s\S]*?<\/title>/g,/<meta[^>]+name="description"[^>]*>/g,/<link[^>]+rel="canonical"[^>]*>/g,/<script[^>]+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g])assert.deepEqual(after.match(re),(before.match(re)||[]).map(corrected),file);
  const routes=s=>[...s.matchAll(/href="(\/mumbai-to-[^"]+)"/g)].map(m=>m[1]).sort();
  assert.deepEqual(routes(after),routes(before),file+' route links');
}
console.log('PASS titles, descriptions, canonicals, structured data and route links preserved in '+files.length+' HTML files');
