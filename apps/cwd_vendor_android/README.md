# CWD Vendor Android — V0.1 (Internal Testing Only)

Flutter + InAppWebView shell over CWD's existing secure vendor portal.

## Implemented source features

- Native branded vendor home
- Paste a booking offer / allocation link or full WhatsApp message
- Strict preview-origin and 64-character token checks
- Encrypted on-device saved offer and allocation links
- WebView for vendor registration, offer response, driver details and trip close
- Camera permission request on trusted origin
- Restrict WebView top-level navigation; launch approved maps/call/WhatsApp externally
- Android back and refresh; offline load error
- Secure test build package com.carwithdriverindia.vendor.testing

## Important safety gate

Vercel project configuration currently assigns SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY to **both** production and preview. A Vercel
preview deployment may therefore write to the LIVE Supabase database.

The Flutter app is **LOCKED BY DEFAULT**. It will not open booking pages
until BOTH compile-time options are supplied:

  CWD_VENDOR_STAGING_URL=https://car-rental-mumbai-...vercel.app
  CWD_VENDOR_STAGING_ISOLATED=true

The isolated switch must ONLY be enabled after a distinct staging Supabase
project, vendor tables, bucket policies and service role have been configured
and independently verified. This protects live bookings and vendors.

Do not use real booking tokens or actual vendor/customer data in tests.
Do not bypass Vercel SSO/deployment protection by embedding any secret.
The standalone Flutter app is in the WEBSITE repository testing branch only.

## Build locally

Requires Flutter stable, Android SDK, JDK 17 and Python 3.

  cd apps/cwd_vendor_android
  bash scripts/bootstrap.sh
  flutter analyze
  flutter test
  flutter build apk --debug

Safe-mode APK output:

  apps/cwd_vendor_android/build/app/outputs/flutter-apk/app-debug.apk

After isolated staging is genuinely configured:

  flutter build apk --debug --dart-define=CWD_VENDOR_STAGING_URL=https://car-rental-mumbai-REAL-PREVIEW.vercel.app --dart-define=CWD_VENDOR_STAGING_ISOLATED=true

Do NOT copy the example preview URL; use an actual preview verified as isolated.

## Existing backend behavior

The vendor portal is link-based: /vendor-booking?offer=<token> and
/vendor-booking?allocation=<token>. These links are bearer credentials.
Vendor registration intentionally has no OTP. The app does NOT provide
a vendor login, global offers list or payout dashboard in V0.1.

Full native vendor dashboard requires secure vendor-specific authentication,
server-side vendor-scoped offer/trip APIs, and payout integration. A vendor
code or mobile number alone is NOT a secure login.

## QA required on physical Android before use

1. Production website links rejected in testing APK.
2. No database mutations while stage isolation flag is false.
3. Vercel-protected staging authentication works (or authorized stable stage).
4. Accept/decline offer with fake vendor data.
5. Admin allocation link opens and driver details save.
6. Odometer camera + photo upload on real phone.
7. Trip start 3-hour restriction; trip close locks edits.
8. Expired and revoked links show backend errors.
9. Opening Maps and phone dialer correctly.
10. Clear saved secure links and install/uninstall behavior.

No production release, no Play Store publishing, no automatic migrations.
