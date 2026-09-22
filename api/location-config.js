import { loadLocationConfig, normalizeLocationConfig } from '../lib/location-config.mjs';

export const config = { runtime: 'edge' };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

async function requireAdmin(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !base() || !serviceKey()) throw Object.assign(new Error('Admin authentication required.'), { status: 401 });
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz';
  const r = await fetch(base() + '/auth/v1/user', { headers: { apikey: publicKey, Authorization: 'Bearer ' + token } });
  if (!r.ok) throw Object.assign(new Error('Admin session expired.'), { status: 401 });
  const user = await r.json();
  const allowed = String(process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) throw Object.assign(new Error('Admin allowlist is not configured.'), { status: 503 });
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) throw Object.assign(new Error('Admin access denied.'), { status: 403 });
  return user;
}

async function saveConfig(locationConfig) {
  const payload = JSON.stringify(locationConfig);
  if (payload.length > 150000) throw Object.assign(new Error('Location configuration is too large.'), { status: 413 });
  const url = base() + '/rest/v1/site_settings?on_conflict=key';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey(),
      Authorization: 'Bearer ' + serviceKey(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{ key: 'booking_locations_config', value: payload }])
  });
  if (!r.ok) throw Object.assign(new Error('Unable to save location configuration.'), { status: 503 });
}

export default async function handler(request) {
  try {
    if (request.method === 'GET') {
      return json({ success: true, config: await loadLocationConfig() });
    }
    if (request.method !== 'PUT') return json({ success: false, message: 'Method not allowed.' }, 405);
    await requireAdmin(request);
    const raw = await request.text();
    if (raw.length > 160000) return json({ success: false, message: 'Request too large.' }, 413);
    const parsed = JSON.parse(raw);
    const locationConfig = normalizeLocationConfig(parsed?.config);
    await saveConfig(locationConfig);
    return json({ success: true, config: locationConfig });
  } catch (error) {
    return json({ success: false, message: error?.message || 'Unable to process location configuration.' }, error?.status || 400);
  }
}
