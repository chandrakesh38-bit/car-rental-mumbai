# Multi-page site — testing branch

## Architecture

The nine root HTML files are generated static pages. Each response includes its own title, description, canonical, H1, navigation and relevant content; JavaScript is not needed to inject page content. Vercel's existing `cleanUrls: true` serves them without `.html`. `vercel.json`, including its security headers and trailing-slash setting, is unchanged. No SPA catch-all rewrite or new framework is introduced.

- `src/pages.json`: routes, SEO metadata, initial booking modes and section composition.
- `src/components/*.template`: one editable copy of the existing header, booking widget, sections, footer and modals.
- `assets/css/site.css`: the original inline stylesheet, extracted without changes.
- `assets/css/navigation.css`: drawer scrolling and active-page styling.
- `assets/js/analytics.js`, `booking.js`, `partner-documents.js`, `application-id.js`: the original inline scripts, extracted without changes (line endings normalized).
- `assets/js/page.js`: navigation and page initialization only. Calls the existing booking initializer only when its widget exists, then selects the page's existing mode/subtab.
- `scripts/build.mjs`: dependency-free static generator. Generated HTML is committed so Vercel needs no new build configuration.
- `scripts/serve.mjs`: local static preview with clean URLs. Does not execute the partner API.
- `scripts/test.mjs`: browser regression checks with intercepted email and partner submissions.

Edit templates rather than generated HTML, then run `node scripts/build.mjs` and commit both source and generated pages **on testing only**. Shared HTML is repeated in the generated output, as normal for a static multi-page site; business logic is maintained and downloaded from one shared set of scripts.

## Pages

| Path | Existing experience |
| --- | --- |
| `/` | Home, booking widget, fleet, service features, reviews, partner banner |
| `/with-driver` | With-driver widget, initially Local City, and cab fleet |
| `/self-drive` | Self-drive widget, car filters, sorting, pagination and booking |
| `/airport-transfer` | With-driver widget, initially Airport; pickup and drop options |
| `/outstation` | With-driver widget, initially Outstation; dates, distances and fares |
| `/cars` | Cab fleet with the complete booking controls; Self Drive tab exposes that fleet and filters |
| `/mumbai-car-rental` | Existing service features, reviews, partner banner and Mumbai contact details |
| `/faq` | Existing FAQ accordion and See More/See Less controls |
| `/contact` | Existing address, phone, WhatsApp, email and partner banner |

Every page includes all nine navigation links in the drawer and footer, plus the existing partner form and modals. Service tabs remain available inside the booking widget to preserve existing interactions and entered form state; navigation links load distinct pages. With-driver and self-drive controls, fleet and quick-route elements stay together because the original mode-switching functions depend on all of them.

## Preserved code and dependencies

The original `index.html` contained four inline script blocks, three submission forms (with-driver, self-drive, partner), journey fields and all modal markup. Local/outstation/airport bookings share the with-driver form. The partner form uses `/api/partner-application`, with document previews, compression, size/type checks, multipart uploads and success/error handling.

The partner API is unchanged: environment-based Supabase credentials, private storage uploads, `partner_applications` inserts, cleanup on failure and Web3Forms notifications. The admin page and its Supabase authentication, vehicle/rate/location/CMS operations are unchanged. The three destination pages and both logos are unchanged. Booking messages, validation, fare calculations, data, filters, modals and contact links remain in their original code/markup. Tailwind, Font Awesome, Google Fonts, analytics and Supabase SDK dependencies retain their original URLs.

Inspection of the starting `testing` snapshot found that its public Supabase client is initialized but does not make database queries; its public fleet/rates are in-memory arrays. Also, `calculatedRentalHours` starts at 24 and is not recalculated in that snapshot. These pre-existing behaviors are preserved, not silently rewritten. The original drawer referenced missing `openNavDrawer`, `closeNavDrawer` and `navigateAndSetMode` functions; the new navigation supplies open/close handlers and uses real page links instead of the missing mode-navigation handler.

## Test locally

1. Stay on `testing`.
2. Run `node scripts/build.mjs`.
3. Run `node scripts/serve.mjs` and open `http://127.0.0.1:4173`.
4. Open each path in the table directly, refresh it, and navigate using the drawer and footer.
5. Check empty journey validation, local 8/12-hour packages, outstation dates/destinations, airport terminals and pickup/drop, and self-drive filters and delivery choices. Verify fare summaries before submitting.
6. Check FAQ expansion, contact links and partner document preview/change/remove controls on desktop and mobile.

For automated tests, make the `playwright` Node module and a browser available, then run `node scripts/test.mjs`. Set `BROWSER_CHANNEL=msedge` or `chrome` to use an installed browser. Set `PLAYWRIGHT_MODULE` to an absolute module path if using a bundled runtime. Optionally set `BASELINE_DIR` to a pristine copy of the original `testing` snapshot to check exact extraction and compare booking outcomes against the old page. Set `TEST_OUTPUT` to choose where screenshots and results are saved.

Tests intercept booking emails and partner submissions. They do not create real bookings, send messages or write to Supabase. A Vercel **testing preview** with the existing environment variables is required to verify real API/storage/email operation end to end. Static local tests cannot verify production credentials, RLS, storage permissions or email delivery.

## Completed validation

Validated against the original `testing` commit `d3e4e9716cf111a6ad74df57a8a40e04577d43a0` in headless Microsoft Edge:

- All nine direct routes, SEO metadata, a single H1, unique element IDs and expected initial modes.
- All 81 drawer navigation combinations and all nine footer links on every page.
- Layout overflow checks at 1440px, 390px and 320px; desktop/mobile screenshots reviewed.
- Local, outstation, airport and self-drive outcomes compared with the original page; original CSS and all four extracted scripts matched exactly after line-ending normalization.
- Local packages, multi-day outstation fares, all airport terminals in both directions, quick routes, fare breakdown and booking modals.
- Empty/required-field validation, filters, sort, pagination, no-results state, delivery charges, serviceability and mocked booking email payloads.
- FAQ expansion/collapse and phone, email and WhatsApp contact links.
- Partner form on every route; document previews/removal/replacement, image compression, multipart payload and mocked confirmation.
- Supabase SDK/client initialization; API, admin page, logos, destination pages and `vercel.json` byte comparisons.
- Zero uncaught browser JavaScript errors. No real external submissions were made.
