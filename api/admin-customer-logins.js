import {customerConfig,customerDb,fail} from '../lib/customer-account.mjs';
export const config={runtime:'edge'};
export default async function handler(request){
 const headers={'Cache-Control':'private, no-store'};
 try{
  if(request.method!=='GET')return Response.json({success:false},{status:405,headers});
  const cfg=customerConfig(),token=request.headers.get('authorization');
  if(!/^Bearer \S+$/.test(token||''))fail('Admin authentication required.',401);
  // User explicitly approved read-only verification against the existing admin
  // portal's identity provider. Customer records remain in isolated testing.
  const authUrl='https://pwciaihqkfnlenxxiown.supabase.co';
  const key='sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz';
  const r=await fetch(authUrl+'/auth/v1/user',{headers:{apikey:key,Authorization:token},signal:AbortSignal.timeout(10000)});
  if(!r.ok)fail('Admin session expired.',401);
  const user=await r.json(),allowed=String(process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!user.email_confirmed_at||!allowed.includes(String(user.email||'').toLowerCase()))fail('Admin access denied.',403);
  const page=Number(new URL(request.url).searchParams.get('page')||0);
  if(!Number.isSafeInteger(page)||page<0||page>10000)fail('Invalid page.');
  const rows=await customerDb(cfg,'cwd_customer_login_alerts?select=id,mobile,source,created_at,email_status&order=created_at.desc&limit=51&offset='+page*50);
  return Response.json({success:true,logins:rows.slice(0,50),hasMore:rows.length>50,page},{headers});
 }catch(e){return Response.json({success:false,message:e.status?e.message:'Unable to load customer logins.'},{status:e.status||503,headers});}
}
