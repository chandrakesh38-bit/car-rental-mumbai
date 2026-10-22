/* Phase 1 conversion polish: next-field focus and viewport-aware form controls.
   No fare, route-distance, payment, OTP or booking validation changes. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  function init() {
    const widget=$("booking-widget");
    if (!widget || widget.dataset.cwdConversionReady) return;
    widget.dataset.cwdConversionReady="true";
    document.body.classList.add("cwd-p1-conversion");
    const fleet=$("fleet");
    const alignKeyboard=()=>{
      const viewport=window.visualViewport;
      const offset=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
      widget.style.setProperty('--cwd-keyboard-offset',offset+'px');
    };
    window.visualViewport?.addEventListener('resize',alignKeyboard);
    window.visualViewport?.addEventListener('scroll',alignKeyboard);
    alignKeyboard();

    // Keep geolocation as a useful shortcut, but put its action INSIDE the
    // location input. This avoids an extra row or overflow on mobile.
    function compactCurrentLocation(root) {
      if (!root) return;
      root.querySelectorAll(".location-current-action").forEach(button => {
        if (button.closest(".cwd-p1-current-location-input")) return;
        const entry=button.closest(".location-entry");
        const input=entry?.querySelector('input[type="text"]');
        if (!input) return;
        const shell=document.createElement("div");
        shell.className="cwd-p1-current-location-input";
        input.parentNode.insertBefore(shell,input);
        shell.appendChild(input);
        shell.appendChild(button);
        button.replaceChildren();
        const icon=document.createElement("i");
        icon.className="fa-solid fa-location-crosshairs";
        icon.setAttribute("aria-hidden","true");
        button.appendChild(icon);
        button.setAttribute("aria-label","Use My Current Location");
        button.title="Use My Current Location";
        button.classList.remove("mt-2","px-3","py-2");
        input.classList.add("cwd-p1-current-location-field");
      });
    }
    compactCurrentLocation(widget);
    const airportForm=$("airport-dynamic-form");
    if(airportForm) {
      // Airport pickup/drop rebuilds inputs dynamically when direction changes.
      new MutationObserver(()=>compactCurrentLocation(airportForm))
        .observe(airportForm,{childList:true,subtree:true});
    }

    // Fare loader now lives in booking.js, directly in triggerFareSearch().
    // Only one overlay is constructed, and one click always launches the search.
    const fromField=()=> {
      if ($("with-driver-block")?.classList.contains("hidden")) return null;
      if (!$("wd-outstation-fields")?.classList.contains("hidden")) return "wd-out-pickup";
      if (!$("wd-local-fields")?.classList.contains("hidden")) return "wd-local-pickup";
      if (!$("wd-airport-fields")?.classList.contains("hidden"))
        return $("btn-airport-pickup")?.className.includes("bg-white") ? "wd-airport-terminal":"wd-airport-pickup";
      return null;
    };
    const focusNext=(id, picker=false)=>{
      const next=$(id);
      if (!next || next.disabled || next.closest(".hidden") || next.hidden) return false;
      try { next.focus({preventScroll:false}); } catch(e) { next.focus(); }
      // showPicker can be blocked by browsers if called outside a user gesture.
      if (picker && typeof next.showPicker==="function") {
        try { next.showPicker(); } catch(e) { /* normal focus remains usable */ }
      }
      return true;
    };
    const queueFocus=(id,picker=false)=>requestAnimationFrame(()=>focusNext(id,picker));
    // Options run their own onclick handlers; bubbling click fires after state is updated.
    widget.addEventListener("click",e=>{
      const btn=e.target.closest("button");
      if (!btn || !widget.contains(btn)) return;
      switch(btn.id) {
        case "wd-out-one-way":
        case "wd-out-round-trip": queueFocus("wd-out-pickup"); break;
        case "subtab-outstation":queueFocus("wd-out-pickup");break;
        case "subtab-local":queueFocus("wd-local-pickup");break;
        case "subtab-airport":
        case "btn-airport-drop":queueFocus("wd-airport-pickup");break;
        case "btn-airport-pickup":queueFocus("wd-airport-terminal",true);break;
        case "btn-mode-withdriver":queueFocus(fromField());break;
      }
      if (/^pkg-card-(8hr|10hr|12hr|4hr)$/.test(btn.id)) queueFocus("explore-cabs-button");
    });

    widget.addEventListener('cwd:place-selected', e=>{
      const flow={
        'wd-out-pickup':['wd-out-destination',false],
        'wd-out-destination':['wd-out-pdate',true],
        'wd-local-pickup':['wd-local-date',true],
        'wd-airport-pickup':[$('btn-airport-pickup')?.className.includes('bg-white')?'wd-airport-date':'wd-airport-terminal',true]
      };
      const next=flow[e.detail.inputId];
      if(next)queueFocus(next[0],next[1]);
    });

    // Move through the Date → Hour → AM/PM steps after a real user selection.
    // The checkout button is focused, NEVER clicked/submitted automatically.
    const nextByChange={
      "wd-out-pdate":["wd-out-phour",true],
      "wd-out-phour":["wd-out-pampm",true],
      "wd-out-pampm":["wd-out-rdate",true],
      "wd-out-rdate":["wd-out-rhour",true],
      "wd-out-rhour":["wd-out-rampm",true],
      "wd-out-rampm":["explore-cabs-button",false],
      "wd-local-date":["wd-local-hour",true],
      "wd-local-hour":["wd-local-ampm",true],
      "wd-local-ampm":["explore-cabs-button",false],
      "wd-airport-date":["wd-airport-hour",true],
      "wd-airport-hour":["wd-airport-ampm",true],
      "wd-airport-ampm":["explore-cabs-button",false],
    };
    widget.addEventListener("change",e=>{
      const id=e.target?.id;
      if(id==="wd-out-pampm" && $("wd-out-one-way")?.getAttribute("aria-pressed")==="true") {
        queueFocus("explore-cabs-button");
        return;
      }
      if (id==="wd-airport-terminal") {
        const pickup=$("btn-airport-pickup")?.className.includes("bg-white");
        queueFocus(pickup?"wd-airport-pickup":"wd-airport-date",!pickup);
        return;
      }
      const next=nextByChange[id];
      if(next) queueFocus(next[0],next[1]);
    });
    // Keep the single CTA stable during focus changes and after the first click.
    // If a customer returns to edit a journey, the CTA must be visible even
    // when a previous cab listing has already been opened.
    widget.addEventListener("focusin",e=>{
      if(e.target?.id!=="explore-cabs-button")document.body.classList.remove("cwd-p1-results-open");
    });
    widget.addEventListener("click",e=>{
      if(!e.target.closest("#explore-cabs-button"))document.body.classList.remove("cwd-p1-results-open");
    });

  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
