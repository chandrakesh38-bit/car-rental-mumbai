import assert from 'node:assert/strict';
import {bookingView} from '../lib/customer-checkout.mjs';
const originalFetch=globalThis.fetch;
let allocationResponse;
globalThis.fetch=async url=>{
 const table=new URL(url).pathname.split('/').pop();
 if(table==='cwd_vendor_allocations')return allocationResponse.clone();
 return Response.json(table==='inquiries'?[{booking_id:'CWD-WD-261023-0001',total_fare:5000,paid_amount:0}]:[]);
};
try {
 const read=()=>bookingView({url:'https://testing.invalid',key:'fixture'},{booking_id:'CWD-WD-261023-0001'});
 allocationResponse=Response.json({code:'PGRST205',message:"Could not find the table 'public.cwd_vendor_allocations' in the schema cache"},{status:404});
 assert.equal((await read()).driver_status,'Allocation pending');
 for(const [status,code,message] of [[403,'42501','permission denied'],[503,'','unavailable'],[400,'42703','column missing'],[404,'PGRST205','another table missing']]){
  allocationResponse=Response.json({code,message},{status});await assert.rejects(read(),/temporarily unavailable/);
 }
 allocationResponse=Response.json([{status:'allocated',driver_name:'Test Driver',driver_mobile:'fixture',vehicle_number:'TEST'}]);
 assert.equal((await read()).driver.name,'Test Driver');
 console.log('PASS missing optional driver table; real allocation; permission, server and schema errors remain failures');
}finally{globalThis.fetch=originalFetch;}
