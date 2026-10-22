// Results-only sign-in invitation. Uses the existing customer OTP/API contract;
// never calculates fares, applies coupons, or submits a booking.
let initialized = false;
export function initResultsOffer() {
  if (initialized || !document.getElementById('fleet-container')) return;
  initialized = true;
  const sessionKey = 'cwd-results-offer-seen-v1';
  let seen = false;
  try { seen = sessionStorage.getItem(sessionKey) === '1'; } catch {}
  let timer, elapsed = 0, lastTick = 0, checking = false, busy = false;
  let dialog, form, status, phone, submit, previousFocus, previousScroll, attempt = 0, otp;
  let couponBanner, copiedCoupon = false;
  async function refreshCoupon() {
    try {
      const {getLoginCoupon}=await import('./customer-checkout.js');
      const coupon=await getLoginCoupon();
      if(!coupon.eligible){couponBanner?.remove();couponBanner=null;return;}
      if(copiedCoupon)return;
      if (!couponBanner) {
        couponBanner=document.createElement('aside');couponBanner.className='cwd-login-coupon-banner';
        couponBanner.setAttribute('aria-label','Your login coupon');
        couponBanner.setAttribute('aria-live','polite');
        document.body.append(couponBanner);
      }
      couponBanner.replaceChildren();
      const text=document.createElement('span');
      text.textContent=coupon.eligible?`${coupon.code} · 10% off, up to ₹500`:coupon.reason;
      couponBanner.append(text);
      if(coupon.eligible){
        const copy=document.createElement('button');copy.type='button';copy.textContent='Copy';
        copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(coupon.code);copiedCoupon=true;couponBanner.remove();couponBanner=null;const toast=document.createElement('div');toast.setAttribute('role','status');toast.textContent='Coupon copied successfully.';toast.style.cssText='position:fixed;top:85px;left:50%;transform:translateX(-50%);background:#153e68;color:white;padding:12px 18px;border-radius:12px;z-index:100000;max-width:90%;text-align:center';document.body.append(toast);setTimeout(()=>toast.remove(),3000);}catch{copy.textContent='Select code';const selection=getSelection(),range=document.createRange();range.selectNodeContents(text);selection.removeAllRanges();selection.addRange(range);}});
        couponBanner.append(copy);
      }
    } catch {couponBanner?.remove();couponBanner=null;}
  }

  function viewingResults() {
    if (document.hidden || !document.body.classList.contains('cwd-p1-results-open')) return false;
    if (document.querySelector('dialog[open],.cwd-p1-popover,.mobile-otp-modal:not(.hidden),#booking-modal:not(.hidden),#sd-booking-modal:not(.hidden),#cwd-p1-search-loader.visible')) return false;
    const fleet = document.getElementById('fleet-container');
    if (!fleet?.querySelector('.cwd-p1-card')) return false;
    const rect = fleet.getBoundingClientRect();
    return rect.bottom > 100 && rect.top < innerHeight - 80;
  }
  function remember() {
    seen = true;
    clearInterval(timer); timer = null;
    try { sessionStorage.setItem(sessionKey, '1'); } catch {}
  }
  async function account(body, suffix = '') {
    const response = await fetch('/api/customer-account' + suffix, {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000),
      ...(body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw Object.assign(new Error(data.message || 'Sign-in is unavailable. Please try again.'), {status:response.status});
    return data;
  }
  function message(text, error = false) {
    status.textContent = text; status.dataset.error = String(error);
  }
  function show() {
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('cwd-offer-open');
  }
  function hide() {
    dialog.close(); document.body.classList.remove('cwd-offer-open');
  }
  function dismiss() {
    ++attempt; busy = false; remember();
    otp?.clearFormOtp(form); phone.value = '';
    hide();
    if(previousScroll)window.scrollTo({left:previousScroll.x,top:previousScroll.y,behavior:'instant'});
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
  }
  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.id = 'cwd-results-offer';
    dialog.setAttribute('aria-labelledby', 'cwd-offer-title');
    dialog.setAttribute('aria-describedby', 'cwd-offer-description');
    dialog.innerHTML = `
      <button type="button" class="cwd-offer-close" aria-label="Close offer">×</button>
      <div class="cwd-offer-hero">
        <span class="cwd-offer-eyebrow">✦ CWD PRIVILEGE</span>
        <div class="cwd-offer-saving" aria-hidden="true">10<span>%</span><small>EXTRA SAVINGS</small></div>
        <h2 id="cwd-offer-title">Login to unlock your deal</h2>
        <p id="cwd-offer-description">A little more comfort. A little less to pay.</p>
      </div>
      <div class="cwd-offer-content">
        <form id="cwd-offer-form">
          <p class="cwd-offer-intro">Sign in with mobile OTP to unlock your coupon.</p>
          <label for="account-phone">Mobile number</label>
          <div class="cwd-offer-phone"><span>+91</span><input id="account-phone" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[6-9][0-9]{9}" minlength="10" maxlength="10" placeholder="10-digit mobile number" required></div>
          <button class="cwd-offer-primary" type="submit">Get My 10% OFF <span aria-hidden="true">→</span></button>
          <p class="cwd-offer-consent">Your number is used for account verification. Signing in does not subscribe you to marketing. <a href="/privacy-policy" target="_blank" rel="noopener">Privacy policy</a></p>
        </form>
        <div class="cwd-offer-otp"></div>
        <section class="cwd-offer-success" hidden aria-live="polite">
          <div class="cwd-unlocked-icon" aria-hidden="true">✓</div>
          <h3>10% OFF unlocked!</h3><p data-success-message></p>
          <div class="cwd-unlocked-code"><strong data-success-code></strong><button type="button" data-copy-code>Copy Code</button></div>
          <button type="button" class="cwd-offer-primary" data-continue-booking>Continue to Book Your Cab →</button>
        </section>
        <p class="cwd-offer-status" role="status" aria-live="polite"></p>
        <a class="cwd-offer-expert" href="https://wa.me/919702988465?text=Hi%20CWD%2C%20I%20would%20like%20help%20with%20my%20trip%20and%20the%20extra%2010%25%20offer." target="_blank" rel="noopener">Speak to Expert on WhatsApp <span aria-hidden="true">↗</span></a>
        <p class="cwd-offer-terms">10% off eligible booking fare, maximum ₹500. Once per verified mobile. Apply your code at checkout. No stacking; refundable deposits and unpriced toll/parking charges excluded.</p>
        <button class="cwd-offer-continue" type="button">Continue browsing cabs</button>
      </div>`;
    document.body.append(dialog);
    form = dialog.querySelector('form'); phone = form.querySelector('input');
    submit = form.querySelector('[type="submit"]'); status = dialog.querySelector('[role="status"]');
    dialog.querySelector('.cwd-offer-close').addEventListener('click', dismiss);
    dialog.querySelector('.cwd-offer-continue').addEventListener('click', dismiss);
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button,input,a[href]')]
        .filter(node => !node.disabled && node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dismiss();
    });
    dialog.querySelector('.cwd-offer-expert').addEventListener('click', dismiss);
    dialog.querySelector('[data-continue-booking]').addEventListener('click', dismiss);
    dialog.querySelector('[data-copy-code]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(dialog.querySelector('[data-success-code]').textContent);
        dismiss(); copiedCoupon = true; couponBanner?.remove(); couponBanner = null;
        const toast = document.createElement('div'); toast.className = 'cwd-coupon-toast'; toast.setAttribute('role','status');
        toast.textContent = 'Coupon copied successfully.'; document.body.append(toast); setTimeout(()=>toast.remove(),3000);
      } catch { message('Copy unavailable. Your coupon remains available at checkout.'); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      const currentAttempt = ++attempt;
      busy = true; submit.disabled = true; phone.readOnly = true;
      message('Preparing secure sign-in…');
      try {
        await account(null, '?config=1');
        otp = await import('./mobile-otp.js');
        if (currentAttempt !== attempt) return;
        form.hidden = true;
        const proof = await otp.requestFormOtp(form, 'account-phone', 'customer', {mount:dialog.querySelector('.cwd-offer-otp')});
        if (currentAttempt !== attempt) return;
        show(); message('Signing you in…');
        await account({action:'login', phone:phone.value, proof});
        if (currentAttempt !== attempt) return;
        window.dispatchEvent(new Event('cwd:account-changed'));
        const {getLoginCoupon} = await import('./customer-checkout.js');
        const coupon = await getLoginCoupon();
        const success = dialog.querySelector('.cwd-offer-success'); success.hidden = false;
        dialog.querySelector('#cwd-offer-title').textContent = 'Welcome to CWD Privilege';
        success.querySelector('h3').textContent = coupon.eligible ? '10% OFF unlocked!' : 'You’re signed in';
        success.querySelector('[data-success-message]').textContent = coupon.eligible ? 'Save 10% on your eligible fare, up to ₹500. Apply your coupon at checkout.' : coupon.reason;
        success.querySelector('.cwd-unlocked-code').hidden = !coupon.eligible;
        success.querySelector('[data-success-code]').textContent = coupon.code || '';
        message(''); dialog.querySelector('[data-continue-booking]').focus();
        await refreshCoupon();
      } catch (error) {
        // Let Escape finish closing the OTP overlay before reopening a native
        // dialog, or the same key's default action can dismiss the offer too.
        if (error.cancelled) await new Promise(resolve => setTimeout(resolve, 0));
        if (currentAttempt !== attempt) return;
        show();
        form.hidden = false;
        message(error.cancelled ? 'Verification cancelled. You can retry or keep browsing.' : error.message, !error.cancelled);
      } finally {
        otp?.clearFormOtp(form);
        if (currentAttempt === attempt) {
          busy = false; submit.disabled = false; phone.readOnly = false;
        }
      }
    });
  }
  async function invite() {
    if (checking || seen || !viewingResults()) return;
    checking = true;
    try {
      // Fail closed for unavailable account services and skip signed-in users.
      try { await account(); remember(); await refreshCoupon(); return; }
      catch (error) { if (error.status !== 401) { remember(); return; } }
      if (!viewingResults()) return;
      previousFocus = document.activeElement;
      previousScroll = {x:scrollX,y:scrollY};
      createDialog(); remember(); show();
      dialog.querySelector('.cwd-offer-close').focus({preventScroll:true});
    } finally { checking = false; }
  }
  function start() {
    if (seen || timer) return;
    lastTick = performance.now();
    timer = setInterval(() => {
      const now = performance.now(), delta = Math.min(now - lastTick, 500);
      lastTick = now;
      if (!document.hidden) elapsed += delta;
      if (!viewingResults()) return;
      if (elapsed >= 40000) void invite();
    }, 250);
  }
  window.addEventListener('cwd:fares-ready', ()=>{start();void refreshCoupon();});
  window.addEventListener('pageshow', () => {
    try { seen ||= sessionStorage.getItem(sessionKey) === '1'; } catch {}
    if (seen) { clearInterval(timer); timer = null; }
    else if (document.body.classList.contains('cwd-p1-results-open')) start();
  });
  start();
}
