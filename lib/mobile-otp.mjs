// MSG91 access tokens are validated only here, never trusted from browser state.
const enc = new TextEncoder();
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };
export function normalizeMobile(value) {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  return /^[6-9]\d{9}$/.test(digits) ? '91' + digits : /^91[6-9]\d{9}$/.test(digits) ? digits : null;
}
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function key() {
  const secret = process.env.MSG91_AUTH_KEY;
  if (!secret) fail('Mobile verification is temporarily unavailable. Please try again later.', 503);
  return crypto.subtle.importKey('raw', enc.encode('cwd-mobile-otp-v1:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function verifyAccessToken(accessToken, phone, purpose, origin, reqId) {
  const mobile = normalizeMobile(phone);
  if (!mobile || !['booking', 'partner'].includes(purpose)) fail('Enter a valid 10-digit mobile number.', 400);
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8000) fail('Please verify your mobile number.');
  if (typeof reqId !== 'string' || reqId.length < 8 || reqId.length > 500) fail('OTP verification session is invalid. Please send a new OTP.', 400);
  await key();

  // The MSG91 access token does not expose the verified mobile in this widget
  // configuration. It does expose requestId, so bind the server-verified token
  // to the exact OTP transaction started by sendOtp before issuing our proof.
  let tokenRequestId = '';
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) throw Error();
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    tokenRequestId = String(claims.requestId || '');
  } catch {
    fail('OTP verification session is invalid. Please send a new OTP.', 400);
  }
  if (!tokenRequestId || tokenRequestId !== reqId) fail('OTP verification session does not match. Please send a new OTP.', 400);

  let response, result;
  try {
    response = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authkey: process.env.MSG91_AUTH_KEY, 'access-token': accessToken }),
      signal: AbortSignal.timeout(15000),
    });
    result = await response.json();
  } catch { fail('Mobile verification is temporarily unavailable. Please retry.', 503); }
  if (!response.ok || result.type !== 'success') fail('OTP verification failed or expired. Please send a new OTP.');

  const expiresAt = Date.now() + 10 * 60 * 1000;
  const payload = encode(enc.encode(JSON.stringify({ mobile, purpose, origin, expiresAt })));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(payload))));
  return { proof: payload + '.' + signature, expiresAt };
}
export async function requireMobileOtp(proof, phone, purpose, origin) {
  try {
    if (typeof proof !== 'string' || proof.length > 2000) throw Error();
    const [payload, signature, extra] = proof.split('.');
    if (!payload || !signature || extra || !await crypto.subtle.verify('HMAC', await key(), decode(signature), enc.encode(payload))) throw Error();
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (!normalizeMobile(phone) || data.mobile !== normalizeMobile(phone) || data.purpose !== purpose || data.origin !== origin || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw Error();
  } catch (error) {
    if (error.status === 503) throw error;
    fail('Please verify your mobile number before submitting.');
  }
}
