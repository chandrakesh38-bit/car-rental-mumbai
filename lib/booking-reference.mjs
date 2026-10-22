// The server reserves references atomically across checkout and enquiry flows.
// A reference alone never authorizes access to a booking.
export async function reserveBookingReference(key) {
  const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)throw Object.assign(new Error('Booking storage is unavailable.'),{status:503});
  const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/cwd_reserve_booking_reference',{
    method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},
    body:JSON.stringify({p_key:key}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Object.assign(new Error('Unable to reserve a booking reference. Please retry.'),{status:503});
  const id=await r.json();
  if(!/^[1-9]\d{5}$/.test(id))throw Object.assign(new Error('Invalid booking reference.'),{status:503});
  return id;
}
