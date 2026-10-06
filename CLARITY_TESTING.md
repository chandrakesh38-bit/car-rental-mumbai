# Microsoft Clarity staging and production rollout

## Projects

- Testing project: Car With Driver India — Testing (ysx30apjfr), used only on Vercel preview branch testing.
- Production project: Car-With-Driver-India (ytlbj3az3g), website carswithdriverindia.com.
- No Clarity API token is required for website tracking. The project ID is the client-side identifier used by the loader.

## User-approved production settings

- Production Clarity masking mode: Relaxed.
- Production Clarity Cookies setting: ON.
- Website consent remains opt-in: the local Clarity SDK is not loaded until the visitor chooses Allow & Continue.
- Consent copy: Help us make booking easier / Allow anonymous usage analytics so we can improve your booking experience.
- Buttons: Allow & Continue / No thanks.
- Footer: Analytics preferences only.
- The old preview-only Session analytics status diagnostic UI is removed.

Microsoft Clarity masks form input boxes and dropdowns even in Relaxed mode. The site additionally applies data-clarity-mask to customer-specific rendered content such as autocomplete results, exact route/location summaries, current-location status text and booking confirmation content. The page root is not force-masked, so the production project's Relaxed setting remains effective.

## Environment isolation

- CLARITY_TESTING_PROJECT_ID is enabled only on Vercel Preview for branch testing.
- CLARITY_PRODUCTION_PROJECT_ID is enabled only on Vercel Production when the request host is carswithdriverindia.com or www.carswithdriverindia.com.
- The production environment variable must be set to ytlbj3az3g before main is promoted.
- Until the code is pushed to main, production behavior is unchanged.

## Recording scope and privacy gates

Allowed public pages include the home page, With Driver, Self Drive, Airport, Outstation, Cars, location landing pages, FAQ, Contact, Privacy Policy, Terms and Cancellation pages.

Recording is excluded from admin, vendor, invoice, quotation, self-drive document/review and other non-public flows. Unexpected query parameters, unsafe hashes and detailed external referrers fail closed. Google Ads click IDs and safe paid-campaign parameters are permitted without being copied into custom Clarity events/tags.

Custom Clarity events are limited to explore_cabs_click, cab_results_shown, book_car_click, booking_form_opened, otp_requested, otp_verified and booking_request_submitted.

No identify API, customer ID, booking ID, phone, email, exact address, OTP, fare, payment details, raw UTM values or click IDs are sent as custom event payloads.

## Verification before main

1. Verify the latest testing deployment is READY.
2. On Android Chrome, use a fresh browser context and open Outstation.
3. Confirm the compact consent bar appears and no diagnostic/status box exists.
4. Confirm No thanks keeps the Clarity SDK unloaded.
5. Re-open Analytics preferences, choose Allow & Continue, and confirm the testing project receives the session.
6. Verify normal site text is visible according to the project masking mode while customer-specific rendered locations/confirmation content remain masked.
7. Complete only a controlled test funnel and verify the seven custom stages.
8. Confirm admin/vendor/invoice/document pages do not load Clarity.
9. After approval, set production env CLARITY_PRODUCTION_PROJECT_ID=ytlbj3az3g and promote the reviewed changes to main.

Main must not be changed until explicit user approval.
