/* Page composition and navigation only. Business logic remains in booking.js. */
(() => {
    const initializeBooking = window.onload;
    window.onload = null;

    document.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById('booking-widget')) return;
        // Run the original initializer only on pages that contain its required DOM.
        initializeBooking.call(window);
        const { bookingMode, bookingTab } = document.body.dataset;
        setServiceMode(bookingMode);
        if (bookingTab !== 'outstation') setWDSubTab(bookingTab);
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
