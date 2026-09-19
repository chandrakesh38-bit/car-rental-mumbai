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
    const { accessToken, phone, purpose } = JSON.parse(raw);
    return json({ success: true, ...await verifyAccessToken(accessToken, phone, purpose, origin) });
  } catch (error) { return json({ success: false, message: error.status ? error.message : 'Unable to verify OTP. Please retry.' }, error.status || 400); }
}
