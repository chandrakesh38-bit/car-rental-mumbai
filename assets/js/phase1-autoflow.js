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
    const updateFloating=()=>{
      const withDriver=!$("with-driver-block")?.classList.contains("hidden");
      const resultsHidden=Boolean(fleet?.hidden);
      const active=document.activeElement;
      const editing=active && widget.contains(active) &&
        active.matches("input, textarea, select");
      document.body.classList.toggle("cwd-p1-floating-cta",withDriver&&resultsHidden&&!editing);
    };
    widget.addEventListener("focusin",updateFloating);
    widget.addEventListener("focusout",()=>requestAnimationFrame(updateFloating));
    widget.addEventListener("click",()=>requestAnimationFrame(updateFloating));
    if(fleet) new MutationObserver(updateFloating).observe(fleet,{attributes:true,attributeFilter:["hidden","aria-hidden"]});
    updateFloating();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
