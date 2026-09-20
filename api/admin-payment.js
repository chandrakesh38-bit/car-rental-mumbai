const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const razorAuth = () => {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw Object.assign(new Error('Razorpay is not configured.'), { status: 503 });
  return 'Basic ' + btoa(id + ':' + secret);
};
async function admin(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !base() || !serviceKey()) throw Object.assign(new Error('Admin authentication required.'), { status: 401 });
  // Validate the exact Supabase access token from the signed-in admin session.
  // Use the project's publishable/anon key for Auth validation; the service
  // role remains server-only and is used only for subsequent DB operations.
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz';
  const r = await fetch(base() + '/auth/v1/user', { headers: { apikey: publicKey, Authorization: 'Bearer ' + token } });
  if (!r.ok) throw Object.assign(new Error('Admin session expired.'), { status: 401 });
  const user = await r.json();
  // Authorization is separate from authentication: only explicitly allowed
  // admin emails may use payment-management APIs.
  const allowed = String(process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) throw Object.assign(new Error('Admin allowlist is not configured.'), { status: 503 });
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) throw Object.assign(new Error('Admin access denied.'), { status: 403 });
  return user;
}
async function db(path, options = {}) {
  const r = await fetch(base() + '/rest/v1/' + path, { ...options, headers: { apikey: serviceKey(), Authorization: 'Bearer ' + serviceKey(), 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await r.text();
  if (!r.ok) throw Object.assign(new Error('Database operation failed.'), { status: 503, detail: body });
  return body ? JSON.parse(body) : null;
}
async function razor(path, options = {}) {
  const r = await fetch('https://api.razorpay.com/v1/' + path, { ...options, headers: { Authorization: razorAuth(), 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await r.text(); let data = {}; try { data = JSON.parse(body); } catch {}
  if (!r.ok) throw Object.assign(new Error(data?.error?.description || 'Razorpay request failed.'), { status: 502 });
  return data;
}
async function syncBooking(bookingId) {
  const payments = await db('booking_payments?booking_id=eq.' + encodeURIComponent(bookingId) + '&select=amount,status');
  const paid = (payments || []).filter(p => p.status === 'paid').reduce((sum,p) => sum + Number(p.amount || 0), 0);
  const bookings = await db('inquiries?booking_id=eq.' + encodeURIComponent(bookingId) + '&select=total_fare&limit=1');
  const fare = Number(bookings?.[0]?.total_fare || 0);
  const payment_status = paid <= 0 ? 'pending' : paid >= fare && fare > 0 ? 'paid' : 'partially_paid';
  await db('inquiries?booking_id=eq.' + encodeURIComponent(bookingId), { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({paid_amount:paid,payment_status,updated_at:new Date().toISOString()}) });
  return { paid, fare, payment_status };
}
async function reconcile(record) {
  const link = await razor('payment_links/' + encodeURIComponent(record.razorpay_payment_link_id));
  const captured = Array.isArray(link.payments) ? link.payments.find(p => p.status === 'captured') : null;
  const status = link.status === 'paid' && captured ? 'paid' : link.status === 'cancelled' || link.status === 'expired' ? 'cancelled' : 'pending';
  const patch = { status, updated_at:new Date().toISOString() };
  if (status === 'paid') { patch.razorpay_payment_id = captured.id; patch.paid_at = new Date((captured.created_at || Math.floor(Date.now()/1000))*1000).toISOString(); }
  if (status === 'cancelled') patch.cancelled_at = new Date().toISOString();
  await db('booking_payments?id=eq.' + encodeURIComponent(record.id), {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
  await syncBooking(record.booking_id);
  return { ...record, ...patch, razorpay_status: link.status };
}
async function handle(request) {
  if (!['GET','POST'].includes(request.method)) return json({success:false,message:'Method not allowed.'},405);
  try {
    const adminUser = await admin(request);
    if (request.method === 'GET') {
      const url = new URL(request.url), bookingId = url.searchParams.get('booking_id');
      if (!/^CWD-WD-\d{6}-\d{4}$/.test(bookingId || '')) return json({success:false,message:'Invalid booking ID.'},400);
      let rows = await db('booking_payments?booking_id=eq.'+encodeURIComponent(bookingId)+'&select=*&order=created_at.desc');
      // Webhooks remain primary. If one is delayed/missed, reconcile pending
      // requests against Razorpay whenever the admin opens/refreshed a booking.
      // Only Razorpay's server-side API can promote a request to paid.
      let changed = false;
      const reconciled = [];
      for (const row of (rows || [])) {
        if (row.status === 'pending' && row.razorpay_payment_link_id) {
          try {
            const fresh = await reconcile(row);
            reconciled.push(fresh);
            if (fresh.status !== row.status) changed = true;
          } catch {
            // Do not block payment history if Razorpay is temporarily unavailable.
            reconciled.push(row);
          }
        } else reconciled.push(row);
      }
      if (changed) {
        rows = await db('booking_payments?booking_id=eq.'+encodeURIComponent(bookingId)+'&select=*&order=created_at.desc');
      } else {
        rows = reconciled;
      }
      return json({success:true,payments:rows || []});
    }
    const body = await request.json();
    const bookingId = String(body.booking_id || ''), action = String(body.action || '');
    if (!/^CWD-WD-\d{6}-\d{4}$/.test(bookingId)) return json({success:false,message:'Invalid booking ID.'},400);
    const bookings = await db('inquiries?booking_id=eq.'+encodeURIComponent(bookingId)+'&select=*&limit=1');
    const booking = bookings?.[0]; if (!booking) return json({success:false,message:'Booking not found.'},404);
    if (action === 'record_offline') {
      const amount = Number(body.amount), method = String(body.payment_method || '').toLowerCase();
      if (!Number.isFinite(amount) || amount <= 0 || !['cash','bank_transfer','offline_upi'].includes(method)) return json({success:false,message:'Invalid offline payment.'},400);
      const summary = await syncBooking(bookingId);
      const balance = Math.max(0, Number(summary.fare || 0) - Number(summary.paid || 0));
      if (amount > balance) return json({success:false,message:'Amount cannot exceed booking balance.'},400);
      const rows = await db('booking_payments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({
        booking_id:bookingId,payment_type:'offline',amount,status:'paid',payment_method:method,
        recorded_by:String(adminUser?.email || '').toLowerCase(),paid_at:new Date().toISOString()
      })});
      const updated = await syncBooking(bookingId);
      return json({success:true,payment:rows?.[0],summary:updated});
    }
    if (action === 'create') {
      const amount = Number(body.amount), type = String(body.payment_type || '');
      if (!Number.isFinite(amount) || amount <= 0 || !['advance','full','balance'].includes(type)) return json({success:false,message:'Invalid payment request.'},400);
      const balance = Math.max(0, Number(booking.total_fare || 0) - Number(booking.paid_amount || 0));
      if (amount > balance) return json({success:false,message:'Amount cannot exceed booking balance.'},400);
      const reference = (bookingId + '-' + Date.now().toString(36)).slice(0,40);
      const contact = String(booking.customer_phone || '').replace(/\D/g,'').replace(/^0+/,'');
      const link = await razor('payment_links', {method:'POST',body:JSON.stringify({
        amount: Math.round(amount*100), currency:'INR', accept_partial:false,
        expire_by: Math.floor(Date.now()/1000) + (24 * 60 * 60),
        reference_id:reference, description:'Booking ' + bookingId,
        customer:{name:booking.customer_name, contact: contact.length === 10 ? '+91'+contact : '+'+contact, email:booking.customer_email},
        notify:{sms:false,email:false}, reminder_enable:false,
        notes:{booking_id:bookingId,payment_type:type}
      })});
      const rows = await db('booking_payments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({
        booking_id:bookingId,payment_type:type,amount,status:'pending',
        razorpay_payment_link_id:link.id,razorpay_payment_link_url:link.short_url,razorpay_reference_id:reference
      })});
      return json({success:true,payment:rows?.[0]});
    }
    const rows = await db('booking_payments?id=eq.'+encodeURIComponent(String(body.payment_id || ''))+'&booking_id=eq.'+encodeURIComponent(bookingId)+'&select=*&limit=1');
    const payment = rows?.[0]; if (!payment) return json({success:false,message:'Payment request not found.'},404);
    if (action === 'verify') return json({success:true,payment:await reconcile(payment)});
    if (action === 'cancel') {
      if (payment.status === 'paid') return json({success:false,message:'Paid payment cannot be cancelled.'},409);
      await razor('payment_links/'+encodeURIComponent(payment.razorpay_payment_link_id)+'/cancel',{method:'POST'});
      await db('booking_payments?id=eq.'+encodeURIComponent(payment.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'cancelled',cancelled_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
      await syncBooking(bookingId);
      return json({success:true});
    }
    return json({success:false,message:'Unknown action.'},400);
  } catch (error) { return json({success:false,message:error.message || 'Request failed.'}, error.status || 500); }
}


export function GET(request) {
  return handle(request);
}

export function POST(request) {
  return handle(request);
}
