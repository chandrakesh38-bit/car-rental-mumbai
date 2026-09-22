import { verifyAccessToken } from '../lib/mobile-otp.mjs';
export const config = { runtime: 'edge' };
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export default async function handler(request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') && request.headers.get('origin') !== origin) return json({ success: false, message: 'Invalid request origin.' }, 403);
  if (request.method === 'GET') {
    const widgetId = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID;
    const tokenAuth = process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN;
    if (!widgetId || !tokenAuth || !process.env.MSG91_AUTH_KEY) return json({ success: false, message: 'Mobile verification is temporarily unavailable.' }, 503);
    // This static site uses a runtime endpoint for the two explicitly public values.
    return json({ success: true, widgetId, tokenAuth });
  }
  if (request.method !== 'POST') return json({ success: false }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 10000) return json({ success: false, message: 'Request too large.' }, 413);
    const body = JSON.parse(raw || '{}');
    if (body.action === 'diagnostic') {
      const allowedStages = new Set(['sdk_config_loaded','sdk_ready','captcha_verified','send_invoked','send_success','send_error','verify_invoked','verify_sdk_success','verify_server_success','verify_error']);
      const stage = String(body.stage || '');
      if (!allowedStages.has(stage)) return json({ success: false }, 400);
      const detail = String(body.detail || '').replace(/[\r\n]/g, ' ').slice(0, 180);
      console.info('[OTP_DIAG]', JSON.stringify({ stage, purpose: String(body.purpose || '').slice(0, 20), detail, reqIdPresent: Boolean(body.reqIdPresent) }));
      return json({ success: true });
    }
    const { accessToken, phone, purpose, reqId } = body;
    return json({ success: true, ...await verifyAccessToken(accessToken, phone, purpose, origin, reqId) });
  } catch (error) { return json({ success: false, message: error.status ? error.message : 'Unable to verify OTP. Please retry.' }, error.status || 400); }
}
