import { requireMobileOtp } from '../lib/mobile-otp.mjs';
import { customerConfig, customerDb, requireCustomer, guardMutation, tokenFrom,
  hash, newToken, sessionCookie, SESSION_SECONDS, fail } from '../lib/customer-account.mjs';
export const config = { runtime: 'edge' };
const json = (body, status = 200, headers = {}) => Response.json(body, { status,
  headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
export default async function handler(request) {
  try {
    const cfg = customerConfig();
    if (request.method === 'GET') {
      if (new URL(request.url).searchParams.get('config') === '1') return json({ success: true, enabled: true });
      return json({ success: true, customer: await requireCustomer(cfg, request) });
    }
    if (request.method !== 'POST') return json({ success: false }, 405, { Allow: 'GET, POST' });
    guardMutation(request);
    const raw = await request.text();
    if (raw.length > 4000) fail('Request too large.', 413);
    let body;
    try { body = JSON.parse(raw); } catch { fail('Invalid JSON.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid request.');
    if (body.action === 'login') {
      const proof = await requireMobileOtp(body.proof, body.phone, 'customer', new URL(request.url).origin);
      const token = newToken();
      // One transaction consumes proof, creates/reuses the account and creates the session.
      const customer = await customerDb(cfg, 'rpc/cwd_customer_login', { method: 'POST',
        body: JSON.stringify({ p_nonce: proof.nonce, p_mobile: proof.mobile,
          p_proof_expires: new Date(proof.expiresAt).toISOString(), p_session_hash: await hash(token),
          p_session_expires: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString() }) });
      return json({ success: true, customer }, 200, { 'Set-Cookie': sessionCookie(token) });
    }
    if (body.action === 'logout') {
      const token = tokenFrom(request);
      if (token) await customerDb(cfg, 'cwd_customer_sessions?session_hash=eq.' + await hash(token), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
      return json({ success: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (body.action === 'profile') {
      const customer = await requireCustomer(cfg, request);
      if (Object.keys(body).some(k => !['action', 'display_name'].includes(k))) fail('Only your display name can be changed.');
      const name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
      if (name.length < 2 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) fail('Enter a name between 2 and 80 characters.');
      await customerDb(cfg, 'cwd_customers?id=eq.' + encodeURIComponent(customer.id), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ display_name: name, updated_at: new Date().toISOString() }) });
      return json({ success: true, customer: { ...customer, display_name: name } });
    }
    fail('Unknown account action.');
  } catch (error) {
    return json({ success: false, message: error.status ? error.message : 'Account service is temporarily unavailable.' }, error.status || 503);
  }
}
