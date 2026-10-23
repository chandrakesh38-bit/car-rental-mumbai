export const config={runtime:'edge'};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const fields='id,application_number,created_at,name,phone,email,alternate_phone,car_brand,car_model,mfg_year,review_status,review_notes,reviewed_at,reviewed_by,review_version';
const documentFields=['rc_path','insurance_path','puc_path','dl_path','aadhaar_path','pan_path'];
export default async function handler(request){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const json=(data,status=200)=>Response.json(data,{status,headers});
 try{
  if(!['GET','POST'].includes(request.method))return json({success:false},405);
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=request.headers.get('authorization'),publicKey=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!/^Bearer \S+$/.test(token||''))fail('Admin authentication required.',401);
  if(!base||!key||!publicKey)fail('Partner review is not configured.',503);
  const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:token},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)fail('Admin session expired.',401);
  const user=await auth.json(),email=String(user.email||'').toLowerCase();
  if(!user.email_confirmed_at||!String(process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(email))fail('Admin access denied.',403);
  const db=async(path,options={})=>{
   const r=await fetch(base+'/rest/v1/'+path,{...options,signal:AbortSignal.timeout(12000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers}});
   if(!r.ok)fail('Unable to access partner applications.',503);return r.status===204?null:r.json();
  };
  const url=new URL(request.url),id=url.searchParams.get('id');
  const validId=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
  if(request.method==='GET'){
   if(id){
    if(!validId(id))fail('Invalid application.');
    const rows=await db('partner_applications?id=eq.'+id+'&select='+fields+','+documentFields.join(',')+',vehicle_photo_paths&limit=1');
    const row=rows?.[0];if(!row)fail('Application not found.',404);
    const files=[...documentFields.map(name=>({key:name,label:name.replace('_path','').toUpperCase(),path:row[name]})),...(Array.isArray(row.vehicle_photo_paths)?row.vehicle_photo_paths:[]).map((path,index)=>({key:'photo_'+index,label:'Vehicle photo '+(index+1),path}))].filter(f=>f.path);
    const fileKey=url.searchParams.get('document');
    if(fileKey){
     const file=files.find(f=>f.key===fileKey);
     if(!file||typeof file.path!=='string'||!file.path.startsWith(id+'/')||file.path.split('/').some(p=>p==='.'||p==='..'))fail('Document unavailable.',404);
     const r=await fetch(base+'/storage/v1/object/sign/partner-documents/'+file.path.split('/').map(encodeURIComponent).join('/'),{method:'POST',signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})});
     if(!r.ok)fail('Unable to open document.',503);const d=await r.json(),signed=d.signedURL||d.signedUrl;
     if(!signed)fail('Unable to open document.',503);
     const link=new URL(signed.startsWith('/')?base+'/storage/v1'+signed:signed);
     if(link.origin!==new URL(base).origin)fail('Invalid document link.',503);
     return json({success:true,url:link.href});
    }
    documentFields.forEach(k=>delete row[k]);delete row.vehicle_photo_paths;
    return json({success:true,application:row,documents:files.map(({key,label})=>({key,label}))});
   }
   const status=url.searchParams.get('status')||'pending',page=Number(url.searchParams.get('page')||0);
   if(!['all','pending','approved','rejected'].includes(status)||!Number.isSafeInteger(page)||page<0||page>10000)fail('Invalid filter.');
   const rows=await db('partner_applications?select='+fields+'&order=created_at.desc,id.desc&limit=26&offset='+page*25+(status==='all'?'':'&review_status=eq.'+status));
   return json({success:true,applications:rows.slice(0,25),hasMore:rows.length>25,page});
  }
  if(request.headers.get('origin')!==url.origin||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))fail('Invalid request origin or content type.',403);
  const raw=await request.text();if(raw.length>5000)fail('Request too large.',413);
  let body;try{body=JSON.parse(raw);}catch{fail('Invalid request.');}
  if(!body||!validId(body.id)||!['approved','rejected','pending'].includes(body.status)||!Number.isSafeInteger(body.version)||body.version<0)fail('Invalid review.');
  const notes=String(body.notes||'').trim();if(notes.length>2000)fail('Review notes must be at most 2000 characters.');
  if(body.status==='rejected'&&!notes)fail('Add a reason for rejection.');
  const rows=await db('partner_applications?id=eq.'+body.id+'&review_version=eq.'+body.version+'&select='+fields,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({review_status:body.status,review_notes:notes,reviewed_at:new Date().toISOString(),reviewed_by:email,review_version:body.version+1})});
  if(!rows?.length)fail('This application changed. Refresh it before reviewing again.',409);
  return json({success:true,application:rows[0]});
 }catch(e){return json({success:false,message:e.status?e.message:'Unable to review partner applications.'},e.status||503);}
}
