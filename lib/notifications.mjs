// Server-only: imported by Vercel functions, never by browser code.
const ADMIN_EMAIL = 'carwithdriver.vikhroli@gmail.com';
const FROM = 'Car with Driver Mobility LLP <noreply@carswithdriverindia.com>';
export const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

async function sendEmail(to, subject, text, key, replyTo) {
  if (!process.env.RESEND_API_KEY || !validEmail(to)) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, reply_to: replyTo }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || !result.id) {
      console.error('Resend notification rejected', response.status);
      return false;
    }
    return true;
  } catch {
    console.error('Resend notification unavailable');
    return false;
  }
}

export async function sendNotifications({ kind, reference, email, details }) {
  // Email errors must never roll back an accepted form or saved application.
  try {
    const partner = kind === 'partner';
    const label = partner ? 'Partner application' : 'Booking enquiry';
    const subject = `${label} received - ${reference}`;
    const receipt = partner
      ? 'Your partner application has been received for review. This acknowledgement does not mean your partnership is approved.'
      : 'Your booking enquiry has been received. This is an acknowledgement only, NOT a confirmed booking. Our team will contact you to discuss availability and confirm the details.';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ kind, reference, email, details })));
    const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const admin_email_sent = await sendEmail(ADMIN_EMAIL, subject,
      `${label}\nReference: ${reference}\n\n${details}`, `${kind}/${key}/admin`, validEmail(email) ? email : ADMIN_EMAIL);
    const customer_email_sent = await sendEmail(email, subject,
      `Thank you for contacting Car with Driver Mobility LLP.\n\n${receipt}\n\n${partner ? 'Application Number' : 'Booking ID'}: ${reference}\n\nOur team will contact you shortly.\nContact: ${ADMIN_EMAIL}`,
      `${kind}/${key}/customer`, ADMIN_EMAIL);
    return { admin_email_sent, customer_email_sent };
  } catch {
    console.error('Email notifications unavailable');
    return { admin_email_sent: false, customer_email_sent: false };
  }
}
