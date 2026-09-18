import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

// Build-time presentation only. The existing data stays in booking.js.
// Read only its array literals; never execute its booking or submission code.
function readArray(source, name) {
  const match = source.match(new RegExp(`(?:const|let) ${name} = (\\[[\\s\\S]*?\\n\\s*\\]);`));
  if (!match) throw new Error(`Cannot find existing fleet/location data: ${name}`);
  return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
}

export default async function renderMumbaiPage({ root, component, escape, page }) {
  const source = await readFile(path.join(root, 'assets/js/booking.js'), 'utf8');
  const fleet = readArray(source, 'wdFleet');
  const locations = readArray(source, 'mumbaiMetroLocations');
  const destinations = readArray(source, 'destinationCities');
  const fleetCards = '<div id="mumbai-selfdrive-fleet" class="contents"><p class="col-span-full text-center text-slate-500 py-8" role="status">Loading fleet…</p></div>';
  const driverCars = fleet.map(car => `
    <li class="rounded-xl bg-slate-50 border border-slate-200 p-4">
      <span class="block text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">${escape(car.category)}</span>
      <span class="block font-bold text-sm text-slate-900">${escape(car.name)}</span>
      <span class="block text-xs text-slate-500 mt-1">${escape(car.seats)} seats · ${escape(car.bags)}</span>
    </li>`).join('\n');
  const areaGroups = [
    ['Mumbai', ['Bhandup','Mulund','Ghatkopar','Kurla','Andheri','Bandra']],
    ['Thane', ['Thane']],
    ['Navi Mumbai', ['Airoli','Vashi','Nerul','Panvel']]
  ].map(([name,areas]) => {
    for (const area of areas) {
      if (!locations.some(l => l.name === area && l.serviceable === true)) {
        throw new Error(`Recheck Mumbai landing-page coverage: ${area}`);
      }
    }
    return `<div class="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h3 class="font-extrabold text-slate-900 mb-4">${escape(name)}</h3>
      <ul class="flex flex-wrap gap-2 text-sm text-slate-600">${areas.map(a=>`<li class="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">${escape(a)}</li>`).join('')}</ul>
      ${name === 'Thane' ? '<p class="text-sm text-slate-500 leading-relaxed mt-4">Share your exact pickup or delivery address when planning your trip.</p>' : ''}
    </div>`;
  }).join('\n');
  const outstationLinks = [['Pune','/outstation'],['Lonavala','/mumbai-to-lonavala-car-rental'],['Shirdi','/mumbai-to-shirdi-car-rental'],['Nashik','/outstation']].map(([city,href]) => {
    if(!destinations.some(d => d.name === city)) throw new Error(`Unsupported destination: ${city}`);
    return `<a href="${href}" class="rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm font-bold text-indigo-950 hover:border-indigo-400 transition">Mumbai to ${escape(city)} <i class="fa-solid fa-arrow-right text-xs ml-2 text-indigo-600" aria-hidden="true"></i></a>`;
  }).join('\n');
  const template = await readFile(path.join(root,'src/pages/mumbai-car-rental.template'),'utf8');
  const values = { h1:escape(page.h1), fleetCards, driverCars, areaGroups, outstationLinks, benefits:await component('services') };
  const main = template.replace(/\{\{(\w+)\}\}/g, (_,key) => {
    if(!(key in values)) throw new Error(`Missing Mumbai page content: ${key}`);
    return values[key];
  });
  const site = 'https://carswithdriverindia.com';
  const url = site + '/mumbai-car-rental';
  const schema = {
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'AutoRental','@id':site+'/#business',name:'Car with Driver India',url:site+'/',telephone:'+919702988465',logo:site+'/logo.png',
        address:{'@type':'PostalAddress',streetAddress:'Lal Bahadur Shastri Marg, Godrej Hillside Colony, Vikhroli West',addressLocality:'Mumbai',addressRegion:'Maharashtra',postalCode:'400079',addressCountry:'IN'}},
      {'@type':'Service','@id':url+'#service',name:'Mumbai car rental with driver and self drive',serviceType:'Car rental',url,
        provider:{'@id':site+'/#business'},areaServed:['Mumbai','Thane','Navi Mumbai'].map(name=>({'@type':'City',name}))},
      {'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:[
        {'@type':'ListItem',position:1,name:'Home',item:site+'/'},
        {'@type':'ListItem',position:2,name:'Mumbai Car Rental',item:url}
      ]}
    ]
  };
  return {
    main,
    head:'    <meta name="robots" content="index, follow">\n' +
      '    <meta property="og:image:alt" content="Car with Driver India logo">\n' +
      '    <script type="application/ld+json">' + JSON.stringify(schema).replace(/</g,'\\u003c') + '</script>\n'
  };
}
