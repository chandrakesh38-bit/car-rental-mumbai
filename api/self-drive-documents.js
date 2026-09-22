import { notifyDocumentEvent } from '../lib/self-drive-review-notifications.mjs';
import { BUCKET, DOC_KINDS, authorize, db, rpc, filesFor, validateMetadata, verifyFile, supabase, config as storageConfig, fail } from '../lib/self-drive-documents.mjs';
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
    if (action === 'status') return json({ success: true, booking_id: bookingId, status: row.status, alternate_phone: row.alternate_phone || '', files: await filesFor(bookingId) });
    if (action === 'submit') {
      if (!['awaiting_documents','reupload_required','pending_verification'].includes(row.status)) fail('Documents are locked.',409);
      if (!/^[6-9]\d{9}$/.test(alternatePhone || '')) fail('Please enter a valid 10-digit alternate mobile number.');
      const files = await filesFor(bookingId);
      if (!DOC_KINDS.every(k => files.some(f => f.kind === k && f.review_status !== 'reupload_required'))) fail('Please upload all required documents.');
      const saved = await rpc('sd_submit_documents',{p_booking_id:bookingId,p_alternate_phone:alternatePhone});
      const admin_email_sent = await notifyDocumentEvent(saved,new URL(request.url).origin);
      return json({ success:true,status:saved.status,admin_email_sent });
    }
    if (!['awaiting_documents','reupload_required'].includes(row.status)) fail('Documents have already been submitted for manual verification.',409);
    if (action === 'verify') return json({ success: true, file: await verifyFile(bookingId, kind, filename) });
    if (action !== 'prepare') fail('Invalid request.');
    validateMetadata(kind, type, size);
    // Recover a successful PUT whose acknowledgement was lost before retrying.
    const existing = await verifyFile(bookingId, kind, filename, true);
    if (existing) return json({ success: true, file: existing });
    const file = (await filesFor(bookingId)).find(f=>f.kind===kind);
    const path = `${bookingId}/${kind}${file?.upload_revision ? '/v' + file.upload_revision : ''}`;
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
