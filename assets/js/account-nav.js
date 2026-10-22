async function refreshAccountNav() {
  let customer = null;
  try { const r=await fetch('/api/customer-account',{credentials:'same-origin',cache:'no-store'}); if(r.ok)customer=(await r.json()).customer; } catch {}
  document.querySelectorAll('[data-account-logout]').forEach(button=>button.hidden=!customer);
  document.querySelectorAll('[data-account-link]').forEach(link=>{
    link.textContent=customer?'My Bookings':'Login';
    link.href=customer?'/my-bookings':'/customer-account';
    link.setAttribute('aria-label',customer?'View my bookings':'Login with mobile OTP');
  });
}
window.addEventListener('cwd:account-changed',refreshAccountNav);
window.addEventListener('pageshow',refreshAccountNav);
refreshAccountNav();

document.querySelectorAll('[data-account-logout]').forEach(button=>button.addEventListener('click',async()=>{
 button.disabled=true;
 try {
  const r=await fetch('/api/customer-account',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
  if(!r.ok)throw Error('Unable to sign out. Please retry.');
  Object.keys(sessionStorage).filter(key=>key.startsWith('cwd-booking:')).forEach(key=>sessionStorage.removeItem(key));location.replace('/customer-account');
 }catch(e){button.disabled=false;const message=document.getElementById('booking-message');if(message)message.textContent=e.message;}
}));
