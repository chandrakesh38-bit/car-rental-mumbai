export const BUCKET = 'self-drive-documents';
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const DOC_KINDS = ['aadhaar', 'licence_front', 'licence_back', 'pan', 'address_proof'];
export function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
export function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Document verification is temporarily unavailable.', 503);
  return { url: url.replace(/\/$/, ''), headers: { apikey: key, Authorization: `Bearer ${key}` } };
}
export async function supabase(path, options = {}) {
  const { url, headers } = config();
  return fetch(url + path, { ...options, headers: { ...headers, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(20000) });
}
export async function db(table, query = '', options = {}) {
  const response = await supabase(`/rest/v1/${table}${query}`, options);
  if (!response.ok) fail('Unable to save document verification. Please try again.', 503);
  return response.status === 204 ? null : response.json();
}
export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function tokenKey() {
  const secret = process.env.SELF_DRIVE_TOKEN_SECRET;
  if (!secret || secret.length < 32) fail('Document verification is temporarily unavailable.', 503);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('self-drive-token-encryption:' + secret));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function encryptToken(token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await tokenKey(), new TextEncoder().encode(token)));
  return Array.from([...iv,...encrypted], b=>b.toString(16).padStart(2,'0')).join('');
}
export async function decryptToken(encrypted) {
  if (!encrypted) fail('For this older request, ask the customer to open their existing secure upload link once before requesting re-upload.',409);
  try {
    const bytes = Uint8Array.from(encrypted.match(/.{2}/g), x=>parseInt(x,16));
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await tokenKey(),bytes.slice(12)));
  } catch { fail('The secure upload link cannot be recovered. Check the existing token secret.',503); }
}
export async function rpc(name, body) {
  const response = await supabase('/rest/v1/rpc/' + name, { method:'POST', body:JSON.stringify(body) });
  if (!response.ok) fail('The review or documents changed. Refresh and check all required documents before retrying.',409);
  return response.json();
}
export async function createVerification({ bookingId, submissionKey, name, phone, email, details }, origin) {
  if (!/^[a-f0-9]{64}$/.test(submissionKey || '')) fail('Please reopen the booking form and try again.');
  const secret = process.env.SELF_DRIVE_TOKEN_SECRET;
  if (!secret || secret.length < 32) fail('Document verification is temporarily unavailable.', 503);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${bookingId}:${submissionKey}`));
  const token = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
  const token_hash = await hash(token);
  const request_hash = await hash(JSON.stringify({ name, phone, email, details }));
  const row = { booking_id: bookingId, token_hash, request_hash, upload_token_encrypted: await encryptToken(token), site_origin: origin, customer_name: name, customer_phone: phone, customer_email: email, enquiry_details: details, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() };
  // Ignore duplicate inserts; only the same high-entropy submission key may resume.
  await db('self_drive_verifications', '?on_conflict=booking_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(row) });
  const [saved] = await db('self_drive_verifications', `?booking_id=eq.${bookingId}&select=token_hash,request_hash,expires_at`);
  if (!saved || saved.token_hash !== token_hash || saved.request_hash !== request_hash) fail('This booking reference is already in use. Please reopen the form for a new enquiry.', 409);
  if (Date.parse(saved.expires_at) <= Date.now()) fail('This upload link has expired. Please contact our team.', 410);
  return `${origin}/self-drive-documents#booking=${encodeURIComponent(bookingId)}&token=${token}`;
}
export async function authorize(request, bookingId) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!/^CWD-WD-\d{6}-\d{4}$/.test(bookingId || '') || !/^[a-f0-9]{64}$/.test(token || '')) fail('Invalid or expired upload link.', 403);
  const [row] = await db('self_drive_verifications', `?booking_id=eq.${bookingId}&token_hash=eq.${await hash(token)}&select=booking_id,status,expires_at,upload_token_encrypted,site_origin,alternate_phone`);
  if (!row || Date.parse(row.expires_at) <= Date.now()) fail('Invalid or expired upload link. Please contact our team.', 403);
  if (!row.upload_token_encrypted) {
    await db('self_drive_verifications', `?booking_id=eq.${bookingId}&upload_token_encrypted=is.null`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({upload_token_encrypted:await encryptToken(token),site_origin:new URL(request.url).origin})});
  }
  return row;
}
export async function filesFor(bookingId) {
  return db('self_drive_document_files', `?booking_id=eq.${bookingId}&select=kind,filename,mime_type,size_bytes,review_status,rejection_reason,reviewed_at,upload_revision`);
}
export function validateMetadata(kind, type, size) {
  if (!DOC_KINDS.includes(kind)) fail('Invalid document field.');
  if (!DOC_TYPES.includes(type)) fail('Unsupported file format... Use JPG, PNG or PDF.');
  if (!Number.isInteger(size) || size <= 0) fail('Please choose a non-empty file.');
  if (size > MAX_FILE_SIZE) fail('File size too large... Maximum 5 MB per file.');
}
export function validSignature(bytes, type) {
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
  return type === 'application/pdf' && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-';
}
export async function verifyFile(bookingId, kind, filename, allowMissing = false) {
  if (!DOC_KINDS.includes(kind)) fail('Invalid document field.');
  const existing = (await filesFor(bookingId)).find(f => f.kind === kind);
  if (existing?.review_status === 'approved') fail('Approved documents are locked.',409);
  if (existing && existing.review_status !== 'reupload_required') return existing;
  const revision = existing?.upload_revision || 0;
  const path = `${bookingId}/${kind}${revision ? '/v' + revision : ''}`;
  const response = await supabase(`/storage/v1/object/authenticated/${BUCKET}/${path}`, { method: 'GET' });
  if (!response.ok) {
    if (allowMissing && [400,404].includes(response.status)) return null;
    fail('File not received. Please retry this document.', 409);
  }
  const type = response.headers.get('content-type')?.split(';')[0];
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    validateMetadata(kind, type, bytes.length);
    if (!validSignature(bytes, type)) fail('Unsupported file format... File contents do not match JPG, PNG or PDF.');
  } catch (error) {
    // Invalid content is never registered as a submitted document.
    await supabase(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: [path] }) });
    throw error;
  }
  const row = await rpc('sd_record_document', {p_booking_id:bookingId,p_kind:kind,p_filename:String(filename||kind).slice(0,180),p_mime:type,p_size:bytes.length,p_path:path,p_revision:revision});
  return {kind:row.kind,filename:row.filename,mime_type:row.mime_type,size_bytes:row.size_bytes,review_status:row.review_status,upload_revision:row.upload_revision};
}
