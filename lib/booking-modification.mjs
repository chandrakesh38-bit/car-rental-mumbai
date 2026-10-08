const IST = 19800000;
export const moneyRound = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const amount = v => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
export const isSelfDrive = b => /self/i.test(String(b.service_type || '')) || /self drive/i.test(String(b.trip_type || ''));
export function field(details, name) {
  const line = String(details || '').split(/\r?\n/).find(x => x.trim().toLowerCase().startsWith(name.toLowerCase() + ':'));
  return line ? line.slice(line.indexOf(':') + 1).trim() : '';
}
