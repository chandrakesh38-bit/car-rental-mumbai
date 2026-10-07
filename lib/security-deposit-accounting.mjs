const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function numberFromMoney(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function detailAmount(details, labels) {
  const lines = String(details || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  for (const label of labels) {
    const lower = label.toLowerCase() + ':';
    const line = lines.find(v => v.toLowerCase().startsWith(lower));
    if (line) return roundMoney(numberFromMoney(line.slice(line.indexOf(':') + 1)));
  }
  return 0;
}

export function isSelfDriveBooking(booking) {
  return /self/i.test(String(booking?.service_type || '')) ||
    /self drive/i.test(String(booking?.trip_type || '')) ||
    /SELF DRIVE/i.test(String(booking?.booking_details || ''));
}

export function getSecurityDepositBreakup(booking, paidOverride) {
  const details = String(booking?.booking_details || '');
  const total = roundMoney(Number(booking?.total_fare || booking?.fare_amount || 0));
  const paid = roundMoney(paidOverride === undefined ? Number(booking?.paid_amount || 0) : Number(paidOverride || 0));
  const deposit = detailAmount(details, ['Security Deposit']);
  const delivery = detailAmount(details, ['Delivery Charge']);
  let rental = detailAmount(details, ['Rental Amount', 'Base Rental Fare']);
  if (!rental && total >= deposit + delivery) rental = roundMoney(total - deposit - delivery);

  const serviceAndExtras = Math.max(0, roundMoney(total - deposit));
  const depositReceived = deposit > 0
    ? Math.max(0, Math.min(deposit, roundMoney(paid - serviceAndExtras)))
    : 0;
  const refundMarker = /Security Deposit Refund Issued:/i.test(details);

  return {
    is_self_drive: isSelfDriveBooking(booking),
    rental_amount: rental,
    security_deposit: deposit,
    delivery_charge: delivery,
    total_collectible: total,
    paid,
    balance: Math.max(0, roundMoney(total - paid)),
    deposit_received: roundMoney(depositReceived),
    refund_marked: refundMarker,
    deposit_refunded: refundMarker ? deposit : 0,
    deposit_held: refundMarker ? 0 : roundMoney(depositReceived)
  };
}

function accountingConfig() {
  const url = String(process.env.CWD_ACCOUNTING_SYNC_URL || '').trim().replace(/\/$/, '');
  const secret = String(process.env.CWD_ACCOUNTING_SYNC_SECRET || '');
  const bypass = String(process.env.CWD_ACCOUNTS_PREVIEW_BYPASS || '');
  if (!url || !secret) {
    const error = new Error('Accounting sync is not configured for this environment.');
    error.status = 503;
    throw error;
  }
  return { url, secret, bypass };
}

async function accountingRequest(payload) {
  const { url, secret, bypass } = accountingConfig();
  const headers = {
    'Content-Type': 'application/json',
    'X-CWD-Accounting-Secret': secret
  };
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass;
    headers['x-vercel-set-bypass-cookie'] = 'false';
  }
  const response = await fetch(url + '/api/deposit-sync', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || 'Accounting sync failed.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function commonPayload(booking, paymentMode) {
  return {
    booking_id: String(booking?.booking_id || ''),
    customer_name: String(booking?.customer_name || ''),
    vehicle_name: String(booking?.car_name || ''),
    payment_mode: paymentMode || 'bank_transfer'
  };
}

export async function syncSecurityDepositReceived(booking, paidOverride, paymentMode = 'bank_transfer') {
  const breakup = getSecurityDepositBreakup(booking, paidOverride);
  if (!breakup.is_self_drive || breakup.security_deposit <= 0) return breakup;

  const result = await accountingRequest({
    action: 'sync_received',
    ...commonPayload(booking, paymentMode),
    deposit_received: breakup.deposit_received,
    remarks: 'Security deposit received for ' + booking.booking_id + ' (auto from booking payment allocation)'
  });

  const sheetRefunded = roundMoney(result.refunded || 0);
  const refunded = breakup.refund_marked || sheetRefunded + 0.001 >= breakup.security_deposit;
  return {
    ...breakup,
    accounted_deposit_received: roundMoney(result.received_after || 0),
    accounted_deposit_refunded: sheetRefunded,
    refund_marked: refunded,
    deposit_refunded: refunded ? breakup.security_deposit : sheetRefunded,
    deposit_held: refunded ? 0 : breakup.deposit_received
  };
}

export async function markFullSecurityDepositRefund(booking, paidOverride, paymentMode, adminEmail) {
  const breakup = getSecurityDepositBreakup(booking, paidOverride);
  if (!breakup.is_self_drive || breakup.security_deposit <= 0) {
    const error = new Error('This booking does not have a refundable security deposit.');
    error.status = 400;
    throw error;
  }
  if (String(booking?.booking_status || '').toLowerCase() !== 'completed') {
    const error = new Error('Complete the booking before marking the security deposit refund.');
    error.status = 409;
    throw error;
  }
  if (breakup.deposit_received + 0.001 < breakup.security_deposit) {
    const error = new Error('Full security deposit has not been received yet.');
    error.status = 409;
    throw error;
  }

  const result = await accountingRequest({
    action: 'mark_refund',
    ...commonPayload(booking, paymentMode),
    deposit_amount: breakup.security_deposit,
    remarks: 'Full security deposit refund marked offline in CWD Admin by ' + String(adminEmail || 'admin')
  });
  return { ...breakup, result };
}

export function appendSecurityDepositRefundMarker(details, amount, paymentMode, adminEmail) {
  const text = String(details || '').trim();
  if (/Security Deposit Refund Issued:/i.test(text)) return text;
  const label = paymentMode === 'cash' ? 'Cash' : paymentMode === 'bank_transfer' ? 'Bank Transfer' : 'UPI';
  const line = 'Security Deposit Refund Issued: ₹' + Number(amount || 0).toLocaleString('en-IN') +
    ' | ' + label + ' | ' + new Date().toISOString() + ' | ' + String(adminEmail || 'admin');
  return (text ? text + '\n' : '') + line;
}
