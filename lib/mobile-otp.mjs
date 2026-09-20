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
export async function verifyAccessToken(accessToken, phone, purpose, origin) {
  const mobile = normalizeMobile(phone);
  if (!mobile || !['booking', 'partner'].includes(purpose)) fail('Enter a valid 10-digit mobile number.', 400);
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8000) fail('Please verify your mobile number.');
  await key();
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
  // MSG91's verifyAccessToken response currently returns the verified
  // identifier at the top level for the Web OTP widget (not under data).
  // Accept the documented/observed identity fields from either shape, but
  // never trust the phone sent by the browser as proof of verification.
  const providerIdentity =
    result.mobile ?? result.identifier ?? result.phone ?? result.number ??
    result.data?.mobile ?? result.data?.identifier ?? result.data?.phone ?? result.data?.number;

  // Temporary server-only diagnostics: field names and masked identity only.
  // Never log authkey, access-token, OTP, or the full provider response.
  const maskIdentity = value => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? '*'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4) : 'absent';
  };
  console.info('[mobile-otp] MSG91 verifyAccessToken', {
    httpStatus: response.status,
    topLevelFields: Object.keys(result || {}),
    dataFields: result?.data && typeof result.data === 'object' ? Object.keys(result.data) : [],
    maskedIdentity: maskIdentity(providerIdentity)
  });

  const verifiedMobile = normalizeMobile(String(providerIdentity || ''));
  if (!verifiedMobile || verifiedMobile !== mobile) {
    fail('The verified mobile number does not match this booking.', 400);
  }
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
