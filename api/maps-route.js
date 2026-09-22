export const config = { runtime: 'edge' };

const BASE_ADDRESS = 'Lal Bahadur Shastri Marg, Godrej Hillside Colony, Vikhroli West, Mumbai, Maharashtra 400079';
const MAX_STOPS = 8;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const mapsKey = () => String(process.env.GOOGLE_MAPS_SERVER_API_KEY || '').trim();

function checkBrowserOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    if (originUrl.host !== requestUrl.host) {
      throw Object.assign(new Error('Cross-site request blocked.'), { status: 403 });
    }
  } catch (error) {
    if (error?.status) throw error;
    throw Object.assign(new Error('Invalid request origin.'), { status: 403 });
  }
}

async function google(path, options = {}) {
  const key = mapsKey();
  if (!key) throw Object.assign(new Error('Google Maps integration is not configured.'), { status: 503 });
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let payload = {};
  try { payload = JSON.parse(raw); } catch {}
  if (!response.ok) {
    const message = payload?.error?.message || 'Google Maps request failed.';
    throw Object.assign(new Error(message), { status: response.status >= 500 ? 502 : 400 });
  }
  return payload;
}

async function autocomplete(input) {
  const payload = await google('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': [
        'suggestions.placePrediction.placeId',
        'suggestions.placePrediction.text.text',
        'suggestions.placePrediction.structuredFormat.mainText.text',
        'suggestions.placePrediction.structuredFormat.secondaryText.text'
      ].join(',')
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['in'],
      languageCode: 'en'
    })
  });

  return (payload.suggestions || [])
    .map(item => item.placePrediction)
    .filter(Boolean)
    .slice(0, 8)
    .map(place => ({
      placeId: String(place.placeId || ''),
      text: String(place.text?.text || ''),
      mainText: String(place.structuredFormat?.mainText?.text || place.text?.text || ''),
      secondaryText: String(place.structuredFormat?.secondaryText?.text || '')
    }))
    .filter(place => place.placeId && place.mainText);
}

function cleanPlaceId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 220 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw Object.assign(new Error('Please select all route locations from Google suggestions.'), { status: 400 });
  }
  return id;
}

function durationSeconds(value) {
  const match = String(value || '').match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

async function computeSmartRoute(pickupPlaceId, stopPlaceIds, finalDropPlaceId) {
  const pickup = cleanPlaceId(pickupPlaceId);
  const destinations = [
    ...(Array.isArray(stopPlaceIds) ? stopPlaceIds.map(cleanPlaceId) : []),
    cleanPlaceId(finalDropPlaceId)
  ];
  if (destinations.length < 2) {
    throw Object.assign(new Error('Smart Route needs at least two destinations after pickup.'), { status: 400 });
  }
  if (destinations.length > MAX_STOPS + 1) {
    throw Object.assign(new Error('Too many route locations.'), { status: 400 });
  }

  const baseToPickupPayload = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
    body: JSON.stringify({
      origin: { address: BASE_ADDRESS },
      destination: { placeId: pickup },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });

  const optimizedPayload = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex'
    },
    body: JSON.stringify({
      origin: { placeId: pickup },
      destination: { address: BASE_ADDRESS },
      intermediates: destinations.map(placeId => ({ placeId })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      optimizeWaypointOrder: true,
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });

  const first = baseToPickupPayload.routes?.[0];
  const second = optimizedPayload.routes?.[0];
  const firstMeters = Number(first?.distanceMeters);
  const secondMeters = Number(second?.distanceMeters);
  if (!Number.isFinite(firstMeters) || firstMeters <= 0 || !Number.isFinite(secondMeters) || secondMeters <= 0) {
    throw Object.assign(new Error('Smart Route distance could not be calculated.'), { status: 422 });
  }
  const order = Array.isArray(second.optimizedIntermediateWaypointIndex)
    ? second.optimizedIntermediateWaypointIndex.map(Number)
    : [];
  if (order.length !== destinations.length || order.some(i => !Number.isInteger(i) || i < 0 || i >= destinations.length)) {
    throw Object.assign(new Error('Smart Route order could not be calculated.'), { status: 422 });
  }

  const totalMeters = firstMeters + secondMeters;
  const totalDurationSeconds = durationSeconds(first?.duration) + durationSeconds(second?.duration);
  return {
    baseAddress: BASE_ADDRESS,
    distanceMeters: totalMeters,
    distanceKmExact: Math.round((totalMeters / 1000) * 10) / 10,
    billableRouteKm: Math.ceil(totalMeters / 1000),
    durationSeconds: totalDurationSeconds,
    optimizedDestinationOrder: order
  };
}

async function computeRoute(pickupPlaceId, stopPlaceIds, finalDropPlaceId) {
  const pickup = cleanPlaceId(pickupPlaceId);
  const finalDrop = cleanPlaceId(finalDropPlaceId);
  const stops = Array.isArray(stopPlaceIds) ? stopPlaceIds.map(cleanPlaceId) : [];
  if (stops.length > MAX_STOPS) {
    throw Object.assign(new Error('A maximum of 8 intermediate stops is supported.'), { status: 400 });
  }

  const intermediates = [
    { placeId: pickup },
    ...stops.map(placeId => ({ placeId })),
    { placeId: finalDrop }
  ];

  const payload = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration'
    },
    body: JSON.stringify({
      origin: { address: BASE_ADDRESS },
      destination: { address: BASE_ADDRESS },
      intermediates,
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });

  const route = payload.routes?.[0];
  const distanceMeters = Number(route?.distanceMeters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw Object.assign(new Error('Driving distance could not be calculated for this route.'), { status: 422 });
  }

  const legs = (route.legs || []).map((leg, index) => ({
    index,
    distanceMeters: Number(leg.distanceMeters) || 0,
    distanceKm: Math.round(((Number(leg.distanceMeters) || 0) / 1000) * 10) / 10,
    duration: String(leg.duration || '')
  }));

  return {
    baseAddress: BASE_ADDRESS,
    distanceMeters,
    distanceKmExact: Math.round((distanceMeters / 1000) * 10) / 10,
    billableRouteKm: Math.ceil(distanceMeters / 1000),
    duration: String(route.duration || ''),
    legs
  };
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed.' }, 405);
  try {
    checkBrowserOrigin(request);
    const raw = await request.text();
    if (raw.length > 12000) return json({ success: false, message: 'Request too large.' }, 413);
    const body = JSON.parse(raw || '{}');
    const action = String(body.action || '');

    if (action === 'autocomplete') {
      const input = String(body.input || '').trim();
      if (input.length < 3 || input.length > 150) {
        return json({ success: false, message: 'Enter at least 3 characters.' }, 400);
      }
      return json({ success: true, suggestions: await autocomplete(input) });
    }

    if (action === 'route') {
      const result = await computeRoute(body.pickupPlaceId, body.stopPlaceIds, body.finalDropPlaceId);
      return json({ success: true, ...result, durationSeconds: durationSeconds(result.duration) });
    }

    if (action === 'smart-route') {
      const result = await computeSmartRoute(body.pickupPlaceId, body.stopPlaceIds, body.finalDropPlaceId);
      return json({ success: true, ...result });
    }

    return json({ success: false, message: 'Invalid action.' }, 400);
  } catch (error) {
    return json({ success: false, message: error?.message || 'Google Maps request failed.' }, error?.status || 500);
  }
}
