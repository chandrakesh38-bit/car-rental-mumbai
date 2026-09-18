import { sendNotifications, validEmail } from '../lib/notifications.mjs';

export const config = { runtime: 'edge' };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

export default async function handler(request) {
  if (request.method !== 'POST') return json({ success: false, message: 'Only POST requests are allowed.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ success: false, message: 'Invalid request origin.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 20000) return json({ success: false, message: 'Enquiry is too large.' }, 413);
    const { bookingId, name, phone, email, details } = JSON.parse(raw);
    if (!/^CWD-WD-\d{6}-\d{4}$/.test(bookingId || '') ||
        typeof name !== 'string' || !name.trim() || name.length > 200 ||
        typeof phone !== 'string' || !/^[+\d\s()-]{7,30}$/.test(phone) ||
        !validEmail(email) || typeof details !== 'string' || !details.trim() || details.length > 15000) {
      return json({ success: false, message: 'Please check your enquiry details and email address.' }, 400);
    }
    const notifications = await sendNotifications({
      kind: 'booking', reference: bookingId, email,
      details: `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\n\n${details}`,
    });
    return json({ success: true, booking_id: bookingId, ...notifications });
  } catch {
    return json({ success: false, message: 'Unable to submit enquiry. Please try again.' }, 400);
  }
}
