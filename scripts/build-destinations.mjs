import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const destinations=[
 ['shirdi','Shirdi',480,'Sai Baba Temple exterior'],
 ['lonavala','Lonavala',170,'green hills at Tiger’s Point'],
 ['mahabaleshwar','Mahabaleshwar',520,'valley views at Arthur’s Seat'],
 ['trimbakeshwar','Trimbakeshwar',360,'Trimbakeshwar Temple exterior']
];
// Optional one-time optimization of user-authorized generated images.
if(process.argv[2]&&!process.argv[2].startsWith('--')){
 const require=createRequire(import.meta.url),sharp=require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
 const originals=['exec-e241d653-e6b1-47c0-b4ea-f742bb4d1a7d.png','exec-525523bf-69c7-4b74-885e-9e9ee8e956e6.png','exec-1a00f50d-0021-4647-90d9-3f2d78b26adc.png','exec-35100940-8f63-420e-a74e-0f3e4f4d6457.png'];
 await mkdir('assets/images/destinations',{recursive:true});
 for(let i=0;i<4;i++)for(const width of [400,800])await sharp(process.argv[2]+'/'+originals[i]).resize({width}).webp({quality:80}).toFile(`assets/images/destinations/${destinations[i][0]}-${width}.webp`);
}
const cards=destinations.map(([slug,name,km,subject])=>`<button type="button" class="cwd-destination-card" data-origin="Mumbai" data-destination="${name}" data-route-km="${km}" onclick="selectQuickRoute('${name}')">
 <span class="cwd-destination-image"><img src="/assets/images/destinations/${slug}-400.webp" srcset="/assets/images/destinations/${slug}-400.webp 400w, /assets/images/destinations/${slug}-800.webp 800w" sizes="(max-width:359px) 100vw, (max-width:899px) 50vw, 260px" width="800" height="533" loading="lazy" decoding="async" alt="AI illustration inspired by ${subject}, ${name}"><span class="cwd-destination-origin">FROM MUMBAI</span><strong>${name}</strong></span>
 <span class="cwd-destination-content"><span data-live-route-fare>Check live fare</span><span class="cwd-destination-action">Explore Cabs <span aria-hidden="true">↗</span></span></span>
</button>`).join('\n');
const template=`<!-- QUICK PLAN POPULAR MAHARASHTRA ROUTES -->
<section id="quick-plan-routes" class="cwd-destinations" aria-labelledby="cwd-destinations-title">
 <div class="cwd-destinations-heading"><span class="cwd-destinations-eyebrow">YOUR NEXT GETAWAY</span><h2 id="cwd-destinations-title">Maharashtra, a drive away</h2><p>Temple towns, green hills and memorable journeys. Start from Mumbai, travel your way.</p></div>
 <div class="cwd-destinations-grid">${cards}</div>
 <p class="cwd-destinations-note">Starting estimates use the available CWD rate card, daily minimum kilometres and driver allowance for a daytime trip. Tolls, parking, state tax and applicable night charges are extra. Choose dates and exact addresses for a live quote. Images are AI-generated destination illustrations, not site photographs.</p>
</section>`;
if(!process.argv.includes('--check'))await writeFile('src/components/quick-routes.template',template+'\n');
else if((await readFile('src/components/quick-routes.template','utf8')).trim()!==template)throw Error('Stale template');
const existing=await readFile('index.html','utf8');const start=existing.indexOf('<!-- QUICK PLAN POPULAR MAHARASHTRA ROUTES -->');const end=existing.indexOf('<!-- WITH DRIVER FLEET SECTION -->',start);
if(start<0||end<0)throw Error('Missing section boundaries');
const updated=existing.slice(0,start)+template+'\n\n    '+existing.slice(end);
if(process.argv.includes('--check')){if(updated!==existing)throw Error('Stale homepage');}else await writeFile('index.html',updated);
console.log('Built/verified actual destination template and homepage');
