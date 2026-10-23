/* Customer presentation / progressive enhancement only. No fare or auth state. */
(async () => {
  'use strict';
  if (!document.body.classList.contains('cwd-road')) return;
  const {BANNER_COPY}=await import('/assets/js/road-banner-copy.mjs');
  const updateBanner=(initial=false)=>{
   const mode=initial===true?(document.body.dataset.bookingMode==='selfdrive'?'selfdrive':document.body.dataset.bookingTab||'outstation'):document.getElementById('btn-mode-selfdrive')?.classList.contains('tab-active')?'selfdrive':['airport','local'].find(t=>document.getElementById('subtab-'+t)?.classList.contains('subtab-active'))||'outstation';
   const banner=document.querySelector('.road-banner');if(banner){
    banner.dataset.scene=mode;const copy=BANNER_COPY[mode];
    banner.querySelector('small').textContent=copy.eyebrow;
    const accent=document.createElement('em');accent.textContent=copy.accent;
    banner.querySelector('h2').replaceChildren(document.createTextNode(copy.title),document.createElement('br'),accent);
    banner.querySelector('p').textContent=copy.description;
   }
   document.querySelectorAll('[data-road-plans]').forEach(section=>section.hidden=section.dataset.roadPlans!==mode);
   const plans=document.getElementById('quick-plan-routes');if(plans)plans.hidden=mode==='selfdrive';
  };
  document.getElementById('booking-widget')?.addEventListener('click',()=>requestAnimationFrame(updateBanner));
  window.addEventListener('cwd:service-change',updateBanner);updateBanner(true);
  document.querySelectorAll('[data-local-plan]').forEach(button=>button.addEventListener('click',()=>{
   // Selecting a sightseeing idea keeps the local package flow and existing trip details.
   if(typeof window.selectLocalPackage!=='function')return;
   window.selectLocalPackage(button.dataset.localPlan);
   document.getElementById('booking-widget')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
   document.getElementById('wd-local-pickup')?.focus({preventScroll:true});
  }));
  document.querySelector('.road-more-routes')?.addEventListener('click',event=>{
   const button=event.currentTarget,open=button.getAttribute('aria-expanded')!=='true';
   document.querySelectorAll('.road-extra-route').forEach(card=>card.hidden=!open);
   button.setAttribute('aria-expanded',String(open));button.textContent=open?'Show fewer destinations':'View more destinations';
  });
  const icon = (name) => ({home:'⌂',bookings:'▤',search:'⌕',support:'♧',menu:'☰'})[name];
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const nav = document.createElement('nav');
  nav.className = 'road-bottom-nav'; nav.setAttribute('aria-label','Quick navigation');
  nav.innerHTML = `<a href="/" ${path==='/'?'aria-current="page"':''}><span aria-hidden="true">${icon('home')}</span>Home</a><a href="/my-bookings" ${path==='/my-bookings'?'aria-current="page"':''}><span aria-hidden="true">${icon('bookings')}</span>My Bookings</a><a class="road-search-link" href="/#booking-widget" aria-label="Search cars"><span aria-hidden="true">${icon('search')}</span><small>Book a cab</small></a><a href="tel:+919702988465"><span aria-hidden="true">☎</span>Support</a><button type="button" data-road-menu><span aria-hidden="true">${icon('menu')}</span>Menu</button>`;
  document.body.append(nav);
  const menu = document.createElement('dialog');
  menu.className='road-app-menu';menu.setAttribute('aria-labelledby','road-menu-title');
  menu.innerHTML='<button type="button" class="road-menu-close" aria-label="Close menu">×</button><h2 id="road-menu-title">Your next journey</h2><a href="/customer-account">My Account / Login</a><a href="/my-bookings">My Bookings</a><a href="/with-driver">Car with Driver</a><a href="/self-drive">Self Drive</a><a href="/contact">Contact us</a><button type="button" data-road-install>Install CWD app</button><label class="road-haptics"><input type="checkbox" checked data-road-haptics> Tap vibration</label><p data-road-install-status role="status" aria-live="polite"></p>';
  document.body.append(menu);
  nav.querySelector('[data-road-menu]').onclick=()=>menu.showModal();
  menu.querySelector('.road-menu-close').onclick=()=>menu.close();
  menu.addEventListener('click',e=>{if(e.target===menu)menu.close();});
  let haptics=true;
  try {haptics=localStorage.getItem('cwd-haptics')!=='off';} catch {}
  const toggle=menu.querySelector('[data-road-haptics]');toggle.checked=haptics;
  toggle.onchange=()=>{haptics=toggle.checked;try{localStorage.setItem('cwd-haptics',haptics?'on':'off');}catch{}};
  let lastTap=0;
  document.addEventListener('click',event=>{
    const button=event.target.closest('button,a[href],input[type="submit"],[role="button"]');
    if(!event.isTrusted||!button||button.disabled||button.getAttribute('aria-disabled')==='true'||!haptics||typeof navigator.vibrate!=='function')return;
    if(Date.now()-lastTap<100)return;lastTap=Date.now();
    try {navigator.vibrate(12);} catch {}
  },{passive:true});
  let installPrompt=null;
  const status=menu.querySelector('[data-road-install-status]');
  const installButtons=[menu.querySelector('[data-road-install]')];
  const drawer=document.querySelector('#nav-drawer > div:last-child');
  if(drawer){const button=document.createElement('button');button.type='button';button.className='road-install-button';button.textContent='Install CWD app';drawer.prepend(button);installButtons.push(button);}
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const refresh=()=>installButtons.forEach(b=>{b.hidden=installed();});refresh();
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
  window.addEventListener('appinstalled',()=>{installPrompt=null;status.textContent='CWD is installed. Open it from your home screen.';refresh();});
  for(const button of installButtons)button.onclick=async()=>{
    if(!menu.open)menu.showModal();
    if(installPrompt){const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();const choice=await prompt.userChoice;status.textContent=choice.outcome==='accepted'?'Installation requested.':'You can install whenever you like.';}catch{status.textContent='Use your browser menu to install CWD.';}}
    else status.textContent=/iPad|iPhone|iPod/.test(navigator.userAgent)?'In Safari, tap Share, then Add to Home Screen.':'Open your browser menu and choose Install app or Add to Home Screen, if available.';
  };
  if('serviceWorker' in navigator && window.isSecureContext){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{}));
  }
})();
