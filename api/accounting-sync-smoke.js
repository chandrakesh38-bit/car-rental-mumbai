export const config = { runtime: 'edge' };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export async function GET() {
  try {
    const url = String(process.env.CWD_ACCOUNTING_SYNC_URL || '').replace(/\/$/, '');
    const secret = String(process.env.CWD_ACCOUNTING_SYNC_SECRET || '');
    const bypass = String(process.env.CWD_ACCOUNTS_PREVIEW_BYPASS || '');
    if (!url || !secret) return json({ success:false, stage:'config' }, 503);

    const headers = {
      'Content-Type':'application/json',
      'X-CWD-Accounting-Secret':secret
    };
    if (bypass) {
      headers['x-vercel-protection-bypass'] = bypass;
      headers['x-vercel-set-bypass-cookie'] = 'false';
    }

    const response = await fetch(url + '/api/deposit-sync', {
      method:'POST',
      headers,
      body:JSON.stringify({
        action:'sync_received',
        booking_id:'CWD-WD-261006-2309',
        customer_name:'Shivam Pal',
        vehicle_name:'Maruti Suzuki Baleno',
        payment_mode:'bank_transfer',
        deposit_received:0,
        remarks:'Testing smoke check - zero amount, no ledger write'
      })
    });
    const body = await response.json().catch(()=>({}));
    return json({
      success:response.ok && body?.success===true,
      upstream_status:response.status,
      sheet_sync:body?.success===true,
      added:Number(body?.added||0)
    }, response.ok ? 200 : 502);
  } catch (error) {
    return json({ success:false, stage:'request', error:error?.message||'failed' }, 500);
  }
}
