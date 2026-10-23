import { requestFormOtp, clearFormOtp, bindAutomaticOtp } from './mobile-otp.js';
const login = document.getElementById('login-form');
const panel = document.getElementById('profile-panel');
const profile = document.getElementById('profile-form');
const status = document.getElementById('account-message');
let busy = false;
function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
function display(customer) {
  window.dispatchEvent(new Event('cwd:account-changed'));
  login.hidden = Boolean(customer); panel.hidden = !customer;
  document.getElementById('verified-mobile').textContent = customer ? '+' + customer.mobile : '';
  document.getElementById('display-name').value = customer?.display_name || '';
}
async function api(body, suffix = '') {
  const response = await fetch('/api/customer-account' + suffix, {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(30000),
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw Object.assign(new Error(data.message || 'Please retry.'), { status: response.status });
  return data;
}
async function perform(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('.card button').forEach(b => b.disabled = true);
  try { await action(); }
  catch (error) {
    if (error.status === 401) display(null);
    message(error.cancelled ? 'Sign-in cancelled. You can try again.' : error.message, !error.cancelled);
  } finally { busy = false; document.querySelectorAll('.card button').forEach(b => b.disabled = false); }
}
login.addEventListener('submit', event => {
  event.preventDefault();
  if (!login.reportValidity()) return;
  perform(async () => {
    // Check the isolated backend before loading MSG91 or sending an OTP.
    await api(null, '?config=1');
    const phone = document.getElementById('account-phone');
    let proof;
    try {
      proof = await requestFormOtp(login, 'account-phone', 'customer');
      const data = await api({ action: 'login', phone: phone.value, proof });
      const back=new URLSearchParams(location.search).get('return_to');
      if(back && /^\/booking-confirmation\?booking_id=/.test(back)){location.assign(back);return;}
      display(data.customer); message('You are signed in. View My Bookings to see trip details or request changes.');
      document.getElementById('display-name').focus();
    } finally { clearFormOtp(login); }
  });
});
profile.addEventListener('submit', event => {
  event.preventDefault();
  if (!profile.reportValidity()) return;
  perform(async () => {
    const data = await api({ action: 'profile', display_name: document.getElementById('display-name').value });
    display(data.customer); message('Your profile has been saved.');
  });
});
document.getElementById('logout').addEventListener('click', () => perform(async () => {
  await api({ action: 'logout' }); display(null); login.reset(); clearFormOtp(login);
  message('You have signed out.'); document.getElementById('account-phone').focus();
}));
// Revalidate on returning to this page, including back-forward cache restores.
async function load() {
  try { const data = await api(); display(data.customer); message(''); }
  catch (error) {
    display(null);
    if (error.status === 401) message('');
    else { login.hidden = true; message(error.message, true); }
  }
}
window.addEventListener('pageshow', event => { if (event.persisted) load(); });
load();

bindAutomaticOtp(document.getElementById('account-phone'),()=>login.requestSubmit(),()=>!busy&&!login.hidden);
