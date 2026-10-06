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

  let active = false;
  let started = false;
  let settings = null;
  let pending = [];

  const productionHost = ['carswithdriverindia.com', 'www.carswithdriverindia.com'].includes(location.hostname);
  const localTestHost = ['localhost', '127.0.0.1'].includes(location.hostname);
  const hostAllowed = productionHost || localTestHost;
  const publicPath = path => paths.has(path.replace(/\.html$/, '').replace(/\/$/, '') || '/');

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
        if (key === 'utm_campaign' && /^[A-Za-z0-9_-]{1,100}$/.test(value)) continue;
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
      return referrer.origin === location.origin
        ? safeUrl(referrer.href)
        : referrer.pathname === '/' && !referrer.search && !referrer.hash;
    } catch (_) { return false; }
  }

  function call(...args) {
    try { window.clarity?.(...args); } catch (_) {}
  }

  function deliver(item) {
    Object.entries(item.tags).forEach(([key, value]) => call('set', key, value));
    call('event', item.name);
  }

  function track(name, params) {
    if (!events.has(name) || !eligible()) return;
    const tags = {};
    Object.entries(allowedTags).forEach(([key, values]) => {
      if (values.has(params?.[key])) tags[key] = params[key];
    });
    if (active) deliver({ name, tags });
    else if (pending.length < 40) pending.push({ name, tags });
  }

  function applySensitiveMasks() {
    const selectors = [
      '.autocomplete-dropdown',
      '#modal-summary-pickup',
      '#modal-summary-dest',
      '#wd-local-location-status',
      '#wd-out-location-status',
      '#wd-current-location-status',
      '#sd-current-location-status',
      '#sd-review-deliv-location',
      '#success-confirmation-modal'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(element => {
      element.setAttribute('data-clarity-mask', 'true');
    });
  }

  function start() {
    if (started || !settings || !eligible()) return;
    applySensitiveMasks();
    if (window.clarity) return;
    started = true;
    window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    call('set', 'environment', 'production');

    const query = new URL(location.href).searchParams;
    const paid = ['gclid', 'gbraid', 'wbraid'].some(key => query.has(key))
      || (['google', 'google_ads'].includes(query.get('utm_source'))
        && ['cpc', 'ppc', 'paidsearch'].includes(query.get('utm_medium')));
    call('set', 'traffic_type', paid ? 'google_ads' : 'other');
    if (location.pathname.includes('outstation') || location.pathname.startsWith('/mumbai-to-')) {
      call('set', 'trip_type', 'outstation');
    }

    active = true;
    pending.splice(0).forEach(deliver);
    status('starting');

    const script = document.createElement('script');
    script.id = 'cwd-clarity-sdk';
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + settings.projectId;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => status('sdk-loaded');
    script.onerror = () => {
      active = false;
      pending = [];
      if (window.clarity?.q) window.clarity.q = [];
      status('sdk-blocked');
    };
    document.head.appendChild(script);
  }

  window.cwdClarity = { track };

  if (!eligible()) { status('url-excluded'); return; }
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') { status('privacy-signal'); return; }

  async function init() {
    try {
      const response = await fetch('/api/clarity-config', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) { status('config-unavailable'); return; }
      const config = await response.json();
      if (!config.enabled || config.environment !== 'production' || !/^[a-z0-9]{6,20}$/.test(config.projectId)) {
        status('not-configured');
        return;
      }
      settings = config;
      start();
    } catch (_) {
      status('config-unavailable');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
