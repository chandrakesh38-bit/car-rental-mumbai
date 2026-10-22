async function refreshAccountNav() {
  let customer = null;
  try { const r=await fetch('/api/customer-account',{credentials:'same-origin',cache:'no-store'}); if(r.ok)customer=(await r.json()).customer; } catch {}
  document.querySelectorAll('[data-account-link]').forEach(link=>{
    link.textContent=customer?'My Bookings':'Login';
    link.href=customer?'/my-bookings':'/customer-account';
    link.setAttribute('aria-label',customer?'View my bookings':'Login with mobile OTP');
  });
}
window.addEventListener('cwd:account-changed',refreshAccountNav);
window.addEventListener('pageshow',refreshAccountNav);
refreshAccountNav();
