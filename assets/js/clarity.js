(function () {
  'use strict';
  if (window.cwdClarity) return;
  const status = value => document.documentElement.setAttribute('data-session-analytics-status', value);
  const events = new Set(['explore_cabs_click', 'cab_results_shown', 'book_car_click',
    'booking_form_opened', 'otp_requested', 'otp_verified', 'booking_request_submitted']);
  const paths = new Set(['/', '/index', '/with-driver', '/self-drive', '/airport-transfer',
    '/outstation', '/cars', '/mumbai-car-rental', '/thane-car-rental-with-driver',
    '/navi-mumbai-car-rental-with-driver', '/faq', '/contact', '/privacy-policy',
    '/terms-and-conditions', '/cancellation-refund-policy',
    ...['alibaug', 'bhimashankar', 'goa', 'igatpuri', 'lonavala', 'mahabaleshwar',
      'matheran', 'nashik', 'pune', 'shirdi', 'trimbakeshwar'].map(city => '/mumbai-to-' + city + '-car-rental')]);
  const allowedTags = {
    service_type: new Set(['with_driver', 'self_drive']),
    trip_type: new Set(['outstation', 'local', 'airport']),
    journey_type: new Set(['one-way', 'round-trip'])
  };
  const preferenceKey = 'cwd_clarity_testing_consent_v1';
  let active = false, started = false, settings, banner, preference;
  let pending = [];
  let dismissChoice = () => banner?.remove();
  const hostAllowed = /^(car-rental-mumbai-[a-z0-9-]+-car-with-driver-operation-team\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname);
  const publicPath = path => paths.has(path.replace(/\.html$/, '').replace(/\/$/, '') || '/');
  // Masking the DOM does not mask page/referrer URLs. Reject unexpected parameters
  // rather than rewriting URLs and disturbing GA4/Ads attribution or booking links.
  function safeUrl(raw) {
    try {
      const url = new URL(raw, location.href);
      if (!publicPath(url.pathname)) return false;
      if (url.hash && !/^#(booking|booking-widget|fleet|contact|faq|services|reviews|with-driver-block|self-drive-block)$/.test(url.hash)) return false;
      for (const [key, value] of url.searchParams) {
        if (['gclid', 'gbraid', 'wbraid'].includes(key) && /^[A-Za-z0-9_-]{20,256}$/.test(value)) continue;
        if (key === 'gad_source' && /^[1-5]$/.test(value)) continue;
        if (key === 'gad_campaignid' && /^\d{8,16}$/.test(value)) continue;
        if (key === 'utm_source' && ['google', 'google_ads'].includes(value)) continue;
        if (key === 'utm_medium' && ['cpc', 'ppc', 'paidsearch'].includes(value)) continue;
        if (key === 'utm_campaign' && ['outstation', 'clarity_testing'].includes(value)) continue;
        return false;
      }
      return true;
    } catch (_) { return false; }
  }
  function eligible() {
    if (!hostAllowed || !safeUrl(location.href)) return false;
    if (!document.referrer) return true;
    try {
      const referrer = new URL(document.referrer);
      // External referrers must be origin-only; same-origin referrers use the URL gate.
      return referrer.origin === location.origin ? safeUrl(referrer.href)
        : referrer.pathname === '/' && !referrer.search && !referrer.hash;
    } catch (_) { return false; }
  }
  function call(...args) {
    try { window.clarity?.(...args); } catch (_) { /* Analytics never blocks booking. */ }
  }
  function deliver(item) {
    Object.entries(item.tags).forEach(([key, value]) => call('set', key, value));
    call('event', item.name);
  }
  function track(name, params) {
    if (!events.has(name) || preference !== 'granted' || !eligible()) return;
    const tags = {};
    Object.entries(allowedTags).forEach(([key, values]) => {
      if (values.has(params?.[key])) tags[key] = params[key];
    });
    if (active) deliver({ name, tags });
    else if (pending.length < 40) pending.push({ name, tags });
  }
  function save(value) {
    preference = value;
    try { localStorage.setItem(preferenceKey, value); } catch (_) {}
  }
  function revoke() {
    save('denied'); pending = []; active = false;
    status('declined');
    if (started) {
      call('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
      call('stop');
      // Reload to remove SDK observers, queues and pending startup entirely.
      location.reload();
    }
    dismissChoice();
  }
  function start() {
    if (started || preference !== 'granted' || !settings || !eligible()) return;
    // Before the SDK can inspect any existing or future descendants, including portals.
    document.documentElement.setAttribute('data-clarity-mask', 'true');
    if (document.querySelector('[data-clarity-unmask]') || window.clarity) return;
    started = true;
    window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    call('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' });
    call('set', 'environment', 'testing');
    const query = new URL(location.href).searchParams;
    const paid = ['gclid', 'gbraid', 'wbraid'].some(key => query.has(key))
      || (['google', 'google_ads'].includes(query.get('utm_source'))
        && ['cpc', 'ppc', 'paidsearch'].includes(query.get('utm_medium')));
    call('set', 'traffic_type', paid ? 'google_ads' : 'other');
    if (location.pathname.includes('outstation') || location.pathname.startsWith('/mumbai-to-')) call('set', 'trip_type', 'outstation');
    active = true;
    status('starting');
    pending.splice(0).forEach(deliver);
    const script = document.createElement('script');
    script.id = 'cwd-clarity-sdk'; script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + settings.projectId;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => status('sdk-loaded');
    script.onerror = () => { active = false; pending = []; window.clarity.q = []; status('sdk-blocked'); };
    document.head.appendChild(script);
  }
  function showChoice() {
    if (banner?.isConnected) return;
    banner = document.createElement('section');
    banner.id = 'cwd-clarity-choice';
    banner.setAttribute('aria-label', 'Optional session analytics');
    banner.style.cssText = 'box-sizing:border-box;bottom:0;left:0;width:100%;z-index:40;background:#fff;color:#172554;border-top:1px solid #94a3b8;padding:10px 16px;padding-bottom:max(10px,env(safe-area-inset-bottom));font:13px/1.4 system-ui';
    banner.innerHTML = '<div style="max-width:1100px;margin:auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px"><p style="flex:1 1 320px;margin:0"><strong style="display:block;margin-bottom:2px;font-size:14px">Help us make booking easier</strong><span>Allow anonymous usage analytics so we can improve your booking experience.</span> <a href="/privacy-policy" style="color:inherit;text-decoration:underline;white-space:nowrap">Privacy Policy</a></p><div style="display:flex;flex:1 1 280px;max-width:360px;gap:8px"><button type="button" data-allow style="flex:1;min-height:44px;padding:8px;border:1px solid #64748b;border-radius:6px;background:#fff;color:#172554;font:inherit;cursor:pointer">Allow &amp; Continue</button><button type="button" data-decline style="flex:1;min-height:44px;padding:8px;border:1px solid #64748b;border-radius:6px;background:#fff;color:#172554;font:inherit;cursor:pointer">No thanks</button></div></div>';
    banner.querySelector('[data-allow]').onclick = () => { save('granted'); dismissChoice(); start(); };
    banner.querySelector('[data-decline]').onclick = revoke;
    document.body.appendChild(banner);
    // Reserve the fixed bar's space without changing existing body styles. On a
    // short/zoomed viewport or during text entry, keep it in normal document flow.
    // It never floats above a keyboard or the site's z-index 50+ booking dialogs.
    const space = document.createElement('div');
    space.setAttribute('aria-hidden', 'true');
    document.body.appendChild(space);
    const viewport = window.visualViewport;
    function layoutChoice() {
      const focused = document.activeElement;
      const editing = focused && !banner.contains(focused)
        && (focused.matches('input,textarea,select') || focused.isContentEditable);
      const compact = editing || (viewport?.height || window.innerHeight) < 500
        || (viewport?.scale || 1) > 1;
      banner.style.position = compact ? 'static' : 'fixed';
      space.style.height = compact ? '0px' : banner.getBoundingClientRect().height + 'px';
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(layoutChoice) : null;
    observer?.observe(banner);
    window.addEventListener?.('resize', layoutChoice);
    viewport?.addEventListener('resize', layoutChoice);
    document.addEventListener?.('focusin', layoutChoice);
    document.addEventListener?.('focusout', layoutChoice);
    dismissChoice = () => {
      observer?.disconnect();
      window.removeEventListener?.('resize', layoutChoice);
      viewport?.removeEventListener('resize', layoutChoice);
      document.removeEventListener?.('focusin', layoutChoice);
      document.removeEventListener?.('focusout', layoutChoice);
      space.remove(); banner.remove();
    };
    layoutChoice();
  }
  window.cwdClarity = { track, revoke, showChoice };
  if (!eligible()) { status('url-excluded'); return; }
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') { status('privacy-signal'); return; }
  try { preference = localStorage.getItem(preferenceKey); } catch (_) {}
  async function init() {
    try {
      const response = await fetch('/api/clarity-config', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) { status('config-unavailable'); return; }
      const config = await response.json();
      if (!config.enabled || config.environment !== 'testing' || !/^[a-z0-9]{6,20}$/.test(config.projectId)) { status('not-configured'); return; }
      settings = config;
      status(preference === 'denied' ? 'declined' : 'awaiting-consent');
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Session analytics preferences';
      button.className = 'underline mx-3 my-3'; button.onclick = showChoice;
      (document.querySelector('footer') || document.body).appendChild(button);
      if (preference === 'granted') start();
      else if (preference !== 'denied') showChoice();
    } catch (_) { status('config-unavailable'); /* Recording remains disabled. */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
