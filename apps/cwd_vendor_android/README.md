# CWD Partner Android — V0.6 (Internal Testing Only)

Flutter + InAppWebView shell over CWD's existing secure vendor portal.

## Vendor-authenticated operational screens

After approved OTP login, show **real vendor data** through
`GET /api/vendor-app-ops` rather than sample/demo content.
Includes Home, New / Accepted / Allocated / Ongoing / Completed / Cancelled,
My Cars, vendor-specific records, earnings, driver details, navigation to
pickup/destination, mandatory odometer-camera trip forms and profile logout.
Native UI never sends arbitrary vendor_id; the server binds the account to
the bearer session. Real write actions require separate backend approval.

Safety: Flutter APK runs in Safe Mode unless it is built with
`--dart-define=CWD_VENDOR_SHARED_DB_APPROVED=true`.
**Do not set** this flag until migration is applied to the correct CWD
Supabase project and the backend login/write gates are configured.
Static splash/branding and keypad checks are safe without it.
Foreground offer polling is **not** background push notifications; true FCM
requires a dedicated Firebase project and validated messaging credentials.

## Finalized CWD Partner branding and City Skyline Drive splash

CWD Partner is the locked consumer-facing Android application name and UI
brand. The original `com.carwithdriverindia.vendor.testing` package ID is
preserved in testing builds to avoid accidental production replacement.

The native Android launch background is teal and immediate, including a
circular branded badge, on Android 7–11 and a matching system splash background
and icon on Android 12+. In Flutter a lightweight local `CustomPainter`
animates coastal skyline illumination, road lines and a **moving car** with a
circular clipped CWD logo, then automatically transitions to the login. No
network image or long blocking initialization is required.

Locked design spec: CWD Partner Splash / Option 13 / City Sky Drive / circular
logo / subtle car drives away / 3-second intro / automatic login / no
artificial wait for sound-preference storage.

**Release boundary:** These are finalized branding and splash changes,
NOT a real vendor production launch. The normal safe-mode preview remains
locked until account auth, database boundaries, actual vendor bookings and
push delivery are verified. No customer/vendor live data is modified.

## V0.4 Vendor Login & Registration

Native login screen based on the owner's login HTML:
- Registered +91 mobile numeric-only keyboard (10 digits).
- Four OTP boxes numeric-only keyboard with paste/next focus.
- MSG91 OTP challenge controlled by server: no mock success.
- Pending/rejected/suspended statuses cannot open the dashboard.
- Active vendor retains existing vendor code, vehicles and payout account.
- Register Now opens the existing CWD registration form only on authorized
  isolated staging; no duplicate onboarding flow.
- Remembered secure mobile session; logout revokes server session.
- Support links, UI transitions and safe-mode keypad preview.

Testing gate: The current CWD Preview still shares its Supabase backend
variables with Production. A NEW isolated staging Supabase project with
vendor tables and separate CWD_VENDOR_APP_* env vars is required.
Do not change CWD_VENDOR_APP_AUTH_ENABLED to true until those prerequisites
are verified. The unconfigured testing APK only previews the login/keypad
and does not send real SMS, approve vendors or read production bookings.

Auth design: api/vendor-app-auth.js, lib/vendor-app-server.mjs,
lib/vendor-app-auth-core.mjs; database draft at
apps/cwd_vendor_android/STAGING_SCHEMA_DRAFT.sql. Not yet migrated.
Full vendor-specific authenticated booking API and push notifications
are separate upcoming tasks; the currently approved dashboard is still
a clearly labeled demo UI (not real vendor data).

## V0.3 interactive design preview (UI testing, no live vendor accounts)

The safe-mode APK shows a clickable mock dashboard using fictional sample data:
- Home contains five simple cards with counts (New Bookings, Today's Pickups,
  Ongoing Trips, Completed, Cancelled); the active section is highlighted.
- My Cars supports animated selection and demo date blocking.
- Pending offer displays general pickup/destination area only, with matching
  vehicle dropdown. Selecting the car never changes the vendor payout.
- After Accept, Cancel is disabled. Only a server-authorized admin may enable
  cancellation, and allocated trips still require admin approval.
- Allocated demo booking displays example public-location addresses and a
  Google Maps navigation button; the call icon never calls a demo number.
- Completed booking has a sample breakdown of fixed kilometers, driver
  allowance, extra km/hours (only where applicable), night charge, toll,
  parking, state tax and final earning. Live settlements will derive strictly
  from CWD's approved vendor ledger.
- On-screen click feedback, acceptance confetti and alert preview are muted
  by a persisted switch in Profile. For Android, notification-tone playback
  uses a secure native MethodChannel and the device notification ringtone.
  Silent/DND and system audio settings can suppress sound.
- Real push notifications require secure vendor login, device tokens,
  backend event delivery and Android notification-channel configuration.
  The preview "Test New Booking Sound" is NOT a real push notification.

Existing CWD server/business data is not modified by this demo UI. The
application stays fail-closed until a verified isolated preview backend exists.

Important: GitHub-hosted Flutter debug builds use an ephemeral Android signing
certificate, so different build runs may not install as upgrades over previous
testing versions. Uninstall the previous CWD Vendor TEST app before installing
this debug build (after saving any local-only test data). A persistent protected
signing key must be set up for seamless future upgrades; never commit private
keystores or secret passwords.

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

Build note: Flutter 3.47 uses Android Gradle Plugin 9. The stable
flutter_inappwebview 6.1.5 fails on removed proguard-android.txt;
V0.1 pins 6.2.0-beta.3, whose Android build uses the supported rule.
This is a testing-only pre-release dependency requiring real-device QA.
