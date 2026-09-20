import { requireMobileOtp } from '../lib/mobile-otp.mjs';
import { createVerification } from '../lib/self-drive-documents.mjs';
import { sendNotifications, validEmail } from '../lib/notifications.mjs';

export const config = { runtime: 'edge' };

function extractInquiry({ bookingId, name, phone, email, details, serviceMode }) {
  const text = String(details);
  const lines = text.split('\n').map(v => v.trim()).filter(Boolean);
  const find = label => lines.find(line => line.toLowerCase().startsWith(label.toLowerCase() + ':'))?.split(':').slice(1).join(':').trim();
  const isSelfDrive = serviceMode === 'selfdrive';
  const car = isSelfDrive ? (find('Car') || 'Self Drive') : (text.match(/🚗\s*([^|\n]+)/)?.[1]?.trim() || 'With Driver');
  const fareText = isSelfDrive ? (find('Total Amount') || find('Base Rental Fare') || '') : (text.match(/🚗[^\n]*₹\s*([\d,]+)/)?.[1] || text.match(/₹\s*([\d,]+)/)?.[1] || '');
  const fare = Number(String(fareText).replace(/[^\d.]/g, '')) || 0;
  let service = 'Self Drive', tripType = 'Self Drive', route = find('Delivery Location') || 'Self Pick-up';
  if (!isSelfDrive) {
    service = 'With Driver';
    if (/AIRPORT DROP/i.test(text)) {
      tripType = 'Airport';
      const pickup = text.match(/📍\s*Pickup:\s*([^\n]+)/)?.[1]?.trim() || '';
      const airport = text.match(/✈️\s*([^\n]+)/)?.[1]?.trim() || '';
      route = [pickup, airport].filter(Boolean).join(' → ');
    } else if (/AIRPORT PICKUP/i.test(text)) {
      tripType = 'Airport';
      const airport = text.match(/✈️\s*From:\s*([^\n]+)/)?.[1]?.trim() || '';
      const drop = text.match(/📍\s*Drop:\s*([^\n]+)/)?.[1]?.trim() || '';
      route = [airport, drop].filter(Boolean).join(' → ');
    } else if (/OUTSTATION/i.test(text)) {
      tripType = 'Outstation';
      route = text.match(/📍\s*([^\n]+)/)?.[1]?.trim() || '';
    } else {
      tripType = 'Local';
      route = text.match(/📍\s*([^\n]+)/)?.[1]?.trim() || '';
    }
  }
  return {
    booking_id: bookingId,
    customer_name: name.trim(),
    customer_phone: phone.trim(),
    customer_email: email.trim(),
    service_type: service,
    trip_type: tripType,
    car_name: car,
    route,
    booking_details: text,
    fare_amount: fare,
    total_fare: fare,
    paid_amount: 0,
    payment_status: 'pending',
    booking_status: 'received',
    inquiry_status: 'Received'
  };
}

async function saveInquiry(payload) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw Object.assign(new Error('Booking storage is not configured.'), { status: 503 });
  const response = await fetch(base.replace(/\/$/, '') + '/rest/v1/inquiries', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw Object.assign(new Error('Unable to save booking. Please try again.'), { status: 503 });
}
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
    const { bookingId, name, phone, email, details, serviceMode, submissionKey, otpProof } = JSON.parse(raw);
    if (!/^CWD-WD-\d{6}-\d{4}$/.test(bookingId || '') ||
        typeof name !== 'string' || !name.trim() || name.length > 200 ||
        typeof phone !== 'string' || !/^[+\d\s()-]{7,30}$/.test(phone) ||
        !validEmail(email) || typeof details !== 'string' || !details.trim() || details.length > 15000) {
      return json({ success: false, message: 'Please check your enquiry details and email address.' }, 400);
    }
    await requireMobileOtp(otpProof, phone, 'booking', new URL(request.url).origin);
    const uploadUrl = serviceMode === 'selfdrive'
      ? await createVerification({ bookingId, submissionKey, name, phone, email, details }, new URL(request.url).origin)
      : undefined;
    await saveInquiry(extractInquiry({ bookingId, name, phone, email, details, serviceMode }));
    const notifications = await sendNotifications({
      kind: 'booking', reference: bookingId, email, uploadUrl,
      details: `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\n\n${details}`,
    });
    return json({ success: true, booking_id: bookingId, ...(uploadUrl ? { upload_url: uploadUrl } : {}), ...notifications });
  } catch (error) {
    return json({ success: false, message: error.status ? error.message : 'Unable to submit enquiry. Please try again.' }, error.status || 400);
  }
}
