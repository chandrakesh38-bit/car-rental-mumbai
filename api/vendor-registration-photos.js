export const config = { runtime: 'edge' };

const BUCKET = 'cwd-vendor-registration-photos';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const TYPES = ['image/jpeg','image/png','application/pdf'];
const SLOTS = ['front','right','left','rear','interior'];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
});

const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }

async function supabase(path, options = {}) {
  if (!base() || !key()) fail('Photo upload is temporarily unavailable.', 503);
  return fetch(base() + path, {
    ...options,
    headers: { apikey: key(), Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });
}

async function db(path, options = {}) {
  const response = await supabase('/rest/v1/' + path, options);
  const raw = await response.text();
  if (!response.ok) fail('Unable to verify vendor registration.', 503);
  return raw ? JSON.parse(raw) : null;
}

async function ensureBucket() {
  const check = await supabase('/storage/v1/bucket/' + BUCKET, { method:'GET' });
  if (check.ok) return;
  if (check.status !== 404) fail('Vehicle photo storage is temporarily unavailable.', 503);
  const create = await supabase('/storage/v1/bucket', {
    method:'POST',
    body:JSON.stringify({
      id:BUCKET,
      name:BUCKET,
      public:false,
      file_size_limit:MAX_FILE_SIZE,
      allowed_mime_types:TYPES
    })
  });
  if (!create.ok && create.status !== 409) fail('Unable to prepare vehicle photo storage.', 503);
}

function clean(value, max = 180) { return String(value || '').trim().slice(0, max); }
function validateMeta(slot, type, size) {
  if (!SLOTS.includes(slot)) fail('Invalid vehicle photo position.');
  if (!TYPES.includes(type)) fail('Unsupported file format. Use JPG, PNG or PDF.');
  if (!Number.isInteger(size) || size <= 0) fail('Please choose a non-empty file.');
  if (size > MAX_FILE_SIZE) fail('File size too large. Maximum 5 MB per file.');
}
function validSignature(bytes, type) {
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  return type === 'application/pdf' && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-';
}
async function removeObject(path) {
  if (!path) return;
  await supabase('/storage/v1/object/' + BUCKET, { method:'DELETE', body:JSON.stringify({ prefixes:[path] }) }).catch(()=>{});
}
async function authorize(vendorCode, uploadToken, vehicleNumber) {
  const code = clean(vendorCode, 32);
  const token = clean(uploadToken, 64);
  const number = clean(vehicleNumber, 30).toUpperCase().replace(/\s+/g,'');
  if (!/^CWD[6-9][0-9]{9}$/.test(code) || !/^[0-9a-f-]{36}$/i.test(token) || !/^[A-Z0-9-]{6,20}$/.test(number)) fail('Invalid or expired photo upload session.', 403);

  const vendor = (await db('cwd_vendors?vendor_code=eq.' + encodeURIComponent(code) + '&select=id,vendor_code&limit=1'))?.[0];
  if (!vendor) fail('Invalid or expired photo upload session.', 403);

  const accepted = (await db('cwd_vendor_terms_acceptances?vendor_id=eq.' + encodeURIComponent(vendor.id) + '&audit_request_id=eq.' + encodeURIComponent(token) + '&select=id&limit=1'))?.[0];
  if (!accepted) fail('Invalid or expired photo upload session.', 403);

  const vehicle = (await db('cwd_vendor_vehicles?vendor_id=eq.' + encodeURIComponent(vendor.id) + '&vehicle_number=eq.' + encodeURIComponent(number) + '&select=id,vehicle_number&limit=1'))?.[0];
  if (!vehicle) fail('Registered vehicle not found.', 404);
  return { vendor, vehicle };
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ success:false, message:'Only POST requests are allowed.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ success:false, message:'Invalid request origin.' }, 403);

  try {
    const body = await request.json().catch(()=>null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid photo upload request.');
    const action = clean(body.action, 20);
    const slot = clean(body.slot, 20);
    const type = clean(body.type, 80);
    const size = Number(body.size);
    const filename = clean(body.filename || 'vehicle-photo', 180);
    validateMeta(slot, type, size);

    const { vendor, vehicle } = await authorize(body.vendor_code, body.upload_token, body.vehicle_number);
    await ensureBucket();
    const objectPath = vendor.id + '/' + vehicle.id + '/' + slot;

    if (action === 'prepare') {
      // One current photo per view. Replacing a selection should replace the old object.
      await removeObject(objectPath);
      const response = await supabase('/storage/v1/object/upload/sign/' + BUCKET + '/' + objectPath, { method:'POST', body:'{}' });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data.url) fail('Unable to start photo upload. Please try again.', 503);
      const uploadUrl = new URL(base() + '/storage/v1' + data.url);
      if (uploadUrl.origin !== new URL(base()).origin || !uploadUrl.pathname.startsWith('/storage/v1/object/upload/sign/' + BUCKET + '/')) fail('Unable to start photo upload.', 503);
      return json({ success:true, upload_url:uploadUrl.href, object_path:objectPath });
    }

    if (action !== 'verify') fail('Invalid photo upload action.');
    if (clean(body.object_path, 500) !== objectPath) fail('Invalid photo upload reference.', 403);

    const response = await supabase('/storage/v1/object/authenticated/' + BUCKET + '/' + objectPath, { method:'GET' });
    if (!response.ok) fail('Photo file was not received. Please retry.', 409);
    const actualType = String(response.headers.get('content-type') || '').split(';')[0];
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      validateMeta(slot, actualType, bytes.length);
      if (!validSignature(bytes, actualType)) fail('Unsupported file format. File contents do not match JPG, PNG or PDF.');
    } catch (error) {
      await removeObject(objectPath);
      throw error;
    }

    return json({
      success:true,
      file:{ view_type:slot, original_filename:filename, mime_type:actualType, size_bytes:bytes.length, object_path:objectPath }
    });
  } catch (error) {
    return json({ success:false, message:error?.message || 'Unable to upload vehicle photo.' }, error?.status || 500);
  }
}
