/* Only a generic offline screen is cached. Never cache pages, API responses,
   customer details, OTP, fares, bookings, documents or payment requests. */
const CACHE='cwd-offline-v1';
const OFFLINE='/offline.html';
const CUSTOMER_PATHS=new Set(['/','/with-driver','/self-drive','/outstation','/airport-transfer','/cars','/customer-account','/my-bookings','/booking-confirmation','/contact','/faq']);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add(OFFLINE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cwd-offline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  const path=url.pathname.replace(/\.html$/,'').replace(/\/$/,'')||'/';
  if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==self.location.origin||!CUSTOMER_PATHS.has(path))return;
  event.respondWith(fetch(request).catch(()=>caches.match(OFFLINE).then(response=>response||new Response('You are offline. Reconnect to continue.',{status:503,headers:{'Content-Type':'text/plain'}}))));
});
