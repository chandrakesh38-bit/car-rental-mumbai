import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://storage.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';process.env.SELF_DRIVE_TOKEN_SECRET='test-only-secret-with-at-least-32-characters';process.env.RESEND_API_KEY='test-resend';
const {default:book}=await import('../api/booking-enquiry.js');const {default:docs}=await import('../api/self-drive-documents.js');
const {DOC_KINDS,MAX_FILE_SIZE}=await import('../lib/self-drive-documents.mjs');
const rows=new Map(),files=new Map(),objects=new Map(),emails=[],signatures=[];let failEmail=false,dbFail=false,dbCalls=0;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url),body=options.body?JSON.parse(options.body):null;
 if(u.host==='api.resend.com'){emails.push({body,headers:options.headers});return failEmail?Response.json({}, {status:500}):Response.json({id:'email-id'});}
 assert.equal(u.origin,'https://storage.test');assert.equal(options.headers.Authorization,'Bearer test-service-role');
 if(u.pathname.startsWith('/rest/v1/')){
  dbCalls++;if(dbFail)return Response.json({}, {status:503});const table=u.pathname.split('/').pop();const map=table==='self_drive_verifications'?rows:files;
  if(options.method==='POST'){const key=body.booking_id+(body.kind?'/'+body.kind:'');if(!map.has(key))map.set(key,{status:'awaiting_documents',...body});return Response.json([map.get(key)]);}
  let found=[...map.values()].filter(r=>[...u.searchParams.entries()].every(([k,v])=>!v.startsWith('eq.')||String(r[k])===v.slice(3)));
  if(options.method==='PATCH'){found.forEach(r=>Object.assign(r,body));}
  if(u.searchParams.has('select'))found=found.map(r=>Object.fromEntries(u.searchParams.get('select').split(',').map(k=>[k,r[k]])));
  return Response.json(found);
 }
 if(u.pathname.startsWith('/storage/v1/object/upload/sign/')){assert.notEqual(options.headers['x-upsert'],'true');signatures.push(u.pathname);return Response.json({url:u.pathname.replace('/storage/v1','')+'?token=one-file-only'});}
 if(options.method==='DELETE'){for(const path of body.prefixes)objects.delete(path);return Response.json({});}
 if(u.pathname.startsWith('/storage/v1/object/authenticated/self-drive-documents/')){const obj=objects.get(u.pathname.split('/self-drive-documents/')[1]);return obj?new Response(obj.bytes,{headers:{'Content-Type':obj.type}}):Response.json({}, {status:404});}
 throw Error('Unexpected fetch '+url);
};
const payload={bookingId:'CWD-WD-260919-4321',name:'Test',phone:'9999999999',email:'test@example.com',details:'Self Drive test trip',serviceMode:'selfdrive',submissionKey:'a'.repeat(64)};
const booking=async(p=payload)=>{const r=await book(new Request('https://preview.test/api/booking-enquiry',{method:'POST',body:JSON.stringify(p)}));return {code:r.status,...await r.json()};};
let result=await booking();assert.equal(result.success,true);assert.equal(rows.size,1);assert.match(result.upload_url,/^https:\/\/preview.test\/self-drive-documents#booking=/);const params=new URLSearchParams(new URL(result.upload_url).hash.slice(1)),token=params.get('token');assert.equal(token.length,64);assert.notEqual(rows.get(payload.bookingId).token_hash,token);assert.match(emails[1].body.html,/Upload Documents/);assert.ok(emails[1].body.text.includes(result.upload_url));assert.doesNotMatch(emails[0].body.text,/token=/);assert.doesNotMatch(JSON.stringify(emails),/test-service-role|attachments/);
const firstKey=emails[1].headers['Idempotency-Key'];assert.equal((await booking()).upload_url,result.upload_url);assert.equal(rows.size,1);assert.equal(emails[3].headers['Idempotency-Key'],firstKey);
assert.equal((await booking({...payload,submissionKey:'b'.repeat(64)})).code,409);
const count=dbCalls;emails.length=0;result=await booking({...payload,serviceMode:'withdriver'});assert.equal(result.upload_url,undefined);assert.equal(dbCalls,count);assert.equal(emails[1].body.html,undefined);assert.doesNotMatch(emails[1].body.text,/Upload Documents/);
async function request(action,data={},auth=token){const r=await docs(new Request('https://preview.test/api/self-drive-documents',{method:'POST',headers:auth?{Authorization:'Bearer '+auth}:{},body:JSON.stringify({bookingId:payload.bookingId,action,...data})}));return {code:r.status,...await r.json()};}
assert.equal((await request('status',{},null)).code,403);assert.equal((await request('status',{},'0'.repeat(64))).code,403);assert.equal((await request('status',{bookingId:'CWD-WD-260919-9999'})).code,403);
assert.equal((await request('submit',{alternatePhone:'9999999999'})).code,400);
for(const [type,size]of [['text/html',10],['image/png',MAX_FILE_SIZE+1],['application/pdf',0]])assert.equal((await request('prepare',{kind:'aadhaar',type,size})).code,400);
assert.equal((await request('prepare',{kind:'../escape',type:'application/pdf',size:5})).code,400);
const pdf=new TextEncoder().encode('%PDF-1.7\nDocument test');
result=await request('prepare',{kind:'aadhaar',type:'application/pdf',size:pdf.length,filename:'Aadhaar.pdf'});assert.match(result.upload_url,/object\/upload\/sign\/self-drive-documents\/CWD-WD-260919-4321\/aadhaar/);assert.equal(files.size,0);
objects.set(payload.bookingId+'/aadhaar',{type:'application/pdf',bytes:pdf});result=await request('verify',{kind:'aadhaar',filename:'Aadhaar.pdf'});assert.equal(result.file.kind,'aadhaar');assert.equal(files.size,1);
const signed=signatures.length;result=await request('prepare',{kind:'aadhaar',type:'application/pdf',size:pdf.length});assert.ok(result.file);assert.equal(signatures.length,signed,'successful file must not be re-uploaded');
objects.set(payload.bookingId+'/pan',{type:'application/pdf',bytes:new TextEncoder().encode('<html>not a pdf')});assert.equal((await request('verify',{kind:'pan'})).code,400);assert.equal(objects.has(payload.bookingId+'/pan'),false);
objects.set(payload.bookingId+'/pan',{type:'application/pdf',bytes:new Uint8Array(MAX_FILE_SIZE+1)});assert.equal((await request('verify',{kind:'pan'})).code,400);
// Recover successful storage upload even if browser lost the PUT/verify response.
for(const kind of DOC_KINDS.slice(1)){objects.set(payload.bookingId+'/'+kind,{type:'application/pdf',bytes:pdf});result=await request('prepare',{kind,type:'application/pdf',size:pdf.length,filename:kind+'.pdf'});assert.ok(result.file);}
assert.equal((await request('submit',{alternatePhone:'123'})).code,400);
result=await request('submit',{alternatePhone:'8888888888'});assert.equal(result.status,'pending_verification');assert.equal(rows.get(payload.bookingId).status,'pending_verification');assert.equal(rows.get(payload.bookingId).alternate_phone,'8888888888');
assert.equal((await request('submit',{alternatePhone:'8888888888'})).status,'pending_verification');assert.equal((await request('prepare',{kind:'pan',type:'application/pdf',size:20})).code,409);
result=await request('status');assert.equal(result.files.length,5);assert.doesNotMatch(JSON.stringify(result),/token_hash|storage_path|test-service/);
rows.get(payload.bookingId).expires_at='2000-01-01';assert.equal((await request('status')).code,403);
failEmail=true;result=await booking({...payload,bookingId:'CWD-WD-260919-4322'});assert.equal(result.success,true);assert.equal(result.customer_email_sent,false);assert.ok(result.upload_url);
dbFail=true;const mailCount=emails.length;assert.equal((await booking({...payload,bookingId:'CWD-WD-260919-4323'})).code,503);assert.equal(emails.length,mailCount);
console.log('PASS: Self Drive persistence/token hashing/expiry, With Driver skip, Resend upload CTA, missing/wrong/cross-booking tokens, file type/signature/5MB checks, private upload paths, missing documents/mobile, retry recovery, no overwrite, manual-only final state and email/DB failures.');
