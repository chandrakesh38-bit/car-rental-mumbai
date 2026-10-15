/* CWD phase 1 — visual-only upgrades to the existing booking journey.
   Uses live fare/card DOM from booking.js. Never calculates or changes prices. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const safeImage = (src) => typeof src === 'string' && (/^https:\/\//i.test(src) || /^\/(?!\/)/.test(src));
  const money = (value) => Number.isFinite(value) ? '₹' + value.toLocaleString('en-IN') : '';
  const photosFor = (name) => {
    // Only user-provided genuine vehicle photographs, configured after verification.
    const photos = window.CWD_VERIFIED_CAR_PHOTOS?.[name];
    return Array.isArray(photos) ? photos.filter(safeImage).slice(0, 4) : [];
  };
  function init() {
    const widget = $('booking-widget'), container = $('fleet-container'), fleet = $('fleet');
    if (!widget || !container || !fleet || document.body.classList.contains('cwd-p1')) return;
    document.body.classList.add('cwd-p1');
    const hero = widget.closest('header');
    hero?.classList.add('cwd-p1-hero');
    const mode = $('btn-mode-withdriver');
    if (mode) {
      const icon = mode.querySelector('i');
      mode.replaceChildren(icon || make('i','fa-solid fa-user-tie'), document.createTextNode(' Car with Driver'));
    }
    const local = $('subtab-local');
    const outstation = $('subtab-outstation');
    if (local) {
      const span = local.querySelector('span');
      if (span) span.textContent = 'Local';
    }
    if (outstation && local && local.parentElement === outstation.parentElement) {
      outstation.parentElement.insertBefore(outstation, local);
    }
    ['local','airport'].forEach(type => {
      const fields = $('wd-' + type + '-fields');
      const heading = make('p','cwd-p1-mode-heading', type === 'local' ? 'Hourly rentals within the city' : 'Reliable airport pickups & drops');
      fields?.prepend(heading);
    });
    $('search-btn-text') && ($('search-btn-text').textContent = 'EXPLORE CABS');
    widget.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.trim() === 'Explore Cabs') btn.textContent = 'EXPLORE CABS';
    });
    const stops = $('wd-out-stops');
    if (stops) {
      const addBox = stops.parentElement;
      if (addBox) {
        const custom = make('div','cwd-p1-custom-route');
        custom.appendChild(make('span','', 'Planning a multi-city or custom trip?'));
        const links = make('div','');
        const wa = make('a','', 'WhatsApp');
        wa.href = 'https://wa.me/919702988465?text=' + encodeURIComponent('Hello Car With Driver India, I need a quotation for a custom multi-city trip.');
        wa.target='_blank'; wa.rel='noopener noreferrer';
        const call = make('a','', 'Call');
        call.href='tel:+919702988465'; call.style.marginLeft='12px';
        links.append(wa,call); custom.appendChild(links);
        addBox.replaceWith(custom);
        // The empty stop container remains available for compatibility with route validation.
        custom.appendChild(stops);
        stops.hidden = true;
      }
    }
    // The main navigation still relies on the existing verified contact number.
    const navActions = document.querySelector('body > nav .flex.items-center.space-x-3');
    if (navActions && !navActions.querySelector('.cwd-p1-call')) {
      const phone = make('a','cwd-p1-call');
      phone.href='tel:+919702988465';phone.setAttribute('aria-label','Call Car With Driver India on 9702988465');
      const icon=make('i','fa-solid fa-phone');icon.setAttribute('aria-hidden','true');
      phone.append(icon, document.createTextNode(' 97029 88465'));navActions.prepend(phone);
    }
    if (hero && !$('cwd-p1-hero-trust')) {
      const trust = make('div','cwd-p1-trust');
      trust.id='cwd-p1-hero-trust';
      ['Mumbai, Thane & Navi Mumbai Pickups','Travel Across India','Book at ₹0 Available'].forEach((t,i)=>{
        const span=make('span','');
        span.append(make('i', i===2 ? 'fa-solid fa-shield-halved' : 'fa-solid fa-circle-check'), document.createTextNode(' '+t));
        trust.appendChild(span);
      });
      widget.insertAdjacentElement('afterend',trust);
    }
    const toolbar = make('div','cwd-p1-toolbar');
    const summaryRow = make('div','cwd-p1-trip-row');
    const summary = make('div','cwd-p1-trip-text');
    const title = make('strong','', 'Your Trip');
    const description = make('small','', 'Choose your journey details');
    summary.append(title,description);
    const modify = make('button','cwd-p1-modify', 'Modify Booking');
    modify.type='button';
    summaryRow.append(summary,modify);
    const filters = make('div','cwd-p1-filter-row');
    const filterBtn = make('button','cwd-p1-chip','Filter & Sort');
    filterBtn.type='button';
    filters.append(filterBtn);
    const cats = ['All','Hatchback','Sedan','SUV'];
    const chipButtons = {};
    let category = 'All', sort = 'default', fuel = 'all';
    cats.forEach(c=>{
      const btn=make('button','cwd-p1-chip',c);
      btn.type='button';btn.setAttribute('aria-pressed',String(c===category));
      btn.addEventListener('click',()=>{category=c;applyFilters();});
      chipButtons[c]=btn;filters.append(btn);
    });
    toolbar.append(summaryRow,filters);
    fleet.insertBefore(toolbar,fleet.firstChild);
    const banner = make('div','cwd-p1-trust');
    banner.style.cssText='background:#153c67;border-radius:11px;padding:11px 16px;margin-bottom:15px;';
    ['No Advance','Trusted Drivers','24×7 Support'].forEach(label=>{
      const span=make('span','');
      span.append(make('i','fa-solid fa-check-circle'),document.createTextNode(' '+label));
      banner.appendChild(span);
    });
    toolbar.insertAdjacentElement('afterend',banner);
    function activeTrip() {
      const tab = ['outstation','local','airport'].find(t=> $('subtab-'+t)?.classList.contains('subtab-active')) || 'outstation';
      if (tab==='local') {
        const pack = $('wd-local-package')?.selectedOptions?.[0]?.textContent || '8 Hours / 80 KM';
        return {title: ($('wd-local-pickup')?.value || 'Mumbai') + ' — Local (' + pack + ')',prefix:'wd-local-'};
      }
      if (tab==='airport') {
        const from = $('wd-airport-pickup')?.value || 'Airport transfer';
        const code = $('wd-airport-terminal')?.selectedOptions?.[0]?.textContent?.trim() || '';
        const direction = $('btn-airport-pickup')?.className.includes('bg-white') ? 'Pickup from Airport' : 'Drop to Airport';
        return {title: direction + ': ' + from + (code ? ' — '+code : ''),prefix:'wd-airport-'};
      }
      const journey = $('wd-out-one-way')?.getAttribute('aria-pressed')==='true' ? 'One Way' :
        $('wd-out-round-trip')?.getAttribute('aria-pressed')==='true' ? 'Round Trip' : 'Outstation';
      const from = $('wd-out-pickup')?.value || 'From', to = $('wd-out-destination')?.value || 'To';
      return {title: journey + ': ' + from + ' → ' + to,prefix:'wd-out-p'};
    }
    function updateSummary() {
      const trip=activeTrip(); title.textContent=trip.title;
      const d=$(trip.prefix+'date')?.value;
      const h=$(trip.prefix+'hour')?.selectedOptions?.[0]?.textContent || '';
      const ap=$(trip.prefix+'ampm')?.value || '';
      description.textContent=[d,h,ap].filter(Boolean).join(' · ') || 'Add pickup date & time';
    }
    widget.addEventListener('change',updateSummary);
    widget.addEventListener('input',updateSummary);
    widget.addEventListener('click',()=>queueMicrotask(updateSummary));
    updateSummary();
    function typeFor(name,tag) {
      const n=(name+' '+tag).toLowerCase();
      if (/wagon.?r|hatchback|swift|alto|tiago|i10/.test(n))return 'Hatchback';
      if (/sedan|dzire|aura|amaze|etios|verna/.test(n))return 'Sedan';
      if (/suv|muv|ertiga|carens|innova|crysta|xl6|xuv|scorpio/.test(n))return 'SUV';
      return 'Other';
    }
    function decorateCard(card) {
      if (card.dataset.cwdP1Card==='yes') return;
      const name = card.querySelector('h3')?.textContent?.trim() || '';
      const originalFare=card.querySelector('[data-fare-readiness]');
      const origBook=[...card.querySelectorAll('button')].find(btn=>btn.getAttribute('onclick')?.includes('handleBookThisCarClick'));
      if (!name || !originalFare || !origBook) return;
      const label=card.querySelector('span.uppercase')?.textContent?.trim() || 'Car with Driver';
      const capacity=card.querySelector('.fa-users')?.parentElement?.textContent?.trim() || '';
      const luggage=card.querySelector('.fa-suitcase')?.parentElement?.textContent?.trim() || '';
      const oldText=originalFare.textContent?.trim() || '';
      const match=/₹\s*([\d,]+)/.exec(oldText);
      const fare=match?Number(match[1].replace(/,/g,'')):null;
      card.dataset.cwdP1Card='yes';
      card.dataset.cwdP1Category=typeFor(name,label);
      card.dataset.cwdP1Fare= fare===null?'':String(fare);
      card.className='cwd-p1-card';
      const photoBox=make('button','cwd-p1-car-photo');
      photoBox.type='button';
      const photos=photosFor(name);
      if (photos.length) {
        const image=make('img');
        image.src=photos[0];image.alt=name+' car photo';
        photoBox.append(image,make('span','', 'View Photos ('+photos.length+')'));
        photoBox.setAttribute('aria-label','View genuine photos of '+name);
        photoBox.addEventListener('click',e=>{e.stopPropagation();openGallery(name,photos);});
      } else {
        photoBox.disabled=true;
        photoBox.append(make('i','fa-solid fa-car-side'),make('span','','Genuine photos coming soon'));
      }
      const detail=make('div','');
      detail.append(make('span','cwd-p1-card-label',label),make('h3','cwd-p1-car-name',name));
      const specs=make('div','cwd-p1-specs');
      [capacity,luggage,'AC'].filter(Boolean).forEach((t,i)=>{
        const sp=make('span','');
        sp.append(make('i',i===0?'fa-solid fa-users':i===1?'fa-solid fa-suitcase':'fa-solid fa-snowflake'),document.createTextNode(t));
        specs.appendChild(sp);
      });
      detail.appendChild(specs);
      const fareRow=make('div','cwd-p1-fare-row');
      const cost=make('div','');
      cost.append(make('small','',fare===null?'Complete trip details to see fare':'Total fare'),originalFare);
      originalFare.className='cwd-p1-price';
      const cta=make('span','cwd-p1-continue', fare===null?'Trip details required':'Select car →');
      fareRow.append(cost,cta);detail.appendChild(fareRow);
      origBook.classList.add('cwd-p1-hidden-action');
      origBook.tabIndex=-1;origBook.setAttribute('aria-hidden','true');
      card.replaceChildren(photoBox,detail,origBook);
      if (fare!==null && !origBook.disabled) {
        card.setAttribute('role','button');card.tabIndex=0;
        card.setAttribute('aria-label','Select '+name+' for '+money(fare));
        card.addEventListener('click',ev=>{
          if (ev.target.closest('.cwd-p1-car-photo')) return;
          if (ev.target===origBook) return;
          origBook.click();
        });
        card.addEventListener('keydown',ev=>{
          if ((ev.key==='Enter'||ev.key===' ') && ev.target===card) {
            ev.preventDefault();origBook.click();
          }
        });
      }
    }
    function applyFilters() {
      Object.entries(chipButtons).forEach(([c,btn])=>btn.setAttribute('aria-pressed',String(c===category)));
      const cards=[...container.children].filter(c=>c.dataset.cwdP1Card==='yes');
      cards.forEach(card=>{card.hidden=category!=='All'&&card.dataset.cwdP1Category!==category;});
      const sorted=cards.slice().sort((a,b)=>{
        if(sort==='default') return 0;
        const fa=Number(a.dataset.cwdP1Fare)||Number.POSITIVE_INFINITY;
        const fb=Number(b.dataset.cwdP1Fare)||Number.POSITIVE_INFINITY;
        return sort==='low'?fa-fb:fb-fa;
      });
      sorted.forEach((card,i)=>card.style.order=sort==='default'?'':String(i));
      const empty=$('cwd-p1-empty-results')||make('p','', 'No cars match these filters. Try another category.');
      empty.id='cwd-p1-empty-results';empty.style.cssText='padding:22px;text-align:center;color:#526a83;';
      if (!empty.isConnected) container.appendChild(empty);
      empty.hidden=cards.some(c=>!c.hidden)||cards.length===0;
    }
    function refreshCards() {
      [...container.children].forEach(card=>{if(card.id!=='cwd-p1-empty-results')decorateCard(card);});
      updateSummary();applyFilters();
    }
    let pending=false;
    const resultObserver=new MutationObserver(()=>{
      if(pending)return;
      pending=true;
      requestAnimationFrame(()=>{pending=false;refreshCards();});
    });
    resultObserver.observe(container,{childList:true});
    refreshCards();
    function dialog(titleText,cls) {
      const overlay=make('div','cwd-p1-popover');
      overlay.setAttribute('role','presentation');
      const panel=make('section','cwd-p1-dialog '+(cls||''));
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',titleText);
      const header=make('div','cwd-p1-dialog-header');
      header.append(make('strong','',titleText));
      const close=make('button','cwd-p1-dialog-close','Close');
      close.type='button';header.append(close);panel.append(header);overlay.append(panel);
      document.body.appendChild(overlay);
      const previous=document.activeElement;
      const dispose=()=>{overlay.remove();document.removeEventListener('keydown',escapeKey);previous?.focus?.();};
      const escapeKey=(e)=>{if(e.key==='Escape'){e.preventDefault();dispose();}};
      document.addEventListener('keydown',escapeKey);
      overlay.addEventListener('click',e=>{if(e.target===overlay)dispose();});
      close.addEventListener('click',dispose);close.focus();
      return {overlay,panel,dispose};
    }
    function openGallery(name,images) {
      if(!images.length)return;
      const modal=dialog(name+' — Genuine car photos');
      let index=0;
      const image=make('img');
      image.alt=name+' photo';
      image.style.cssText='width:100%;height:300px;object-fit:contain;border-radius:12px;background:#f1f5f9;';
      const controls=make('div','');
      controls.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-top:12px;';
      const left=make('button','cwd-p1-reset','← Previous');
      const right=make('button','cwd-p1-reset','Next →');
      const count=make('span','');
      const update=()=>{image.src=images[index];count.textContent=(index+1)+' / '+images.length;};
      left.addEventListener('click',()=>{index=(index+images.length-1)%images.length;update();});
      right.addEventListener('click',()=>{index=(index+1)%images.length;update();});
      controls.append(left,count,right);
      modal.panel.append(image,controls,make('p','', 'We send neat and clean cars for every trip.'));
      update();
    }
    function openFilterDialog() {
      const modal=dialog('Filter & Sort');
      const type=make('label','cwd-p1-field','Car Type');
      const typeSel=make('select');
      cats.forEach(c=>{const opt=make('option','',c);opt.value=c;typeSel.append(opt);});
      typeSel.value=category;type.append(typeSel);
      const fuelWrap=make('label','cwd-p1-field','Fuel Type');
      const fuelSel=make('select');
      fuelSel.disabled=true;
      fuelSel.append(make('option','','Fuel details not verified yet'));
      fuelWrap.append(fuelSel);
      const sortLabel=make('label','cwd-p1-field','Fare Sort');
      const sortSel=make('select');
      [['default','Recommended order'],['low','Lowest to Highest'],['high','Highest to Lowest']].forEach(([v,t])=>{
        const opt=make('option','',t);opt.value=v;sortSel.append(opt);
      });
      sortSel.value=sort;sortLabel.append(sortSel);
      const row=make('div','');
      row.style.cssText='display:flex;gap:10px;justify-content:space-between;margin-top:20px;';
      const clear=make('button','cwd-p1-reset','CLEAR ALL');
      const apply=make('button','cwd-p1-reset','Apply Filters');
      apply.style.cssText='background:#153c67;color:white;';
      clear.addEventListener('click',()=>{category='All';sort='default';fuel='all';applyFilters();modal.dispose();});
      apply.addEventListener('click',()=>{category=typeSel.value;sort=sortSel.value;applyFilters();modal.dispose();});
      row.append(clear,apply);modal.panel.append(type,fuelWrap,sortLabel,row);
    }
    filterBtn.addEventListener('click',openFilterDialog);
    function openModifyDialog() {
      updateSummary();
      const placeholder=document.createComment('booking widget original position');
      widget.parentNode.insertBefore(placeholder,widget);
      const modal=dialog('Modify your trip','cwd-p1-edit-dialog');
      modal.panel.appendChild(widget);
      const originalDispose=modal.dispose;
      let restored=false;
      const restore=()=> {
        if(restored)return;
        restored=true;
        if(placeholder.parentNode)placeholder.parentNode.replaceChild(widget,placeholder);
        originalDispose();updateSummary();
      };
      modal.overlay.querySelector('.cwd-p1-dialog-close').addEventListener('click',restore);
      modal.overlay.addEventListener('click',e=>{if(e.target===modal.overlay)restore();});
      const status=$('explore-cabs-status');
      const finished =new MutationObserver(()=>{
        if(status?.textContent?.startsWith('Live fares ready')) {finished.disconnect();restore();fleet.scrollIntoView({behavior:'smooth',block:'start'});}
      });
      if(status)finished.observe(status,{childList:true,subtree:true,characterData:true});
      const closeIfRemoved=new MutationObserver(()=>{if(!modal.overlay.isConnected){finished.disconnect();closeIfRemoved.disconnect();if(!restored){restored=true;if(placeholder.parentNode)placeholder.parentNode.replaceChild(widget,placeholder);}}});
      closeIfRemoved.observe(document.body,{childList:true});
    }
    modify.addEventListener('click',openModifyDialog);
    // The single loading overlay is now controlled by phase1-autoflow.js,
    // independently of cab-card rendering and filter setup.
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
