# Fleet Vehicles → website

The existing Supabase `vehicles` table supplies the self-drive booking catalog (including `/cars`) and the self-drive example cards on `/mumbai-car-rental`. The website fetches the catalog when a fleet page opens. After saving in Admin, open or reload the website page to see the change; a page already open is not subscribed to live updates.

## Admin operation

1. Sign in to the existing Admin Panel and open **Fleet Vehicles**.
2. Add or edit the brand, model, display name, segment, transmission, fuel, seats, hourly price, refundable deposit, image and priority rank.
3. Select **Self Drive Only** or **Both** and mark the car **Active** to include it in the self-drive catalog. Driver-only records do not become self-drive cars.
4. Save, then reload `/self-drive` or `/cars`. The existing booking calculator uses the saved hourly price and deposit.
5. Click Active/Inactive to deactivate/reactivate. Deactivated and deleted cars disappear on the next page load. Delete retains the existing confirmation; an unsuccessful database write now shows an error.

Images can use an HTTP(S) URL or the existing `vehicle-images` upload. Upload accepts JPG, PNG or WEBP up to 5 MB; Save waits for the upload to finish. Storage/database permissions must already allow the signed-in admin to perform the operation. No bucket or policy is modified by this change.

## Data mapping and boundaries

`full_name`, `brand`, `model`, `segment`, `transmission`, `fuel_type`, `seating_capacity`, `rate_per_hour`, `refundable_deposit`, `image_url`, `display_order` and `is_active` feed the existing display/filter/booking fields. Money stays numeric until formatting. `rate_per_day` is left untouched because the existing calculator uses hourly prices. The existing featured ranks (1, 2, 3, 6–11) retain their Best Selling sorting treatment without requiring a new database column.

All 32 existing public database cars were readable during development, with prices, deposits, images and ordering matching the prior hardcoded catalog. No seed or migration is needed. The service dropdown now saves `Self-Drive`, matching the existing table values.

There is no hardcoded self-drive fallback: a successful empty catalog stays empty, and read failures show a retry control instead of resurrecting removed vehicles. Reads are paginated and requested without browser caching. New catalog values become available in the existing filters. Database text is escaped when rendered and booking buttons use event listeners rather than interpolated executable code.

With Driver package/airport/outstation rates remain in their existing separate source. Other Admin sections, booking formulas, destinations, delivery calculations, forms, email submissions, partner applications/documents/uploads, RLS and Vercel configuration are unchanged. Mumbai self-drive cards are now populated in the browser rather than frozen into generated HTML; the page's existing title, description, canonical, headings and structured data are unchanged.

## Verification

Run `node scripts/test-fleet.mjs` with Playwright installed (or set `PLAYWRIGHT_MODULE`) and Edge available (or set `BROWSER_CHANNEL`). It uses the real Supabase client against intercepted responses, testing Admin create/edit/deactivate/reactivate/delete, image upload, website mapping, filtering, fare inputs, empty/error/retry behavior, denied/zero-row writes, escaping, all nine routes and mobile overflow. Auth and writes are mocked; it never modifies live Supabase records.

`node scripts/test.mjs` exercises the existing website flows against public catalog reads. `TEST_PORT` can select an unused preview port. External booking emails and partner submissions are intercepted.

Live anonymous catalog reads are verified. Authenticated production fleet writes and Storage upload permissions require a signed-in admin check; no admin session or service-role credential was available during implementation. To verify: add a temporary active Self Drive car, reload `/cars`, edit its price/image, check its fare review, deactivate it, then delete the test record. No service-role secret belongs in frontend code.
