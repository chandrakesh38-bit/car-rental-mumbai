// Use Google's structured result, never address text or a client-supplied state.
export function maharashtraPickup(result) {
  const deny = message => ({ allowed: false, serviceArea: '', message });
  const unknown = 'Unable to verify the pickup state. Please select a precise Maharashtra address from Google suggestions.';
  const parts = result?.address_components || [];
  const values = type => [...new Set(parts.filter(p => p.types?.includes(type)).map(p => String(p.long_name || '').trim().toLowerCase()))];
  const states = values('administrative_area_level_1');
  const countries = values('country');
  if (states.length !== 1 || !states[0] || countries.length !== 1 || !countries[0] || result?.partial_match) return deny(unknown);
  if (states[0] !== 'maharashtra' || countries[0] !== 'india') return deny('Pickup is available only in Maharashtra for Local City and Outstation trips.');
  const location = result?.geometry?.location;
  if (typeof location?.lat !== 'number' || !Number.isFinite(location.lat) || Math.abs(location.lat) > 90 ||
      typeof location?.lng !== 'number' || !Number.isFinite(location.lng) || Math.abs(location.lng) > 180) return deny(unknown);
  return { allowed: true, serviceArea: 'Maharashtra', message: 'Pickup location is serviceable.' };
}

export function metroPickup(result) {
  const state = maharashtraPickup(result);
  if (!state.allowed) return state;
  const parts = result.address_components || [];
  const values = type => parts.filter(p => p.types?.includes(type)).map(p => String(p.long_name || '').trim().toLowerCase());
  const cities = [...values('locality'), ...values('postal_town')];
  const districts = values('administrative_area_level_2');
  const city = cities.find(c => ['mumbai','bombay','thane','navi mumbai'].includes(c));
  const mumbaiDistrict = districts.some(d => ['mumbai suburban','mumbai city'].includes(d));
  return city || mumbaiDistrict ? {allowed:true,serviceArea:city || 'Mumbai',message:'Pickup location is serviceable.'}
    : {allowed:false,serviceArea:'',message:'Pickup is available only in Mumbai, Thane, and Navi Mumbai.'};
}
