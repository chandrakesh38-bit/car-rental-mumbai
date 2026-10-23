import assert from 'node:assert/strict';
import handler from '../api/admin-partner-applications.js';
process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';process.env.SUPABASE_ANON_KEY='fixture-public';process.env.ADMIN_EMAILS='admin@example.test';
const id='11111111-1111-1111-1111-111111111111';let email='admin@example.test',stale=false,patch;
globalThis.fetch=async(url,options={})=>{
 if(url.includes('/auth/'))return Response.json({email,email_confirmed_at:'2026-01-01'});
 if(url.includes('/storage/'))return Response.json({signedURL:'/object/sign/partner-documents/'+id+'/rc.pdf?token=fixture'});
 if(options.method==='PATCH'){patch=JSON.parse(options.body);assert.ok(url.includes('review_version=eq.0'));return Response.json(stale?[]:[{id,...patch}]);}
 if(!url.includes('id=eq.')){assert.ok(!url.includes('rc_path'));return Response.json([]);}
 return Response.json([{id,name:'Fixture',review_status:'pending',review_version:0,rc_path:id+'/rc.pdf',pan_path:'other/secret.pdf',vehicle_photo_paths:[]}]);
};
const call=(query='',body,auth=true)=>handler(new Request('https://example.test/api/admin-partner-applications'+query,{method:body?'POST':'GET',headers:{...(auth?{authorization:'Bearer fixture'}:{}),'content-type':'application/json',origin:'https://example.test'},...(body?{body:JSON.stringify(body)}:{})}));
assert.equal((await call('',null,false)).status,401);email='stranger@example.test';assert.equal((await call()).status,403);email='admin@example.test';
assert.equal((await call()).status,200);
const detail=await (await call('?id='+id)).json();assert.equal(detail.application.rc_path,undefined);assert.equal(detail.documents[0].key,'rc_path');
assert.equal((await call('?id='+id+'&document=rc_path')).status,200);assert.equal((await call('?id='+id+'&document=pan_path')).status,404);
assert.equal((await call('',{id,status:'rejected',notes:'',version:0})).status,400);
assert.equal((await call('',{id,status:'approved',notes:'Checked',version:0})).status,200);assert.equal(patch.reviewed_by,email);assert.equal(patch.review_version,1);
stale=true;assert.equal((await call('',{id,status:'approved',version:0})).status,409);
console.log('PASS partner admin authorization, private documents, validation, audit identity and concurrent review protection.');
