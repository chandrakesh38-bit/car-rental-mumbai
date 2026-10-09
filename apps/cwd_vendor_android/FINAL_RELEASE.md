# CWD Partner — production-connected final app release checklist
Updated: 9 October 2026. Owner-approved 3-second City Sky Drive splash and
Flutter vendor screens are preserved.

## What is operational today
- The production `carswithdriverindia.com` backend is live on Vercel.
- The verified CWD Supabase database already contains secure vendor sessions,
  approval status, offers, allocations, trip events, car blocks and ledgers.
- **Codex resolved the owner-tested MSG91 OTP login issue. Do not change the
  working OTP implementation in `api/vendor-app-auth.js` or
  `lib/vendor-app-auth-core.mjs` while releasing unrelated app updates.**
- Approved vendors sign in using existing registration. Rejected, suspended,
  pending and unregistered accounts cannot open the dashboard.
- Vendor-owned offers only: pre-allocation addresses/customer data are hidden.
- Matching registered vehicle selection, Accept/Decline, admin allocation,
  cancellation unlock and vehicle-blocking are implemented.
- Driver details; mandatory odometer photos; no Start Trip earlier than
  three hours before pickup unless admin-approved; locked final closure.
- Only admin-approved vendor settlement appears as a **final earning**.

## Final UX finishing pass — testing branch
- Vendor Home / Bookings / My Cars / Earnings / Profile with status filters.
- Approved earnings show paid/pending totals, due date, payment date/reference,
  while under-review trips show no premature final payout.
- My Cars lists blocked dates with confirmation before unblocking.
- Booking details show vendor-local rates, India-local trip dates, and clear
  acceptance/cancellation state.
- Trip dialogs validate KM, photo and driver input without losing the form.
- Admin booking operations show an authorized cancellation unlock/lock button.
- Overlapping accepted bookings for the same vendor car are rejected at the
  API layer. DB-level concurrency exclusion remains a separate hardening task.
- All changes are made in `testing` and must pass GitHub CI before selective
  promotion. Never merge the diverged branches wholesale.

## Blocking requirements for vendor-distributable Android APK
1. Set the permanent Android signing secrets under GitHub Actions:
   `CWD_PARTNER_KEYSTORE_B64` and `CWD_PARTNER_KEYSTORE_PASSWORD`.
   The owner's PRIVATE signing kit must remain off the repository. The alias
   is `cwd-partner` and release application ID is
   `com.carwithdriverindia.partner`.
2. `.github/workflows/cwd-partner-signed-release.yml` publishes an Android
   release artifact and owner-review GitHub Release only if signing secrets
   exist. A successful *signing-check* workflow with `signed-apk: skipped`
   is **not** a release.
3. Test the exact signed APK on a real Android phone with approved OTP,
   vehicle offers, allocation, Start/End odometer camera, logout, and payouts.
   Do not send vendors untested or debug-signed APKs.
4. Android foreground 60-second polling + notification tone is currently
   implemented. **True background FCM push notifications are not implemented**;
   those require an owner-controlled Firebase project, Android app registration,
   FCM service authorization, and an end-to-end delivery test.
5. Avoid changes to the customer's OTP widget, pricing, payment process or
   production data during APK packaging.

## Exact deliverable
`CWD-Partner.apk`, final package ID
`com.carwithdriverindia.partner`, signed using a stable owner-controlled
keystore with consistent certificate for Android update continuity.

Provider authentication secrets remain only in Vercel; no OTP tokens or
private keystore bytes belong in Flutter, the repository or customer messages.
