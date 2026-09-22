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
const OUTSTATION_BASE_ADDRESS='Lal Bahadur Shastri Marg, Godrej Hillside Colony, Vikhroli West, Mumbai, Maharashtra 400079';
const OUTSTATION_DRIVER_ALLOWANCE_PER_DAY=500;
const cleanPlaceId=v=>{const id=String(v||'').trim();if(!id||id.length>220||!/^[A-Za-z0-9_-]+$/.test(id))fail('Please select all outstation route locations from Google suggestions.');return id};
const istParts=iso=>{const d=parseDateTime(iso),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d),out={};for(const p of parts)if(p.type!=='literal')out[p.type]=Number(p.value);return out};
const istDayOrdinal=iso=>{const p=istParts(iso);return Math.floor(Date.UTC(p.year,p.month-1,p.day)/86400000)};
const nightKey=iso=>{const p=istParts(iso),minutes=p.hour*60+(p.minute||0);if(!(minutes>=23*60||minutes<=4*60))return null;let stamp=Date.UTC(p.year,p.month-1,p.day);if(minutes<=4*60)stamp-=86400000;return new Date(stamp).toISOString().slice(0,10)};
const nightCount=isos=>new Set(isos.map(nightKey).filter(Boolean)).size;
const nightRateForCar=car=>/hatchback|sedan/i.test(String(car?.segment||''))?400:600;
async function validatePickupServiceArea(placeId){
 const id=cleanPlaceId(placeId),key=String(process.env.GOOGLE_MAPS_SERVER_API_KEY||'').trim();if(!key)fail('Google pickup validation is not configured.',503);
 const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');url.searchParams.set('place_id',id);url.searchParams.set('key',key);url.searchParams.set('language','en');url.searchParams.set('region','in');
 const response=await fetch(url),payload=await response.json().catch(()=>({}));
 if(!response.ok||!['OK','ZERO_RESULTS'].includes(payload.status))fail(payload.error_message||'Unable to validate pickup location.',response.status>=500?503:400);
 const result=payload.results?.[0];if(!result)fail('Unable to validate pickup location.');
 const components={};for(const part of result.address_components||[])for(const type of part.types||[])if(!components[type])components[type]=part.long_name;
 const norm=v=>String(v||'').trim().toLowerCase(),state=norm(components.administrative_area_level_1),locality=norm(components.locality),postalTown=norm(components.postal_town),admin2=norm(components.administrative_area_level_2),formatted=norm(result.formatted_address);
 const allowed=(!state||state.includes('maharashtra'))&&(['mumbai','bombay'].includes(locality)||['mumbai','bombay'].includes(postalTown)||['mumbai suburban','mumbai city'].includes(admin2)||locality==='thane'||postalTown==='thane'||locality==='navi mumbai'||postalTown==='navi mumbai'||formatted.includes(', navi mumbai,')||formatted.startsWith('navi mumbai,'));
 if(!allowed)fail('Pickup is available only in Mumbai, Thane, and Navi Mumbai.');
 return true;
}
async function googleRouteRequest(body,fieldMask='routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration'){
 const key=String(process.env.GOOGLE_MAPS_SERVER_API_KEY||'').trim();if(!key)fail('Google route pricing is not configured.',503);
 const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fieldMask},body:JSON.stringify(body)});
 const raw=await response.text();let payload={};try{payload=JSON.parse(raw)}catch{}
 if(!response.ok)fail(payload?.error?.message||'Unable to validate Google route distance.',response.status>=500?503:400);
 return payload.routes?.[0]||null;
}
async function computeOutstationRoute(pickupPlaceId,stops,finalDropPlaceId){
 const pickup=cleanPlaceId(pickupPlaceId),finalDrop=cleanPlaceId(finalDropPlaceId);
 if(!Array.isArray(stops))stops=[];if(stops.length>8)fail('A maximum of 8 intermediate stops is supported.');
 const stopIds=stops.map(s=>cleanPlaceId(s?.placeId));
 const first=await googleRouteRequest({origin:{address:OUTSTATION_BASE_ADDRESS},destination:{placeId:finalDrop},intermediates:[{placeId:pickup},...stopIds.map(placeId=>({placeId}))],travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false,languageCode:'en-US',units:'METRIC'});
 const second=await googleRouteRequest({origin:{placeId:finalDrop},destination:{address:OUTSTATION_BASE_ADDRESS},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false,languageCode:'en-US',units:'METRIC'});
 const firstMeters=Number(first?.distanceMeters),secondMeters=Number(second?.distanceMeters);
 if(!Number.isFinite(firstMeters)||firstMeters<=0||!Number.isFinite(secondMeters)||secondMeters<=0)fail('Unable to calculate driving distance for the selected outstation route.');
 const meters=firstMeters+secondMeters;
 const legs=[...(first?.legs||[]),...(second?.legs||[])].map(l=>({distanceMeters:Number(l.distanceMeters)||0,duration:String(l.duration||'')}));
 return {distanceMeters:meters,distanceKmExact:Math.round(meters/100)/10,billableRouteKm:Math.ceil(meters/1000),legs};
}
async function computeDeliveryRoute(placeId){
 const id=cleanPlaceId(placeId);
 const route=await googleRouteRequest({origin:{address:OUTSTATION_BASE_ADDRESS},destination:{placeId:id},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false,languageCode:'en-US',units:'METRIC'},'routes.distanceMeters,routes.duration');
 const meters=Number(route?.distanceMeters);if(!Number.isFinite(meters)||meters<=0)fail('Unable to calculate Self Drive delivery distance.');
 return {oneWayKm:Math.round((meters/1000)*10)/10};
}

const AIRPORT_MAX_METERS=30000;
const AIRPORT_ADDRESSES={
 t1:'Chhatrapati Shivaji Maharaj International Airport Terminal 1, Santacruz East, Mumbai, Maharashtra, India',
 t2:'Chhatrapati Shivaji Maharaj International Airport Terminal 2, Sahar, Mumbai, Maharashtra, India',
 nmia:'Navi Mumbai International Airport, Ulwe, Navi Mumbai, Maharashtra, India'
};
async function computeAirportRoute(terminal,customerPlaceId,airportType){
 const airportAddress=AIRPORT_ADDRESSES[String(terminal||'').toLowerCase()];
 if(!airportAddress||!['pickup','drop'].includes(airportType))fail('Invalid airport transfer.');
 const customer=cleanPlaceId(customerPlaceId);
 const origin=airportType==='pickup'?{address:airportAddress}:{placeId:customer};
 const destination=airportType==='pickup'?{placeId:customer}:{address:airportAddress};
 const route=await googleRouteRequest({origin,destination,travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false,languageCode:'en-US',units:'METRIC'},'routes.distanceMeters,routes.duration');
 const meters=Number(route?.distanceMeters);if(!Number.isFinite(meters)||meters<=0)fail('Unable to calculate airport transfer distance.');
 return {distanceMeters:meters,distanceKmExact:Math.round((meters/1000)*10)/10};
}

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
  if(mode==='home'){
   deliveryLocation=text(data.deliveryLocation,300);
   const deliveryPlaceId=cleanPlaceId(data.deliveryPlaceId);
   const deliveryRoute=await computeDeliveryRoute(deliveryPlaceId);
   const km=Number(deliveryRoute.oneWayKm);
   if(!Number.isFinite(km)||km>50)fail('Sorry, this delivery location is outside our current Self Drive home-delivery service area.');
   delivery=rules.baseDeliveryCharge+Math.max(0,km*2-rules.freeThresholdKm)*rules.extraDeliveryChargePerKm;
   data={...data,deliveryPlaceId,deliveryDistanceKm:km};
  }
  const fare=billed*rate+deposit+delivery;
  return {fare,carName:car.full_name||[car.brand,car.model].filter(Boolean).join(' '),tripType:'Self Drive',route:deliveryLocation,normalized:{...data,vehicleId:car.id,pickupAt:pickup.toISOString(),returnAt:ret.toISOString(),deliveryMode:mode,deliveryLocation,baseFare:billed*rate,securityDeposit:deposit,deliveryCharge:delivery,totalFare:fare}};
 }
 const tripType=['local','outstation','airport'].includes(data.tripType)?data.tripType:null;if(!tripType)fail('Invalid trip type.');
 const carName=text(data.carName,150);
 const rows=await supabaseRows('with_driver_rates',new URLSearchParams({select:'*',is_active:'eq.true',limit:'100'}));
 const car=rows.find(r=>publicName(r).toLowerCase()===carName.toLowerCase());if(!car)fail('Selected vehicle is no longer available.',409);
 const pickup=parseDateTime(data.pickupAt);let fare=0,route='';
 if(tripType==='local'){await validatePickupServiceArea(data.pickupPlaceId);if(!PACKAGES.has(data.localPackage))fail('Invalid local package.');const base=number(car.local_pkg_8hr_80km),extra=number(car.local_extra_hour_rate);const extraHours={ '8hr_80km':0,'10hr_100km':2,'12hr_120km':4}[data.localPackage];const packageHours={ '8hr_80km':8,'10hr_100km':10,'12hr_120km':12}[data.localPackage];const end=new Date(pickup.getTime()+packageHours*3600000).toISOString();const nightCharge=nightCount([data.pickupAt,end])*nightRateForCar(car);fare=base+extra*extraHours+nightCharge;route=text(data.pickupLocation,300);data={...data,nightCharge};}
 else if(tripType==='airport'){if(!AIRPORTS.has(data.airportTerminal)||!['pickup','drop'].includes(data.airportType))fail('Invalid airport transfer.');const customerPlaceId=cleanPlaceId(data.customerPlaceId||data.pickupPlaceId);if(data.airportType==='drop')await validatePickupServiceArea(customerPlaceId);const airportRoute=await computeAirportRoute(data.airportTerminal,customerPlaceId,data.airportType);if(airportRoute.distanceMeters>AIRPORT_MAX_METERS)fail('This location is outside our Airport Transfer service area. Please use Outstation booking for this trip.');const nightCharge=nightCount([data.pickupAt])*nightRateForCar(car);fare=number(car['airport_'+data.airportTerminal+'_rate'])+nightCharge;route=text(data.pickupLocation,300);data={...data,customerPlaceId,airportDistanceKm:airportRoute.distanceKmExact,nightCharge};}
 else {
  const ret=parseDateTime(data.returnAt);if(ret<=pickup)fail('Final drop date and time must be later than pickup date and time.');
  await validatePickupServiceArea(data.pickupPlaceId);
  const pickupLocation=text(data.pickupLocation,300),destination=text(data.destination,300);
  const rawStops=Array.isArray(data.stops)?data.stops:[];if(rawStops.length>8)fail('A maximum of 8 intermediate stops is supported.');
  const stops=rawStops.map(s=>({name:text(String(s?.name||s?.address||''),200),address:String(s?.address||'').trim().slice(0,300),placeId:cleanPlaceId(s?.placeId)}));
  const routeQuote=await computeOutstationRoute(data.pickupPlaceId,stops,data.destinationPlaceId);
  const days=Math.max(1,istDayOrdinal(data.returnAt)-istDayOrdinal(data.pickupAt)+1);
  const billable=Math.max(routeQuote.billableRouteKm,days*rules.minimumOutstationKmPerDay);
  const nightCharge=nightCount([data.pickupAt,data.returnAt])*nightRateForCar(car);
  fare=billable*number(car.outstation_rate_per_km)+days*OUTSTATION_DRIVER_ALLOWANCE_PER_DAY+nightCharge;
  route=[OUTSTATION_BASE_ADDRESS,pickupLocation,...stops.map(s=>s.name),destination,OUTSTATION_BASE_ADDRESS].join(' → ');
  data={...data,pickupLocation,destination,stops,days,googleRouteKm:routeQuote.distanceKmExact,billableKm:billable,driverAllowancePerDay:OUTSTATION_DRIVER_ALLOWANCE_PER_DAY,nightCharge,routeLegs:routeQuote.legs};
 }
 return {fare,carName:publicName(car),tripType:tripType[0].toUpperCase()+tripType.slice(1),route,normalized:{...data,carName:publicName(car),pickupAt:pickup.toISOString(),totalFare:fare}};
}
