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

async function computeRoute(pickupPlaceId, stopPlaceIds, finalDropPlaceId) {
  const pickup = cleanPlaceId(pickupPlaceId);
  const finalDrop = cleanPlaceId(finalDropPlaceId);
  const stops = Array.isArray(stopPlaceIds) ? stopPlaceIds.map(cleanPlaceId) : [];
  if (stops.length > MAX_STOPS) {
    throw Object.assign(new Error('A maximum of 8 intermediate stops is supported.'), { status: 400 });
  }

  // Google Routes can return no route when the same address is used as both
  // origin and destination in a round trip. Split the journey into two legs:
  // base -> customer route -> final drop, then final drop -> base.
  const outbound = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration'
    },
    body: JSON.stringify({
      origin: { address: BASE_ADDRESS },
      destination: { placeId: finalDrop },
      intermediates: [{ placeId: pickup }, ...stops.map(placeId => ({ placeId }))],
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });

  const back = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration'
    },
    body: JSON.stringify({
      origin: { placeId: finalDrop },
      destination: { address: BASE_ADDRESS },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });

  const first = outbound.routes?.[0];
  const second = back.routes?.[0];
  const firstMeters = Number(first?.distanceMeters);
  const secondMeters = Number(second?.distanceMeters);
  if (!Number.isFinite(firstMeters) || firstMeters <= 0 || !Number.isFinite(secondMeters) || secondMeters <= 0) {
    throw Object.assign(new Error('Driving distance could not be calculated for this route.'), { status: 422 });
  }

  const distanceMeters = firstMeters + secondMeters;
  const legs = [...(first.legs || []), ...(second.legs || [])].map((leg, index) => ({
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
    durationSeconds: durationSeconds(first?.duration) + durationSeconds(second?.duration),
    legs
  };
}

function pickupServiceArea(components, formattedAddress = '') {
  const norm = value => String(value || '').trim().toLowerCase();
  const state = norm(components.administrative_area_level_1);
  const locality = norm(components.locality);
  const postalTown = norm(components.postal_town);
  const admin2 = norm(components.administrative_area_level_2);
  const formatted = norm(formattedAddress);
  if (state && !state.includes('maharashtra')) return null;
  if (['mumbai','bombay'].includes(locality) || ['mumbai','bombay'].includes(postalTown) || ['mumbai suburban','mumbai city'].includes(admin2)) return 'Mumbai';
  if (locality === 'thane' || postalTown === 'thane') return 'Thane';
  if (locality === 'navi mumbai' || postalTown === 'navi mumbai' || formatted.includes(', navi mumbai,') || formatted.startsWith('navi mumbai,')) return 'Navi Mumbai';
  return null;
}

async function validatePickupPlace(placeId) {
  const details = await placeDetails(placeId);
  const area = pickupServiceArea(details.components || {}, details.address);
  return { ...details, allowed: Boolean(area), serviceArea: area || '' };
}

async function placeDetails(placeId) {
  const id = cleanPlaceId(placeId);
  const key = mapsKey();
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('place_id', id);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'en');
  url.searchParams.set('region', 'in');
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !['OK', 'ZERO_RESULTS'].includes(payload.status)) {
    throw Object.assign(new Error(payload.error_message || 'Unable to identify this location.'), { status: 502 });
  }
  const result = payload.results?.[0];
  if (!result) throw Object.assign(new Error('Location details could not be found.'), { status: 422 });
  const components = {};
  for (const part of result.address_components || []) {
    for (const type of part.types || []) if (!components[type]) components[type] = part.long_name;
  }
  return {
    placeId: id,
    address: String(result.formatted_address || ''),
    city: String(components.locality || components.sublocality || components.administrative_area_level_2 || ''),
    state: String(components.administrative_area_level_1 || ''),
    postalCode: String(components.postal_code || ''),
    components
  };
}

const AIRPORT_ADDRESSES = {
  t1: 'Chhatrapati Shivaji Maharaj International Airport Terminal 1, Santacruz East, Mumbai, Maharashtra, India',
  t2: 'Chhatrapati Shivaji Maharaj International Airport Terminal 2, Sahar, Mumbai, Maharashtra, India',
  nmia: 'Navi Mumbai International Airport, Ulwe, Navi Mumbai, Maharashtra, India'
};

async function airportRoute(terminal, customerPlaceId, airportType) {
  const airportAddress = AIRPORT_ADDRESSES[String(terminal || '').toLowerCase()];
  if (!airportAddress || !['pickup', 'drop'].includes(airportType)) {
    throw Object.assign(new Error('Invalid airport transfer.'), { status: 400 });
  }
  const customer = cleanPlaceId(customerPlaceId);
  const origin = airportType === 'pickup' ? { address: airportAddress } : { placeId: customer };
  const destination = airportType === 'pickup' ? { placeId: customer } : { address: airportAddress };
  const payload = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
    body: JSON.stringify({
      origin,
      destination,
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });
  const route = payload.routes?.[0];
  const meters = Number(route?.distanceMeters);
  if (!Number.isFinite(meters) || meters <= 0) {
    throw Object.assign(new Error('Airport transfer distance could not be calculated for this location.'), { status: 422 });
  }
  return {
    distanceMeters: meters,
    distanceKmExact: Math.round((meters / 1000) * 10) / 10,
    durationSeconds: durationSeconds(route?.duration)
  };
}

async function deliveryRoute(placeId) {
  const id = cleanPlaceId(placeId);
  const payload = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
    body: JSON.stringify({
      origin: { address: BASE_ADDRESS },
      destination: { placeId: id },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC'
    })
  });
  const route = payload.routes?.[0];
  const meters = Number(route?.distanceMeters);
  if (!Number.isFinite(meters) || meters <= 0) {
    throw Object.assign(new Error('Delivery distance could not be calculated for this location.'), { status: 422 });
  }
  return {
    oneWayDistanceMeters: meters,
    oneWayDistanceKm: Math.round((meters / 1000) * 10) / 10,
    durationSeconds: durationSeconds(route?.duration)
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

async function reverseGeocode(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw Object.assign(new Error('Invalid location coordinates.'), { status: 400 });
  }
  const key = mapsKey();
  if (!key) throw Object.assign(new Error('Google Maps integration is not configured.'), { status: 503 });
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', latitude + ',' + longitude);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'en');
  url.searchParams.set('region', 'in');
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !['OK','ZERO_RESULTS'].includes(payload.status)) {
    throw Object.assign(new Error(payload.error_message || 'Unable to identify this location.'), { status: 502 });
  }
  const result = payload.results?.[0];
  const components = {};
  for (const part of result?.address_components || []) {
    for (const type of part.types || []) if (!components[type]) components[type] = part.long_name;
  }
  const city = components.locality || components.sublocality || components.administrative_area_level_2 || '';
  const state = components.administrative_area_level_1 || '';
  const postalCode = components.postal_code || '';
  return {
    latitude,
    longitude,
    address: String(result?.formatted_address || ''),
    placeId: String(result?.place_id || ''),
    city,
    state,
    postalCode,
    mapUrl: 'https://www.google.com/maps?q=' + encodeURIComponent(latitude + ',' + longitude)
  };
}

    if (action === 'reverse-geocode') {
      const result = await reverseGeocode(body.latitude, body.longitude);
      return json({ success: true, ...result });
    }

    if (action === 'place-details') {
      const details = await placeDetails(body.placeId);
      const { components, ...safe } = details;
      return json({ success: true, ...safe });
    }

    if (action === 'validate-pickup') {
      const result = await validatePickupPlace(body.placeId);
      const { components, ...safe } = result;
      return json({
        success: true,
        ...safe,
        message: safe.allowed ? 'Pickup location is serviceable.' : 'Pickup is available only in Mumbai, Thane, and Navi Mumbai.'
      });
    }

    if (action === 'delivery-route') {
      return json({ success: true, ...(await deliveryRoute(body.placeId)) });
    }

    if (action === 'airport-route') {
      return json({ success: true, ...(await airportRoute(body.terminal, body.customerPlaceId, body.airportType)) });
    }

    if (action === 'autocomplete') {
      const input = String(body.input || '').trim();
      if (input.length < 3 || input.length > 150) {
        return json({ success: false, message: 'Enter at least 3 characters.' }, 400);
      }
      return json({ success: true, suggestions: await autocomplete(input) });
    }

    if (action === 'route') {
      const result = await computeRoute(body.pickupPlaceId, body.stopPlaceIds, body.finalDropPlaceId);
      return json({ success: true, ...result });
    }


    return json({ success: false, message: 'Invalid action.' }, 400);
  } catch (error) {
    return json({ success: false, message: error?.message || 'Google Maps request failed.' }, error?.status || 500);
  }
}
