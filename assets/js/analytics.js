(function () {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());

  // Prevent deployment/preview tooling from taking credit for real sessions.
  // This keeps GA4 acquisition reports clean when we open production from Vercel.
  let ignoreDeploymentReferrer = false;
  try {
    const referrerHost = new URL(document.referrer || location.href).hostname.toLowerCase();
    ignoreDeploymentReferrer =
      referrerHost === 'vercel.com' ||
      referrerHost.endsWith('.vercel.com') ||
      referrerHost.endsWith('.vercel.app');
  } catch (_) {}

  const productionHost = ['carswithdriverindia.com', 'www.carswithdriverindia.com'].includes(location.hostname);
  if (productionHost) window.gtag('config', 'G-TQH1RQ70WV', ignoreDeploymentReferrer ? { ignore_referrer: true } : {});

  window.cwdTrackEvent = function (name, params = {}) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(name || ''))) return;
    // Clarity uses a fixed-value event allowlist; customer PII is not forwarded here.
    try { window.cwdClarity?.track(name, params); } catch (_) {}
    // Preview QA must not inflate the production acquisition funnel.
    if (!productionHost) return;
    const safeParams = {};
    const allowed = new Set(['service_type', 'trip_type', 'journey_type', 'currency', 'value',
      'page_path', 'contact_method', 'reason', 'vehicle_count', 'is_retry']);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (!allowed.has(key) || value === undefined || value === null || value === '') return;
      if (key === 'page_path') safeParams[key] = location.pathname;
      else if (['value', 'vehicle_count'].includes(key)) {
        if (typeof value === 'number' && Number.isFinite(value)) safeParams[key] = value;
      } else if (key === 'is_retry') safeParams[key] = Boolean(value);
      else if (/^[a-zA-Z0-9_-]{1,60}$/.test(String(value))) safeParams[key] = value;
    });
    window.gtag('event', name, safeParams);
  };

  // Session analytics is production-only and has no customer-facing UI.
  if (productionHost && typeof document.createElement === 'function' && document.head) {
    const script = document.createElement('script');
    document.documentElement.setAttribute('data-session-analytics-status', 'loading');
    script.onerror = () => document.documentElement.setAttribute('data-session-analytics-status', 'loader-blocked');
    script.src = '/assets/js/clarity.js';
    script.async = true;
    document.head.appendChild(script);
  }

  document.addEventListener('click', function (event) {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    const href = String(link.getAttribute('href') || '');
    if (/^tel:/i.test(href)) {
      window.cwdTrackEvent('phone_click', { contact_method: 'phone', page_path: location.pathname });
    } else if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(href)) {
      window.cwdTrackEvent('whatsapp_click', { contact_method: 'whatsapp', page_path: location.pathname });
    }
  }, { passive: true });

  document.addEventListener('DOMContentLoaded', function () {
    const footerNav = document.querySelector('footer nav[aria-label="Footer navigation"]');
    if (!footerNav) return;
    [
      ['/privacy-policy', 'Privacy Policy'],
      ['/terms-and-conditions', 'Terms & Conditions'],
      ['/cancellation-refund-policy', 'Cancellation & Refund Policy']
    ].forEach(([href, label]) => {
      if (footerNav.querySelector('a[href="' + href + '"]')) return;
      const a = document.createElement('a');
      a.href = href;
      a.className = 'hover:text-amber-400 transition';
      a.textContent = label;
      footerNav.appendChild(a);
    });
  });
})();
