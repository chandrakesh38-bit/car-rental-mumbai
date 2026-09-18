import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
process.env.RESEND_API_KEY = 'test-key-not-real';
process.env.SUPABASE_URL = 'https://test.supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
const { default: booking } = await import('../api/booking-enquiry.js');
const { default: partner } = await import('../api/partner-application.js');
const calls = [];
let fail = '', saves = 0, deletes = 0;
globalThis.fetch = async (url, options) => {
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  if (url === 'https://api.resend.com/emails') {
    calls.push({ body, headers: options.headers });
    if (fail === 'network') throw new Error('offline');
    if (fail === 'all' || (fail === 'customer' && body.to[0] !== 'carwithdriver.vikhroli@gmail.com')) return Response.json({ error: 'rejected' }, { status: 503 });
    return Response.json({ id: 'email-accepted' });
  }
  assert.ok(url.startsWith(process.env.SUPABASE_URL));
  if (options.method === 'DELETE') deletes++;
  if (url.includes('/rest/')) {
    saves++;
    if (fail === 'database') return new Response('DB failed', { status: 500 });
    return Response.json([{ ...body, application_number: 'CWD-P-12345' }]);
  }
  return Response.json({});
};
const payload = { bookingId: 'CWD-WD-260919-1234', name: 'Test Customer', phone: '9999999999', email: 'test@example.com', details: 'Outstation\nPickup: Mumbai\nReturn: 26 Sep 2026 10:00 PM\nTotal: 10000' };
const book = (data=payload) => booking(new Request('https://test.example/api/booking-enquiry', { method: 'POST', headers: { origin: 'https://test.example' }, body: JSON.stringify(data) }));
let result = await (await book()).json();
assert.equal(result.success, true); assert.equal(result.customer_email_sent, true);assert.equal(calls.length, 2);
assert.deepEqual(calls[0].body.to, ['carwithdriver.vikhroli@gmail.com']);
assert.match(calls[0].body.from, /noreply@carswithdriverindia.com/);
assert.ok(calls[0].body.text.includes(payload.details));assert.match(calls[1].body.text, /NOT a confirmed booking/);
const firstKey=calls[0].headers['Idempotency-Key'];await book();assert.equal(calls[2].headers['Idempotency-Key'], firstKey);
assert.equal((await book({...payload,email:'bad'})).status,400);
for (const failure of ['customer','all','network']) {fail=failure;result=await(await book()).json();assert.equal(result.success,true);assert.equal(result.customer_email_sent,false);}
fail='';delete process.env.RESEND_API_KEY;result=await(await book()).json();assert.equal(result.success,true);assert.equal(result.admin_email_sent,false);process.env.RESEND_API_KEY='test-key-not-real';
function application() {
 const form=new FormData();for(const[k,v]of Object.entries({name:'Partner Test',phone:'9999999999',email:'partner@example.com',alternate_phone:'8888888888',car_brand:'Test Brand',car_model:'Test Model',mfg_year:'2024'}))form.set(k,v);
 for(const field of ['rc','insurance','puc','dl','aadhaar','pan'])form.set(field,new File(['test'],field+'.pdf',{type:'application/pdf'}));
 form.append('vehicle_photos',new File(['test'],'front.jpg',{type:'image/jpeg'}));
 return new Request('https://test.example/api/partner-application',{method:'POST',body:form});
}
calls.length=0;result=await(await partner(application())).json();assert.equal(result.success,true);assert.equal(result.application_number,'CWD-P-12345');assert.equal(calls.length,2);assert.match(calls[1].body.text,/does not mean your partnership is approved/);assert.match(calls[0].body.text,/Test Model/);assert.match(calls[0].body.text,/1 uploaded/);assert.doesNotMatch(JSON.stringify(calls),/partner-documents|\.pdf|front\.jpg|storage\/v1|signed/);
for(const failure of ['customer','all','network']) {fail=failure;const before=deletes;result=await(await partner(application())).json();assert.equal(result.success,true);assert.equal(result.customer_email_sent,false);assert.equal(deletes,before,'email failures must not delete uploads');}
fail='database';calls.length=0;result=await(await partner(application())).json();assert.equal(result.success,false);assert.equal(calls.length,0,'no emails before persistence');assert.ok(deletes>0);
// Execute the existing frontend submit functions with controlled form values.
const source=await readFile(new URL('../assets/js/booking.js',import.meta.url),'utf8');
assert.doesNotMatch(source,/api.web3forms.com|RESEND_API_KEY/);
const values={ 'cust-name':'Test','cust-phone':'9999999999','cust-email':'test@example.com','cust-address':'Test address',
 'wd-local-pickup':'Mumbai','wd-local-package':'8hr_80km','wd-local-date':'2099-01-01','wd-local-hour':'9','wd-local-ampm':'AM',
 'wd-out-pickup':'Mumbai','wd-out-destination':'Pune','wd-out-pdate':'2099-01-01','wd-out-phour':'9','wd-out-pampm':'AM','wd-out-rdate':'2099-01-03','wd-out-rhour':'10','wd-out-rampm':'PM',
 'wd-airport-terminal':'t2','wd-airport-pickup':'Vikhroli','wd-airport-date':'2099-01-01','wd-airport-hour':'9','wd-airport-ampm':'AM',
 'sd-cust-name':'SD Test','sd-cust-phone':'9999999999','sd-cust-email':'sd@example.com','sd-cust-alt-phone':'8888888888','sd-cust-address':'Delivery address','sd-cust-city':'Mumbai','sd-cust-state':'Maharashtra','sd-cust-pincode':'400083','sd-delivery-location-input':'Vikhroli',
 'sd-pdate':'2099-01-01','sd-phour':'9','sd-pampm':'AM','sd-rdate':'2099-01-01','sd-rhour':'10','sd-rampm':'PM'};
const texts={'sd-review-duration':'13 actual hours / 24 billed hours','sd-review-deliv-mode':'Home Delivery','sd-review-base-fare':'2400','sd-review-deposit':'5000','sd-review-delivery-charge':'100','disp-total-final-fare':'7500'};
let requests=[],closed=0,shown=[],alerts=[],valid=true;
const context=vm.createContext({console,Date,Math,document:{getElementById:id=>({value:values[id],innerText:texts[id]})},
 validateJourneyAndOpenBooking:()=>valid,validateSelfDriveJourney:()=>valid,updateSDFareReview:()=>{},
 wdFleet:[{name:'Sedan',rates:{local:{extraKm:15},outstationPerKm:15,driverAllowance:300}}],chosenCarName:'Sedan',chosenFareAmount:10000,wdOutstationKm:600,wdOutstationDays:3,currentDeliveryMode:'home',selectedCarObj:{fullName:'Test Car',brand:'Brand',rateHour:'100/hour'},
 createLocalDateTime:(d,h,a)=>new Date(d+'T'+String(h%12+(a==='PM'?12:0)).padStart(2,'0')+':00:00'),formatBookingDateTime:d=>d.toISOString(),
 closeModal:()=>closed++,closeSDModal:()=>closed++,showSuccessModal:(...v)=>shown.push(v),showCustomAlert:s=>alerts.push(s),
 fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json({success:true,booking_id:JSON.parse(options.body).bookingId,customer_email_sent:false,admin_email_sent:true});}});
vm.runInContext(source.slice(source.indexOf('function generateBookingId()'),source.indexOf('let lastPartnerForm')),context);
vm.runInContext(source.slice(source.indexOf('        function sendWithDriverBookingEmail('),source.indexOf('        window.onload')),context);
const event=()=>({preventDefault(){},target:{dataset:{},querySelector:()=>({disabled:false})}});
for(const mode of ['local','outstation','airport']){context.currentWDSubTab=mode;context.currentAirportType='drop';const e=event();await Promise.all([context.handleBookingSubmit(e),context.handleBookingSubmit(e)]);assert.equal(requests.length,1);assert.match(requests[0].body.details,/Test address/);assert.equal(shown.at(-1)[1].customer_email_sent,false);requests=[];}
await context.handleSDBookingSubmit(event());assert.match(requests[0].body.details,/13 actual hours \/ 24 billed hours/);assert.match(requests[0].body.details,/8888888888/);assert.match(requests[0].body.details,/Delivery address/);assert.match(requests[0].body.details,/2099-01-01 10:00 PM/);
requests=[];valid=false;await context.handleBookingSubmit(event());await context.handleSDBookingSubmit(event());assert.equal(requests.length,0,'validation blocks submission');
console.log('PASS: booking/partner success, email rejection/network/missing key, private uploads, persistence failure, references/idempotency, all booking payloads, duplicate clicks and validation.');
