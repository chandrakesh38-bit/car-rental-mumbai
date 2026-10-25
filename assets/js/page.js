/* Page composition and navigation only. Business logic remains in booking.js. */
(() => {
    const initializeBooking = window.onload;
    window.onload = null;

    document.addEventListener('DOMContentLoaded', () => {
        const bookingWidget = document.getElementById('booking-widget');
        const selfDriveLandingFleet = document.getElementById('mumbai-selfdrive-fleet');
        const isSelfDrivePage = document.body.dataset.bookingMode === 'selfdrive';

        // Avoid fetching the Self Drive fleet on With Driver landing pages.
        // This saves a Supabase request and unnecessary rendering work for paid Outstation traffic.
        if (selfDriveLandingFleet || (bookingWidget && isSelfDrivePage)) loadWebsiteFleet();
        if (!bookingWidget) return;
        // Run the original initializer only on pages that contain its required DOM.
        initializeBooking.call(window);
        const { bookingMode, bookingTab } = document.body.dataset;
        setServiceMode(bookingMode);
        if (bookingMode === 'withdriver' && bookingTab) setWDSubTab(bookingTab);
    });


    // Business registration details: keep the already published HTML pages
    // aligned with the shared footer template until their next full rebuild.
    document.addEventListener('DOMContentLoaded', () => {
        const gstin = '27AAWFC9651P1ZA';
        const footer = document.querySelector('footer');
        if (footer && !footer.textContent.includes(gstin)) {
            const legalName = [...footer.querySelectorAll('p')].find(p =>
                p.textContent.includes('Car with Driver Mobility LLP'));
            const gstLine = document.createElement('p');
            gstLine.className = 'mt-1 text-slate-300';
            gstLine.textContent = 'GSTIN: ' + gstin;
            if (legalName) legalName.insertAdjacentElement('afterend', gstLine);
            else footer.append(gstLine);
        }
        if (document.body.dataset.page === 'contact' && !document.getElementById('business-registration')) {
            const section = document.createElement('section');
            section.id = 'business-registration';
            section.className = 'max-w-7xl mx-auto px-4 sm:px-6 pb-10';
            section.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"><h2 class="font-bold text-lg text-slate-900 mb-3">Business Information</h2><p class="text-sm text-slate-600">Legal name: Car with Driver Mobility LLP</p><p class="text-sm text-slate-600 mt-1">GSTIN: ' + gstin + '</p></div>';
            const reach = document.getElementById('reach-us');
            if (reach) reach.insertAdjacentElement('afterend', section);
        }
    });

    let previousFocus;
    let closeTimer;
    window.openNavDrawer = function () {
        clearTimeout(closeTimer);
        previousFocus = document.activeElement;
        const drawer = document.getElementById('nav-drawer');
        const overlay = document.getElementById('nav-drawer-overlay');
        drawer.inert = false;
        drawer.setAttribute('aria-hidden', 'false');
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => overlay.classList.remove('opacity-0'));
        document.body.classList.add('overflow-hidden');
        document.getElementById('nav-menu-button').setAttribute('aria-expanded', 'true');
        drawer.querySelector('button').focus();
    };

    window.closeNavDrawer = function () {
        const drawer = document.getElementById('nav-drawer');
        const overlay = document.getElementById('nav-drawer-overlay');
        drawer.classList.add('translate-x-full');
        drawer.inert = true;
        drawer.setAttribute('aria-hidden', 'true');
        overlay.classList.add('opacity-0');
        closeTimer = setTimeout(() => overlay.classList.add('hidden'), 300);
        document.body.classList.remove('overflow-hidden');
        document.getElementById('nav-menu-button').setAttribute('aria-expanded', 'false');
        previousFocus?.focus();
    };

    document.addEventListener('keydown', event => {
        const drawer = document.getElementById('nav-drawer');
        if (drawer.inert) return;
        if (event.key === 'Escape') closeNavDrawer();
        if (event.key !== 'Tab') return;
        const items = [...drawer.querySelectorAll('a[href], button')];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
        }
    });
})();
