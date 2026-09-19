# Self Drive document verification — testing only

## Setup required before using the testing preview

1. Apply `supabase/migrations/20260919_self_drive_documents.sql` in the Supabase project used by the testing preview. This creates only the two Self Drive tables, a private `self-drive-documents` bucket, and a restrictive policy scoped to that bucket. It does not modify partner storage or existing table policies.
2. Add `SELF_DRIVE_TOKEN_SECRET` to Vercel **Preview**, scoped to `testing`: use a cryptographically random secret of at least 32 characters. Do not put the value in the repository or frontend. Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` are reused server-side. Redeploy `testing` only after setup.
3. Do not enable public access or client policies for either new table or the new bucket. The server uses the existing service-role key. Browser uploads use a signed, single-document upload URL and do not receive a service-role key or any read/download URL.

No Supabase management connection is available in this workspace. The migration is supplied but has not been applied remotely. Actual Supabase bucket/RLS behavior and live Resend delivery must be verified on the configured testing preview; automated tests use mocks.

## Flow and security

- Existing Self Drive booking generation and validation are retained. The booking endpoint creates a `self_drive_verifications` row before sending the existing admin/customer notifications. With Driver bypasses this flow completely.
- The browser creates a 256-bit random submission nonce. The server derives an HMAC token using the server-only secret, stores only its SHA-256 hash, and returns a booking-specific upload link. Retrying the same submission preserves its token; other requests cannot retrieve it with a Booking ID. Booking reference collisions return an error instead of replacing the existing request.
- Links expire after seven days. The secret link's token is in the URL fragment (not query parameters), with no-referrer/noindex and no third-party scripts on the upload page. Do not share these bearer links. Tokens are used only in the API Authorization header; never log or email document URLs.
- Required files: Aadhaar, Driving Licence front, Driving Licence back, PAN, current address proof. Alternate mobile number is required on final submit.
- Selecting files only creates local previews. Small images (up to 1 MB) and PDFs are unchanged. Larger images are reduced to at most 2400 pixels on the longest edge at JPEG quality 0.9 only if this saves space; the user should inspect readability before submitting. Final file limit is 5 MiB (5 MB displayed). Very large source images over 30 MiB are rejected to bound browser memory use.
- Uploads start only on Submit Documents, one file at a time. Storage paths are `self-drive-documents/<BOOKING_ID>/<document-kind>`. Signed upload URLs allow no overwrite and expire after Supabase's two-hour window. Expired booking tokens cannot request more URLs or finalize. A URL issued before expiry may finish its bounded upload; it grants no read access.
- Both the browser and server check allowed types and size. The server reads the private uploaded object and checks MIME type, size and file signature before registering it. Invalid objects are deleted. This is format validation, not identity verification or malware scanning.
- Verified file receipts are stored in `self_drive_document_files`. A retry checks for an existing receipt/object before issuing a new upload URL, including when a successful upload response was lost. Successful files are not uploaded again. Refresh restores uploaded-file status; unuploaded local files must be selected again.
- Final submission requires all five validated receipts and alternate mobile number. It writes only `pending_verification` and `submitted_at`; it never confirms a booking. Completed documents cannot be replaced through the upload link.
- Manual review uses authorized Supabase access to the private bucket and the corresponding booking row. This change does not add an admin review UI or automatic approval. Apply your document-retention process using authorized server/dashboard access.

## Tests

- `node scripts/test-self-drive-documents.mjs`: mocked Supabase and Resend; token/expiry/isolation, With Driver skip, secure email link, missing/oversize/unsupported/spoofed files, alternate phone, recover/retry/no-overwrite, manual-only status, database and email failures.
- `node scripts/test-self-drive-documents-browser.mjs`: mobile page, JPG/PNG and PDF previews, compression, small/PDF preservation, selection without upload, change/remove, missing docs, failed-file retry, resume, invalid link, success copy.
- `node scripts/test-notifications.mjs` and `node scripts/test-notifications-browser.mjs`: existing booking and partner regressions, including Self Drive-only popup/link and no docs for With Driver.
- Browser tests require Playwright and Edge; optionally set `PLAYWRIGHT_MODULE` and `BROWSER_CHANNEL`.
- `node scripts/build.mjs`: existing static-site build. The dedicated upload page is static and stays outside public navigation. Preserve the pre-existing handwritten differences in `index.html` and `with-driver.html` when reviewing build output.

## Live testing checklist (testing preview only)

Submit a Self Drive enquiry with an inbox you control. Confirm a persisted verification record, the existing admin email, one customer acknowledgement with Upload Documents, and the same Booking ID in popup/email/page. Open the link on mobile and desktop. Verify no upload request occurs when selecting files. Upload all five test documents and an alternate number, and verify private storage objects plus `pending_verification` in Supabase. Check an anonymous object request fails, an ID-only/wrong-token/cross-booking/expired-token API call fails, files over 5 MB and unsupported content are rejected, and a network interruption allows retry without duplicating successful files. Submit With Driver and partner forms and verify their existing behavior; neither should show Self Drive document UI. No real customer documents are needed for testing.
