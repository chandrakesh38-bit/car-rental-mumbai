// CWD vendor/customer fare policy — testing branch only until approved for production.
// Keep the booked billable km identical for customer and vendor.
export const MIN_OUTSTATION_KM_DAY = 200;
export const CUSTOMER_EXTRA_KM_INCREMENT = 1;
export const CUSTOMER_NIGHT_CHARGE = 500;
export const VENDOR_NIGHT_CHARGE = 300;

const positive = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function billableOutstationKm(routeKm, dutyDays, minimumKmDay = MIN_OUTSTATION_KM_DAY) {
  const days = Math.max(1, Math.floor(positive(dutyDays, 1)));
  return Math.max(Math.ceil(positive(routeKm)), days * positive(minimumKmDay, MIN_OUTSTATION_KM_DAY));
}

export function customerOutstationBreakdown({ km, dutyDays = 1, kmRate, driverAllowance = 0,
  nightCount = 0, minimumKmDay = MIN_OUTSTATION_KM_DAY }) {
  const days = Math.max(1, Math.floor(positive(dutyDays, 1)));
  const included = days * positive(minimumKmDay, MIN_OUTSTATION_KM_DAY);
  const billableKm = billableOutstationKm(km, days, minimumKmDay);
  const extraKm = Math.max(0, billableKm - included);
  const baseKm = billableKm - extraKm;
  const normalRate = positive(kmRate);
  const extraKmRate = normalRate + CUSTOMER_EXTRA_KM_INCREMENT;
  const fare = baseKm * normalRate + extraKm * extraKmRate
    + days * positive(driverAllowance) + Math.floor(positive(nightCount)) * CUSTOMER_NIGHT_CHARGE;
  return { fare, billableKm, baseKm, extraKm, normalRate, extraKmRate,
    driverAllowance: days * positive(driverAllowance),
    nightCharge: Math.floor(positive(nightCount)) * CUSTOMER_NIGHT_CHARGE };
}

export function vendorOutstationBreakdown({ billableKm, dutyDays = 1, vendorKmRate,
  driverAllowance = 0, nightCount = 0 }) {
  const days = Math.max(1, Math.floor(positive(dutyDays, 1)));
  const km = Math.max(0, positive(billableKm));
  const rate = positive(vendorKmRate);
  const kmFare = km * rate;
  const da = days * positive(driverAllowance);
  const night = Math.floor(positive(nightCount)) * VENDOR_NIGHT_CHARGE;
  return { billableKm: km, kmRate: rate, kmFare, driverAllowance: da,
    nightCharge: night, payout: kmFare + da + night };
}

function istParts(iso) {
  const dt = new Date(iso);
  if (!iso || Number.isNaN(dt.valueOf())) return null;
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const part of format.formatToParts(dt)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return p;
}

export function qualifyingNightKey(iso) {
  const p = istParts(iso);
  if (!p) return null;
  const mins = p.hour * 60 + p.minute;
  // 10:01 PM to 5:59 AM, endpoints only. 10 PM and 6 AM are excluded.
  if (!(mins >= 22 * 60 + 1 || mins <= 5 * 60 + 59)) return null;
  const date = Date.UTC(p.year, p.month - 1, p.day) - (mins <= 359 ? 86400000 : 0);
  return new Date(date).toISOString().slice(0, 10);
}

export function bookingNightCount(start, end) {
  const a = istParts(start), b = istParts(end);
  if (!a && !b) return 0;
  const first = qualifyingNightKey(start);
  const last = qualifyingNightKey(end);
  // One duty on the same calendar date must never be charged twice,
  // e.g. 4:00 AM pickup and 11:00 PM drop on the same date.
  if (a && b && a.year === b.year && a.month === b.month && a.day === b.day)
    return first || last ? 1 : 0;
  return new Set([first, last].filter(Boolean)).size;
}

export function marginPreview(customerFare, vendorPayout) {
  const fare = positive(customerFare);
  const payout = positive(vendorPayout);
  return { grossDifference: fare - payout,
    grossMarginPercent: fare > 0 ? Math.round((fare - payout) / fare * 1000) / 10 : 0 };
}
