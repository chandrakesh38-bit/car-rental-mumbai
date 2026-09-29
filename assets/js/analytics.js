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

  window.gtag('config', 'G-TQH1RQ70WV', ignoreDeploymentReferrer ? { ignore_referrer: true } : {});

  window.cwdTrackEvent = function (name, params = {}) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(name || ''))) return;
    const safeParams = {};
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') safeParams[key] = value;
    });
    window.gtag('event', name, safeParams);
  };

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