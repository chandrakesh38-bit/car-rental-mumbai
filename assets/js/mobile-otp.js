const instances = new WeakMap();
let sdkPromise, sdkBusy = false;
const normalize = value => { const n = value.replace(/[\s()+-]/g, ''); return /^[6-9]\d{9}$/.test(n) ? '91' + n : /^91[6-9]\d{9}$/.test(n) ? n : ''; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function loadSdk(captcha) {
  if (!sdkPromise) sdkPromise = (async () => {
    const response = await fetch('/api/mobile-otp', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || !config.success) throw Error(config.message || 'Mobile verification is unavailable. Please retry.');
    if (!window.initSendOTP) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => reject(Error('OTP service took too long to load. Please retry.')), 20000);
      script.src = 'https://verify.msg91.com/otp-provider.js';
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error('Could not load OTP service. Check your connection and retry.')); };
      document.head.append(script);
    });
    window.initSendOTP({
  widgetId: config.widgetId,
  tokenAuth: config.tokenAuth,
  exposeMethods: true,
  captchaRenderId: captcha.id,
  success: (data) => {
    console.log('MSG91 success:', data);
  },
  failure: (error) => {
    console.error('MSG91 failure:', error);
  }
});
    for (let i = 0; i < 200; i++) {
      const data = window.getWidgetData?.();
      if (window.sendOtp && window.verifyOtp && data?.otpLength) return data;
      await pause(100);
    }
    const debug = {
  initSendOTP: typeof window.initSendOTP,
  sendOtp: typeof window.sendOtp,
  verifyOtp: typeof window.verifyOtp,
  getWidgetData: typeof window.getWidgetData,
  widgetData: typeof window.getWidgetData === 'function'
    ? window.getWidgetData()
    : null
};

throw Error(
  'OTP DEBUG: ' + JSON.stringify(debug)
);

  })().catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}
function sdkCall(method, value, reqId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('OTP request timed out. Please retry.')), 30000);
    const success = result => { clearTimeout(timer); result?.type === 'error' ? reject(Error('OTP request failed. Please retry.')) : resolve(result); };
    const failure = () => { clearTimeout(timer); reject(Error(method === 'verifyOtp' ? 'Incorrect or expired OTP. Please try again or resend.' : 'Unable to send OTP. Complete the security check, wait a moment, and retry.')); };
    try { window[method](value, success, failure, reqId); } catch { failure(); }
  });
}
export function mountMobileOtp(phone, purpose) {
  if (!phone || instances.has(phone)) return instances.get(phone);
  if (!document.querySelector('link[data-mobile-otp]')) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/assets/css/mobile-otp.css'; css.dataset.mobileOtp = ''; document.head.append(css);
  }
  const box = document.createElement('section'); box.className = 'mobile-otp'; box.setAttribute('aria-label', 'Mobile verification');
  box.innerHTML = '<button type="button" data-send>Send OTP</button><div class="otp-captcha"></div><div data-code hidden><p>Enter the OTP sent to your mobile</p><div class="otp-digits" role="group" aria-label="OTP digits"></div><div class="otp-actions"><button type="button" data-verify>Verify OTP</button><button type="button" data-resend>Resend OTP</button></div></div><p class="otp-message" role="status" aria-live="polite">Verify your mobile number before submitting.</p>';
  phone.insertAdjacentElement('afterend', box);
  const send = box.querySelector('[data-send]'), verify = box.querySelector('[data-verify]'), resend = box.querySelector('[data-resend]'), code = box.querySelector('[data-code]'), digits = box.querySelector('.otp-digits'), message = box.querySelector('.otp-message');
  let version = 0, busy = false, mobile = '', reqId = '', proof = '', expiresAt = 0, retryAt = 0, retrySeconds = 30;
  const report = (text, error = false) => { message.textContent = text; message.className = 'otp-message' + (error ? ' otp-error' : proof ? ' otp-success' : ''); };
  function render() {
    send.disabled = busy; verify.disabled = busy; resend.disabled = busy || Date.now() < retryAt;
    resend.textContent = Date.now() < retryAt ? `Resend in ${Math.ceil((retryAt - Date.now()) / 1000)}s` : 'Resend OTP';
    send.hidden = Boolean(reqId || proof); code.hidden = !reqId || Boolean(proof);
    for (const input of digits.children) input.disabled = busy;
    box.setAttribute('aria-busy', String(busy));
  }
  function reset() { version++; mobile = ''; reqId = ''; proof = ''; expiresAt = 0; digits.replaceChildren(); report('Verify your mobile number before submitting.'); render(); }
  phone.addEventListener('input', reset); phone.closest('form')?.addEventListener('reset', reset);
  setInterval(() => { if (proof && Date.now() >= expiresAt) { reset(); report('Verification expired. Please verify your mobile again.'); } render(); }, 1000);
  function buildDigits(length) {
    digits.replaceChildren();
    for (let i = 0; i < length; i++) {
      const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = i === 0 ? 'one-time-code' : 'off'; input.setAttribute('aria-label', `OTP digit ${i + 1} of ${length}`);
      input.oninput = () => { const text = input.value.replace(/\D/g, ''); input.value = text.slice(0, 1); for (let j = 1; j < text.length && i + j < length; j++) digits.children[i + j].value = text[j]; if (text) digits.children[Math.min(i + Math.max(1, text.length), length - 1)].focus(); };
      input.onpaste = event => { event.preventDefault(); input.value = event.clipboardData.getData('text'); input.oninput(); };
      input.onkeydown = event => { if (event.key === 'Backspace' && !input.value && i > 0) digits.children[i - 1].focus(); if (event.key === 'Enter') { event.preventDefault(); verify.click(); } };
      digits.append(input);
    }
  }
  async function run(action) {
    if (busy || sdkBusy) return;
    const currentMobile = normalize(phone.value);
    if (!currentMobile) { report('Enter a valid 10-digit mobile number first.', true); phone.focus(); return; }
    if (action !== 'send' && currentMobile !== mobile) { reset(); return; }
    if (action === 'resend' && Date.now() < retryAt) return;
    const currentVersion = version;
    busy = true; sdkBusy = true; render(); report(action === 'verify' ? 'Verifying OTP…' : 'Sending OTP…');
    try {
      let captcha = document.getElementById('cwd-otp-captcha');
      if (!captcha) { captcha = document.createElement('div'); captcha.id = 'cwd-otp-captcha'; }
      box.querySelector('.otp-captcha').append(captcha);
      const settings = await loadSdk(captcha);
      if (version !== currentVersion) return;
      if (action === 'verify') {
        const otp = [...digits.children].map(input => input.value).join('');
        if (otp.length !== digits.children.length || !/^\d+$/.test(otp)) throw Error('Enter every OTP digit.');
        const result = await sdkCall('verifyOtp', otp, reqId);
        if (version !== currentVersion) return;
        const accessToken = result?.['access-token'] || result?.message;
        const response = await fetch('/api/mobile-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ accessToken, phone: currentMobile, purpose }) });
        const verified = await response.json();
        if (version !== currentVersion) return;
        if (!response.ok || !verified.success) throw Error(verified.message || 'Unable to verify mobile. Please retry.');
        proof = verified.proof; expiresAt = verified.expiresAt; report('Mobile number verified ✓');
      } else {
        const retryChannel = settings.processes?.find(p => p.processVia?.value === '5' && ['11', '12', '4'].includes(p.channel?.value))?.channel.value || '11';
        const result = await sdkCall(action === 'send' ? 'sendOtp' : 'retryOtp', action === 'send' ? currentMobile : retryChannel, reqId || undefined);
        if (version !== currentVersion) return;
        if (action === 'send') { reqId = result?.reqId || result?.message; if (typeof reqId !== 'string' || !reqId) throw Error('Unable to start OTP verification. Please retry.'); mobile = currentMobile; }
        const length = Number(settings.otpLength); if (!Number.isInteger(length) || length < 4 || length > 8) throw Error('OTP service configuration is unavailable.');
        retrySeconds = Math.max(30, Number(settings.retryTime) || 30); retryAt = Date.now() + retrySeconds * 1000;
        buildDigits(length); report('OTP sent. Please check your mobile.');
      }
    } catch (error) { if (version === currentVersion) report(error.message || 'OTP service is unavailable. Please retry.', true); }
    finally { busy = false; sdkBusy = false; render(); if (action !== 'verify' && reqId) digits.firstElementChild?.focus(); }
  }
  send.onclick = () => run('send'); verify.onclick = () => run('verify'); resend.onclick = () => run('resend');
  const instance = { requireProof() { if (!proof || expiresAt <= Date.now() || mobile !== normalize(phone.value)) { report('Please verify your mobile number before submitting.', true); box.scrollIntoView({ block: 'center', behavior: 'smooth' }); throw Error('Please verify your mobile number before submitting.'); } return proof; }, reset };
  instances.set(phone, instance); return instance;
}
export function requireFormOtp(form, phoneId, purpose) { return mountMobileOtp(form.querySelector('#' + phoneId), purpose).requireProof(); }
for (const [id, purpose] of [['cust-phone', 'booking'], ['sd-cust-phone', 'booking'], ['part-phone', 'partner']]) mountMobileOtp(document.getElementById(id), purpose);
