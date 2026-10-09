# CWD Partner — final Android APK release readiness

Owner requested **the final usable Android app**, not another safe-mode design preview. This is the signed-release preparation checklist and a snapshot of the outstanding service dependencies.

## App identity and delivery
- Brand: **CWD Partner**; original City Sky Drive 3-second splash and owner-approved UI stay intact.
- Final package ID: `com.carwithdriverindia.partner` (not the old `com.carwithdriverindia.vendor.testing`).
- Production API host: `https://carswithdriverindia.com` (hard-coded and verified; no client-defined host).
- Final deliverable: one **Android release APK** (not an AAB/Play Store release), with a permanent owner-controlled signing certificate.
- APK workflow: `.github/workflows/cwd-partner-signed-release.yml`, on `testing` branch.
- Required GitHub **Actions secrets**: `CWD_PARTNER_KEYSTORE_B64` and `CWD_PARTNER_KEYSTORE_PASSWORD`. The alias `cwd-partner` and keystore format PKCS12 are fixed. No keystore/password in Git.
- GitHub CI skips the final signed-build job unless BOTH secrets exist; a safe-mode debug build is **not** the final APK.

## Required production backend (not yet active at authoring)
A correctly signed APK alone does not unlock the vendor booking business logic. Release the reviewed `api/vendor-app-auth.js`, `api/vendor-app-ops.js`, `lib/vendor-app-server.mjs`, `lib/vendor-app-auth-core.mjs`, and `lib/vendor-offer-privacy.mjs` to `main` ONLY with the owner's explicit permission; do NOT merge the diverged testing branch wholesale. Keep existing customer booking logic and payment flows unchanged.

Additive database migration on the **confirmed** CWD production Supabase project:
`supabase/migrations/20261009_cwd_partner_app_auth.sql`.
Verify the migration's RLS/service-role restrictions and vendor tables before applying it. It is NOT applied by building the APK.

Production Vercel environment has separate opt-in flags, all default OFF:
- `CWD_VENDOR_APP_AUTH_ENABLED=true`
- `CWD_VENDOR_APP_PRODUCTION_ENABLED=true`
- `CWD_VENDOR_APP_PRODUCTION_WRITES_ENABLED=true` **only after** approved end-to-end auth, ownership, accept/allocate, odometer photo, final settlement checks.
- Configure `CWD_VENDOR_APP_SESSION_SECRET` to a strong random secret in Vercel. Secrets never belong in Git or APK assets.
- Use existing server MSG91 credentials; test with a real approved vendor only after activation.

The `testing` preview currently inherits shared production Supabase variables. Never enable its booking writes or assume isolation.

## Before giving the APK to vendors
1. Verify the real production vendor-auth endpoint returns an auth error for unauthenticated requests (not a missing route/503 feature-gate error).
2. Approved vendor OTP login works, while pending/rejected users cannot open bookings.
3. A vendor receives only their own offers and accepts using one registered matching car; no customer details before allocation.
4. Allocated trip shows customer details; driver fields, Start/End odometer photo, trip close lock and admin review match agreed rules.
5. Final earning appears only after admin approval; no fake payouts.
6. Signed release APK builds with verified signature and exact final application ID, installs on an Android phone and upgrades cleanly with the same keystore.
7. If background push is a release requirement, provision Firebase/FCM credentials and validate Android notification delivery. **The current foreground polling is not push.**

## Safety boundary
CWD website `main`, production Supabase and existing booking/payment records remain unchanged until separately approved. This signed APK preparation alone does not constitute permission to change them.
