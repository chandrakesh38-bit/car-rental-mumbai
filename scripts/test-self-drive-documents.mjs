import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=await PGlite.create();
await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text);alter table storage.objects enable row level security;`);
for(const file of ['20260919_self_drive_documents.sql','20260919_self_drive_review.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
process.env.SUPABASE_URL='https://storage.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-role';process.env.SELF_DRIVE_TOKEN_SECRET='test-secret-at-least-thirty-two-characters';process.env.RESEND_API_KEY='test-resend';
const {default:book}=await import('../api/booking-enquiry.js');const {default:docs}=await import('../api/self-drive-documents.js');const {default:review}=await import('../api/self-drive-review.js');
const {DOC_KINDS,decryptToken}=await import('../lib/self-drive-documents.mjs');
const emails=[],signed=[],objects=new Map();let failEmail=false,dbCalls=0;
const adminId='11111111-1111-4111-8111-111111111111';
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url),body=options.body?JSON.parse(options.body):null;
 if(u.host==='api.resend.com'){emails.push({body,headers:options.headers});return failEmail?Response.json({}, {status:500}):Response.json({id:'email-id'});}
 assert.equal(u.origin,'https://storage.test');assert.equal(options.headers.apikey,'test-role');
 if(u.pathname==='/auth/v1/user'){
  const token=options.headers.Authorization;
  if(token==='Bearer expired')return Response.json({}, {status:401});
  return Response.json({id:adminId,email:token==='Bearer admin'||token==='Bearer unconfirmed'?'carwithdriver.vikhroli@gmail.com':'other@example.com',email_confirmed_at:token==='Bearer unconfirmed'?null:new Date().toISOString()});
 }
 assert.equal(options.headers.Authorization,'Bearer test-role');
 if(u.pathname.startsWith('/rest/v1/')){
  dbCalls++;const table=u.pathname.split('/').pop();
  try {
   if(u.pathname.includes('/rpc/')){assert.match(table,/^sd_[a-z_]+$/);const keys=Object.keys(body);const params=Object.values(body).map(v=>typeof v==='object'?JSON.stringify(v):v);const result=await pg.query(`select ${table}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) as result`,params);return Response.json(result.rows[0].result);}
   assert.ok(['self_drive_verifications','self_drive_document_files'].includes(table));
   if(options.method==='POST'){const keys=Object.keys(body);const conflict=u.searchParams.get('on_conflict');assert.match(conflict,/^[a-z_,]+$/);return Response.json((await pg.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict (${conflict}) do nothing returning *`,Object.values(body))).rows);}
   const params=[],where=[];const sets=[];
   if(options.method==='PATCH')for(const[k,v]of Object.entries(body)){params.push(v);sets.push(`${k}=$${params.length}`);}
   for(const[k,v]of u.searchParams){if(v.startsWith('eq.')){params.push(v.slice(3));where.push(`${k}=$${params.length}`);}else if(v==='is.null')where.push(`${k} is null`);}
   const condition=where.length?' where '+where.join(' and '):'';const select=u.searchParams.get('select')||'*';assert.match(select,/^[a-z_,*]+$/);
   return Response.json((await pg.query(options.method==='PATCH'?`update ${table} set ${sets.join(',')}${condition} returning *`:`select ${select} from ${table}${condition}`,params)).rows);
  }catch(error){return Response.json({message:error.message},{status:400});}
 }
 if(u.pathname.startsWith('/storage/v1/object/upload/sign/')){assert.notEqual(options.headers['x-upsert'],'true');signed.push({path:u.pathname,body});return Response.json({url:u.pathname.replace('/storage/v1','')+'?token=upload'});}
 if(u.pathname.startsWith('/storage/v1/object/sign/')){assert.equal(body.expiresIn,60);signed.push({path:u.pathname,body});return Response.json({signedURL:u.pathname.replace('/storage/v1','')+'?token=preview'});}
 if(options.method==='DELETE'){for(const path of body.prefixes)objects.delete(path);return Response.json({});}
 if(u.pathname.startsWith('/storage/v1/object/authenticated/self-drive-documents/')){const obj=objects.get(u.pathname.split('/self-drive-documents/')[1]);return obj?new Response(obj.bytes,{headers:{'Content-Type':obj.type}}):Response.json({}, {status:404});}
 throw Error('Unexpected fetch '+url);
};
const api=async(handler,p,token)=>{const r=await handler(new Request('https://preview.test/api/test',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(p)}));return {code:r.status,...await r.json()};};
const getRow=async id=>(await pg.query('select * from self_drive_verifications where booking_id=$1',[id])).rows[0];
const getFiles=async id=>(await pg.query('select * from self_drive_document_files where booking_id=$1 order by kind',[id])).rows;
const pdf=new TextEncoder().encode('%PDF-1.7\nTest document');
async function setup(suffix){const id='CWD-WD-260919-'+suffix;const p={bookingId:id,name:'Test Customer',phone:'9999999999',email:'test@example.com',details:'Self Drive Test Trip',serviceMode:'selfdrive',submissionKey:'a'.repeat(64)};const r=await api(book,p);assert.equal(r.success,true);const token=new URLSearchParams(new URL(r.upload_url).hash.slice(1)).get('token');const row=await getRow(id);assert.equal(await decryptToken(row.upload_token_encrypted),token);assert.ok(!row.upload_token_encrypted.includes(token));for(const kind of DOC_KINDS){objects.set(id+'/'+kind,{type:'application/pdf',bytes:pdf});assert.equal((await api(docs,{bookingId:id,action:'verify',kind,filename:kind+'.pdf'},token)).success,true);}const start=emails.length;assert.equal((await api(docs,{bookingId:id,action:'submit',alternatePhone:'8888888888'},token)).status,'pending_verification');assert.equal(emails.length,start+1);assert.match(emails.at(-1).body.html,/Review Documents/);assert.match(emails.at(-1).body.text,/Pending Review/);await api(docs,{bookingId:id,action:'submit',alternatePhone:'8888888888'},token);assert.equal(emails.length,start+1);return {id,token,p};}
try {
 assert.equal((await pg.query("select public from storage.buckets where id='self-drive-documents'")).rows[0].public,false);
 await pg.exec('set role authenticated');await assert.rejects(pg.query('select * from self_drive_document_files'));await assert.rejects(pg.query("select sd_submit_documents('x','8888888888')"));await pg.exec('reset role');
 const a=await setup('1001');
 for(const [token,status]of [[undefined,401],['expired',401],['customer',403],['unconfirmed',403]])assert.equal((await api(review,{action:'read',bookingId:a.id},token)).code,status);
 assert.equal((await api(review,{action:'verify',bookingId:a.id},'admin')).code,409);
 let r=await api(review,{action:'read',bookingId:a.id},'admin');assert.equal(r.files.length,5);assert.doesNotMatch(JSON.stringify(r),/token_hash|upload_token_encrypted|storage_path/);
 r=await api(review,{action:'preview',bookingId:a.id,kind:'aadhaar'},'admin');assert.equal(r.expires_in,60);assert.match(r.preview_url,/object\/sign\/self-drive-documents/);
 const approve=(kind,revision=0)=>({kind,status:'approved',revision});
 r=await api(review,{action:'review',bookingId:a.id,decisions:DOC_KINDS.map(k=>approve(k))},'admin');assert.equal(r.status,'pending_verification');assert.equal((await getRow(a.id)).verified_at,null);
 const n=emails.length;r=await api(review,{action:'verify',bookingId:a.id},'admin');assert.equal(r.status,'verified');assert.equal(emails.length,n+1);assert.match(emails.at(-1).body.text,/does not confirm your booking/);assert.ok((await getRow(a.id)).verified_at);await api(review,{action:'verify',bookingId:a.id},'admin');assert.equal(emails.length,n+1);
 const b=await setup('1002');assert.equal((await api(review,{action:'review',bookingId:b.id,decisions:[{kind:'aadhaar',status:'reupload_required',reason:'',revision:0}]},'admin')).code,400);
 const decisions=DOC_KINDS.map(k=>k==='aadhaar'?{kind:k,status:'reupload_required',reason:'Aadhaar not readable <script>',revision:0}:approve(k));
 r=await api(review,{action:'review',bookingId:b.id,decisions},'admin');assert.equal(r.status,'reupload_required');assert.match(emails.at(-1).body.subject,/Document Re-upload Required/);assert.match(emails.at(-1).body.html,/Re-upload Documents/);assert.match(emails.at(-1).body.html,/&lt;script&gt;/);assert.ok(emails.at(-1).body.text.includes(b.token));
 let before=await getFiles(b.id);assert.equal(before.filter(f=>f.review_status==='approved').length,4);assert.equal((await api(docs,{action:'status',bookingId:b.id},a.token)).code,403);
 assert.equal((await api(docs,{action:'prepare',bookingId:b.id,kind:'pan',type:'application/pdf',size:20},b.token)).code,409);
 assert.equal((await api(docs,{action:'submit',bookingId:b.id,alternatePhone:'8888888888'},b.token)).code,400);
 r=await api(docs,{action:'prepare',bookingId:b.id,kind:'aadhaar',type:'application/pdf',size:20},b.token);assert.match(r.upload_url,/aadhaar\/v1/);
 objects.set(b.id+'/aadhaar/v1',{type:'application/pdf',bytes:pdf});r=await api(docs,{action:'verify',bookingId:b.id,kind:'aadhaar',filename:'new.pdf'},b.token);assert.equal(r.file.review_status,'pending');
 for(const f of before.filter(f=>f.review_status==='approved'))assert.deepEqual((await getFiles(b.id)).find(x=>x.kind===f.kind),f);
 r=await api(docs,{action:'submit',bookingId:b.id,alternatePhone:'8888888888'},b.token);assert.equal(r.status,'pending_verification');assert.match(emails.at(-1).body.subject,/Documents Pending Review/);
 assert.equal((await api(review,{action:'review',bookingId:b.id,decisions:[approve('aadhaar',0)]},'admin')).code,409);assert.equal((await api(review,{action:'review',bookingId:b.id,decisions:[approve('aadhaar',1)]},'admin')).success,true);assert.equal((await api(review,{action:'verify',bookingId:b.id},'admin')).status,'verified');
 const c=await setup('1003');failEmail=true;r=await api(review,{action:'review',bookingId:c.id,decisions:DOC_KINDS.map(k=>['aadhaar','pan'].includes(k)?{kind:k,status:'reupload_required',reason:k+' needs clearer text',revision:0}:approve(k))},'admin');assert.equal(r.success,true);assert.equal(r.email_sent,false);assert.equal((await getFiles(c.id)).filter(f=>f.review_status==='reupload_required').length,2);failEmail=false;const count=emails.length;assert.equal((await api(review,{action:'notify',bookingId:c.id},'admin')).email_sent,true);assert.equal(emails.length,count+1);await api(review,{action:'notify',bookingId:c.id},'admin');assert.equal(emails.length,count+1);assert.match(emails.at(-1).body.text,/aadhaar needs clearer text/);assert.match(emails.at(-1).body.text,/pan needs clearer text/);
 for(const kind of ['aadhaar','pan']){objects.set(c.id+'/'+kind+'/v1',{type:'application/pdf',bytes:pdf});assert.equal((await api(docs,{action:'verify',bookingId:c.id,kind},c.token)).success,true);}assert.equal((await api(docs,{action:'submit',bookingId:c.id,alternatePhone:'8888888888'},c.token)).status,'pending_verification');
 // A failed multi-document review must roll back the entire decision batch.
 const prior=await getFiles(c.id);assert.equal((await api(review,{action:'review',bookingId:c.id,decisions:[approve('aadhaar',1),approve('pan',0)]},'admin')).code,409);assert.deepEqual(await getFiles(c.id),prior);
 // Legacy rows keep their token: authenticated use backfills its encrypted copy.
 await pg.query('update self_drive_verifications set upload_token_encrypted=null where booking_id=$1',[c.id]);
 assert.equal((await api(review,{action:'review',bookingId:c.id,decisions:[{kind:'aadhaar',status:'reupload_required',reason:'Please replace',revision:1}]},'admin')).code,409);
 assert.equal((await api(docs,{action:'status',bookingId:c.id},c.token)).success,true);
 assert.equal(await decryptToken((await getRow(c.id)).upload_token_encrypted),c.token);
 assert.ok((await getFiles(b.id)).every(f=>f.reviewed_at&&f.reviewed_by===adminId));
 // Preserve the original server-side format and size checks.
 const fresh={...a.p,bookingId:'CWD-WD-260919-1004'};const freshResult=await api(book,fresh);const freshToken=new URLSearchParams(new URL(freshResult.upload_url).hash.slice(1)).get('token');
 for(const [type,size]of [['text/html',20],['application/pdf',5242881]])assert.equal((await api(docs,{action:'prepare',bookingId:fresh.bookingId,kind:'aadhaar',type,size},freshToken)).code,400);
 objects.set(fresh.bookingId+'/aadhaar',{type:'application/pdf',bytes:new TextEncoder().encode('Not a PDF')});assert.equal((await api(docs,{action:'verify',bookingId:fresh.bookingId,kind:'aadhaar'},freshToken)).code,400);assert.equal(objects.has(fresh.bookingId+'/aadhaar'),false);
 assert.equal((await api(docs,{action:'submit',bookingId:fresh.bookingId,alternatePhone:'8888888888'},freshToken)).code,400);
 const dc=dbCalls;const wd=await api(book,{...a.p,serviceMode:'withdriver'});assert.equal(wd.upload_url,undefined);assert.equal(dbCalls,dc);assert.doesNotMatch(emails.at(-1).body.text,/Upload Documents/);
 await pg.query("update self_drive_verifications set expires_at='2000-01-01' where booking_id=$1",[c.id]);assert.equal((await api(docs,{action:'status',bookingId:c.id},c.token)).code,403);
 assert.doesNotMatch(JSON.stringify(emails),/attachments|object\/sign|storage_path|test-role/);
 console.log('PASS: actual local PostgreSQL migrations/RPC transactions and permissions; all-approved, one/multiple rejected, same-token emails, re-upload isolation, approved locks, version/stale-review protection, rollback, short-lived preview authorization, notification retry/deduplication, expiry and With Driver skip.');
}finally{await pg.close();}
