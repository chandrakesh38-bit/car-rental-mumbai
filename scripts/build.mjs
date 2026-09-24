import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import renderMumbaiPage from '../src/pages/mumbai-car-rental.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = JSON.parse(await readFile(path.join(root, 'src/pages.json'), 'utf8'));
const component = name => readFile(path.join(root, `src/components/${name}.template`), 'utf8');
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
  } else if (['with-driver','self-drive','airport-transfer','outstation'].includes(page.slug)) {
    const serviceNames = {
      'with-driver':'Car rental with driver',
      'self-drive':'Self drive car rental',
      'airport-transfer':'Airport transfer car service',
      'outstation':'Outstation car rental with driver'
    };
    graph.push({
      '@type':'Service',
      '@id':site+'/'+page.slug+'#service',
      name:serviceNames[page.slug],
      url:site+'/'+page.slug,
      provider:{'@id':site+'/#organization'},
      areaServed:['Mumbai','Thane','Navi Mumbai'].map(name => ({'@type':'City',name}))
    });
  } else {
    graph.push({'@type':'WebPage','@id':site+'/'+page.slug+'#webpage',url:site+'/'+page.slug,name:page.title,about:{'@id':site+'/#organization'}});
  }
  return '<script type="application/ld+json">' + JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c') + '</script>';
}

for (const page of pages) {
  const route = '/' + page.slug;
  const link = (target, className, icon = false) => `<a href="/${target.slug}"${target.slug === page.slug ? ' aria-current="page"' : ''} class="${className}">${icon ? `<i class="fa-solid ${target.icon} text-indigo-600 w-5" aria-hidden="true"></i>` : ''}<span>${escape(target.label)}</span></a>`;
  const navigationLinks = pages.map(p => link(p, 'flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 hover:text-indigo-950 transition', true)).join('\n');
  const footerLinks = pages.map(p => link(p, 'hover:text-amber-400 transition')).join('\n');
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
      render(hero, {...data, bookingWidget: page.mode ? await component('booking-widget') : ''}),
      ...(await Promise.all(page.sections.map(component)))
    ]),
    '</main>',
    await component('route-links'),
    render(await component('footer'), {footerLinks}),
    await component('modals'),
    await component('serviceability'),
    ...['booking','partner-documents','application-id','page'].map(n=>`<script src="/assets/js/${n}.js"></script>`)
  ].join('\n');
  const head = render(await component('head'),data).replace('</head>', (custom?.head || '') + '</head>');
  const html = `${head}<body class="bg-slate-50 text-slate-800 antialiased min-h-screen" data-page="${page.slug || 'home'}" data-booking-mode="${page.mode || ''}" data-booking-tab="${page.tab || ''}">\n${body}\n</body>\n</html>\n`;
  if (/\{\{\w+\}\}/.test(html)) throw new Error(`Unresolved template in ${route}`);
  await writeFile(path.join(root, `${page.slug || 'index'}.html`), html);
  console.log(`Built ${route}`);
}
