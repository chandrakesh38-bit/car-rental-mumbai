# CWD Partner OTP integration — vendor-only Widget

## Current blocker, 9 October 2026
- The deployed `/api/vendor-app-auth` endpoint accepts approved-vendor requests but MSG91 `POST /api/v5/widget/sendOtp` responds with **HTTP 200**, `type: error`, provider `code: 401` (authentication rejected).
- The existing customer website uses the same MSG91 Widget through the **Web SDK**, including web CAPTCHA.
- MSG91's [OTP Widget REST API docs](https://docs.msg91.com/otp-widget) state that REST calls **do not support CAPTCHA**. This is one plausible cause, **not proof** of the precise provider configuration.

## Dedicated widget (preserve customer booking OTP)
Create a separate MSG91 OTP Widget called `CWD Partner - Android` **under the same MSG91 account** as the existing `MSG91_AUTH_KEY`.
- Verification: mobile number, SMS channel active and available in India
- **OTP length: 4** (the current Flutter screen expects four digits)
- **CAPTCHA validation: off on this vendor-only widget** (not on the existing website widget)
- **Mobile Integration: off** for REST API server integration. Native SDK requires a different integration and settings.
- No demo credentials in production.
- Confirm template/balance or OTP Widget subscription, and domain/country restrictions.
- Keep provider-side rate limits and existing CWD server limits; do not bypass OTP.

In the Vercel project `car-rental-mumbai`, add **Production-only**:
`CWD_VENDOR_APP_MSG91_WIDGET_ID=<the new 24+ character widget ID>`.
Do **not** edit `NEXT_PUBLIC_MSG91_WIDGET_ID` or `NEXT_PUBLIC_MSG91_WIDGET_TOKEN`: those belong to the customer website.
Do not paste MSG91 auth keys or access tokens into chat or GitHub.

After saving the Vercel env, **redeploy production** so the environment variable becomes active. The CWD Partner auth server will prefer the dedicated widget ID, while the website retains its original widget.

## Verify
1. Unregistered mobile gets Register Now (404); rejected/pending gets account status (403), without contacting MSG91.
2. Send OTP to an owner-authorized **approved** vendor mobile. Provider must return a request ID instead of `error 401`.
3. Enter the correct OTP only inside the app. Server verifies the exact request ID and MSG91 access-token proof before issuing the vendor session.
4. Test wrong/expired OTP, resend, vendor-specific bookings, and logout.
5. If code 401 persists: inspect the new Widget's `OTP Widget / Logs`, widget subscription, server-side integration configuration, and the authkey account. Do not silently switch to weaker authentication.
