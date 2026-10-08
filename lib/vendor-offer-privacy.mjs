// Vendor offer privacy boundary: never expose street-level freeform route text
// before CWD admin has assigned this offer to this vendor.
//
// This is deliberately an allowlist, NOT a best-effort address truncation.
// Unknown locations must stay redacted rather than risk releasing customer PII.
const AREA_NAMES = [
  ['navi mumbai','Navi Mumbai'],
  ['mumbai airport','Mumbai Airport'],
  ['trimbakeshwar','Trimbakeshwar'],
  ['mahabaleshwar','Mahabaleshwar'],
  ['panchgani','Panchgani'],
  ['bhimashankar','Bhimashankar'],
  ['lonavala','Lonavala'],
  ['khandala','Khandala'],
  ['vikhroli','Vikhroli'],
  ['ghansoli','Ghansoli'],
  ['kandivali','Kandivali'],
  ['andheri','Andheri'],
  ['bandra','Bandra'],
  ['borivali','Borivali'],
  ['chembur','Chembur'],
  ['powai','Powai'],
  ['dadar','Dadar'],
  ['kurla','Kurla'],
  ['malad','Malad'],
  ['mulund','Mulund'],
  ['bhandup','Bhandup'],
  ['jogeshwari','Jogeshwari'],
  ['goregaon','Goregaon'],
  ['santacruz','Santacruz'],
  ['sion','Sion'],
  ['mahim','Mahim'],
  ['wadala','Wadala'],
  ['matunga','Matunga'],
  ['juhu','Juhu'],
  ['colaba','Colaba'],
  ['fort','Fort'],
  ['khar','Khar'],
  ['worli','Worli'],
  ['mahalaxmi','Mahalaxmi'],
  ['thane','Thane'],
  ['airoli','Airoli'],
  ['vashi','Vashi'],
  ['nerul','Nerul'],
  ['belapur','Belapur'],
  ['panvel','Panvel'],
  ['kharghar','Kharghar'],
  ['dombivli','Dombivli'],
  ['kalyan','Kalyan'],
  ['mumbai','Mumbai'],
  ['pune','Pune'],
  ['nashik','Nashik'],
  ['shirdi','Shirdi'],
  ['alibaug','Alibaug'],
  ['igatpuri','Igatpuri'],
  ['matheran','Matheran'],
  ['karjat','Karjat'],
  ['kasauli','Kasauli'],
  ['aurangabad','Aurangabad'],
  ['chhatrapati sambhajinagar','Chhatrapati Sambhajinagar'],
  ['goa','Goa'],
  ['surat','Surat'],
  ['vadodara','Vadodara'],
  ['ahmedabad','Ahmedabad'],
  ['hyderabad','Hyderabad'],
  ['bengaluru','Bengaluru'],
  ['bangalore','Bengaluru'],
  ['delhi','Delhi'],
  ['jaipur','Jaipur'],
  ['kota','Kota'],
  ['satara','Satara'],
  ['kolhapur','Kolhapur'],
].sort((a, b) => b[0].length - a[0].length);

function knownArea(segment) {
  const normalized=String(segment||'').toLowerCase()
    .normalize('NFKC').replace(/[^a-z0-9]+/g,' ').trim();
  for (const [needle, display] of AREA_NAMES) {
    if ((' '+normalized+' ').includes(' '+needle+' ')) return display;
  }
  return 'Area to be confirmed';
}
function isDepot(text) {
  return /godrej hillside colony.*vikhroli west|vikhroli base|lal bahadur shastri marg.*godrej hillside colony/i.test(String(text||''));
}
export function vendorOfferAreaSummary(route) {
  let parts=String(route||'').split(/\s*(?:→|➔|➜|->)\s*/).map(s=>s.trim()).filter(Boolean);
  if (parts.length>1 && isDepot(parts[0])) parts=parts.slice(1);
  if (parts.length>1 && isDepot(parts[parts.length-1])) parts=parts.slice(0,-1);
  const pickup=knownArea(parts[0]||'');
  const knownStops=parts.slice(1).map(knownArea);
  // For a round trip ending back at pickup, use the destination before it.
  const destination=knownStops.slice().reverse()
    .find(area=>area!==pickup && area!=='Area to be confirmed')||
    knownStops.find(area=>area!=='Area to be confirmed')||
    pickup;
  return Object.freeze({
    pickup_area:pickup,
    destination_area:destination,
    route:pickup+' → '+destination,
  });
}

export function vendorOfferSafePricing(snapshot) {
  const source=(snapshot && typeof snapshot==='object'&&!Array.isArray(snapshot))?snapshot:{};
  const keys=['minimum_km_per_day','vendor_km_rate','vendor_da',
    'vendor_night','duty_days','local_package','estimated_km'];
  const output={};
  for (const key of keys) {
    const value=source[key];
    if (typeof value==='number'&&Number.isFinite(value)) output[key]=value;
    if (typeof value==='string'&&value.length<=32&&/^[a-z0-9_.-]+$/i.test(value)) output[key]=value;
  }
  return output;
}
