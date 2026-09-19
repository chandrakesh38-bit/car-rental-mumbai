# Mobile OTP — testing branch

Booking (With Driver and Self Drive) and Become a Partner share `assets/js/mobile-otp.js`. It lazy-loads the MSG91 Web SDK with `exposeMethods: true`, reads OTP length and resend timing from the widget, and sends its access token to `/api/mobile-otp` for server verification. The two existing submission APIs require a server-signed proof tied to the verified Indian mobile number, form purpose and site origin. Proofs expire after ten minutes and remain in browser memory only. Changing the mobile or resetting the form clears verification. This is a short-lived phone-verification receipt, not an account login or a one-time booking identifier; existing submission/idempotency behavior is retained.

## Configuration

The three already configured Vercel Preview variables are used: `NEXT_PUBLIC_MSG91_WIDGET_ID`, `NEXT_PUBLIC_MSG91_WIDGET_TOKEN`, and server-only `MSG91_AUTH_KEY`. No new environment variables or database migration are required. The static site reads only the two public values through a no-store configuration endpoint. The auth key is never returned to the browser or written into generated pages.

Keep these variables scoped to testing. Ensure the MSG91 widget permits the testing preview domain, has Web integration enabled (not mobile-only), and has an active India mobile OTP channel/template and sufficient sending balance. The custom UI supports widget OTP lengths from four through eight digits and renders a shared captcha container when needed. Use an actual phone on the testing deployment to verify delivery and provider account configuration; automated tests mock MSG91 and do not send SMS.

## Checks

Run `node scripts/test-mobile-otp.mjs`, `node scripts/test-mobile-otp-browser.mjs`, notification server/browser tests and Self Drive document tests. Browser tests use Playwright (`PLAYWRIGHT_MODULE` if not installed locally) and Edge. The Self Drive transaction suite uses `PGLITE_MODULE`. Run `node scripts/build.mjs`; retain existing handwritten page customizations when reviewing generated differences.

Provider references: [MSG91 custom UI integration](https://msg91.com/help/sendotp/how-to-integrate-the-new-login-with-otp-widget), [OTP Widget API overview](https://docs.msg91.com/otp-widget). The server calls `https://control.msg91.com/api/v5/widget/verifyAccessToken` with JSON `authkey` and `access-token`, checks provider success and matches its returned mobile identity before issuing the receipt. Failure, timeout, mismatched identity or absent configuration fail closed before uploads, database writes and notification emails.
