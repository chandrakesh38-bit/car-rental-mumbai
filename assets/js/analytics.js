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
    // Clarity has its own testing/consent gates and fixed-value tag allowlist.
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

  // One small async loader; never load a testing recorder on the production domain.
  if (!productionHost && /^(car-rental-mumbai-[a-z0-9-]+-car-with-driver-operation-team\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const script = document.createElement('script');
    const loaderStartedAt = Date.now();
    let loaderFinished = false;
    document.documentElement.setAttribute('data-session-analytics-status', 'loading');
    script.onload = () => { loaderFinished = true; };
    script.onerror = () => document.documentElement.setAttribute('data-session-analytics-status', 'loader-blocked');
    script.src = '/assets/js/clarity.js'; script.async = true;
    document.head.appendChild(script);

    // Preview-only, read-only diagnostics. Independent of clarity.js and its gates.
    // Never read storage, invoke the SDK, request data, or echo arbitrary DOM values.
    function addSessionAnalyticsStatus() {
      if (document.getElementById('cwd-session-analytics-status')) return;
      const button = document.createElement('button');
      button.id = 'cwd-session-analytics-status'; button.type = 'button';
      button.textContent = 'Session analytics status';
      button.style.cssText = 'margin:12px;padding:10px 12px;min-height:44px;text-decoration:underline;font:14px system-ui;cursor:pointer';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'cwd-session-analytics-details');
      const panel = document.createElement('section');
      panel.id = 'cwd-session-analytics-details'; panel.hidden = true; panel.tabIndex = -1;
      panel.setAttribute('aria-label', 'Session analytics status');
      panel.style.cssText = 'box-sizing:border-box;max-width:480px;margin:12px auto;padding:16px;background:white;color:#172554;border:1px solid #94a3b8;border-radius:12px;font:14px/1.5 system-ui;text-align:left;overflow-wrap:anywhere';
      const text = document.createElement('p');
      text.setAttribute('role', 'status'); text.setAttribute('aria-live', 'polite');
      const refresh = document.createElement('button');
      refresh.type = 'button'; refresh.textContent = 'Refresh status';
      refresh.style.cssText = 'padding:10px 12px;min-height:44px;border:1px solid;border-radius:6px;font:inherit;cursor:pointer';
      function renderStatus() {
        const messages = {
          'loader-blocked': 'The local analytics loader failed or was blocked. Share this status with support; it does not identify the blocker.',
          'url-excluded': 'This page or its referring page is excluded by privacy safeguards. Share this status with support; no URL details are displayed.',
          'privacy-signal': 'Your browser is asking not to be tracked. Recording stays off. No change to your privacy settings is needed.',
          'config-unavailable': 'This page could not read its analytics configuration. Opening the configuration separately may still work. Share this status with support.',
          'not-configured': 'The configuration did not enable testing analytics. Ask support to check this testing deployment.',
          'declined': 'Recording is off. Use Session analytics preferences if you want to review your choice.',
          'awaiting-consent': 'Waiting for an optional analytics choice. Use the consent prompt or Session analytics preferences; this check does not change your choice.',
          'starting': 'The SDK was requested but has not confirmed loading. Refresh this status later; this does not confirm recording.',
          'sdk-loaded': 'The SDK script loaded. This does not confirm successful collection, a recording or a heatmap.',
          'sdk-blocked': 'The SDK request failed or was blocked. Share this status with support; no recording is confirmed.'
        };
        const raw = document.documentElement.getAttribute('data-session-analytics-status');
        const key = raw === 'loading' || Object.prototype.hasOwnProperty.call(messages, raw) ? raw : 'unknown';
        const message = key === 'loading'
          ? (loaderFinished ? 'The local loader finished; configuration initialization is incomplete.' : 'The local loader has not finished.')
            + (Date.now() - loaderStartedAt >= 10000 ? ' Still incomplete after 10 seconds; the cause is unknown. Share this status with support.' : ' Refresh this status shortly.')
          : messages[key] || 'No recognized analytics status is available. Share this status with support.';
        text.textContent = 'Status: ' + key + '. ' + message + ' SDK element: '
          + (document.getElementById('cwd-clarity-sdk') ? 'present' : 'absent') + '. Checking status does not start recording or send data.';
      }
      refresh.onclick = renderStatus;
      button.onclick = () => {
        panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) { renderStatus(); panel.focus(); }
      };
      panel.append(text, refresh);
      (document.querySelector('footer') || document.body).append(button, panel);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSessionAnalyticsStatus, { once: true });
    else addSessionAnalyticsStatus();
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
