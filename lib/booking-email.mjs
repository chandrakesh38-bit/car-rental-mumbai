import {customerDb} from './customer-account.mjs';

// Read only the customer-facing fields; never include booking access/session tokens.
export async function bookingEmailData(cfg, bookingId) {
 const id=encodeURIComponent(bookingId);
 const rows=await customerDb(cfg,'inquiries?booking_id=eq.'+id+'&select=booking_id,customer_email,customer_name,booking_status,payment_status,total_fare,paid_amount,trip_type,route,car_name&limit=1');
 if(!rows?.[0])return null;
 const trips=await customerDb(cfg,'cwd_checkout_bookings?booking_id=eq.'+id+'&select=booking_data&limit=1');
 return {...rows[0],trip:trips?.[0]?.booking_data||{}};
}
const clean=value=>typeof value==='string'?value.replace(/[\r\n\u0000-\u001f\u007f]+/g,' ').trim():'';
const amount=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
const money=value=>value===null?'Not available':'INR '+value.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
function date(value){
 // Checkout persists ISO instants. Reject ambiguous dates rather than guessing a timezone.
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value))return '';
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
 return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(d)+' IST (Asia/Kolkata)';
}
export function bookingEmail(b,eventType){
 const t=b.trip||{},fare=amount(b.total_fare),paid=amount(b.paid_amount);
 const payment=paid===0?'unpaid':paid!==null&&fare!==null?(paid>=fare?'paid':'partially paid'):clean(b.payment_status)||'Not available';
 const lines=['Car with Driver India', 'Booking ID: '+clean(b.booking_id)];
 const add=(label,value)=>{const v=clean(value);if(v)lines.push(label+': '+v);};
 add('Customer',b.customer_name);add('Trip type',b.trip_type||t.tripType);add('Route',b.route);
 add('From / pickup location',t.pickupLocation);add('To / destination',t.destination);
 add('Pickup',date(t.pickupAt));add('Return / final drop',date(t.returnAt));add('Vehicle',b.car_name);
 lines.push('Booking status: '+(clean(b.booking_status)||'Not available'),'Payment status: '+payment,'Fare: '+money(fare),'Paid: '+money(paid),'Balance: '+money(fare!==null&&paid!==null?Math.max(0,fare-paid):null),
 '','View booking details in My Bookings (sign in with your booking mobile number):','https://carswithdriverindia.com/my-bookings',
 '','Driver allocation is managed separately.','For support: +91 9702988465','','Car with Driver Mobility LLP','carswithdriverindia.com');
 // Plain text only: customer input is never interpreted as HTML.
 return {subject:'CWD '+clean(eventType).replaceAll('_',' ')+' - '+clean(b.booking_id),text:lines.join('\n')};
}
