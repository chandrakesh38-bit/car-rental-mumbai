import { validateBookingData } from '../lib/booking-validation.mjs';

export const config = { runtime: 'edge' };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function requireAdmin(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !base() || !serviceKey()) {
    throw Object.assign(new Error('Admin authentication required.'), { status: 401 });
  }

  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz';
  const response = await fetch(base() + '/auth/v1/user', {
    headers: { apikey: publicKey, Authorization: 'Bearer ' + token }
  });
  if (!response.ok) throw Object.assign(new Error('Admin session expired.'), { status: 401 });

  const user = await response.json();
  const allowed = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.length) throw Object.assign(new Error('Admin allowlist is not configured.'), { status: 503 });
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) {
    throw Object.assign(new Error('Admin access denied.'), { status: 403 });
  }
  return { email };
}

async function supabaseRows(table, query = '') {
  if (!base() || !serviceKey()) throw Object.assign(new Error('Operations service is not configured.'), { status: 503 });
  const response = await fetch(base() + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: serviceKey(), Authorization: 'Bearer ' + serviceKey() }
  });
  if (!response.ok) throw Object.assign(new Error('Unable to load current vehicle pricing.'), { status: 503 });
  return response.json();
}

const publicName = row =>
  String(row.segment || '').toLowerCase() === 'sedan' && /dzire|aura/i.test(String(row.full_name || ''))
    ? 'Sedan (Dzire / Aura)'
    : String(row.full_name || '').trim();

async function loadQuoteVehicles() {
  const params = new URLSearchParams({
    select: 'id,full_name,segment,seating_capacity,outstation_rate_per_km,local_pkg_8hr_80km,local_extra_hour_rate,local_extra_km_rate,airport_t1_rate,airport_t2_rate,airport_nmia_rate,is_active,display_order',
    is_active: 'eq.true',
    order: 'display_order.asc'
  });
  const rows = await supabaseRows('with_driver_rates', params.toString());
  return rows.map(row => ({
    key: String(row.id),
    seats: Number(row.seating_capacity) || 0,
    carName: publicName(row),
    segment: String(row.segment || ''),
    outstationRate: Number(row.outstation_rate_per_km) || 0,
    localBaseRate: Number(row.local_pkg_8hr_80km) || 0,
    localExtraHourRate: Number(row.local_extra_hour_rate) || 0,
    localExtraKmRate: Number(row.local_extra_km_rate) || 0,
    airportRates: {
      t1: Number(row.airport_t1_rate) || 0,
      t2: Number(row.airport_t2_rate) || 0,
      nmia: Number(row.airport_nmia_rate) || 0
    }
  }));
}

function cleanText(value, max = 300) {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw Object.assign(new Error('Please complete all quotation details.'), { status: 400 });
  return text;
}

function cleanPlaceId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 220 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw Object.assign(new Error('Please select pickup and destination from Google suggestions.'), { status: 400 });
  }
  return id;
}

function istParts(iso) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const out = {};
  for (const part of parts) if (part.type !== 'literal') out[part.type] = Number(part.value);
  return out;
}

function nightKey(iso) {
  const p = istParts(iso);
  const minutes = p.hour * 60 + (p.minute || 0);
  if (!(minutes >= 23 * 60 || minutes <= 4 * 60)) return null;
  let stamp = Date.UTC(p.year, p.month - 1, p.day);
  if (minutes <= 4 * 60) stamp -= 86400000;
  return new Date(stamp).toISOString().slice(0, 10);
}

function nightCount(values) {
  return new Set(values.map(nightKey).filter(Boolean)).size;
}

function nightRate(segment) {
  return /hatchback|sedan/i.test(String(segment || '')) ? 400 : 600;
}

function localPackageForTimes(pickupAt, returnAt) {
  const start = new Date(pickupAt);
  const end = new Date(returnAt);
  const hours = (end - start) / 3600000;
  if (!Number.isFinite(hours) || hours <= 0) throw Object.assign(new Error('Return date and time must be later than pickup date and time.'), { status: 400 });
  if (hours <= 8) return { key: '8hr_80km', hours: 8, km: 80, extraHours: 0 };
  if (hours <= 10) return { key: '10hr_100km', hours: 10, km: 100, extraHours: 2 };
  if (hours <= 12) return { key: '12hr_120km', hours: 12, km: 120, extraHours: 4 };
  throw Object.assign(new Error('Local quotation supports up to 12 hours. Please use Outstation for a longer trip.'), { status: 400 });
}

const AIRPORT_LABELS = {
  t1: 'Mumbai Airport T1',
  t2: 'Mumbai Airport T2',
  nmia: 'Navi Mumbai International Airport'
};

export default async function handler(request) {
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed.' }, 405);

  try {
    const admin = await requireAdmin(request);
    const raw = await request.text();
    if (raw.length > 12000) return json({ success: false, message: 'Request too large.' }, 413);
    const body = JSON.parse(raw || '{}');
    const action = String(body.action || '');

    if (action === 'ping') {
      return json({ success: true, email: admin.email });
    }

    if (action === 'vehicles') {
      return json({ success: true, vehicles: await loadQuoteVehicles() });
    }

    if (action !== 'calculate') return json({ success: false, message: 'Invalid action.' }, 400);

    const tripType = ['outstation','local','airport'].includes(String(body.tripType || '')) ? String(body.tripType) : '';
    if (!tripType) return json({ success: false, message: 'Select a valid trip type.' }, 400);

    const vehicleKeys = Array.isArray(body.vehicleKeys) ? [...new Set(body.vehicleKeys.map(String))] : [];
    if (!vehicleKeys.length) return json({ success: false, message: 'Select at least one vehicle option.' }, 400);

    const vehicles = await loadQuoteVehicles();
    const selected = vehicleKeys.map(key => vehicles.find(vehicle => vehicle.key === key)).filter(Boolean);
    if (selected.length !== vehicleKeys.length) {
      throw Object.assign(new Error('One of the selected vehicles is no longer available.'), { status: 409 });
    }

    const pickupAt = cleanText(body.pickupAt, 80);
    const pickupLocation = cleanText(body.pickupLocation);
    const pickupPlaceId = cleanPlaceId(body.pickupPlaceId);
    const primaryVehicle = selected[0];
    let returnAt = '';
    let destination = '';
    let durationDays = 1;
    let routeKm = 0;
    let billableKm = 0;
    let quotes = [];
    let routeLabel = '';

    if (tripType === 'outstation') {
      returnAt = cleanText(body.returnAt, 80);
      destination = cleanText(body.destination);
      const destinationPlaceId = cleanPlaceId(body.destinationPlaceId);

      const primary = await validateBookingData('withdriver', {
        tripType: 'outstation',
        carName: primaryVehicle.carName,
        pickupAt,
        returnAt,
        pickupPlaceId,
        pickupLocation,
        destinationPlaceId,
        destination,
        stops: []
      });

      const days = Number(primary.normalized?.days) || 1;
      const googleRouteKm = Number(primary.normalized?.googleRouteKm) || 0;
      const billedKm = Number(primary.normalized?.billableKm) || 0;
      const allowance = Number(primary.normalized?.driverAllowancePerDay) || 500;
      const nights = nightCount([pickupAt, returnAt]);

      durationDays = days;
      routeKm = googleRouteKm;
      billableKm = billedKm;
      routeLabel = pickupLocation + ' → ' + destination;
      quotes = selected.map(vehicle => {
        const nightCharge = nights * nightRate(vehicle.segment);
        return {
          key: vehicle.key,
          seats: vehicle.seats,
          carName: vehicle.carName,
          fare: Math.round(billedKm * vehicle.outstationRate + days * allowance + nightCharge),
          extraKmRate: vehicle.outstationRate,
          days,
          googleRouteKm,
          billableKm: billedKm,
          nightCharge
        };
      });
    } else if (tripType === 'local') {
      const packageMap = {
        '8hr_80km': { hours: 8, km: 80, extraHours: 0, label: '8 Hours / 80 KM' },
        '10hr_100km': { hours: 10, km: 100, extraHours: 2, label: '10 Hours / 100 KM' },
        '12hr_120km': { hours: 12, km: 120, extraHours: 4, label: '12 Hours / 120 KM' }
      };
      const pkg = packageMap[String(body.localPackage || '')];
      if (!pkg) throw Object.assign(new Error('Select a valid local package.'), { status: 400 });
      const start = new Date(pickupAt);
      returnAt = new Date(start.getTime() + pkg.hours * 3600000).toISOString();

      await validateBookingData('withdriver', {
        tripType: 'local',
        carName: primaryVehicle.carName,
        pickupAt,
        pickupLocation,
        pickupPlaceId,
        localPackage: String(body.localPackage)
      });

      const nights = nightCount([pickupAt, returnAt]);
      billableKm = pkg.km;
      routeLabel = pickupLocation;
      quotes = selected.map(vehicle => {
        const nightCharge = nights * nightRate(vehicle.segment);
        const fare = vehicle.localBaseRate + pkg.extraHours * vehicle.localExtraHourRate + nightCharge;
        return {
          key: vehicle.key,
          seats: vehicle.seats,
          carName: vehicle.carName,
          fare: Math.round(fare),
          extraKmRate: vehicle.localExtraKmRate,
          extraHourRate: vehicle.localExtraHourRate,
          includedKm: pkg.km,
          packageHours: pkg.hours,
          packageLabel: pkg.label,
          nightCharge
        };
      });
    } else {
      const airportType = ['pickup','drop'].includes(String(body.airportType || '')) ? String(body.airportType) : '';
      const airportTerminal = ['t1','t2','nmia'].includes(String(body.airportTerminal || '')) ? String(body.airportTerminal) : '';
      if (!airportType || !airportTerminal) throw Object.assign(new Error('Select airport direction and terminal.'), { status: 400 });

      const primary = await validateBookingData('withdriver', {
        tripType: 'airport',
        carName: primaryVehicle.carName,
        pickupAt,
        pickupLocation,
        customerPlaceId: pickupPlaceId,
        pickupPlaceId: airportType === 'drop' ? pickupPlaceId : '',
        airportTerminal,
        airportType
      });
      routeKm = Number(primary.normalized?.airportDistanceKm) || 0;
      const nights = nightCount([pickupAt]);
      const airportName = AIRPORT_LABELS[airportTerminal] || airportTerminal.toUpperCase();
      routeLabel = airportType === 'pickup'
        ? airportName + ' → ' + pickupLocation
        : pickupLocation + ' → ' + airportName;
      quotes = selected.map(vehicle => {
        const nightCharge = nights * nightRate(vehicle.segment);
        return {
          key: vehicle.key,
          seats: vehicle.seats,
          carName: vehicle.carName,
          fare: Math.round((vehicle.airportRates[airportTerminal] || 0) + nightCharge),
          nightCharge
        };
      });
    }

    const reference = 'CWD-Q-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(Math.floor(1000 + Math.random() * 9000));

    return json({
      success: true,
      reference,
      tripType: tripType[0].toUpperCase() + tripType.slice(1),
      pickupAt,
      returnAt,
      pickupLocation,
      pickupPlaceId,
      destination,
      destinationPlaceId: body.destinationPlaceId || '',
      airportType: body.airportType || '',
      airportTerminal: body.airportTerminal || '',
      routeLabel,
      durationDays,
      routeKm,
      billableKm,
      localPackage: tripType === 'local' ? String(body.localPackage || '') : '',
      quotes
    });
  } catch (error) {
    return json({ success: false, message: error?.message || 'Unable to create quotation.' }, error?.status || 500);
  }
}
