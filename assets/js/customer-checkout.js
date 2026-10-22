async function api(body, suffix = '', token = '') {
  const r = await fetch('/api/customer-checkout' + suffix, { credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(45000),
    headers: { 'Content-Type':'application/json', ...(token ? {Authorization:'Booking '+token} : {}) },
    ...(body ? { method:'POST', body:JSON.stringify(body) } : {}) });
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data.message || 'Checkout is unavailable.');
  return data;
}
export const checkoutReady = () => api(null, '?config=1');
export const getLoginCoupon = async () => (await api(null,'?coupon=1')).coupon;
export const quoteLoginCoupon = async body => (await api({action:'quote',...body})).quote;
export const cancelPendingBooking = id => api({action:'cancel-pending',booking_id:id},'',sessionStorage.getItem('cwd-booking:'+id)||'');
export async function submitCheckout(body, form) {
  form.dataset.submissionKey ||= crypto.randomUUID();
  const result = await api({action:'create', ...body, submissionKey:form.dataset.submissionKey});
  sessionStorage.setItem('cwd-booking:'+result.booking_id, result.access_token);
  location.assign('/booking-confirmation?booking_id='+encodeURIComponent(result.booking_id)+(body.paymentChoice ? '&pay=1' : ''));
}
export async function startPayment(id, balance = false) {
  const token = sessionStorage.getItem('cwd-booking:'+id) || '';
  const {order,key} = await api({action:'order',booking_id:id,balance},'',token);
  if (!window.Razorpay) await new Promise((resolve,reject) => {
    const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';
    script.onload=resolve;script.onerror=()=>reject(Error('Payment window could not load. Your booking is saved and payment remains pending.'));
    document.head.append(script);
  });
  return new Promise((resolve,reject) => {
    const gateway = new window.Razorpay({key,order_id:order.razorpay_order_id,amount:order.amount_paise,currency:'INR',
      name:'Car With Driver India',description:'Booking '+id,theme:{color:'#153e68'},
      handler:async result=>{try {resolve(await api({action:'verify',booking_id:id,...result},'',token));} catch(e){reject(e);}},
      modal:{ondismiss:()=>reject(Error('Payment not completed. Your booking is saved; payment remains pending.'))} });
    gateway.on('payment.failed',()=>{gateway.close();reject(Error('Payment failed. No payment has been confirmed; your booking is saved for follow-up.'));});
    gateway.open();
  });
}
export async function getBooking(id) {
  return (await api(null,'?booking_id='+encodeURIComponent(id),sessionStorage.getItem('cwd-booking:'+id)||'')).booking;
}

export async function getCheckoutCustomer() {
 const response=await fetch('/api/customer-account',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(response.status===401)return null;
 const data=await response.json();
 if(!response.ok||!data.success)throw Error('Unable to check your session. Please retry.');
 return data.customer;
}
