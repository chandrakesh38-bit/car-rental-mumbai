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
    if (started) {
      call('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
      call('stop');
      // Reload to remove SDK observers, queues and pending startup entirely.
      location.reload();
    }
    banner?.remove();
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
    banner.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;max-width:480px;margin:auto;z-index:100000;background:white;color:#172554;border:1px solid #94a3b8;border-radius:12px;padding:16px;box-shadow:0 4px 20px #0003;font:14px/1.5 system-ui';
    banner.innerHTML = '<strong>Help improve our website</strong><p>Allow Microsoft Clarity to record masked page interactions and use analytics cookies? Your choice is optional. Advertising storage stays off. <a href="/privacy-policy" style="text-decoration:underline">Privacy Policy</a></p><div style="display:flex;gap:12px;margin-top:12px"><button type="button" data-allow style="padding:10px;border:1px solid;border-radius:6px">Allow analytics</button><button type="button" data-decline style="padding:10px;border:1px solid;border-radius:6px">No thanks</button></div>';
    banner.querySelector('[data-allow]').onclick = () => { save('granted'); banner.remove(); start(); };
    banner.querySelector('[data-decline]').onclick = revoke;
    document.body.appendChild(banner);
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
