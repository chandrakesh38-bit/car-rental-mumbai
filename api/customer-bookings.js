import { checkoutConfig, bookingView } from '../lib/customer-checkout.mjs';
import { requireCustomer, customerDb } from '../lib/customer-account.mjs';
export const config = {runtime:'edge'};
export default async function handler(request) {
  const headers={'Cache-Control':'private, no-store'};
  if(request.method!=='GET')return Response.json({success:false},{status:405,headers});
  try {
    const cfg=checkoutConfig(),customer=await requireCustomer(cfg,request);
    const rows=await customerDb(cfg,'cwd_checkout_bookings?mobile=eq.'+encodeURIComponent(customer.mobile)+'&select=*&order=created_at.desc&limit=50');
    return Response.json({success:true,bookings:await Promise.all((rows||[]).map(b=>bookingView(cfg,b)))},{headers});
  }catch(e){return Response.json({success:false,message:e.status?e.message:'Unable to load bookings.'},{status:e.status||503,headers});}
}
