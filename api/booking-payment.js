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
const serviceKey = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const razorId = () => String(process.env.RAZORPAY_KEY_ID || '');
const razorSecret = () => String(process.env.RAZORPAY_KEY_SECRET || '');

async function validPaymentToken(bookingId, token) {
  const secret = razorSecret();
  if (!secret || !token) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  let bytes;
  try {
    bytes = new Uint8Array(String(token).match(/.{1,2}/g).map(value => parseInt(value, 16)));
  } catch {
    return false;
  }
  return crypto.subtle.verify(
    'HMAC',
    key,
    bytes,
    encoder.encode('booking-payment:' + bookingId)
  );
}

async function db(path, options = {}) {
  if (!base() || !serviceKey()) throw Object.assign(new Error('Payment storage is not configured.'), { status: 503 });
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
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw Object.assign(new Error('Unable to prepare payment.'), { status: 503 });
  return payload;
}

async function razor(path, options = {}) {
  if (!razorId() || !razorSecret()) throw Object.assign(new Error('Online payment is temporarily unavailable.'), { status: 503 });
  const auth = 'Basic ' + btoa(razorId() + ':' + razorSecret());
  const response = await fetch('https://api.razorpay.com/v1/' + path, {
    ...options,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let payload = {};
  try { payload = JSON.parse(raw); } catch {}
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.description || 'Unable to create secure payment link.'), { status: 502 });
  }
  return payload;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length > 10) return '+' + digits;
  return '';
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ success: false, message: 'Invalid request origin.' }, 403);

  try {
    const raw = await request.text();
    if (raw.length > 5000) return json({ success: false, message: 'Request too large.' }, 413);
    const body = JSON.parse(raw || '{}');
    const bookingId = String(body.booking_id || '');
    const token = String(body.payment_token || '');

    if (!/^CWD-WD-\d{6}-\d{4}$/.test(bookingId)) {
      return json({ success: false, message: 'Invalid booking ID.' }, 400);
    }
    if (!(await validPaymentToken(bookingId, token))) {
      return json({ success: false, message: 'This payment request is no longer valid.' }, 403);
    }

    const bookings = await db(
      'inquiries?booking_id=eq.' + encodeURIComponent(bookingId) +
      '&select=booking_id,customer_name,customer_phone,customer_email,total_fare,paid_amount,payment_status&limit=1'
    );
    const booking = bookings?.[0];
    if (!booking) return json({ success: false, message: 'Booking not found.' }, 404);

    const totalFare = Number(booking.total_fare || 0);
    const paidAmount = Number(booking.paid_amount || 0);
    if (!Number.isFinite(totalFare) || totalFare <= 0) {
      return json({ success: false, message: 'Booking amount is not available yet. Please choose Pay Later.' }, 409);
    }

    const advanceAmount = Math.max(1, Math.round(totalFare * 0.20));
    if (paidAmount >= advanceAmount) {
      return json({ success: true, already_paid: true, advance_amount: advanceAmount });
    }

    const existing = await db(
      'booking_payments?booking_id=eq.' + encodeURIComponent(bookingId) +
      '&payment_type=eq.advance&status=eq.pending&amount=eq.' + encodeURIComponent(String(advanceAmount)) +
      '&select=razorpay_payment_link_url,created_at&order=created_at.desc&limit=1'
    );
    if (existing?.[0]?.razorpay_payment_link_url) {
      return json({
        success: true,
        payment_url: existing[0].razorpay_payment_link_url,
        advance_amount: advanceAmount,
        total_fare: totalFare,
        reused: true
      });
    }

    const reference = (bookingId + '-ADV-' + Date.now().toString(36)).slice(0, 40);
    const paymentLink = await razor('payment_links', {
      method: 'POST',
      body: JSON.stringify({
        amount: advanceAmount * 100,
        currency: 'INR',
        accept_partial: false,
        expire_by: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        reference_id: reference,
        description: '20% advance for booking ' + bookingId,
        customer: {
          name: String(booking.customer_name || '').slice(0, 200),
          contact: normalizePhone(booking.customer_phone),
          email: String(booking.customer_email || '').slice(0, 200)
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: {
          booking_id: bookingId,
          payment_type: 'advance',
          source: 'customer_pay_now'
        }
      })
    });

    await db('booking_payments', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        booking_id: bookingId,
        payment_type: 'advance',
        amount: advanceAmount,
        status: 'pending',
        razorpay_payment_link_id: paymentLink.id,
        razorpay_payment_link_url: paymentLink.short_url,
        razorpay_reference_id: reference
      })
    });

    return json({
      success: true,
      payment_url: paymentLink.short_url,
      advance_amount: advanceAmount,
      total_fare: totalFare
    });
  } catch (error) {
    return json({ success: false, message: error?.message || 'Unable to start payment.' }, error?.status || 500);
  }
}
