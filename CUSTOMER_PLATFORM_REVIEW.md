# Customer platform review — testing branch

Reviewed 19 October 2026. Repository starting point: `origin/testing`. This is a code/schema review plus public browser observation, not a claim that every integration has passed a live transaction.

## Evidence and scope

- Repository: static HTML with shared templates/build, browser JavaScript, server APIs, SQL migrations and Flutter vendor app. Existing pricing, vendor features, payment rules and bookings remain intact.
- Production Supabase: read-only project metadata, public schema and policy inspection; no customer records fetched and no writes. Project `pwciaihqkfnlenxxiown` is active. Separate testing project `musjsnzcuqrxvkvyshfi` was inactive at review time.
- Public browser observation of https://www.savaari.com: service tabs, mobile-number login entry, Mumbai–Shirdi results, car selection and booking review/contact fields. No OTP, account creation, checkout submission or payment. No REA used.
- Savaari displayed included distance, extra-km charges, car/fuel options, inclusions/exclusions, pickup details and cancellation messaging. Authenticated My Bookings, internal administration and actual notification delivery were not accessed.
- Public policies: https://www.savaari.com/term-conditions and https://carswithdriverindia.com/cancellation-refund-policy . Savaari's separate refunds URL failed in the web fetch, so its terms and visible booking copy were used. Their policies are reference evidence, not rules adopted by CWD.

## Existing versus missing

| Area | CWD implementation observed | Gap / next work |
|---|---|---|
| Search and fares | Local/outstation/airport/self-drive; server validation, first-trip offer, fare rules, route lookup | Preserve; continue testing against current business rules |
| Customer login | MSG91 widget + server-verified, phone/purpose/origin-bound proof for submissions | Persistent customer sessions and profile; implemented in milestone 1 below |
| My Bookings | `inquiries` stores references, route, fares, payment and trip statuses; admin lists/details | Explicit ownership, pagination, customer-safe fields, status timeline; never expose all inquiries |
| Booking confirmation | Admin status workflow and WhatsApp confirmation copy/share | Durable confirmation event and customer email; enquiry acknowledgement must not claim confirmation |
| Cancellation | Customer policy directs phone/email; admin can set cancelled status | Authenticated request, policy snapshot, approval/rejection, reason and audit log |
| Refunds | Payment links/webhook, offline payments and self-drive deposit refund accounting | Booking refund ledger, eligibility calculation under CWD policy, admin decision and provider/manual settlement reconciliation |
| Modifications | `admin-booking-modification.js` checks dates, totals, optimistic concurrency and payment-link changes; records history | Customer request workflow, explicit approval, notification and reconciliation |
| Email | Resend booking/partner acknowledgements, self-drive review notifications | Confirmation/status/modification/refund templates, durable outbox, retries and delivery audit |
| SMS | MSG91 OTP | Transactional status SMS adapter, approved templates and delivery handling |
| WhatsApp | `wa.me` links, configurable templates and manual share buttons | Provider-independent adapter and outbox; default disabled; no production-number migration |
| Driver allocation | Vendor registration, offers/acceptance, admin allocation, vendor portal/app, costing | Customer-safe assigned driver/vehicle presentation and change notifications |
| Invoices | Tokenized invoice endpoint and stored invoice snapshots | Session-authorized invoice access from owned booking and final invoice lifecycle |
| Completed trips | Admin completed/ongoing states, vendor billing, extras, deposit accounting | Customer completed-trip summary, final invoice and support trail |
| Support | Phone, email, WhatsApp entry points | Trackable customer requests linked to booking and admin queue |
| Admin | Fleet/pricing, inquiries, payments, review, vendor operations | Central customer-request queue, audited status changes and notification failures |

`EMAIL.md` is stale where it describes bookings as email-only: current `api/booking-enquiry.js` saves to `inquiries` before notifications. Code and schema take precedence over that old description.

## Authorization findings

Live policy metadata includes `inquiries` ALL/SELECT policies with `true` for the generic Supabase `authenticated` role, broad authenticated permissions on several admin-managed tables, and a public UPDATE policy on `with_driver_rates`. Effective exposure also depends on grants. These policies need a separate carefully tested hardening migration before customer Supabase Auth sessions could be safely introduced. Nothing was changed in production.

Milestone 1 therefore issues opaque server-side customer sessions, not Supabase Auth JWTs. New account tables have RLS, no browser-role grants, and service-only RPC execution. Every account operation derives identity from the cookie; supplied account IDs, roles or phone edits are rejected. Existing admin and vendor auth is unchanged. This does not repair the pre-existing policies.

## Implementation order

1. **Customer OTP account**: separate sessions, profile, logout, isolated migration and tests. Current milestone.
2. **My Bookings**: add an explicit ownership link at trusted booking creation, paginated projection and status history. Legacy booking claims need an audited verification flow; do not automatically disclose historical records solely because a number matches or has been recycled. Guest booking remains supported.
3. **Cancellation and refunds**: append requests with idempotency/version checks; apply existing CWD 24h / 3h windows. Admin approval controls refunds; never promise settlement from a status change alone.
4. **Email**: transactional outbox written with the booking event; Resend idempotency, retries and failure queue. Test transport must capture locally.
5. **WhatsApp**: a disabled adapter using the same outbox, approved template IDs, consent and delivery receipts. No phone migration, provider provisioning or live sends in this milestone.
6. **Modifications**: extend current admin logic through customer requests, fare approval, payment reconciliation and notifications.
7. **Driver/invoice/completion**: expose customer-safe assignment details, final bills, completed-trip records and support requests.

## Milestone 1 delivered

- `/customer-account` page, shared MSG91 OTP UI, editable display name, returning-session check, logout and support links. Existing indigo/amber branding and logo retained; My Account link added to shared navigation and its existing rendered pages.
- `api/customer-account.js` and `lib/customer-account.mjs`: secure HttpOnly/SameSite cookie; 256-bit random token, SHA-256 token storage, seven-day expiry, server revocation, strict mutation origin checks, bounded bodies, no-store responses and field allowlist.
- Additive SQL migration: accounts, sessions, nonce ledger and one transactional login RPC. A consumed proof cannot create another session; failed transaction rolls back consumption.
- Customer OTP purpose is separated from booking and partner proofs. Existing submission endpoints remain unchanged.
- Fail-closed feature gate: disabled by default; known production database and production deployment forbidden. Dedicated customer database credentials required. No hosted migration, deployment or live notifications performed.

## Validation and remaining limits

Passing: customer account API suite (43 assertions), mobile/desktop account browser suite with intercepted traffic, existing mobile OTP and OTP security suites, vendor auth API regression, and scoped booking build check. Browser screenshots are in `.test-output/` (ignored by Git).

Existing `test-cwd-pricing-policy.mjs` fails at its vendor payout assertion: actual 4034 versus expected 4100. The test and pricing implementation are unchanged by this milestone; baseline reproduction is recorded in the handoff. Fare rules were not altered to satisfy it.

Migration execution/RLS transaction tests are supplied but have not run: PGlite/Postgres is unavailable locally, the npm registry request was denied by the environment, and staging is inactive. No attempt was made to use production as a test database. Supabase CLI was unavailable; the additive migration was authored locally rather than installing/configuring more tooling. The changelog fetch failed; current official RLS documentation was reviewed.

Live MSG91 delivery, hosted cookie behavior and the migration must be verified on an isolated testing deployment before this milestone is called deployment-ready. My Bookings and milestones 3–7 are not implemented in this change.
