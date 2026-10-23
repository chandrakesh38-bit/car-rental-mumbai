export const config={runtime:'edge'};
export default async function handler(request){
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 const reply=(data,status=200)=>Response.json(data,{status,headers});
 try{
  if(!['GET','POST'].includes(request.method))return reply({message:'Method not allowed'},405);
  const token=request.headers.get('x-feedback-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))return reply({message:'Open the private feedback link from your WhatsApp message.'},400);
  let rating=null,comment=null;
  if(request.method==='POST'){
   if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply({message:'Invalid request'},403);
   const raw=await request.text();if(raw.length>10000)return reply({message:'Feedback is too long'},413);
   let body;try{body=JSON.parse(raw);}catch{return reply({message:'Invalid feedback'},400);}
   if(!body||!Number.isInteger(body.rating)||body.rating<1||body.rating>5||typeof body.comment!=='string'||body.comment.length>2000)return reply({message:'Choose a rating from 1 to 5; comments can contain up to 2,000 characters.'},400);
   rating=body.rating;comment=body.comment.trim();
  }
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)return reply({message:'Feedback is temporarily unavailable.'},503);
  const response=await fetch(base+'/rest/v1/rpc/cwd_feedback_access',{method:'POST',signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_token:token,p_rating:rating,p_comment:comment})});
  if(!response.ok)return reply({message:'This feedback link is invalid or expired. Contact our team for help.'},400);
  return reply({success:true,...await response.json()});
 }catch{return reply({message:'Unable to save feedback. Please retry.'},503);}
}
