export const config = { runtime: 'edge' };

const TERMS_VERSION = 'CWD-VENDOR-TERMS-V1';
const RATE_CARD_VERSIONS = {
  outstation: 'CWD-VENDOR-RATE-V2',
  local: 'CWD-VENDOR-LOCAL-V1',
  one_way: 'CWD-ONEWAY-RULE-V1'
};

const TERMS_SNAPSHOT = [
  'CWD With-Driver Vendor Terms & Conditions',
  '1. Vendor payout is processed after booking completion on the next calendar day on or before 4:00 PM.',
  '2. The allocated vendor must arrange an equivalent replacement vehicle in case of breakdown or cancellation.',
  '3. If a last-minute cancellation or breakdown occurs and the vendor cannot provide an equivalent replacement vehicle, a Rs.500 penalty applies.',
  '4. CWD does not promise or guarantee any booking volume or earnings.',
  '5. Toll, parking and state tax are settled as actual/as applicable.',
  '6. Night charge applies only when the vehicle is actually driven between 10:00 PM and 6:00 AM.',
  '7. Vendor confirms that the registration, vehicle and payout details submitted are accurate.'
].join('\n');

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function text(value, max, label) {
  const out = String(value || '').trim();
  if (!out) fail(label + ' is required.');
  if (out.length > max) fail(label + ' is too long.');
  return out;
}

function optionalText(value, max, label) {
  const out = String(value || '').trim();
  if (!out) return null;
  if (out.length > max) fail(label + ' is too long.');
  return out;
}

function mobile(value, label, required = true) {
  const out = String(value || '').replace(/\D/g, '').slice(-10);
  if (!out && !required) return null;
  if (!/^[6-9][0-9]{9}$/.test(out)) fail('Please enter a valid ' + label + '.');
  return out;
}

function email(value) {
  const out = String(value || '').trim().toLowerCase();
  if (!out) return null;
  if (out.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out)) fail('Please enter a valid email address.');
  return out;
}

function pan(value) {
  const out = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(out)) fail('Please enter a valid PAN.');
  return out;
}

function ifsc(value) {
  const out = String(value || '').trim().toUpperCase();
  if (!out) return null;
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(out)) fail('Please enter a valid IFSC code.');
  return out;
}

function upi(value) {
  const out = String(value || '').trim();
  if (!out) return null;
  if (out.length > 120 || !/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(out)) fail('Please enter a valid UPI ID.');
  return out;
}

async function db(path, options = {}) {
  if (!base() || !serviceKey()) fail('Vendor registration is temporarily unavailable.', 503);
  const response = await fetch(base() + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: serviceKey(),
      Authorization: 'Bearer ' + serviceKey(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  if (!response.ok) {
    let code = '';
    try { code = String(JSON.parse(raw)?.code || ''); } catch {}
    if (code === '23505') fail('This mobile number or vehicle number is already registered.', 409);
    fail('Unable to save vendor registration. Please try again.', 503);
  }
  return raw ? JSON.parse(raw) : null;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(value) {
  if (!serviceKey()) fail('Vendor registration is temporarily unavailable.', 503);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serviceKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map(v => v.toString(16).padStart(2, '0')).join('');
}

async function createUploadToken(vendorCode) {
  const stamp = Date.now();
  return String(stamp) + '.' + await hmacHex(String(vendorCode) + '|' + String(stamp));
}

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || '';
}

function validateVehicle(raw, index) {
  const currentYear = new Date().getFullYear();
  const year = Number(raw?.manufacturing_year);
  const seating = Number(raw?.seating);
  const fuel = text(raw?.fuel, 30, 'Vehicle ' + (index + 1) + ' fuel');
  const allowedFuel = new Set(['Petrol','Diesel','CNG','Petrol+CNG','Electric','Hybrid','Other']);
  if (!allowedFuel.has(fuel)) fail('Vehicle ' + (index + 1) + ' has an invalid fuel type.');
  if (!Number.isInteger(year) || year < currentYear - 4 || year > currentYear) fail('Vehicle ' + (index + 1) + ' must be manufactured between ' + (currentYear - 4) + ' and ' + currentYear + '.');
  if (!Number.isInteger(seating) || seating < 2 || seating > 20) fail('Vehicle ' + (index + 1) + ' seating is invalid.');

  const vehicleNumber = text(raw?.vehicle_number, 30, 'Vehicle number').toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9-]{6,20}$/.test(vehicleNumber)) fail('Please enter a valid vehicle number.');

  return {
    id: crypto.randomUUID(),
    vehicle_number: vehicleNumber,
    make_model: text(raw?.make_model, 160, 'Make / model'),
    category: text(raw?.category, 80, 'Vehicle category'),
    manufacturing_year: year,
    fuel,
    seating,
    commercial_permit_type: text(raw?.commercial_permit_type, 120, 'Commercial / permit type'),
    rc_number: vehicleNumber,
    // Legacy DB columns are still NOT NULL in the live project. These placeholders
    // keep the schema compatible without collecting insurance/PUC data from vendors.
    insurance_policy_number: 'NOT_COLLECTED',
    puc_number: 'NOT_COLLECTED'
  };
}

export default async function handler(request) {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const lookupMobile = String(url.searchParams.get('mobile') || '').replace(/\D/g, '').slice(-10);
      if (url.searchParams.has('mobile')) {
        if (!/^[6-9][0-9]{9}$/.test(lookupMobile)) return json({ success: true, exists: false });
        const existing = (await db('cwd_vendors?primary_whatsapp=eq.' + encodeURIComponent(lookupMobile) + '&select=id,vendor_code&limit=1'))?.[0];
        return json({
          success: true,
          exists: Boolean(existing),
          vendor_code: existing?.vendor_code || null
        });
      }
      const rows = await db('with_driver_rates?select=id,full_name,segment&is_active=eq.true&order=display_order.asc,full_name.asc');
      return json({ success: true, vehicles: rows || [] });
    } catch (error) {
      return json({ success: false, message: error?.message || 'Unable to load vehicle list.' }, error?.status || 500);
    }
  }
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed.' }, 405);

  try {
    const origin = request.headers.get('origin');
    const selfOrigin = new URL(request.url).origin;
    if (origin && origin !== selfOrigin) fail('Invalid request origin.', 403);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid registration request.');

    if (body.terms_accepted !== true || body.terms_version !== TERMS_VERSION) {
      fail('You must accept the current CWD Vendor Terms & Conditions.');
    }

    if (body.action === 'add_vehicle') {
      const primaryWhatsapp = mobile(body.primary_whatsapp, 'primary WhatsApp mobile');
      const vendor = (await db('cwd_vendors?primary_whatsapp=eq.' + encodeURIComponent(primaryWhatsapp) + '&select=id,vendor_code&limit=1'))?.[0];
      if (!vendor) fail('No existing vendor registration was found for this mobile number.', 404);

      if (!Array.isArray(body.vehicles) || body.vehicles.length < 1) fail('Please add at least one vehicle.');
      if (body.vehicles.length > 20) fail('A maximum of 20 vehicles can be added at one time.');
      const vehicles = body.vehicles.map(validateVehicle);

      for (const vehicle of vehicles) {
        const existingVehicle = (await db('cwd_vendor_vehicles?vehicle_number=eq.' + encodeURIComponent(vehicle.vehicle_number) + '&select=id&limit=1'))?.[0];
        if (existingVehicle) fail('This vehicle number is already registered with CWD.', 409);
      }

      await db('cwd_vendor_vehicles', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(vehicles.map(v => ({ ...v, vendor_id: vendor.id, is_active: false })))
      });

      return json({
        success: true,
        existing_vendor: true,
        vendor_code: vendor.vendor_code,
        upload_token: await createUploadToken(vendor.vendor_code),
        status: 'pending_vehicle_review',
        message: 'New vehicle submitted for review.'
      });
    }

    const ownerBusinessName = text(body.owner_business_name, 160, 'Owner / business name');
    const primaryWhatsapp = mobile(body.primary_whatsapp, 'primary WhatsApp mobile');
    const existingVendor = (await db('cwd_vendors?primary_whatsapp=eq.' + encodeURIComponent(primaryWhatsapp) + '&select=id&limit=1'))?.[0];
    if (existingVendor) fail('This mobile number is already registered. Use Add Another Vehicle instead.', 409);
    const alternateMobile = mobile(body.alternate_mobile, 'alternate mobile', false);
    if (alternateMobile && alternateMobile === primaryWhatsapp) fail('Alternate mobile must be different from the primary mobile.');

    const payoutMode = String(body.payout_mode || '').trim();
    if (!['upi','bank','bank_upi'].includes(payoutMode)) fail('Please select a payout method.');

    const accountHolder = optionalText(body.account_holder_name, 160, 'Account holder name');
    const bankName = optionalText(body.bank_name, 160, 'Bank name');
    const accountNumber = optionalText(body.account_number, 40, 'Account number');
    const ifscCode = ifsc(body.ifsc);
    const upiId = upi(body.upi_id);

    if ((payoutMode === 'bank' || payoutMode === 'bank_upi') && (!accountHolder || !accountNumber || !ifscCode)) {
      fail('Bank account holder, account number and IFSC are required for bank payout.');
    }
    if ((payoutMode === 'upi' || payoutMode === 'bank_upi') && !upiId) {
      fail('UPI ID is required for UPI payout.');
    }

    if (!Array.isArray(body.vehicles) || body.vehicles.length < 1) fail('Please add at least one vehicle.');
    if (body.vehicles.length > 20) fail('A maximum of 20 vehicles can be added in one registration.');
    const vehicles = body.vehicles.map(validateVehicle);

    const vendorId = crypto.randomUUID();
    const vendorCode = 'CWD' + primaryWhatsapp;
    const requestId = crypto.randomUUID();

    const vendor = {
      id: vendorId,
      vendor_code: vendorCode,
      owner_business_name: ownerBusinessName,
      primary_whatsapp: primaryWhatsapp,
      alternate_mobile: alternateMobile,
      email: email(body.email),
      base_location: text(body.base_location, 160, 'Base location / area'),
      address: text(body.address, 1000, 'Address'),
      pan: pan(body.pan),
      status: 'pending_review'
    };

    await db('cwd_vendors', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(vendor)
    });

    try {
      await db('cwd_vendor_payout_accounts', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          vendor_id: vendorId,
          payout_mode: payoutMode,
          account_holder_name: accountHolder,
          bank_name: bankName,
          account_number: accountNumber,
          ifsc: ifscCode,
          upi_id: upiId
        })
      });

      await db('cwd_vendor_vehicles', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(vehicles.map(v => ({ ...v, vendor_id: vendorId })))
      });

      const ip = clientIp(request);
      const auditHash = ip ? await sha256(ip + '|' + String(request.headers.get('user-agent') || '')) : null;

      await db('cwd_vendor_terms_acceptances', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          vendor_id: vendorId,
          terms_version: TERMS_VERSION,
          rate_card_versions: RATE_CARD_VERSIONS,
          terms_snapshot: TERMS_SNAPSHOT,
          accepted_at: new Date().toISOString(),
          audit_ip_hash: auditHash,
          audit_user_agent: String(request.headers.get('user-agent') || '').slice(0, 500) || null,
          audit_request_id: requestId
        })
      });
    } catch (error) {
      await db('cwd_vendors?id=eq.' + encodeURIComponent(vendorId), {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      }).catch(() => {});
      throw error;
    }

    return json({
      success: true,
      vendor_code: vendorCode,
      upload_token: await createUploadToken(vendorCode),
      status: 'pending_review',
      terms_version: TERMS_VERSION,
      rate_card_versions: RATE_CARD_VERSIONS,
      message: 'Vendor registration submitted successfully.'
    });
  } catch (error) {
    return json({
      success: false,
      message: error?.message || 'Unable to submit vendor registration.'
    }, error?.status || 500);
  }
}
