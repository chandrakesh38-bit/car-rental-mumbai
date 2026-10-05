# Microsoft Clarity testing and verification

This implementation is for the Vercel preview of `testing` only. No production project is configured. Recording stays disabled until a separate testing Project ID is supplied. Code tests with a simulated SDK do not prove that Microsoft has processed recordings or heatmaps.

## Create the testing project

1. Sign in at https://clarity.microsoft.com/ using the business account you want to own the data.
2. Create a website project named **Car With Driver India — Testing**. Use the newest READY deployment for the Vercel `testing` branch as its website URL. Do not use the production domain. The initial baseline was commit `b1f9c7c`; implementation will produce a newer preview.
3. Copy the Project ID from Settings → Overview or the installation code under Settings → Setup. It is the value following `https://www.clarity.ms/tag/`. Send the ID, not an account password or access token.
4. In Settings → Masking, select **Strict** and remove any unmask rules. The code independently masks the document root before SDK startup. Do not unmask forms, summaries, suggestions, OTP, payment or document content. Microsoft says masking-setting changes can take up to one hour and affect only new recordings.
5. Enable the project's consent requirement. The website asks for analytics permission and sends `analytics_Storage: granted` and `ad_Storage: denied` only after acceptance. No Clarity SDK loads before acceptance. Do not connect the testing project to production GA4 or Ads accounts.
6. In Vercel → car-rental-mumbai → Settings → Environment Variables, set `CLARITY_TESTING_PROJECT_ID` for **Preview**, branch **testing** only. Redeploy the newest testing commit. This is a public project identifier, not a secret. The endpoint additionally requires `VERCEL_ENV=preview` and the testing/implementation branch; main and production cannot enable it.

## Verify the deployed preview

Use the newly created READY testing deployment URL, after checking its commit matches the implementation. Vercel authentication may require signing in before opening protected previews; a Clarity Project ID does not remove deployment protection.

1. Open `/api/clarity-config` on that preview. Before setup it must return `{"enabled":false}`. After setup it must contain `enabled:true`, `environment:testing`, and the separate testing Project ID.
2. Use Android Chrome on a physical phone for final acceptance. Also test at 393 × 851 with touch/mobile emulation. Start in a fresh browser context, with no privacy extension blocking the test. Use only controlled test details. Automatic tests use fixtures and never send SMS, payments or real bookings.
3. Open `/outstation?utm_source=google&utm_medium=cpc&utm_campaign=clarity_testing`. Before accepting analytics, DevTools Network must show no requests to `clarity.ms` or `c.bing.com`. Decline, reload, and confirm this remains true. Open **Session analytics preferences** in the footer and accept.
4. After accepting, expect one `https://www.clarity.ms/tag/<testing-id>` loader and successful requests to Clarity collection hosts. Check Console for CSP violations. The root `<html>` must have `data-clarity-mask="true"`, and no element may have `data-clarity-unmask`. A loaded script alone is not proof of a processed recording.
5. Run the sequence below. Use a controlled real phone only when explicitly carrying out live OTP testing. Complete a booking submission only in an agreed test workflow: this preview can still use the existing booking backend and send notifications. Do not make a payment just to verify analytics.

| Action | Expected Clarity custom event |
| --- | --- |
| Tap Explore Cabs | `explore_cabs_click` |
| Wait for successful cab results | `cab_results_shown` |
| Tap Book This Car | `book_car_click` |
| Booking modal becomes visible | `booking_form_opened` |
| OTP provider successfully sends OTP | `otp_requested` |
| OTP succeeds and server verification succeeds | `otp_verified` |
| Booking API accepts the request | `booking_request_submitted` |

6. Confirm invalid trip details do not produce results/form-success events. Incorrect or rejected OTP must not produce `otp_verified`; a failed booking request must not produce `booking_request_submitted`. OTP success alone is not booking success. Retry sends can legitimately produce another `otp_requested`.
7. Use distinctive synthetic name, email and address values in the form and suggestions. In Clarity → Recordings, filter the testing project by the test time, Device = Mobile, `environment=testing`, `traffic_type=google_ads`, and `trip_type=outstation`. Find and play the session. Confirm clicks, scrolling, modal transitions and the expected custom events are present, while entered values, exact locations, displayed summaries, phone/OTP, booking reference and secure links are unreadable. This initial conservative configuration masks all page text and images, so identify stages by layout and custom events.
8. In Heatmaps, select `/outstation`, Mobile, the relevant test period and the same custom filters. Verify click/tap markers and scroll depth correspond to the test. Allow processing time; do not mark heatmaps verified until actual data appears. If it does not, check consent, blockers, the Project ID, successful collection responses and CSP first.
9. Change Session analytics preferences to **No thanks**. The page reloads to remove SDK observers; subsequent navigation must not load the SDK. Existing recordings are not deleted by withdrawal.
10. Visit `/customer-invoice`, `/quotation`, `/cwd-admin-5377`, `/vendor-booking`, `/vendor-register`, `/self-drive-documents`, and `/self-drive-review`: no Clarity SDK may load. Repeat with `/outstation?email=synthetic@example.com`; unexpected parameters must disable recording without altering the URL or GA4.

## Data and performance boundaries

- Events accept only the seven names above. Tags accept fixed values for `service_type`, `trip_type`, `journey_type`, `environment` and `traffic_type`. No identify API, user IDs, booking IDs, phone, email, exact address, OTP, fares, payment details, raw UTMs or click IDs are passed as custom tags/events.
- Clarity itself collects page URLs and browser/session metadata. DOM masking is not URL masking. The integration refuses unapproved paths, hashes, query parameters and detailed external referrers. Standard Google click-ID parameters and narrowly approved paid UTMs are allowed; click IDs remain part of the page URL, not custom tags. Review actual Ads landing-URL patterns before production: unknown campaign names/parameters deliberately result in no recording. URLs are never rewritten, preserving existing GA4/Ads attribution.
- `traffic_type=google_ads` means recognized paid landing parameters, not verified Google Ads account data. Outstation is tagged by public page type or a recognized funnel event. No Google Ads account linking is needed.
- Recording is fully opt-in; no consent means no recording. Global Privacy Control and browser Do Not Track also suppress initialization. GA4's existing behavior is unchanged.
- The local loader is about 7.9 KB uncompressed / 3.1 KB gzip, loaded asynchronously only on the project's preview hosts (or local fixtures). The SDK loads asynchronously after consent; there is no new package dependency, polling, or custom DOM observer. Real SDK CPU/network cost still needs measurement after activation.
- CSP adds `https://*.clarity.ms` only to `script-src` and `connect-src`, plus `https://c.bing.com` to `connect-src`. Existing `img-src https:` already permits Clarity images. Default, frame, style and existing provider permissions are preserved. The pre-existing CSP includes inline/eval allowances; this change does not add them.
- Razorpay links remain outside this site's recording scope. No payment handler, Maps implementation, MSG91 verification or booking API is changed.

## Automated checks

Run `node scripts/test-clarity.mjs` for config, consent, URL/referrer gates, fixed payloads and CSP checks. Run `node scripts/test-first-trip-offer.mjs` for the existing server-side offer logic.

Run the existing `scripts/test-paid-funnel.mjs` with `CLARITY_TEST=1`, a resolvable `PLAYWRIGHT_MODULE`, and `BROWSER_CHANNEL=chrome`. `LOW_MEMORY_BROWSER=1` reduces GPU/renderer pressure on this workstation. This uses Pixel 5 Android emulation, six outstation route/journey combinations, mocked Maps/OTP/database/booking responses and a simulated Clarity SDK. It tests the seven real application triggers plus consent acceptance, rejection and withdrawal. It does not contact a real Clarity project or prove real Android hardware behavior.

The pre-existing `scripts/test-mobile-otp.mjs` currently fails because its old test token/request omits the request ID required by `lib/mobile-otp.mjs`. Those files were unchanged. Do not treat that test as passed. The browser fixture does verify the booking UI waits for successful server OTP verification.

## Before any production rollout

Keep main and the production deployment unchanged until the user approves production. Create a different production Clarity project, review the disclosure and consent configuration for production, and explicitly implement production host/environment configuration. This implementation deliberately cannot enable production by adding a Project ID alone.

Acceptance requires real Android testing, successful live collection, reviewed masked recordings, populated mobile heatmaps, a performance comparison with Clarity on/off, and live provider smoke checks in a controlled test workflow. Compare GA4, Google Places, MSG91 and Razorpay behavior against baseline. To disable testing recording, remove the Preview-only Project ID and redeploy testing; existing tabs should reload or revoke consent. Never roll back or promote production for this testing task.

References: [Microsoft masking documentation](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking), [custom events and tags](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api), [CSP](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp), [consent API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2), and [privacy disclosure guidance](https://learn.microsoft.com/en-us/clarity/setup-and-installation/privacy-disclosure).
