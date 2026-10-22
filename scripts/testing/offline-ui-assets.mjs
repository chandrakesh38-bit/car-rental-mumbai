import {readFile} from 'node:fs/promises';

// Reuse the captured Tailwind stylesheet from the isolated local preview.
// Keep presentation tests independent of CDN availability; their REST fixtures
// still supply the catalogue through each test's existing request handlers.
export async function installOfflineUiAssets(target) {
 await target.route('**/api/booking-config',r=>r.fulfill({json:{success:true,url:'https://ui-fixture.supabase.co',key:'test-only-public-key'}}));
 const css=await readFile(new URL('../../.test-output/customer-account-mobile-preview/rendered-homepage.css',import.meta.url),'utf8');
 await target.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({contentType:'text/javascript',body:`window.tailwind={config:{}};const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.append(style);`}));
 await target.route('https://cdn.tailwindcss.com',r=>r.fulfill({contentType:'text/javascript',body:`window.tailwind={config:{}};const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.append(style);`}));
 await target.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',r=>r.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:(url)=>({from:table=>{const q=new Proxy({},{get:(_,key)=>key==='then'?(resolve,reject)=>fetch(url+'/rest/v1/'+table).then(r=>r.json()).then(data=>({data,error:null})).then(resolve,reject):()=>q});return q;},auth:{getSession:async()=>({data:{session:null}})}})};`}));
}
