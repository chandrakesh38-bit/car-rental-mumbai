import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import renderMumbaiPage from '../src/pages/mumbai-car-rental.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = JSON.parse(await readFile(path.join(root, 'src/pages.json'), 'utf8'));
const component = name => readFile(path.join(root, `src/components/${name}.template`), 'utf8');
function servicePlans(html, page) {
  const mode = page.mode === 'selfdrive' ? 'selfdrive' : page.tab || 'outstation';
  return html.replace(/(<div data-road-plans="([^"]+)")(?: hidden)?>/g, (_,start,kind) => start + (kind === mode ? '>' : ' hidden>'))
    .replace('<section id="quick-plan-routes"', '<section' + (mode === 'selfdrive' ? ' hidden' : '') + ' id="quick-plan-routes"');
}
async function bookingWidget(page) {
  let html = await component('booking-widget');
  if (page.tab === 'airport') {
    html = html.replace(/(id="subtab-outstation"[^>]*class=")[^"]+/, '$1py-2.5 rounded-lg transition text-slate-600 flex items-center justify-center gap-1.5')
      .replace(/(id="subtab-airport"[^>]*class=")[^"]+/, '$1py-2.5 rounded-lg transition subtab-active flex items-center justify-center gap-1.5')
      .replace('id="wd-outstation-fields" class="space-y-4"', 'id="wd-outstation-fields" class="space-y-4 hidden"')
      .replace('id="wd-airport-fields" class="space-y-4 hidden"', 'id="wd-airport-fields" class="space-y-4"');
  }
  return html;
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const render = (text, data) => text.replace(/\{\{(\w+)\}\}/g, (_,key) => {
  if (!(key in data)) throw new Error(`Missing template value: ${key}`);
  return data[key];
});

function buildStructuredData(page) {
  const site = 'https://carswithdriverindia.com';
  const organization = {
    '@type':'Organization',
    '@id':site+'/#organization',
    name:'Car with Driver India',
    legalName:'Car with Driver Mobility LLP',
    url:site+'/',
    telephone:'+919702988465',
    logo:site+'/logo.png',
    areaServed:['Mumbai','Thane','Navi Mumbai'].map(name => ({'@type':'City',name}))
  };
  const graph = [organization];
  if (!page.slug) {
    graph.push({'@type':'WebSite','@id':site+'/#website',url:site+'/',name:'Car with Driver India',publisher:{'@id':site+'/#organization'}});
  } else if (['with-driver','self-drive','airport-transfer','outstation','thane-car-rental-with-driver','navi-mumbai-car-rental-with-driver'].includes(page.slug)) {
    const serviceNames = {
      'with-driver':'Car rental with driver',
      'self-drive':'Self drive car rental',
      'airport-transfer':'Airport transfer car service',
      'outstation':'Outstation car rental with driver',
      'thane-car-rental-with-driver':'Car rental with driver in Thane',
      'navi-mumbai-car-rental-with-driver':'Car rental with driver in Navi Mumbai'
    };
    graph.push({
      '@type':'Service',
      '@id':site+'/'+page.slug+'#service',
      name:serviceNames[page.slug],
      url:site+'/'+page.slug,
      provider:{'@id':site+'/#organization'},
      areaServed:(page.slug === 'thane-car-rental-with-driver' ? ['Thane'] : page.slug === 'navi-mumbai-car-rental-with-driver' ? ['Navi Mumbai'] : ['Mumbai','Thane','Navi Mumbai']).map(name => ({'@type':'City',name}))
    });
    if (page.slug === 'with-driver' || page.slug === 'outstation' || page.slug === 'thane-car-rental-with-driver' || page.slug === 'navi-mumbai-car-rental-with-driver') {
      const faqBySlug = {
        'with-driver':[
          ['Do you provide car rental with driver in Mumbai, Thane and Navi Mumbai?','Yes. Pickup is available across Mumbai, Thane and Navi Mumbai for local and outstation trips, subject to vehicle availability.'],
          ['Can I book a car with driver for one day?','Yes. For city use, select a local package such as 8 Hours / 80 KM or 12 Hours / 120 KM. For an outstation trip, billing is based on the applicable distance and day rules.'],
          ['Are toll and parking included in the fare?','Toll, parking and applicable state taxes are normally charged as per actuals unless your confirmed quotation specifically states otherwise.'],
          ['Is this a driver-only service?','No. This service provides a car together with a driver. We do not offer a driver-only booking for a customer\'s own vehicle.']
        ],
        'outstation':[
          ['How are one-way and round-trip fares calculated?','For a one-way trip, the fare includes the vehicle\'s empty return distance to its Vikhroli base. Driver allowance applies to your trip days, not the empty return. A round-trip fare assumes the vehicle returns you to your pickup location. The online fare does not change if a different final drop is arranged. The displayed fare includes the applicable minimum distance per day; tolls, parking and state taxes are extra at actual cost.']
        ],
        'thane-car-rental-with-driver':[
          ['Do you provide car rental with driver pickup in Thane?','Yes. With-driver pickup is available in Thane, subject to vehicle availability for your selected date and time.'],
          ['Can I book a one-day local car with driver in Thane?','Yes. You can choose a local package such as 8 Hours / 80 KM or 12 Hours / 120 KM depending on your planned usage.'],
          ['Can I start an outstation trip from Thane?','Yes. Outstation pickup can start from Thane and the destination can be outside the Mumbai metropolitan area. Applicable distance, daily minimum and actual toll or parking charges are shown or confirmed for the trip.']
        ],
        'navi-mumbai-car-rental-with-driver':[
          ['Do you provide car rental with driver pickup in Navi Mumbai?','Yes. Pickup is available across Navi Mumbai, subject to vehicle availability for your selected date and time.'],
          ['Which Navi Mumbai areas are covered?','Our stated service coverage includes Vashi, Airoli, Nerul, Belapur, Kharghar and Panvel. Enter the exact pickup address in the booking form for validation.'],
          ['Can I start an outstation trip from Navi Mumbai?','Yes. Outstation pickup can start from Navi Mumbai. Applicable distance, daily minimum and actual toll or parking charges are shown or confirmed for the trip.']
        ]
      };
      graph.push({
        '@type':'FAQPage',
        '@id':site+'/'+page.slug+'#faq',
        mainEntity:faqBySlug[page.slug].map(([name,text])=>({
          '@type':'Question',
          name,
          acceptedAnswer:{'@type':'Answer',text}
        }))
      });
    }
  } else {
    graph.push({'@type':'WebPage','@id':site+'/'+page.slug+'#webpage',url:site+'/'+page.slug,name:page.title,about:{'@id':site+'/#organization'}});
  }
  return '<script type="application/ld+json">' + JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c') + '</script>';
}

for (const page of pages) {
  if (process.argv.includes('--modals-only')) {
    const output = path.join(root, `${page.slug || 'index'}.html`);
    const existing = await readFile(output, 'utf8');
    const start = existing.indexOf('<!-- Search Car TRANSITION -->');
    const end = existing.indexOf('<!-- HOME DELIVERY UNAVAILABLE MODAL -->', start);
    if (start < 0 || end < start) throw new Error(`Missing modal boundaries: ${output}`);
    const updated = existing.slice(0, start) + (await component('modals')).trimEnd() + '\n' + existing.slice(end);
    if (process.argv.includes('--check')) {
      if (updated.replace(/\r\n/g,'\n') !== existing.replace(/\r\n/g,'\n')) throw new Error(`Modal HTML is stale: ${output}`);
    } else await writeFile(output, updated);
    console.log(`Modals ${process.argv.includes('--check') ? 'verified' : 'built'}: ${page.slug || '/'}`);
    continue;
  }
  // Scoped rebuild preserves page-specific SEO/content previously edited in
  // generated HTML while synchronizing the shared booking source of truth.
  if (process.argv.includes('--booking-only')) {
    const output = path.join(root, `${page.slug || 'index'}.html`);
    const existing = await readFile(output, 'utf8');
    const start = existing.indexOf('<!-- BOOKING WIDGET CARD -->');
    if (start < 0) continue;
    const tags = /<\/?div\b[^>]*>/g;
    tags.lastIndex = start;
    let depth = 0, end = -1, match;
    while ((match = tags.exec(existing))) {
      depth += match[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = tags.lastIndex; break; }
    }
    if (end < 0) throw new Error(`Unclosed booking widget: ${output}`);
    const updated = existing.slice(0, start) + (await bookingWidget(page)).trimEnd() + existing.slice(end);
    if (process.argv.includes('--check')) {
      if (updated.replace(/\r\n/g,'\n') !== existing.replace(/\r\n/g,'\n')) throw new Error(`Booking HTML is stale: ${output}`);
    } else await writeFile(output, updated);
    console.log(`Booking widget ${process.argv.includes('--check') ? 'verified' : 'built'}: ${page.slug || '/'}`);
    continue;
  }
  const route = '/' + page.slug;
  const link = (target, className, icon = false) => `<a href="/${target.slug}"${target.slug === page.slug ? ' aria-current="page"' : ''} class="${className}">${icon ? `<i class="fa-solid ${target.icon} text-indigo-600 w-5" aria-hidden="true"></i>` : ''}<span>${escape(target.label)}</span></a>`;
  const visiblePages = pages.filter(p => p.nav !== false);
  const navigationLinks = visiblePages.map(p => link(p, 'flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 hover:text-indigo-950 transition', true)).join('\n');
  const footerLinks = visiblePages.map(p => link(p, 'hover:text-amber-400 transition')).join('\n');
  const data = Object.fromEntries(Object.entries(page).filter(([,v])=>typeof v === 'string').map(([k,v])=>[k,escape(v)]));
  data.canonical = 'https://carswithdriverindia.com' + route;
  data.structuredData = buildStructuredData(page);
  // This page-only renderer leaves the other eight page outputs unchanged.
  const custom = page.slug === 'mumbai-car-rental'
    ? await renderMumbaiPage({ root, component, escape, page }) : null;
  let hero = await component('hero');
  // Reuse the existing hero, but give information pages their own introduction.
  if (!page.mode) hero = hero.replace(/(<p\b[^>]*>)[\s\S]*?(<\/p>)/, '$1{{description}}$2');
  const body = [
    render(await component('navigation'), {navigationLinks}),
    '<main>',
    ...(custom ? [custom.main] : [
      render(hero, {...data, roadBanner: page.mode ? `<section data-scene="${page.mode === 'selfdrive' ? 'selfdrive' : page.tab || 'outstation'}" class="road-banner" aria-label="Travel with CWD"><div><small>RIDE · EXPLORE · MORE</small><h2>India Looks Better<br><em>by Road</em></h2><p>Comfortable rides. Memorable journeys.</p></div></section>` : '', bookingWidget: page.mode ? await bookingWidget(page) : ''}),
      ...(await Promise.all(page.sections.map(async name => name === 'quick-routes' ? servicePlans(await component(name),page) : component(name))))
    ]),
    '</main>',
    await component('route-links'),
    render(await component('footer'), {footerLinks}),
    await component('modals'),
    await component('serviceability'),
    ...['booking','partner-documents','application-id','page'].map(n=>`<script src="/assets/js/${n}.js"></script>`)
  ].join('\n');
  const head = render(await component('head'),data).replace('</head>', (custom?.head || '') + '</head>');
  const html = `${head}<body class="cwd-road cwd-p1 cwd-p1-conversion bg-slate-50 text-slate-800 antialiased min-h-screen" data-page="${page.slug || 'home'}" data-booking-mode="${page.mode || ''}" data-booking-tab="${page.tab || ''}">\n${body}\n</body>\n</html>\n`;
  if (/\{\{\w+\}\}/.test(html)) throw new Error(`Unresolved template in ${route}`);
  await writeFile(path.join(root, `${page.slug || 'index'}.html`), html);
  console.log(`Built ${route}`);
}
