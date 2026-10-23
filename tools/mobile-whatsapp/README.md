# CWD Android WhatsApp worker

Scope: new customer-checkout `booking_confirmed` and `payment_captured` events.
Payment-pending bookings do not generate a confirmation. Legacy/admin payment
paths that do not emit these events are not covered.

Operational extension: apply `supabase/drafts/mobile_whatsapp_events.sql` after
the base migration. Selected active vendors receive offers; allocation supplies
customer contact/address and the private trip link. Complete driver details saved
on an active allocation notify the customer, including subsequent corrections.
Trip start and closure submission notify customers. Admin review alone does not
send a final bill: generating an invoice after approval sends its snapshot and
private download link. Invoice regenerations replace unsent outdated links.
Vendor payout/margin is never included in customer messages; customer contact
details are withheld from offers. Booking confirmation does not broadcast to
vendors: the admin must select vendors and generate offers first.

No automatic trip reminder, refund, cancellation-to-customer, vendor payout
receipt, or final PDF attachment is configured. Invoice is a view/download link.
The approved invoice snapshot supplies the financial breakdown, not fresh
calculations in this worker. Balance is explicitly labelled at invoice issue.
All notifications are for future events only. Test SQL fixtures are rolled back.
Manual phone startup after reboot is the owner's chosen operating procedure.

Format/feedback extension: `supabase/drafts/whatsapp_formats_feedback.sql` adds
personalized confirmation, driver/odometer terms, allocated-vendor instructions,
and final settlement messages. Pickup dates use IST. Driver details are still
sent when saved, not by a timer: operations must assign in time to meet the
at-least-two-hours-before-pickup promise. Short-notice bookings have explicit copy.
Checkout booking_data supplies precise itinerary/address details when available.

After an ended/approved trip has a matching final invoice and its full fare is
recorded paid in inquiries, one feedback invitation is queued. This covers both
online payment reconciliation and admin-recorded final payments, and prepaid
trips when their final invoice is issued. Historical bookings are not backfilled.
The 90-day capability token is hashed in the database; its raw value appears only
in the outgoing private link's URL fragment. The public page sends it in a header
to a server-side API; no service key is exposed. One submitted rating/comment per
booking is accepted, and retry submissions return success without overwriting.
Admin Trip Feedback lists submitted responses using existing admin authentication.
The supplied Google review link is visible to everyone regardless of rating.
No automatic Google posting, incentive, or positive-rating gate is implemented.

Apply `supabase/drafts/mobile_whatsapp.sql` once. The system starts disabled.
Install worker.mjs and install.sh into the already-paired private Termux directory
`~/cwd-whatsapp`, then run `bash install.sh`. It prints a SHA-256 activation hash;
the raw random token stays in `worker-config.json`. Never publish that file or auth/.
Register that hash in cwd_private.wa_device with enabled=true and activated_at=now()
only when the phone is ready. There is no historical backfill.

Start using `nohup bash ~/cwd-whatsapp/run-worker.sh >/dev/null 2>&1 &`.
The flock lock prevents two supervisors. Stop old pair/test scripts first.
Install GitHub-signed Termux:Boot to match GitHub-signed Termux, open it once,
allow background/autostart for both apps, and reboot/unlock to verify. Android
vendor restrictions and network outages can still interrupt service. Screen-lock
testing of the earlier standalone script does not prove this worker's boot flow.

The worker polls every 30 seconds, one job per poll. It never needs a service-role
key or inbound port. The public RPC is intentionally SECURITY DEFINER with a
256-bit bearer capability check; only the queue is exposed. Tables live in a
private schema, with RLS and no client grants. Security-advisor executable-function
warnings are expected for this deliberate capability-authenticated boundary.

Before sending, the server moves a leased job to dispatching and the phone saves
a local journal. Ambiguous sends are not automatically retried: dispatching or
uncertain jobs require review to avoid duplicate customer messages. This favors
no duplicate sends over guaranteed automatic recovery of every interrupted send.
Accepted is not delivered; only WhatsApp receipt events advance delivered state.
Review counts with `select status,count(*) from cwd_private.wa_jobs group by status`.
Check `cwd_private.wa_device.last_seen` for worker activity. Disable the device to
revoke its capability; rotate with a newly generated phone token and hash.

Phone off overnight means pending notifications wait until it returns. Worker
does not suppress notifications at night when the phone is online. Never clear
the journal to retry a send blindly. Do not run the test send scripts repeatedly.

Verification: `node scripts/test-mobile-whatsapp.mjs` uses mocked network/WhatsApp
and checks send once, delivered acknowledgement, ambiguous send and restart
recovery without resending. Database transaction tests are rolled back.
