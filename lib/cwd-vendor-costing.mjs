// Final internal vendor costing rates. This module is server-only; never import it into customer-facing pages.
export const FINAL_VENDOR_RATE_CARD = Object.freeze({
  'wagon-r': Object.freeze({ vehicle: 'Wagon R', outstation_rate_per_km: 12, minimum_outstation_km_per_day: 300, driver_allowance_per_day: 400, local_extra_km_rate: 12, local_extra_hour_rate: 110, night_charge: 1000 }),
  dzire: Object.freeze({ vehicle: 'Dzire', outstation_rate_per_km: 14, minimum_outstation_km_per_day: 300, driver_allowance_per_day: 500, local_extra_km_rate: 14, local_extra_hour_rate: 150, night_charge: 1200 }),
  ertiga: Object.freeze({ vehicle: 'Ertiga', outstation_rate_per_km: 16, minimum_outstation_km_per_day: 300, driver_allowance_per_day: 700, local_extra_km_rate: 16, local_extra_hour_rate: 150, night_charge: 1500 }),
  'innova-crysta': Object.freeze({ vehicle: 'Innova Crysta', outstation_rate_per_km: 22, minimum_outstation_km_per_day: 300, driver_allowance_per_day: 700, local_extra_km_rate: 22, local_extra_hour_rate: 200, night_charge: 1500 }),
});

function normalizeVehicleName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function finalVendorRateForVehicle(vehicleName) {
  const name = normalizeVehicleName(vehicleName);
  if (/\bwagon\s*r\b|\bwagonr\b/.test(name)) return { ...FINAL_VENDOR_RATE_CARD['wagon-r'] };
  if (/\bdzire\b|\baura\b/.test(name)) return { ...FINAL_VENDOR_RATE_CARD.dzire };
  if (/\bertiga\b/.test(name)) return { ...FINAL_VENDOR_RATE_CARD.ertiga };
  if (/\binnova\s*crysta\b/.test(name)) return { ...FINAL_VENDOR_RATE_CARD['innova-crysta'] };
  return null;
}

export function applyFinalVendorRate(vehicleName, configuredRate = {}) {
  const fixed = finalVendorRateForVehicle(vehicleName);
  if (!fixed) return { ...configuredRate };
  return { ...configuredRate, ...fixed };
}

export function calculateFinalOutstationVendorCost({ vehicleName, routeKm = 0, dutyDays = 1, nightCount = 0, toll = 0, parking = 0 }) {
  const rate = finalVendorRateForVehicle(vehicleName);
  if (!rate) throw new Error('Vehicle is not present in the finalized vendor rate card.');
  const days = Math.max(1, Math.floor(Number(dutyDays) || 1));
  const km = Math.max(0, Math.ceil(Number(routeKm) || 0));
  const billableKm = Math.max(km, days * rate.minimum_outstation_km_per_day);
  const night = Math.max(0, Math.floor(Number(nightCount) || 0));
  const kmCost = billableKm * rate.outstation_rate_per_km;
  const driverAllowance = days * rate.driver_allowance_per_day;
  const nightCost = night * rate.night_charge;
  const tollCost = Math.max(0, Number(toll) || 0);
  const parkingCost = Math.max(0, Number(parking) || 0);
  return {
    vehicle: rate.vehicle, dutyDays: days, billableKm, kmRate: rate.outstation_rate_per_km,
    kmCost, driverAllowance, nightCount: night, nightRate: rate.night_charge, nightCost,
    toll: tollCost, parking: parkingCost, total: kmCost + driverAllowance + nightCost + tollCost + parkingCost,
  };
}
