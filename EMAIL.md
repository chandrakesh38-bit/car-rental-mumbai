# Resend notifications (testing branch)

The existing booking submit handlers call `/api/booking-enquiry`; the existing partner API sends notifications after saving the application. Both use `lib/notifications.mjs`. Web3Forms notification calls were replaced, not supplemented.

Vercel must expose `RESEND_API_KEY` to the **testing Preview** deployment. The key is read only by server code. Sender: `noreply@carswithdriverindia.com`; admin: `carwithdriver.vikhroli@gmail.com`. Existing Supabase variables remain required for partner applications. No database/storage/RLS changes are needed.

One admin notification and one separate acknowledgement are attempted. Resend idempotency keys protect identical email retries (Resend retains keys for 24 hours); booking buttons are disabled during submission. Acknowledgements explicitly state that bookings are not confirmed and partnerships are not approved. The UI only reports an acknowledgement sent after Resend accepts that email; acceptance is not a guarantee of inbox delivery.

Email failure never rolls back a saved partner application or deletes its uploads. Private document paths, signed URLs and attachments are excluded from emails. Partner emails contain contact/vehicle details, Application Number and upload counts/status.

Bookings retain their existing email-only flow: this change does not create a bookings database table. If the admin notification fails, the UI asks the customer to contact the team using the Booking ID instead of claiming the team received the email. There is no background retry queue.

## Tests

- `node scripts/build.mjs` (existing static site build).
- `node scripts/test-notifications.mjs` (mocked Resend/Supabase: success, partial/total/network failures, missing key, unchanged upload cleanup, reference reuse, duplicate clicks and validation).
- `node scripts/test-notifications-browser.mjs` (requires Playwright and Edge; set `PLAYWRIGHT_MODULE` and/or `BROWSER_CHANNEL` if needed).

Existing handwritten differences in `index.html` and `with-driver.html` were preserved after the build; only the shared success-message copy changed in generated HTML.

## Live testing on Vercel testing preview

1. Confirm the Preview environment has `RESEND_API_KEY` and deploy **testing only**.
2. Submit a test Local, Outstation, Airport and Self Drive enquiry using an email inbox you control. Check one admin email with the reference, customer, journey, selected car and fare details, plus one customer acknowledgement with the same Booking ID. Verify Outstation return time and Self Drive delivery/deposit details.
3. Submit a partner application with permitted test documents/photos. Confirm the application and private uploads remain in Supabase, the existing Application Number appears in both emails, and neither email contains private document links. The partner acknowledgement must say the application is under review, not approved.
4. Check Resend logs and both inboxes (including spam) for delivery. On a separate testing preview with a missing/invalid key, a saved partner application must still succeed, uploads must remain and the UI must not claim an acknowledgement was sent. A booking must display the admin-email failure fallback.

No live email or Supabase writes are made by the automated tests.
