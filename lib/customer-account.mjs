// Customers never receive Supabase authenticated/admin credentials.
export const COOKIE = '__Host-cwd_customer';
export const SESSION_SECONDS = 7 * 86400;
export const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function customerConfig(env = process.env) {
  const url = String(env.CWD_CUSTOMER_SUPABASE_URL || '').replace(/\/$/, '');
  let parsed;
  try { parsed = new URL(url); } catch { /* fail closed below */ }
  if (env.CWD_CUSTOMER_ACCOUNTS_ENABLED !== 'true' || env.VERCEL_ENV === 'production' ||
      (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== 'testing') ||
      !parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.origin !== url || parsed.hostname === 'pwciaihqkfnlenxxiown.supabase.co' ||
      !env.CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY) {
    fail('Customer accounts are not available yet. Please contact our team for booking help.', 503);
  }
  return { url, key: env.CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY };
}
export async function customerDb(cfg, path, options = {}, missingTable = null) {
  let response;
  try {
    response = await fetch(cfg.url + '/rest/v1/' + path, {
      ...options, signal: AbortSignal.timeout(12000),
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key,
        'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch { fail('Account service is temporarily unavailable. Please retry.', 503); }
  if (!response.ok) {
    const error = await response.clone().json().catch(()=>({}));
    // Driver operations are optional in the isolated checkout database. Never
    // suppress permission, connectivity, missing-column or other query errors.
    if (missingTable && path.startsWith(missingTable + '?') && response.status === 404 &&
        ['PGRST205', '42P01'].includes(error.code) &&
        String(error.message || '').includes(missingTable)) return [];
    const messages = {
      CWD_COUPON_USED:'This coupon is already used or reserved for another booking.',
      CWD_COUPON_IDENTITY:'Please sign in with the verified mobile number for this booking.',
      CWD_COUPON_INVALID:'Enter a valid coupon code.',
      CWD_COUPON_FIRST:'Your first-time coupon is available. Apply it again to refresh your fare.',
      CWD_CANCEL_CONFIRMED:'This booking is already confirmed. Contact CWD for cancellation; the coupon remains used.'
    };
    if (messages[error.message]) fail(messages[error.message],409);
  }
  if (response.status === 409) fail('This verification has already been used. Please request another OTP.', 409);
  if (!response.ok) fail('Account service is temporarily unavailable. Please retry.', 503);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
export async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    x => x.toString(16).padStart(2, '0')).join('');
}
export function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
}
export function sessionCookie(token, maxAge) {
  // Browser-session cookie; the database still enforces expiry and revocation.
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict${maxAge === 0 ? '; Max-Age=0' : ''}`;
}
export function tokenFrom(request) {
  const matches = (request.headers.get('cookie') || '').split(';').map(x => x.trim())
    .filter(x => x.startsWith(COOKIE + '='));
  const token = matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function guardMutation(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin ||
      request.headers.get('sec-fetch-site') === 'cross-site') fail('Invalid request origin.', 403);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) fail('JSON required.', 415);
}
export async function requireCustomer(cfg, request) {
  const token = tokenFrom(request);
  if (!token) fail('Please sign in to your account.', 401);
  const sessions = await customerDb(cfg, 'cwd_customer_sessions?session_hash=eq.' + await hash(token) +
    '&select=customer_id,expires_at,revoked_at&limit=1');
  const session = sessions?.[0];
  if (!session || session.revoked_at || !Number.isFinite(Date.parse(session.expires_at)) ||
      Date.parse(session.expires_at) <= Date.now()) fail('Your session has expired. Please sign in again.', 401);
  const rows = await customerDb(cfg, 'cwd_customers?id=eq.' + encodeURIComponent(session.customer_id) +
    '&select=id,mobile,display_name,created_at&limit=1');
  if (!rows?.[0]) fail('Please sign in again.', 401);
  return rows[0];
}
