/* Phase 1 conversion polish: next-field focus and viewport-aware form controls.
   No fare, route-distance, payment, OTP or booking validation changes. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  function init() {
    const widget=$("booking-widget");
    if (!widget || document.body.classList.contains("cwd-p1-conversion")) return;
    document.body.classList.add("cwd-p1-conversion");
    const fleet=$("fleet");

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

    // Robust ONE-click loader, independent of the cab listing renderer.
    // Listen before the existing inline onclick=triggerFareSearch() handler.
    function installSearchAnimation() {
      const button=$("explore-cabs-button");
      if (!button || button.dataset.cwdLoaderAttached==="true") return;
      button.dataset.cwdLoaderAttached="true";
      const overlay=document.createElement("div");
      overlay.id="cwd-p1-search-loader";
      overlay.className="cwd-p1-loader";
      overlay.setAttribute("role","status");
      overlay.setAttribute("aria-live","polite");
      overlay.setAttribute("aria-hidden","true");
      const heading=document.createElement("strong");
      heading.textContent="Please wait";
      const bars=document.createElement("div");
      bars.className="cwd-p1-loader-bars";
      for(let i=0;i<3;i++)bars.appendChild(document.createElement("span"));
      const subheading=document.createElement("p");
      subheading.textContent="Looking for best rates";
      overlay.append(heading,bars,subheading);
      document.body.appendChild(overlay);
      const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||false;
      // Only a brief transition so the bars can paint. Never hold for 5 sec.
      const visibleMs=reduced?0:550;
      let startedAt=0,active=false,token=0,dismissTimer=null;
      const hide=()=>{
        overlay.classList.remove("visible");
        overlay.setAttribute("aria-hidden","true");
        active=false;
        dismissTimer=null;
      };
      const finish=()=>{
        if(!active || button.disabled)return;
        if(dismissTimer!==null)clearTimeout(dismissTimer);
        const current=token;
        const remaining=Math.max(0,visibleMs-(performance.now()-startedAt));
        dismissTimer=setTimeout(()=>{
          if(current!==token)return;
          if(!button.disabled)hide();
        },remaining);
      };
      button.addEventListener("click",()=>{
        if(button.disabled)return;
        if(dismissTimer!==null)clearTimeout(dismissTimer);
        token++;
        active=true;
        startedAt=performance.now();
        overlay.classList.add("visible");
        overlay.setAttribute("aria-hidden","false");
        // The click's inline handler changes disabled state synchronously;
        // a subsequent microtask checks fast-success and validation failures.
        queueMicrotask(finish);
      },true);
      new MutationObserver(finish).observe(button,{
        attributes:true,attributeFilter:["disabled"]
      });
      const status=$("explore-cabs-status");
      if(status)new MutationObserver(finish).observe(status,{
        childList:true,subtree:true,characterData:true
      });
      // Keep waiting when an actual request is pending. On an unexpected
      // exception and a released button, remove the visual blocker safely.
      window.addEventListener("pagehide",hide);
    }
    installSearchAnimation();
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

    // Google suggestion handlers select places on mousedown (not input change).
    // Bubble after the existing suggestion callback without replacing validation.
    document.addEventListener("mousedown",e=>{
      if (!widget.contains(e.target)) return;
      const option=e.target.closest(".autocomplete-item");
      const parent=option?.closest(".autocomplete-dropdown");
      if (!parent) return;
      const flow={
        "wd-out-pickup-dropdown":["wd-out-destination",false],
        "wd-out-dest-dropdown":["wd-out-pdate",true],
        "wd-local-dropdown":["wd-local-date",true],
        "wd-airport-dropdown":[
          $("btn-airport-pickup")?.className.includes("bg-white") ? "wd-airport-date":"wd-airport-terminal",
          $("btn-airport-pickup")?.className.includes("bg-white")
        ]
      };
      const next=flow[parent.id];
      if (next) queueFocus(next[0],next[1]);
    });
    // Some mobile keyboards dispatch click but not mousedown; avoid duplicate advance.
    document.addEventListener("click",e=>{
      if(!widget.contains(e.target) || e.detail===0)return;
      const opt=e.target.closest(".autocomplete-item");
      const id=opt?.closest(".autocomplete-dropdown")?.id;
      if (id==="wd-out-pickup-dropdown") queueFocus("wd-out-destination");
      else if(id==="wd-out-dest-dropdown") queueFocus("wd-out-pdate",true);
      else if(id==="wd-local-dropdown") queueFocus("wd-local-date",true);
      else if(id==="wd-airport-dropdown") {
        const pickup=$("btn-airport-pickup")?.className.includes("bg-white");
        queueFocus(pickup?"wd-airport-date":"wd-airport-terminal",Boolean(pickup));
      }
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
      if (id==="wd-airport-terminal") {
        const pickup=$("btn-airport-pickup")?.className.includes("bg-white");
        queueFocus(pickup?"wd-airport-pickup":"wd-airport-date",!pickup);
        return;
      }
      const next=nextByChange[id];
      if(next) queueFocus(next[0],next[1]);
    });
    // Keep the single CTA stable during focus changes and after the first click.
    const updateResultsMode=()=>{
      document.body.classList.toggle("cwd-p1-results-open",Boolean(fleet && !fleet.hidden));
    };
    if(fleet) new MutationObserver(updateResultsMode).observe(fleet,{
      attributes:true,attributeFilter:["hidden","aria-hidden"]
    });
    updateResultsMode();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
