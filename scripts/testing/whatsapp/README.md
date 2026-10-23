# Local WhatsApp confirmation tests

Run `npm ci --prefix scripts/testing/whatsapp --cache /tmp/cwd-npm-cache`, then
`node scripts/test-whatsapp-confirmation.mjs` from the repository root.
PGlite executes the actual PL/pgSQL formatter and queue functions in memory.
There are no network/database credentials, sender imports or Android calls.
`queue-baseline.sql` is a test-only snapshot of the existing main b1d82b8
formatter, enqueue and offer-cancellation functions. Testing does not contain
main's WhatsApp subsystem; this fixture verifies the same focused integration
without installing unrelated production functionality on testing.

The focused formatter is `supabase/drafts/whatsapp_booking_confirmation.sql`.
On main, only the checkout-confirmation return in `whatsapp_formats_feedback.sql`
is changed to call it. Other message branches and queue/RPC code are unchanged.
The test verifies the main formatter matches that exact one-branch replacement.

## Activation limitation

These are code/template changes only. Git/Vercel deployments do not apply SQL.
No live database functions, queue records, device settings or credentials are
changed. On a new installation the helper must precede the format/feedback SQL.
On an existing installation, a separately authorized, reviewed SQL deployment
must install the helper and replace `wa_format` with its revised definition.
Do not rerun the entire original format/feedback script on an existing database;
it also creates unrelated tables and triggers. Existing queued message snapshots
are deliberately untouched; no historical backfill or resend is supplied.

## Snapshot semantics

Fields come from `inquiries` and `cwd_checkout_bookings.booking_data`, matching
`customer_checkout.sql` and `lib/booking-validation.mjs`. Dates must include an
explicit offset and are formatted in Asia/Kolkata. Missing/invalid dates and
terms are omitted, never guessed. Only shared trailing state/country components
are removed from route stops; cross-state locality names remain distinct.
Detailed address and area are separate labels. Airport pickup uses the terminal
as pickup and the customer's saved address as drop, not the reverse.

With-driver KM/rates/hours come from server-normalized booking snapshots.
Airport's stored `airportWaitingPolicy` contains entry/parking terms. There is
no authoritative persisted Local/Outstation toll/parking inclusion field, so no
such terms are invented. Self Drive does not inherit with-driver allowances or
driver promises. No stored Maps URL was identified, so no URL is fabricated.
The driver promise is operational copy, not a new timer or dispatch mechanism.
