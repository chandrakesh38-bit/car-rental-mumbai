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
  // Invalidate proofs minted by the previous unbound-phone implementation.
  return crypto.subtle.importKey('raw', enc.encode('cwd-mobile-otp-v2:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function verifyAccessToken(accessToken, phone, purpose, origin, reqId) {
  const mobile = normalizeMobile(phone);
  if (!mobile || !['booking', 'partner', 'customer'].includes(purpose)) fail('Enter a valid 10-digit mobile number.', 400);
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8000) fail('Please verify your mobile number.');
  if (typeof reqId !== 'string' || reqId.length < 8 || reqId.length > 500) fail('OTP verification session is invalid. Please send a new OTP.', 400);
  await key();

  // This is a consistency check, NOT proof of phone ownership. Identity comes
  // exclusively from MSG91's authenticated server response below.
  let tokenRequestId = '';
  let tokenExpiresAt;
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) throw Error();
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    tokenRequestId = String(claims.requestId || '');
    if (claims.exp !== undefined) {
      if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw Error();
      tokenExpiresAt = claims.exp * 1000;
    }
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
  // Official widget contract: {type:'success', message:'919999999999'}.
  // https://docs.msg91.com/otp-widget/verify-access-token
  // Do not fall back to the submitted phone, decoded JWT, or generic success.
  const verifiedMobile = normalizeMobile(result.message);
  if (!verifiedMobile || verifiedMobile !== mobile) {
    fail('The verified mobile number does not match this booking. Please verify again.', 403);
  }
  const expiresAt = Math.min(Date.now() + 10 * 60 * 1000, tokenExpiresAt ?? Infinity);
  // Stable transaction nonce prevents exchanging the same MSG91 transaction
  // for fresh one-use proofs (including across purposes and concurrent calls).
  const nonce = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('msg91-widget:' + tokenRequestId))));
  const payload = encode(enc.encode(JSON.stringify({ mobile: verifiedMobile, purpose, origin, expiresAt, nonce })));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(payload))));
  return { proof: payload + '.' + signature, expiresAt };
}
export async function requireMobileOtp(proof, phone, purpose, origin) {
  try {
    if (typeof proof !== 'string' || proof.length > 2000) throw Error();
    const [payload, signature, extra] = proof.split('.');
    if (!payload || !signature || extra || !await crypto.subtle.verify('HMAC', await key(), decode(signature), enc.encode(payload))) throw Error();
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (!normalizeMobile(phone) || data.mobile !== normalizeMobile(phone) || data.purpose !== purpose || data.origin !== origin || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() || typeof data.nonce !== 'string' || data.nonce.length < 20) throw Error();
    return data;
  } catch (error) {
    if (error.status === 503) throw error;
    fail('Please verify your mobile number before submitting.');
  }
}

export async function consumeMobileOtp(proof, phone, purpose, origin) {
  const data = await requireMobileOtp(proof, phone, purpose, origin);
  const base=process.env.SUPABASE_URL,keyValue=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!keyValue) fail('Mobile verification storage is temporarily unavailable. Please try again later.',503);
  let response;
  try { response=await fetch(base.replace(/\/$/,'')+'/rest/v1/otp_proof_uses',{method:'POST',headers:{apikey:keyValue,Authorization:'Bearer '+keyValue,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({nonce:data.nonce,purpose:data.purpose,mobile:data.mobile,expires_at:new Date(data.expiresAt).toISOString()})}); }
  catch { fail('Mobile verification storage is temporarily unavailable. Please try again later.',503); }
  if(response.status===409) fail('This mobile verification has already been used. Please verify again.');
  if(!response.ok) fail('Mobile verification storage is temporarily unavailable. Please try again later.',503);
  return data;
}
