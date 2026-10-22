// External-boundary emulator only. Application API handlers and pricing/OTP code are unmodified.
// This is NOT a PostgreSQL implementation and does not verify migration execution or RLS.
import {randomUUID,createHmac} from 'node:crypto';
import {fallbackLocationConfig} from '../../lib/location-config.mjs';
export const config=fallbackLocationConfig();
export const rates=[['Maruti Suzuki Dzire',14,500,'Sedan'],['WagonR',11,400,'Hatchback'],['Maruti Suzuki Ertiga',16,500,'SUV']].map(([full_name,outstation_rate_per_km,driver_allowance_per_day,segment],i)=>({full_name,outstation_rate_per_km,driver_allowance_per_day,customer_night_charge:400,is_active:true,display_order:i,local_pkg_8hr_80km:3000,local_extra_hour_rate:250,local_extra_km_rate:17,airport_t1_rate:1800,airport_t2_rate:2000,airport_nmia_rate:2500,segment,seating_capacity:i<2?4:6,bag_capacity:2}));
export const places=['Mumbai','Thane','Navi Mumbai','Vikhroli West','Pune','Lonavala','Nashik','Shirdi','Mahabaleshwar','Trimbakeshwar'].map(name=>({name,id:name.replaceAll(' ','-')}));
export const state={tables:{with_driver_rates:rates,pricing_rules:[{rule_name:'Minimum Outstation KM/Day',rule_value:300}]},providerOrders:{},providerPayments:{},emailFails:false,orderFails:false,requests:[],mail:[]};
const table=n=>state.tables[n] ||= [];
const json=x=>Response.json(x);
const problem=(message,status=409)=>Response.json({message},{status});
export const sign=(value,secret=process.env.RAZORPAY_KEY_SECRET)=>createHmac('sha256',secret).update(value).digest('hex');
export function installFixtures(){
 Object.assign(process.env,{CWD_CHECKOUT_ENABLED:'true',CWD_CUSTOMER_ACCOUNTS_ENABLED:'true',CWD_CUSTOMER_SUPABASE_URL:'https://checkout.fixture.invalid',CWD_CUSTOMER_SUPABASE_ANON_KEY:'sb_publishable_fixture',CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_URL:'https://checkout.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',GOOGLE_MAPS_SERVER_API_KEY:'fixture-maps',MSG91_AUTH_KEY:'fixture-msg91-secret',NEXT_PUBLIC_MSG91_WIDGET_ID:'fixture-widget',NEXT_PUBLIC_MSG91_WIDGET_TOKEN:'fixture-widget-token',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'fixture-razor-secret',RAZORPAY_WEBHOOK_SECRET:'fixture-webhook-secret',RESEND_API_KEY:'fixture-email-key',CWD_NOTIFICATION_WORKER_SECRET:'fixture-worker-secret',CWD_TRANSACTIONAL_EMAIL_ENABLED:'true',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'testing'});
 globalThis.fetch=async(input,options={})=>{const u=new URL(String(input)),method=options.method||'GET';let body={};try{body=JSON.parse(options.body||'{}')}catch{};state.requests.push({host:u.hostname,path:u.pathname,method});
  if(u.hostname==='control.msg91.com'){const claims=JSON.parse(Buffer.from(body['access-token'].split('.')[1],'base64url'));return json({type:'success',message:claims.mobile});}
  if(u.hostname==='api.resend.com'){if(state.emailFails)return problem('Provider unavailable',503);state.mail.push(body);return json({id:randomUUID()});}
  if(u.hostname==='places.googleapis.com')return json({suggestions:places.filter(p=>p.name.toLowerCase().includes(body.input.toLowerCase())).map(p=>({placePrediction:{placeId:p.id,text:{text:p.name},structuredFormat:{mainText:{text:p.name},secondaryText:{text:'TEST fixture, India'}}}}))});
  if(u.hostname==='maps.googleapis.com'){const city=u.searchParams.get('place_id')?.replaceAll('-',' ')||'Mumbai';return json({status:'OK',results:[{formatted_address:city+', Maharashtra, India',geometry:{location:{lat:19.1,lng:72.9}},address_components:[{types:['locality'],long_name:city==='Vikhroli West'?'Mumbai':city},{types:['administrative_area_level_1'],long_name:'Maharashtra'},{types:['country'],long_name:'India'}]}]});}
  if(u.hostname==='routes.googleapis.com'){const id=body.destination?.placeId||body.origin?.placeId;const km=String(body.origin?.address||body.destination?.address).includes('Airport')?20:({Pune:300,Lonavala:170,Nashik:340,Shirdi:480,Mahabaleshwar:520,Trimbakeshwar:360}[id]||300)/2;return json({routes:[{distanceMeters:km*1000,duration:'7200s',legs:[{distanceMeters:km*1000,duration:'7200s'}]}]});}
  if(u.hostname==='api.razorpay.com'){
   if(u.pathname==='/v1/orders'&&method==='GET')return json({items:Object.values(state.providerOrders).filter(o=>o.receipt===u.searchParams.get('receipt'))});
  if(u.pathname==='/v1/orders'&&method==='POST'){if(state.orderFails)return problem('Provider unavailable',503);const id='order_'+randomUUID().replaceAll('-','');const order={id,...body};state.providerOrders[id]=order;return json(order);}
   if(u.pathname.startsWith('/v1/payments/'))return json(state.providerPayments[u.pathname.split('/').pop()]||{});
   throw Error('Unexpected Razorpay operation '+u.pathname);
  }
  if(u.hostname!=='checkout.fixture.invalid')throw Error('External network blocked: '+u.hostname);
  const name=u.pathname.split('/').pop();
  if(state.databaseFetch && (u.pathname.includes('/rpc/') || /^(cwd_|inquiries$|booking_payments$|otp_proof_uses$)/.test(name)))return state.databaseFetch(u,method,body);
  if(u.pathname.includes('/rpc/'))return emulateRpc(name,body);
  const rows=table(name);const match=row=>[...u.searchParams].every(([key,value])=>['select','order','limit','on_conflict'].includes(key)||!value.startsWith('eq.')||String(row[key])===value.slice(3));
  if(method==='GET'){let selected=rows.filter(match);if(u.searchParams.get('order')?.endsWith('.desc'))selected=[...selected].reverse();if(u.searchParams.has('limit'))selected=selected.slice(0,Number(u.searchParams.get('limit')));return json(selected);}
  if(method==='PATCH'){rows.filter(match).forEach(row=>Object.assign(row,body));return json(rows.filter(match));}
  if(method==='POST'){rows.push(body);return json([body]);}
  throw Error('Unexpected fixture database operation');
 };
}
function event(bookingId,type,key){if(table('cwd_booking_events').some(e=>e.event_key===key))return;const e={id:randomUUID(),booking_id:bookingId,event_type:type,event_key:key,created_at:new Date().toISOString()};table('cwd_booking_events').push(e);for(const channel of ['email','sms','whatsapp'])table('cwd_notification_outbox').push({id:randomUUID(),event_id:e.id,channel,status:'pending',attempts:0});}
function emulateRpc(name,b){
 if(name==='cwd_customer_login'){
  if(table('cwd_customer_login_uses').some(x=>x.nonce===b.p_nonce))return problem('Proof reused');
  table('cwd_customer_login_uses').push({nonce:b.p_nonce});let account=table('cwd_customers').find(c=>c.mobile===b.p_mobile);
  if(!account){account={id:randomUUID(),mobile:b.p_mobile,display_name:'',created_at:new Date().toISOString()};table('cwd_customers').push(account);}
  table('cwd_customer_sessions').push({session_hash:b.p_session_hash,customer_id:account.id,expires_at:b.p_session_expires,revoked_at:null});return json(account);
 }
 if(name==='cwd_checkout_create'){
  const existing=table('cwd_checkout_bookings').find(x=>x.submission_key===b.p_submission);if(existing)return existing.mobile===b.p_mobile&&existing.access_hash===b.p_access_hash?json({booking_id:existing.booking_id}):problem('Collision');
  if(table('otp_proof_uses').some(x=>x.nonce===b.p_nonce))return problem('Proof reused');
  const id='CWD-WD-261019-'+String(1000+table('cwd_checkout_bookings').length),at=new Date().toISOString();
  table('otp_proof_uses').push({nonce:b.p_nonce});table('cwd_checkout_bookings').push({booking_id:id,submission_key:b.p_submission,otp_nonce:b.p_nonce,mobile:b.p_mobile,access_hash:b.p_access_hash,payment_choice:b.p_choice,total_paise:b.p_total,booking_data:b.p_data,created_at:at});
  table('inquiries').push({booking_id:id,customer_name:b.p_contact.name,customer_phone:b.p_mobile,customer_email:b.p_contact.email,car_name:b.p_contact.car,route:b.p_contact.route,total_fare:b.p_total/100,paid_amount:0,payment_status:'pending',booking_status:b.p_choice===0?'confirmed':'received',created_at:at});event(id,b.p_choice===0?'booking_confirmed':'payment_pending','created:'+id);return json({booking_id:id});
 }
 if(name==='cwd_checkout_reserve_order'){
  const row=table('cwd_checkout_bookings').find(x=>x.booking_id===b.p_booking),inquiry=table('inquiries').find(x=>x.booking_id===b.p_booking);const open=table('cwd_checkout_orders').find(x=>x.booking_id===b.p_booking&&['creating','pending'].includes(x.state));if(open)return json({...open,new_order:false});
  const amount=b.p_balance?Math.round((inquiry.total_fare-inquiry.paid_amount)*100):Math.min(Math.round((inquiry.total_fare-inquiry.paid_amount)*100),Math.round(inquiry.total_fare*100*row.payment_choice/100));if(amount<=0)return problem('No payment due');
  const o={id:randomUUID(),booking_id:b.p_booking,amount_paise:amount,payment_type:b.p_balance?'balance':row.payment_choice===20?'advance':'full',state:'creating',created_at:new Date().toISOString()};table('cwd_checkout_orders').push(o);return json({...o,new_order:true});
 }
 if(name==='cwd_checkout_attach_order'){const o=table('cwd_checkout_orders').find(x=>x.id===b.p_id);Object.assign(o,{state:'pending',razorpay_order_id:b.p_order});return json(null);}
 if(name==='cwd_checkout_capture'){
  const o=table('cwd_checkout_orders').find(x=>x.razorpay_order_id===b.p_order);if(!o||o.amount_paise!==b.p_amount||b.p_currency!=='INR')return problem('Mismatch');if(o.state==='paid')return o.razorpay_payment_id===b.p_payment?json({duplicate:true}):problem('Duplicate payment');
  if(table('cwd_checkout_orders').some(x=>x.razorpay_payment_id===b.p_payment))return problem('Replay');
  Object.assign(o,{state:'paid',razorpay_payment_id:b.p_payment});table('booking_payments').push({booking_id:o.booking_id,amount:b.p_amount/100,status:'paid',payment_type:o.payment_type,razorpay_payment_id:b.p_payment,paid_at:new Date().toISOString()});
  const row=table('inquiries').find(x=>x.booking_id===o.booking_id);row.paid_amount=table('booking_payments').filter(x=>x.booking_id===row.booking_id&&x.status==='paid').reduce((n,x)=>n+x.amount,0);row.payment_status=row.paid_amount>=row.total_fare?'paid':'partially_paid';if(!['cancelled','completed'].includes(row.booking_status))row.booking_status='confirmed';event(row.booking_id,'payment_captured','captured:'+b.p_payment);return json({paid:row.paid_amount});
 }
 if(name==='cwd_notification_claim'){const rows=table('cwd_notification_outbox').filter(x=>['pending','failed'].includes(x.status)&&x.attempts<5).slice(0,20);rows.forEach(x=>{x.status='processing';x.attempts++;});return json(rows);}
 throw Error('Unsupported test RPC: '+name);
}
export function simulateCapture(orderId){const order=state.providerOrders[orderId];if(!order)throw Error('No provider order');const id='pay_'+randomUUID().replaceAll('-','');state.providerPayments[id]={id,order_id:orderId,amount:order.amount,currency:'INR',status:'captured',captured:true};return {razorpay_order_id:orderId,razorpay_payment_id:id,razorpay_signature:sign(orderId+'|'+id)};}
