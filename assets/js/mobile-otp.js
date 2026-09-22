const state = {
  open: false, phone: null, purpose: '', proof: '', expiresAt: 0, mobile: '',
  reqId: '', retryAt: 0, busy: false, resolve: null, reject: null, settings: null
};
let sdkPromise;

const normalize = value => {
  const n = String(value || '').replace(/[\s()+-]/g, '');
  return /^[6-9]\d{9}$/.test(n) ? '91' + n : /^91[6-9]\d{9}$/.test(n) ? n : '';
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function ensureCss() {
  if (document.querySelector('link[data-mobile-otp]')) return;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/css/mobile-otp.css';
  css.dataset.mobileOtp = '';
  document.head.append(css);
}

function ensureModal() {
  let modal = document.getElementById('mobile-otp-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'mobile-otp-modal';
  modal.className = 'mobile-otp-modal hidden';
  modal.innerHTML = `
    <div class="mobile-otp-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-otp-title">
      <button type="button" class="mobile-otp-close" data-close aria-label="Close OTP verification">×</button>
      <h3 id="mobile-otp-title">Verify Mobile Number</h3>
      <p class="mobile-otp-subtitle">Enter the OTP sent to <strong data-phone></strong></p>
      <div class="otp-captcha" data-captcha></div>
      <div class="otp-digits" data-digits role="group" aria-label="OTP digits"></div>
      <p class="otp-message" data-message role="status" aria-live="polite"></p>
      <button type="button" class="otp-primary" data-verify>Verify &amp; Submit</button>
      <button type="button" class="otp-secondary" data-resend>Resend OTP</button>
      <button type="button" class="otp-cancel" data-cancel>Cancel</button>
    </div>`;
  document.body.append(modal);
  modal.querySelector('[data-close]').onclick = cancelModal;
  modal.querySelector('[data-cancel]').onclick = cancelModal;
  modal.addEventListener('click', event => { if (event.target === modal) cancelModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.open) cancelModal(); });
  modal.querySelector('[data-verify]').onclick = verifyAndFinish;
  modal.querySelector('[data-resend]').onclick = () => sendOtp(true);
  return modal;
}

function message(text, error = false) {
  const el = ensureModal().querySelector('[data-message]');
  el.textContent = text;
  el.className = 'otp-message' + (error ? ' otp-error' : '');
}

function render() {
  const modal = ensureModal();
  const resend = modal.querySelector('[data-resend]');
  const verify = modal.querySelector('[data-verify]');
  const seconds = Math.max(0, Math.ceil((state.retryAt - Date.now()) / 1000));
  resend.disabled = state.busy || seconds > 0;
  resend.textContent = seconds > 0 ? `Resend OTP in ${seconds}s` : 'Resend OTP';
  verify.disabled = state.busy;
  [...modal.querySelectorAll('[data-digits] input')].forEach(input => input.disabled = state.busy);
  if (state.open && seconds > 0) requestAnimationFrame(() => setTimeout(render, 250));
}

function buildDigits(length) {
  const digits = ensureModal().querySelector('[data-digits]');
  digits.replaceChildren();
  for (let i = 0; i < length; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 1;
    input.autocomplete = i === 0 ? 'one-time-code' : 'off';
    input.setAttribute('aria-label', `OTP digit ${i + 1} of ${length}`);
    input.oninput = () => {
      const raw = input.value.replace(/\D/g, '');
      input.value = raw.slice(0, 1);
      if (raw.length > 1) {
        for (let j = 1; j < raw.length && i + j < length; j++) digits.children[i + j].value = raw[j];
      }
      if (raw && i < length - 1) digits.children[Math.min(i + raw.length, length - 1)].focus();
    };
    input.onpaste = event => {
      event.preventDefault();
      const raw = event.clipboardData.getData('text').replace(/\D/g, '');
      for (let j = 0; j < raw.length && i + j < length; j++) digits.children[i + j].value = raw[j];
      digits.children[Math.min(i + Math.max(1, raw.length), length - 1)]?.focus();
    };
    input.onkeydown = event => {
      if (event.key === 'Backspace' && !input.value && i > 0) digits.children[i - 1].focus();
      if (event.key === 'Enter') { event.preventDefault(); verifyAndFinish(); }
    };
    digits.append(input);
  }
}

function otpDiagnostic(stage, detail = '', reqIdPresent = false) {
  try {
    fetch('/api/mobile-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ action: 'diagnostic', stage, purpose: state.purpose || '', detail: String(detail || '').slice(0, 180), reqIdPresent: Boolean(reqIdPresent) })
    }).catch(() => {});
  } catch {}
}

async function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const response = await fetch('/api/mobile-otp', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || !config.success) throw Error(config.message || 'Mobile verification is unavailable.');
    otpDiagnostic('sdk_config_loaded');
    if (typeof window.initSendOTP !== 'function') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => reject(Error('OTP service took too long to load. Please retry.')), 20000);
        script.src = 'https://verify.msg91.com/otp-provider.js';
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error('Could not load OTP service. Please retry.')); };
        document.head.append(script);
      });
    }
    const captcha = ensureModal().querySelector('[data-captcha]');
    if (!captcha.id) captcha.id = 'cwd-otp-captcha';
    window.initSendOTP({
      widgetId: config.widgetId,
      tokenAuth: config.tokenAuth,
      exposeMethods: true,
      captchaRenderId: captcha.id,
      success: () => {},
      failure: () => {}
    });
    // MSG91 can expose send/verify methods before getWidgetData() finishes
    // hydrating on a fresh SDK/captcha mount. The methods are the readiness
    // signal; sendOtp() below can use conservative defaults until widget data
    // becomes available.
    for (let i = 0; i < 200; i++) {
      const data = typeof window.getWidgetData === 'function' ? window.getWidgetData() : null;
      if (typeof window.sendOtp === 'function' && typeof window.verifyOtp === 'function') {
        otpDiagnostic('sdk_ready');
        return data || state.settings || { otpLength: 6, retryTime: 30, processes: [] };
      }
      await pause(100);
    }
    throw Error('OTP service is not ready. Please retry.');
  })().catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}

async function waitForCaptcha() {
  // MSG91 exposes isCaptchaVerified for custom UI, but on a fresh SDK mount
  // it can appear slightly after sendOtp/verifyOtp. Do not race ahead and
  // consume the OTP request before CAPTCHA is actually ready.
  for (let i = 0; i < 40 && state.open; i++) {
    if (typeof window.isCaptchaVerified === 'function') break;
    await pause(250);
  }

  // Some widget configurations may have CAPTCHA disabled. In that case
  // MSG91 does not expose isCaptchaVerified, so sending can proceed normally.
  if (typeof window.isCaptchaVerified !== 'function') return;
  if (window.isCaptchaVerified()) {
    await pause(500);
    return;
  }

  message('Complete the captcha to receive OTP.');
  while (state.open) {
    await pause(250);
    if (typeof window.isCaptchaVerified === 'function' && window.isCaptchaVerified()) {
      await pause(500);
      return;
    }
  }
  throw Error('OTP verification cancelled.');
}

function sdkCall(method, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('OTP request timed out. Please retry.')), 30000);
    const ok = result => { clearTimeout(timer); result?.type === 'error' ? reject(Error(result.message || 'OTP request failed.')) : resolve(result); };
    const fail = error => { clearTimeout(timer); reject(Error(error?.message || (method === 'verifyOtp' ? 'Incorrect or expired OTP.' : 'Unable to send OTP.'))); };
    try { window[method](...args, ok, fail); } catch (error) { fail(error); }
  });
}

async function sendOtp(isRetry = false) {
  if (state.busy) return;
  state.busy = true; render(); message(isRetry ? 'Resending OTP…' : 'Sending OTP…');
  try {
    state.settings = await loadSdk();
    const phone = normalize(state.phone.value);
    if (!phone || phone !== state.mobile) throw Error('Mobile number changed. Please close and submit again.');

    // MSG91 hCaptcha must be solved before sendOtp is invoked. Calling sendOtp
    // immediately after rendering the captcha consumes/invalidates the token and
    // can leave the SDK waiting until our request timeout.
    if (!isRetry) {
      await waitForCaptcha();
      if (!state.open) throw Error('OTP verification cancelled.');
      message('Sending OTP…');
    }

    let result;
    if (isRetry) {
      const channel = state.settings.processes?.find(p => p.processVia?.value === '5' && ['11','12','4'].includes(p.channel?.value))?.channel?.value || '11';
      result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('OTP request timed out. Please retry.')), 30000);
        const ok = r => { clearTimeout(timer); r?.type === 'error' ? reject(Error(r.message || 'Unable to resend OTP.')) : resolve(r); };
        const fail = e => { clearTimeout(timer); reject(Error(e?.message || 'Unable to resend OTP.')); };
        try { window.retryOtp(channel, ok, fail, state.reqId); } catch (e) { fail(e); }
      });
    } else {
      result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('OTP request timed out. Please retry.')), 30000);
        const ok = r => { clearTimeout(timer); r?.type === 'error' ? reject(Error(r.message || 'Unable to send OTP.')) : resolve(r); };
        const fail = e => { clearTimeout(timer); reject(Error(e?.message || 'Unable to send OTP.')); };
        try { otpDiagnostic('send_invoked'); window.sendOtp(phone, ok, fail); } catch (e) { fail(e); }
      });
      state.reqId = result?.reqId || result?.requestId || result?.request_id || result?.message || (typeof result === 'string' ? result : '');
      otpDiagnostic('send_success', '', Boolean(state.reqId));
      if (!state.reqId) throw Error('Unable to start OTP verification. Please retry.');
    }
    const length = Number(state.settings.otpLength);
    if (!Number.isInteger(length) || length < 4 || length > 8) throw Error('OTP service configuration is unavailable.');
    buildDigits(length);
    state.retryAt = Date.now() + Math.max(30, Number(state.settings.retryTime) || 30) * 1000;
    message('OTP sent. Please enter it below.');
    ensureModal().querySelector('[data-digits] input')?.focus();
  } catch (error) {
    otpDiagnostic('send_error', error?.message || 'Unable to send OTP.', Boolean(state.reqId));
    message(error.message || 'Unable to send OTP. Please retry.', true);
  } finally {
    state.busy = false; render();
  }
}

async function verifyAndFinish() {
  if (state.busy) return;
  const digits = [...ensureModal().querySelectorAll('[data-digits] input')];
  const otp = digits.map(input => input.value).join('');
  if (!digits.length || otp.length !== digits.length || !/^\d+$/.test(otp)) return message('Enter every OTP digit.', true);
  state.busy = true; render(); message('Verifying OTP…');
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('OTP verification timed out. Please retry.')), 30000);
      const ok = r => { clearTimeout(timer); r?.type === 'error' ? reject(Error(r.message || 'Incorrect or expired OTP.')) : resolve(r); };
      const fail = e => { clearTimeout(timer); reject(Error(e?.message || 'Incorrect or expired OTP.')); };
      try { otpDiagnostic('verify_invoked', '', Boolean(state.reqId)); window.verifyOtp(otp, ok, fail, state.reqId); } catch (e) { fail(e); }
    });
    const accessToken = result?.['access-token'] || result?.message;
    otpDiagnostic('verify_sdk_success', '', Boolean(state.reqId));
    if (!accessToken) throw Error('OTP verification failed. Please resend OTP.');
    const response = await fetch('/api/mobile-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ accessToken, phone: state.mobile, purpose: state.purpose, reqId: state.reqId })
    });
    const verified = await response.json();
    if (!response.ok || !verified.success) throw Error(verified.message || 'Incorrect or expired OTP.');
    otpDiagnostic('verify_server_success', '', Boolean(state.reqId));
    state.proof = verified.proof;
    state.expiresAt = verified.expiresAt;
    const resolve = state.resolve;
    closeModal(false);
    resolve?.(state.proof);
  } catch (error) {
    otpDiagnostic('verify_error', error?.message || 'OTP verification failed.', Boolean(state.reqId));
    message(error.message || 'Incorrect or expired OTP.', true);
  } finally {
    state.busy = false; render();
  }
}

function closeModal(reject = false) {
  const modal = ensureModal();
  modal.classList.add('hidden');
  document.body.classList.remove('otp-modal-open');
  state.open = false;
  if (reject) {
    const rejectFn = state.reject;
    state.resolve = null; state.reject = null;
    rejectFn?.(Object.assign(new Error('OTP verification cancelled.'), { cancelled: true }));
  } else {
    state.resolve = null; state.reject = null;
  }
}

function cancelModal() { closeModal(true); }

export async function requestFormOtp(form, phoneId, purpose) {
  const phone = form.querySelector('#' + phoneId);
  if (!phone) throw Error('Mobile number field is unavailable.');
  const mobile = normalize(phone.value);
  if (!mobile) { phone.focus(); throw Error('Enter a valid 10-digit mobile number.'); }
  if (state.proof && state.expiresAt > Date.now() && state.mobile === mobile && state.purpose === purpose) return state.proof;
  if (state.open) throw Error('Mobile verification is already in progress.');

  // Reuse the MSG91 SDK methods after the first successful initialization.
  // Some SDK globals (including sendOtp) are exposed as read-only Window
  // properties, so attempting to delete/reassign them breaks subsequent forms.
  // hCaptcha itself is reset below by clearing its mount before the modal opens.
  sdkPromise = null;

  ensureCss();
  const modal = ensureModal();
  state.open = true;
  state.phone = phone;
  state.purpose = purpose;
  state.mobile = mobile;
  state.proof = '';
  state.expiresAt = 0;
  state.reqId = '';
  state.retryAt = 0;
  modal.querySelector('[data-phone]').textContent = '+' + mobile;
  modal.querySelector('[data-digits]').replaceChildren();
  const captcha = modal.querySelector('[data-captcha]');
  captcha.replaceChildren();
  captcha.removeAttribute('data-hcaptcha-widget-id');
  message('Sending OTP…');
  modal.classList.remove('hidden');
  document.body.classList.add('otp-modal-open');

  const promise = new Promise((resolve, reject) => { state.resolve = resolve; state.reject = reject; });
  sendOtp(false);
  return promise;
}

export function clearFormOtp(form) {
  if (!form) return;
  const phone = form.querySelector('#cust-phone, #sd-cust-phone, #part-phone');
  if (phone && normalize(phone.value) === state.mobile) {
    state.proof = ''; state.expiresAt = 0;
  }
}
