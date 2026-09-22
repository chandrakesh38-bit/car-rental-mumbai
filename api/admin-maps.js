export const config = { runtime: 'edge' };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapsKey = () => process.env.GOOGLE_MAPS_SERVER_API_KEY;

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
}

async function google(path, options = {}) {
  if (!mapsKey()) throw Object.assign(new Error('Google Maps integration is not configured.'), { status: 503 });
  const r = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': mapsKey(),
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) {
    const message = data?.error?.message || 'Google Maps request failed.';
    throw Object.assign(new Error(message), { status: r.status >= 500 ? 502 : 400 });
  }
  return data;
}

async function autocomplete(input) {
  const data = await google('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text'
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['in'],
      languageCode: 'en'
    })
  });
  return (data.suggestions || []).map(s => s.placePrediction).filter(Boolean).slice(0, 8).map(p => ({
    placeId: p.placeId,
    text: p.text?.text || '',
    mainText: p.structuredFormat?.mainText?.text || p.text?.text || '',
    secondaryText: p.structuredFormat?.secondaryText?.text || ''
  })).filter(p => p.placeId && p.mainText);
}

async function details(placeId) {
  const data = await google('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
    method: 'GET',
    headers: { 'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents' }
  });
  const components = Array.isArray(data.addressComponents) ? data.addressComponents : [];
  const pick = types => {
    const row = components.find(c => Array.isArray(c.types) && types.some(t => c.types.includes(t)));
    return row?.longText || row?.shortText || '';
  };
  return {
    placeId: data.id || placeId,
    displayName: data.displayName?.text || '',
    formattedAddress: data.formattedAddress || '',
    city: pick(['locality','postal_town','administrative_area_level_3','administrative_area_level_2']),
    state: pick(['administrative_area_level_1'])
  };
}

async function distance(placeId) {
  const data = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
    body: JSON.stringify({
      origin: { address: 'Vikhroli, Mumbai, Maharashtra, India' },
      destination: { placeId },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });
  const route = data.routes?.[0];
  const meters = Number(route?.distanceMeters);
  if (!Number.isFinite(meters) || meters <= 0) throw Object.assign(new Error('Driving distance could not be calculated for this place.'), { status: 422 });
  const oneWayKm = meters / 1000;
  return {
    oneWayKm,
    oneWayKmRounded: Math.max(1, Math.round(oneWayKm)),
    roundTripKm: Math.max(2, Math.round(oneWayKm * 2)),
    duration: route?.duration || ''
  };
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed.' }, 405);
  try {
    await requireAdmin(request);
    const raw = await request.text();
    if (raw.length > 8000) return json({ success: false, message: 'Request too large.' }, 413);
    const body = JSON.parse(raw || '{}');
    const action = String(body.action || '');

    if (action === 'autocomplete') {
      const input = String(body.input || '').trim();
      if (input.length < 3 || input.length > 150) return json({ success: false, message: 'Enter at least 3 characters.' }, 400);
      return json({ success: true, suggestions: await autocomplete(input) });
    }

    if (action === 'details') {
      const placeId = String(body.placeId || '').trim();
      if (!placeId || placeId.length > 220) return json({ success: false, message: 'Invalid Google place.' }, 400);
      return json({ success: true, ...(await details(placeId)) });
    }

    if (action === 'distance') {
      const placeId = String(body.placeId || '').trim();
      if (!/^ChI|^Ei|^Gh|^[A-Za-z0-9_-]{10,}$/.test(placeId)) return json({ success: false, message: 'Invalid Google place.' }, 400);
      return json({ success: true, ...(await distance(placeId)) });
    }

    return json({ success: false, message: 'Invalid action.' }, 400);
  } catch (error) {
    return json({ success: false, message: error?.message || 'Google Maps request failed.' }, error?.status || 500);
  }
}
