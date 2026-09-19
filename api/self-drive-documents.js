import { BUCKET, DOC_KINDS, authorize, db, filesFor, validateMetadata, verifyFile, supabase, config as storageConfig, fail } from '../lib/self-drive-documents.mjs';
export const config = { runtime: 'edge' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export default async function handler(request) {
  if (request.method !== 'POST') return json({ success: false, message: 'Only POST requests are allowed.' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({ success: false, message: 'Invalid request origin.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 4000) fail('Request too large.', 413);
    const { bookingId, action, kind, type, size, filename, alternatePhone } = JSON.parse(raw);
    const row = await authorize(request, bookingId);
    if (action === 'status') return json({ success: true, booking_id: bookingId, status: row.status, files: await filesFor(bookingId) });
    if (action === 'submit') {
      if (row.status !== 'awaiting_documents') return json({ success: true, status: row.status });
      if (!/^[6-9]\d{9}$/.test(alternatePhone || '')) fail('Please enter a valid 10-digit alternate mobile number.');
      const files = await filesFor(bookingId);
      if (!DOC_KINDS.every(k => files.some(f => f.kind === k))) fail('Please upload all required documents.');
      await db('self_drive_verifications', `?booking_id=eq.${bookingId}&status=eq.awaiting_documents`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ alternate_phone: alternatePhone, status: 'pending_verification', submitted_at: new Date().toISOString() }) });
      return json({ success: true, status: 'pending_verification' });
    }
    if (row.status !== 'awaiting_documents') fail('Documents have already been submitted for manual verification.', 409);
    if (action === 'verify') return json({ success: true, file: await verifyFile(bookingId, kind, filename) });
    if (action !== 'prepare') fail('Invalid request.');
    validateMetadata(kind, type, size);
    // Recover a successful PUT whose acknowledgement was lost before retrying.
    const existing = await verifyFile(bookingId, kind, filename, true);
    if (existing) return json({ success: true, file: existing });
    const path = `${bookingId}/${kind}`;
    const response = await supabase(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', body: '{}' });
    if (!response.ok) fail('Unable to start upload. Please try again.', 503);
    const data = await response.json();
    const base = storageConfig().url;
    const uploadUrl = new URL(base + '/storage/v1' + data.url);
    if (uploadUrl.origin !== new URL(base).origin || !uploadUrl.pathname.startsWith(`/storage/v1/object/upload/sign/${BUCKET}/`)) fail('Unable to start upload.', 503);
    return json({ success: true, upload_url: uploadUrl.href });
  } catch (error) {
    return json({ success: false, message: error.status ? error.message : 'Unable to process documents. Please retry.' }, error.status || 503);
  }
}
