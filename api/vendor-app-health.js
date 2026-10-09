// CWD Partner production readiness probe. No vendor/customer data is exposed.
// Returns HTTP 200 only when the app auth gates and session/offer tables work.
import { vendorAuthOrFail, vendorDb } from '../lib/vendor-app-server.mjs';
export const config = { runtime: 'edge' };
function reply(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export default async function handler(request) {
  if (request.method !== 'GET') return reply({ ok: false }, 405);
  try {
    const cfg = vendorAuthOrFail();
    await Promise.all([
      vendorDb(cfg, 'cwd_vendor_app_sessions?select=id&limit=1'),
      vendorDb(cfg, 'cwd_vendor_offers?select=id&limit=1'),
      vendorDb(cfg, 'cwd_vendor_app_vehicle_blocks?select=id&limit=1'),
    ]);
    return reply({ ok: true, service: 'cwd-partner' }, 200);
  } catch (_) {
    return reply({ ok: false, service: 'cwd-partner' }, 503);
  }
}
