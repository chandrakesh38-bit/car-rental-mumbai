import {checkoutConfig} from '../lib/customer-checkout.mjs';
export const config={runtime:'edge'};
export default async function handler(request){
 if(request.method!=='GET')return Response.json({success:false},{status:405});
 try{
  const isolated=process.env.CWD_CHECKOUT_ENABLED==='true';
  const url=isolated?checkoutConfig().url:(process.env.SUPABASE_URL||'https://pwciaihqkfnlenxxiown.supabase.co');
  const key=isolated?process.env.CWD_CUSTOMER_SUPABASE_ANON_KEY:(process.env.SUPABASE_ANON_KEY||'sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz');
  let publicKey=key?.startsWith('sb_publishable_');
  if(!publicKey&&key?.split('.').length===3){try{publicKey=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon';}catch{}}
  if(!publicKey||key===process.env.SUPABASE_SERVICE_ROLE_KEY||key===process.env.CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY)throw Error();
  return Response.json({success:true,url,key,checkoutEnabled:isolated},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({success:false,message:'Public catalogue configuration is unavailable.'},{status:503});}
}
