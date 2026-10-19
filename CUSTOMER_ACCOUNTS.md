# Customer accounts — testing milestone

This feature is disabled by default and does not touch production bookings or send booking notifications. It reuses the existing MSG91 widget only after an account availability check. Automated tests never send SMS.

## Isolated configuration

On a testing preview only, configure server variables:

- `CWD_CUSTOMER_ACCOUNTS_ENABLED=true`
- `CWD_CUSTOMER_SUPABASE_URL`: isolated HTTPS Supabase project URL
- `CWD_CUSTOMER_SUPABASE_SERVICE_ROLE_KEY`: that isolated project's service role key
- Existing `MSG91_AUTH_KEY`, `NEXT_PUBLIC_MSG91_WIDGET_ID`, `NEXT_PUBLIC_MSG91_WIDGET_TOKEN`

The known production database URL, Vercel production environment and any named Git branch other than `testing` are rejected. Customer APIs never fall back to general `SUPABASE_URL` credentials. Keep keys server-only. Deployment configuration must pair the URL with the correct project's key.

Apply `supabase/migrations/20261019043000_customer_accounts.sql` only to an isolated testing database after review. Do not replay all historical migrations into production. This migration is additive, uses SECURITY INVOKER, revokes PUBLIC/anon/authenticated grants and grants its RPC only to service_role. The inactive testing project was not restored or modified during development.

Accounts use their own cookies, not Supabase Auth sessions. This prevents customers inheriting current broad authenticated-role policies. It is intentional that the new account cannot yet retrieve historical bookings, documents, invoices, or change a phone number.

## Tests

```text
node scripts/test-customer-account.mjs
node scripts/test-customer-account-browser.mjs
node scripts/test-mobile-otp.mjs
node scripts/test-otp-security.mjs
node scripts/test-vendor-app-auth-api.mjs
node scripts/build.mjs --booking-only --check
```

Browser tests accept `PLAYWRIGHT_MODULE` and `BROWSER_CHANNEL` (default msedge). They intercept all traffic and fail if an external origin is requested. Screenshots are generated in `.test-output/`.

For isolated migration execution and privilege tests, when PGlite is available:

```text
node scripts/test-customer-account-db.mjs
```

Set `PGLITE_MODULE` to its installed module path if necessary. This test uses an in-memory database, never a Supabase project. It checks denied anonymous/authenticated access, login RPC execution, uniqueness/replay, stable identity, rollback and expiry. It has not been executed in this environment.

## Release checks still required

Run the database suite, review advisors on the isolated database and verify browser cookies over HTTPS. An explicitly authorized test-number OTP check is still needed for actual MSG91 delivery. Do not use real customer numbers for development. Existing MSG91 widget CAPTCHA/provider throttling is retained; account proof exchange cannot send an SMS. Add platform-level request limiting before broad rollout and review data retention/expired-session cleanup.

No production activation is provided by this milestone. Do not merge into main or migrate production without explicit approval.
