import { loadLocationConfig } from './location-config.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const text=(v,max=500)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('Invalid booking details.');return v.trim()};
const number=(v)=>{const n=Number(v);if(!Number.isFinite(n)||n<0)fail('Invalid booking pricing.');return n};
const METRO={"vikhroli":1,"powai":2,"bhandup":4,"kanjur marg":4,"nahur":5,"vidyavihar":5,"ghatkopar":6,"mulund":7,"kurla":9,"sakinaka":9,"digha gaon":10,"lokmanya tilak terminus":10,"govandi":12,"guru tegh bahadur nagar":12,"sion":12,"thane":12,"tilak nagar":12,"airoli":13,"chembur":13,"kalwa":13,"chunabhatti":14,"mankhurd":14,"andheri":15,"king's circle":15,"matunga":15,"mumbra":15,"rabale":15,"vile parle":15,"cotton green":16,"dadar":16,"jogeshwari":16,"matunga road":16,"santacruz":16,"sewri":16,"wadala road":16,"currey road":17,"diva junction":17,"ghansoli":17,"khar road":17,"mahim junction":17,"prabhadevi":17,"bandra":18,"chinchpokli":18,"parel":18,"ram mandir":18,"reay road":18,"bandra terminus":19,"byculla":19,"goregaon":19,"koparkhairane":19,"lower parel":19,"chhatrapati shivaji maharaj terminus":20,"dockyard road":20,"mahalaxmi":20,"masjid":20,"sandhurst road":20,"grant road":21,"kopar":21,"marine lines":21,"mumbai central":21,"turbhe":21,"charni road":22,"malad":22,"nilaje":22,"churchgate":23,"ambivli":24,"dativali":24,"dombivli":24,"kandivli":24,"vashi":25,"ambarnath":26,"dahisar":26,"sanpada":26,"ulhasnagar":26,"shahad":27,"juinagar":28,"bhiwandi road":29,"borivali":29,"kharbav":29,"vithalwadi":29,"mira road":31,"nerul":31,"seawoods-darave-karave":32,"kalyan junction":33,"badlapur":34,"kaman road":34,"naigaon":34,"cbd belapur":35,"bhayandar":36,"kharghar":36,"mansarovar":36,"titwala":36,"nallasopara":37,"juchandra":38,"khandeshwar":38,"bamangdongri":41,"kalamboli":41,"kharkopar":41,"taloje panchnand":43,"chouk":44,"gavan":44,"khadavli":44,"panvel":44,"vasind":44,"navde road":45,"chikhli":46,"dolavli":46,"vasai road":46,"chikhale":48,"dronagiri":48,"nhava sheva":48,"asangaon":50,"poyanje":50,"somatne":50,"vangani":50,"virar":50};
const DESTINATIONS={"pune":300,"nashik":340,"nagpur":1650,"kolhapur":780,"satara":500,"solapur":820,"sangli":760,"aurangabad / chhatrapati sambhajinagar":680,"ahmednagar / ahilyanagar":500,"ratnagiri":660,"sindhudurg":980,"nanded":1150,"jalgaon":820,"amravati":1350,"lonavala":170,"mahabaleshwar":520,"shirdi":480,"alibag":220,"trimbakeshwar":360,"goa":1200,"surat":580,"palghar":200,"matheran":190,"khandala":175,"ganpatipule":700,"dapoli":450,"bhandardara":320,"malshej ghat":260,"pandharpur":720,"tuljapur":900,"shani shingnapur":540,"chandrapur":1550,"buldhana":950,"vadodara":850,"vapi":350,"silvassa":380,"indore":1100};
const AIRPORTS=new Set(['t1','t2','nmia']);
const PACKAGES=new Set(['8hr_80km','10hr_100km','12hr_120km']);
const parseDateTime=v=>{const d=new Date(v);if(!v||!Number.isFinite(d.getTime()))fail('Invalid booking date/time.');return d};
async function supabaseRows(table,query=''){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)fail('Booking validation is not configured.',503);
 const r=await fetch(base.replace(/\/$/,'')+'/rest/v1/'+table+'?'+query,{headers:{apikey:key,Authorization:'Bearer '+key}});
 if(!r.ok)fail('Unable to validate current pricing. Please try again.',503);
 return r.json();
}
async function pricingRules(){
 const rows=await supabaseRows('pricing_rules','select=rule_name,rule_value');
 const out={baseDeliveryCharge:500,extraDeliveryChargePerKm:25,freeThresholdKm:25,driverNightAllowance:500,minimumOutstationKmPerDay:300};
 for(const r of rows){const n=String(r.rule_name||'').toLowerCase(),v=Number(r.rule_value);if(!Number.isFinite(v)||v<0)continue;
  if(n.includes('base')&&n.includes('delivery'))out.baseDeliveryCharge=v;
  else if(n.includes('extra')&&n.includes('delivery'))out.extraDeliveryChargePerKm=v;
  else if(n.includes('threshold'))out.freeThresholdKm=v;
  else if(n.includes('night')&&n.includes('allowance'))out.driverNightAllowance=v;
  else if(n.includes('minimum')&&n.includes('outstation'))out.minimumOutstationKmPerDay=v;
 } return out;
}
const night=(iso,amount)=>{const h=parseDateTime(iso).getHours();return h>=22||h<6?amount:0};
const publicName=row=>String(row.segment||'').toLowerCase()==='sedan'&&/dzire|aura/i.test(String(row.full_name||''))?'Sedan (Dzire / Aura)':String(row.full_name||'').trim();
export async function validateBookingData(serviceMode,data){
 if(!['withdriver','selfdrive'].includes(serviceMode)||!data||typeof data!=='object'||Array.isArray(data))fail('Invalid service mode or booking details.');
 const rules=await pricingRules();
 const locations=await loadLocationConfig();
 const activeMetro=(flag)=>locations.metro.filter(l=>l.active!==false&&l[flag]===true);
 const metroByName=(name,flag)=>activeMetro(flag).find(l=>l.name.toLowerCase()===String(name||'').trim().toLowerCase());
 const destinationByName=name=>locations.destinations.find(l=>l.active!==false&&l.name.toLowerCase()===String(name||'').trim().toLowerCase());
 if(serviceMode==='selfdrive'){
  const vehicleId=text(String(data.vehicleId||''),100),pickup=parseDateTime(data.pickupAt),ret=parseDateTime(data.returnAt);
  if(ret<=pickup)fail('Return date and time must be later than pickup date and time.');
  const rows=await supabaseRows('vehicles',new URLSearchParams({select:'id,brand,model,full_name,rate_per_hour,refundable_deposit,is_active,service_type',id:'eq.'+vehicleId,limit:'1'}));
  const car=rows[0];if(!car||car.is_active!==true||!['Self-Drive','Both'].includes(car.service_type))fail('Selected vehicle is no longer available.',409);
  const hours=(ret-pickup)/3600000,billed=Math.max(24,hours),rate=number(car.rate_per_hour),deposit=number(car.refundable_deposit);
  const mode=data.deliveryMode==='self'?'self':data.deliveryMode==='home'?'home':null;if(!mode)fail('Invalid delivery mode.');
  let delivery=0,deliveryLocation='Self Pick-up';
  if(mode==='home'){deliveryLocation=text(data.deliveryLocation,150);const loc=metroByName(deliveryLocation,'selfDriveDelivery');const km=Number(loc?.distanceKm);if(!Number.isFinite(km))fail('Sorry, this delivery location is currently outside our standard service zones. Please select from our listed delivery locations or contact support.');
   delivery=rules.baseDeliveryCharge+Math.max(0,km*2-rules.freeThresholdKm)*rules.extraDeliveryChargePerKm;
  }
  const fare=billed*rate+deposit+delivery;
  return {fare,carName:car.full_name||[car.brand,car.model].filter(Boolean).join(' '),tripType:'Self Drive',route:deliveryLocation,normalized:{...data,vehicleId:car.id,pickupAt:pickup.toISOString(),returnAt:ret.toISOString(),deliveryMode:mode,deliveryLocation,baseFare:billed*rate,securityDeposit:deposit,deliveryCharge:delivery,totalFare:fare}};
 }
 const tripType=['local','outstation','airport'].includes(data.tripType)?data.tripType:null;if(!tripType)fail('Invalid trip type.');
 const carName=text(data.carName,150);
 const rows=await supabaseRows('with_driver_rates',new URLSearchParams({select:'*',is_active:'eq.true',limit:'100'}));
 const car=rows.find(r=>publicName(r).toLowerCase()===carName.toLowerCase());if(!car)fail('Selected vehicle is no longer available.',409);
 const pickup=parseDateTime(data.pickupAt),allowance=night(data.pickupAt,rules.driverNightAllowance);let fare=0,route='';
 if(tripType==='local'){if(!PACKAGES.has(data.localPackage))fail('Invalid local package.');const base=number(car.local_pkg_8hr_80km),extra=number(car.local_extra_hour_rate);const hours={ '8hr_80km':0,'10hr_100km':2,'12hr_120km':4}[data.localPackage];fare=base+extra*hours+allowance;route=text(data.pickupLocation,300);}
 else if(tripType==='airport'){if(!AIRPORTS.has(data.airportTerminal)||!['pickup','drop'].includes(data.airportType))fail('Invalid airport transfer.');fare=number(car['airport_'+data.airportTerminal+'_rate'])+allowance;route=text(data.pickupLocation,300);}
 else {const ret=parseDateTime(data.returnAt);if(ret<=pickup)fail('Return date and time must be later than pickup date and time.');const destination=text(data.destination,150);const configuredDestination=destinationByName(destination);if(!configuredDestination)fail('Please select a supported outstation destination from the list.');const distance=number(configuredDestination.roundTripKm);const days=Math.max(1,Math.ceil((new Date(ret.toDateString())-new Date(pickup.toDateString()))/86400000)+1);const billable=Math.max(distance,days*rules.minimumOutstationKmPerDay);fare=billable*number(car.outstation_rate_per_km)+days*number(car.driver_allowance_per_day)+allowance;route=text(data.pickupLocation,300)+' → '+destination;data={...data,days,billableKm:billable};}
 return {fare,carName:publicName(car),tripType:tripType[0].toUpperCase()+tripType.slice(1),route,normalized:{...data,carName:publicName(car),pickupAt:pickup.toISOString(),totalFare:fare}};
}
