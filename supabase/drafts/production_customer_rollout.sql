-- Approved production rollout. Additive customer platform; preserve existing bookings, payments and vendor data.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Source: supabase/migrations/20261019043000_customer_accounts.sql


create table public.cwd_customers (
  id uuid primary key default gen_random_uuid(),
  mobile text not null unique check (mobile ~ '^91[6-9][0-9]{9}$'),
  display_name text not null default '' check (length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cwd_customer_sessions (
  session_hash text primary key check (session_hash ~ '^[a-f0-9]{64}$'),
  customer_id uuid not null references public.cwd_customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index cwd_customer_sessions_customer_idx on public.cwd_customer_sessions(customer_id);
create index cwd_customer_sessions_expiry_idx on public.cwd_customer_sessions(expires_at);
create table public.cwd_customer_login_uses (
  nonce text primary key,
  used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.cwd_customers enable row level security;
alter table public.cwd_customer_sessions enable row level security;
alter table public.cwd_customer_login_uses enable row level security;
revoke all on public.cwd_customers, public.cwd_customer_sessions, public.cwd_customer_login_uses from public, anon, authenticated;
grant select, insert, update, delete on public.cwd_customers, public.cwd_customer_sessions, public.cwd_customer_login_uses to service_role;

create function public.cwd_customer_login(
  p_nonce text, p_mobile text, p_proof_expires timestamptz,
  p_session_hash text, p_session_expires timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare account public.cwd_customers;
begin
  if p_nonce is null or length(p_nonce) < 20 or length(p_nonce) > 100 or
     p_mobile is null or p_mobile !~ '^91[6-9][0-9]{9}$' or
     p_proof_expires is null or p_proof_expires <= now() or p_proof_expires > now() + interval '11 minutes' or
     p_session_expires is null or p_session_expires <= now() or p_session_expires > now() + interval '7 days 1 minute' then
    raise exception 'Invalid login parameters' using errcode = '22023';
  end if;
  -- A unique nonce serializes concurrent replay; any later failure rolls back all writes.
  insert into public.cwd_customer_login_uses(nonce, expires_at) values(p_nonce, p_proof_expires);
  insert into public.cwd_customers(mobile) values(p_mobile)
    on conflict(mobile) do update set mobile = excluded.mobile returning * into account;
  insert into public.cwd_customer_sessions(session_hash, customer_id, expires_at)
    values(p_session_hash, account.id, p_session_expires);
  return jsonb_build_object('id',account.id,'mobile',account.mobile,
    'display_name',account.display_name,'created_at',account.created_at);
end;
$$;
revoke all on function public.cwd_customer_login(text,text,timestamptz,text,timestamptz) from public, anon, authenticated;
grant execute on function public.cwd_customer_login(text,text,timestamptz,text,timestamptz) to service_role;


-- Source: supabase/drafts/customer_checkout.sql

create unique index if not exists cwd_inquiries_booking_id_uq on public.inquiries(booking_id) where booking_id is not null;
create table public.cwd_checkout_bookings (
 booking_id text primary key,
 submission_key uuid not null unique,
 otp_nonce text not null unique,
 mobile text not null check(mobile ~ '^91[6-9][0-9]{9}$'),
 access_hash text not null check(access_hash ~ '^[a-f0-9]{64}$'),
 payment_choice integer not null check(payment_choice in (0,20,100)),
 total_paise bigint not null check(total_paise > 0 and total_paise <= 100000000),
 booking_data jsonb not null,
 created_at timestamptz not null default now()
);
create index cwd_checkout_mobile_idx on public.cwd_checkout_bookings(mobile,created_at desc);
create table public.cwd_checkout_orders (
 id uuid primary key default gen_random_uuid(),
 booking_id text not null references public.cwd_checkout_bookings(booking_id),
 amount_paise bigint not null check(amount_paise > 0),
 payment_type text not null check(payment_type in ('advance','full','balance')),
 razorpay_order_id text unique,
 razorpay_payment_id text unique,
 state text not null default 'creating' check(state in ('creating','pending','paid','failed')),
 created_at timestamptz not null default now()
);
create unique index cwd_checkout_one_open_order on public.cwd_checkout_orders(booking_id) where state in ('creating','pending');
create table public.cwd_booking_events (
 id uuid primary key default gen_random_uuid(), booking_id text not null references public.cwd_checkout_bookings(booking_id),
 event_key text not null unique, event_type text not null, payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.cwd_notification_outbox (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.cwd_booking_events(id),
 channel text not null check(channel in ('email','sms','whatsapp')), status text not null default 'pending',
 attempts integer not null default 0, last_error text, accepted_at timestamptz, delivered_at timestamptz, claimed_at timestamptz,
 unique(event_id,channel)
);
alter table public.cwd_checkout_bookings enable row level security;
alter table public.cwd_checkout_orders enable row level security;
alter table public.cwd_booking_events enable row level security;
alter table public.cwd_notification_outbox enable row level security;
revoke all on public.cwd_checkout_bookings,public.cwd_checkout_orders,public.cwd_booking_events,public.cwd_notification_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.cwd_checkout_bookings,public.cwd_checkout_orders,public.cwd_booking_events,public.cwd_notification_outbox to service_role;

create function public.cwd_checkout_create(p_nonce text,p_mobile text,p_proof_expires timestamptz,p_submission uuid,
 p_access_hash text,p_choice integer,p_total bigint,p_data jsonb,p_contact jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.cwd_checkout_bookings; reference text; event_id uuid; attempts integer:=0;
begin
 if p_proof_expires is null or p_proof_expires<=now() or p_proof_expires>now()+interval '11 minutes' or
    p_nonce is null or length(p_nonce)<20 or p_choice not in (0,20,100) then raise exception 'Invalid checkout proof'; end if;
 -- Serializes simultaneous retries and ID generation, including unique OTP use.
 perform pg_catalog.pg_advisory_xact_lock(7420161901);
 select * into existing from public.cwd_checkout_bookings where submission_key=p_submission;
 if found then
  if existing.mobile<>p_mobile or existing.access_hash<>p_access_hash or existing.otp_nonce<>p_nonce then raise exception 'Submission collision'; end if;
  return jsonb_build_object('booking_id',existing.booking_id);
 end if;
 insert into public.otp_proof_uses(nonce,purpose,mobile,expires_at) values(p_nonce,'booking',p_mobile,p_proof_expires);
 loop
  reference:='CWD-WD-'||to_char(now() at time zone 'Asia/Kolkata','YYMMDD')||'-'||(1000+floor(random()*9000))::integer::text;
  exit when not exists(select 1 from public.inquiries where booking_id=reference);
  attempts:=attempts+1; if attempts>100 then raise exception 'Booking IDs busy; retry'; end if;
 end loop;
 insert into public.cwd_checkout_bookings(booking_id,submission_key,otp_nonce,mobile,access_hash,payment_choice,total_paise,booking_data)
 values(reference,p_submission,p_nonce,p_mobile,p_access_hash,p_choice,p_total,p_data);
 insert into public.inquiries(booking_id,customer_name,customer_phone,customer_email,service_type,trip_type,car_name,route,
  booking_details,fare_amount,total_fare,paid_amount,payment_status,booking_status,inquiry_status)
 values(reference,p_contact->>'name',p_mobile,p_contact->>'email','With Driver',p_contact->>'trip',p_contact->>'car',p_contact->>'route',
  'Customer checkout'||E'\nPickup: '||(p_data->>'pickupAt')||E'\nAddress: '||(p_data->>'customerAddress')||E'\n'||p_data::text,
  p_total/100.0,p_total/100.0,0,'pending',case when p_choice=0 then 'confirmed' else 'received' end,
  case when p_choice=0 then 'Confirmed' else 'Received' end);
 insert into public.cwd_booking_events(booking_id,event_key,event_type,payload)
 values(reference,'created:'||reference,case when p_choice=0 then 'booking_confirmed' else 'payment_pending' end,
  jsonb_build_object('email',p_contact->>'email','mobile',p_mobile,'total_paise',p_total)) returning id into event_id;
 insert into public.cwd_notification_outbox(event_id,channel) select event_id,x from unnest(array['email','sms','whatsapp']) x;
 return jsonb_build_object('booking_id',reference);
end $$;

create function public.cwd_checkout_reserve_order(p_booking text,p_balance boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.cwd_checkout_bookings; o public.cwd_checkout_orders; paid numeric; total numeric; amount bigint; status text;
begin
 select * into strict b from public.cwd_checkout_bookings where booking_id=p_booking for update;
 select paid_amount,total_fare,booking_status into paid,total,status from public.inquiries where booking_id=p_booking for update;
 if status in ('cancelled','completed') then raise exception 'Booking does not accept payment'; end if;
 select * into o from public.cwd_checkout_orders where booking_id=p_booking and state in ('creating','pending');
 if found then return to_jsonb(o)||jsonb_build_object('new_order',false); end if;
 amount:=case when p_balance then round((total-coalesce(paid,0))*100) else least(round((total-coalesce(paid,0))*100),round(total*100*b.payment_choice/100.0)) end;
 if amount is null or amount<=0 then raise exception 'No payment due'; end if;
 insert into public.cwd_checkout_orders(booking_id,amount_paise,payment_type)
 values(p_booking,amount,case when p_balance then 'balance' when b.payment_choice=20 then 'advance' else 'full' end) returning * into o;
 return to_jsonb(o)||jsonb_build_object('new_order',true);
end $$;
create function public.cwd_checkout_attach_order(p_id uuid,p_order text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_order !~ '^order_[A-Za-z0-9]+$' then raise exception 'Invalid order'; end if;
 update public.cwd_checkout_orders set razorpay_order_id=p_order,state='pending' where id=p_id and state='creating' and razorpay_order_id is null;
 if not found then raise exception 'Order reservation changed'; end if;
end $$;
create function public.cwd_checkout_capture(p_order text,p_payment text,p_amount bigint,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.cwd_checkout_orders; paid numeric; total numeric; event_id uuid; status text;
begin
 select * into strict o from public.cwd_checkout_orders where razorpay_order_id=p_order for update;
 perform 1 from public.cwd_checkout_bookings where booking_id=o.booking_id for update;
 if p_currency<>'INR' or p_amount<>o.amount_paise or p_payment !~ '^pay_[A-Za-z0-9]+$' then raise exception 'Payment mismatch'; end if;
 if o.state='paid' then
  if o.razorpay_payment_id<>p_payment then raise exception 'Unexpected second payment'; end if;
  return jsonb_build_object('duplicate',true);
 end if;
 select total_fare,booking_status into total,status from public.inquiries where booking_id=o.booking_id for update;
 -- Late captures are recorded accurately but never resurrect cancelled/completed trips.
 insert into public.booking_payments(booking_id,payment_type,amount,status,razorpay_payment_id,paid_at)
 values(o.booking_id,o.payment_type,p_amount/100.0,'paid',p_payment,now());
 update public.cwd_checkout_orders set state='paid',razorpay_payment_id=p_payment where id=o.id;
 select coalesce(sum(p.amount),0) into paid from public.booking_payments p where p.booking_id=o.booking_id and p.status='paid';
 update public.inquiries set paid_amount=paid,payment_status=case when paid>=total then 'paid' else 'partially_paid' end,
 booking_status=case when status in ('cancelled','completed') then status else 'confirmed' end,
 inquiry_status=case when status in ('cancelled','completed') then inquiry_status else 'Confirmed' end,updated_at=now() where booking_id=o.booking_id;
 insert into public.cwd_booking_events(booking_id,event_key,event_type,payload)
 values(o.booking_id,'captured:'||p_payment,'payment_captured',jsonb_build_object('paid',paid,'remaining',greatest(0,total-paid))) returning id into event_id;
 insert into public.cwd_notification_outbox(event_id,channel) select event_id,x from unnest(array['email','sms','whatsapp']) x;
 return jsonb_build_object('paid',paid,'remaining',greatest(0,total-paid));
end $$;
create function public.cwd_notification_claim() returns setof public.cwd_notification_outbox
language plpgsql security invoker set search_path='' as $$
begin
 return query update public.cwd_notification_outbox o set status='processing',attempts=o.attempts+1,claimed_at=now()
 where o.id in (select q.id from public.cwd_notification_outbox q where q.attempts<5 and
 (q.status in ('pending','failed') or (q.status='processing' and q.claimed_at<now()-interval '10 minutes'))
 order by q.id limit 20 for update skip locked) returning o.*;
end $$;
revoke all on function public.cwd_notification_claim() from public,anon,authenticated;
grant execute on function public.cwd_notification_claim() to service_role;
revoke all on function public.cwd_checkout_create(text,text,timestamptz,uuid,text,integer,bigint,jsonb,jsonb),
 public.cwd_checkout_reserve_order(text,boolean),public.cwd_checkout_attach_order(uuid,text),public.cwd_checkout_capture(text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.cwd_checkout_create(text,text,timestamptz,uuid,text,integer,bigint,jsonb,jsonb),
 public.cwd_checkout_reserve_order(text,boolean),public.cwd_checkout_attach_order(uuid,text),public.cwd_checkout_capture(text,text,bigint,text) to service_role;


-- Source: supabase/drafts/login_coupon.sql

create table public.cwd_login_coupon_uses (
 id uuid primary key default gen_random_uuid(),
 code text not null check(code='CWDLOGIN10'),
 customer_id uuid not null references public.cwd_customers(id),
 mobile text not null check(mobile ~ '^91[6-9][0-9]{9}$'),
 booking_id text not null unique references public.cwd_checkout_bookings(booking_id),
 gross_paise bigint not null check(gross_paise>0),
 eligible_paise bigint not null check(eligible_paise>0 and eligible_paise<=gross_paise),
 discount_paise bigint not null check(discount_paise=least(50000,round(eligible_paise/10.0)::bigint)),
 status text not null check(status in ('reserved','redeemed','released')),
 created_at timestamptz not null default now(),
 redeemed_at timestamptz,
 released_at timestamptz
);
create unique index cwd_login_coupon_one_mobile on public.cwd_login_coupon_uses(mobile) where status in ('reserved','redeemed');
create index cwd_login_coupon_customer on public.cwd_login_coupon_uses(customer_id);
create table public.cwd_login_coupon_redemptions (
 id uuid primary key default gen_random_uuid(),
 use_id uuid not null unique references public.cwd_login_coupon_uses(id),
 customer_id uuid not null references public.cwd_customers(id),
 mobile text not null unique,
 booking_id text not null unique references public.cwd_checkout_bookings(booking_id),
 code text not null check(code='CWDLOGIN10'),
 eligible_paise bigint not null,
 discount_paise bigint not null,
 redeemed_at timestamptz not null default now()
);
create index cwd_login_redemption_customer on public.cwd_login_coupon_redemptions(customer_id);
alter table public.cwd_login_coupon_uses enable row level security;
alter table public.cwd_login_coupon_redemptions enable row level security;
revoke all on public.cwd_login_coupon_uses,public.cwd_login_coupon_redemptions from public,anon,authenticated,service_role;
grant select,insert,update on public.cwd_login_coupon_uses to service_role;
grant select,insert on public.cwd_login_coupon_redemptions to service_role;

create function public.cwd_coupon_sync_confirmation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare u public.cwd_login_coupon_uses;
begin
 if new.booking_status='confirmed' then
  if exists(select 1 from public.cwd_login_coupon_uses where booking_id=new.booking_id and status='released') then
   raise exception 'CWD_COUPON_USED' using errcode='PT409';
  end if;
  update public.cwd_login_coupon_uses set status='redeemed',redeemed_at=now()
   where booking_id=new.booking_id and status='reserved' returning * into u;
  if found then
   insert into public.cwd_login_coupon_redemptions(use_id,customer_id,mobile,booking_id,code,eligible_paise,discount_paise)
    values(u.id,u.customer_id,u.mobile,u.booking_id,u.code,u.eligible_paise,u.discount_paise);
  end if;
 elsif new.booking_status='cancelled' then
  update public.cwd_login_coupon_uses set status='released',released_at=now()
   where booking_id=new.booking_id and status='reserved';
 end if;
 return new;
end $$;
create trigger cwd_coupon_confirmation after update of booking_status on public.inquiries
for each row when (new.booking_id ~ '^[1-9][0-9]{5}$') execute function public.cwd_coupon_sync_confirmation();

create function public.cwd_checkout_create_coupon(p_nonce text,p_mobile text,p_proof_expires timestamptz,p_submission uuid,
 p_access_hash text,p_choice integer,p_total bigint,p_data jsonb,p_contact jsonb,p_session_hash text,p_code text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.cwd_customers; existing public.cwd_checkout_bookings; result jsonb;
 discount bigint; net bigint; u public.cwd_login_coupon_uses; confirmed boolean;
begin
 if p_code is distinct from 'CWDLOGIN10' then raise exception 'CWD_COUPON_INVALID' using errcode='PT409'; end if;
 -- Same lock as existing creation: duplicate submission, OTP use, booking and
 -- coupon reservation/consumption commit together or roll back together.
 perform pg_catalog.pg_advisory_xact_lock(7420161901);
 select c0.* into c from public.cwd_customer_sessions s join public.cwd_customers c0 on c0.id=s.customer_id
  where s.session_hash=p_session_hash and s.revoked_at is null and s.expires_at>clock_timestamp() and c0.mobile=p_mobile
  for share of s,c0;
 if not found then raise exception 'CWD_COUPON_IDENTITY' using errcode='PT409'; end if;
 select * into existing from public.cwd_checkout_bookings where submission_key=p_submission;
 if found then
  if existing.mobile<>p_mobile or existing.access_hash<>p_access_hash or existing.otp_nonce<>p_nonce then raise exception 'Submission collision'; end if;
  return jsonb_build_object('booking_id',existing.booking_id);
 end if;
 if exists(select 1 from public.cwd_login_coupon_uses where mobile=p_mobile and status in ('reserved','redeemed'))
  or exists(select 1 from public.cwd_login_coupon_redemptions where mobile=p_mobile) then
  raise exception 'CWD_COUPON_USED' using errcode='PT409';
 end if;
 if p_total is null or p_total<=0 or p_total>100000000 then raise exception 'Invalid coupon fare'; end if;
 -- p_total is the server-validated with-driver fare, with no deposits or
 -- unpriced toll/parking actuals. Client discount amounts are never accepted.
 discount:=least(50000,round(p_total/10.0)::bigint); net:=p_total-discount;
 result:=public.cwd_checkout_create(p_nonce,p_mobile,p_proof_expires,p_submission,p_access_hash,p_choice,net,
  (p_data-'loginCoupon'-'couponCode')||jsonb_build_object('totalFare',net/100.0,'loginCoupon',
   jsonb_build_object('code',p_code,'grossPaise',p_total,'eligiblePaise',p_total,'discountPaise',discount,'totalPaise',net)),p_contact);
 select booking_status='confirmed' into confirmed from public.inquiries where booking_id=result->>'booking_id';
 insert into public.cwd_login_coupon_uses(code,customer_id,mobile,booking_id,gross_paise,eligible_paise,discount_paise,status,redeemed_at)
 values(p_code,c.id,c.mobile,result->>'booking_id',p_total,p_total,discount,case when confirmed then 'redeemed' else 'reserved' end,
  case when confirmed then now() end) returning * into u;
 if confirmed then
  insert into public.cwd_login_coupon_redemptions(use_id,customer_id,mobile,booking_id,code,eligible_paise,discount_paise)
   values(u.id,c.id,c.mobile,u.booking_id,p_code,p_total,discount);
 end if;
 return result;
end $$;

create function public.cwd_checkout_cancel_pending(p_booking text) returns void
language plpgsql security invoker set search_path='' as $$
declare status text; paid numeric;
begin
 perform 1 from public.cwd_checkout_bookings where booking_id=p_booking for update;
 select booking_status,coalesce(paid_amount,0) into strict status,paid from public.inquiries where booking_id=p_booking for update;
 if status='cancelled' then return; end if;
 if status<>'received' or paid>0 then raise exception 'CWD_CANCEL_CONFIRMED' using errcode='PT409'; end if;
 update public.inquiries set booking_status='cancelled',inquiry_status='Cancelled',updated_at=now() where booking_id=p_booking;
 insert into public.cwd_booking_events(booking_id,event_key,event_type)
 values(p_booking,'cancelled:'||p_booking,'booking_cancelled') on conflict(event_key) do nothing;
end $$;
revoke all on function public.cwd_coupon_sync_confirmation(),public.cwd_checkout_cancel_pending(text),
 public.cwd_checkout_create_coupon(text,text,timestamptz,uuid,text,integer,bigint,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.cwd_coupon_sync_confirmation(),public.cwd_checkout_cancel_pending(text),
 public.cwd_checkout_create_coupon(text,text,timestamptz,uuid,text,integer,bigint,jsonb,jsonb,text,text) to service_role;


-- Source: supabase/drafts/six_digit_booking_references.sql

create table public.cwd_booking_references (
 booking_id text primary key check(booking_id ~ '^[1-9][0-9]{5}$'),
 request_key text not null unique,
 created_at timestamptz not null default now()
);
alter table public.cwd_booking_references enable row level security;
revoke all on public.cwd_booking_references from public,anon,authenticated;
grant select,insert on public.cwd_booking_references to service_role;
create function public.cwd_reserve_booking_reference(p_key text) returns text
language plpgsql security invoker set search_path='' as $$
declare reference text; attempts integer:=0;
begin
 if p_key is null or length(p_key)<20 or length(p_key)>200 then raise exception 'Invalid reference request'; end if;
 -- Shared by every booking entry point. Reservations survive incomplete enquiries
 -- and are never recycled into a different customer's booking.
 perform pg_catalog.pg_advisory_xact_lock(7420161902);
 select booking_id into reference from public.cwd_booking_references where request_key=p_key;
 if found then return reference; end if;
 loop
  reference:=(100000+floor(random()*900000))::integer::text;
  exit when not exists(select 1 from public.cwd_booking_references where booking_id=reference)
    and not exists(select 1 from public.inquiries where booking_id=reference);
  attempts:=attempts+1;
  if attempts>1000 then raise exception 'Booking references busy; please contact support'; end if;
 end loop;
 insert into public.cwd_booking_references(booking_id,request_key) values(reference,p_key);
 return reference;
end $$;
revoke all on function public.cwd_reserve_booking_reference(text) from public,anon,authenticated;
grant execute on function public.cwd_reserve_booking_reference(text) to service_role;
do $$
declare definition text; old_block text;
begin
 select pg_get_functiondef('public.cwd_checkout_create(text,text,timestamptz,uuid,text,integer,bigint,jsonb,jsonb)'::regprocedure) into definition;
 old_block:=substring(definition from ' loop\s+reference:=[\s\S]*?end loop;');
 if old_block is null then raise exception 'Unexpected checkout definition; review before migrating'; end if;
 definition:=replace(definition,old_block,E' reference:=public.cwd_reserve_booking_reference(''checkout:''||p_submission::text);');
 -- Booking OTP is verified by the API. Keep its account/session creation atomic
 -- with the booking; never accept these contact fields directly from a browser.
 definition:=replace(definition,' insert into public.cwd_booking_events', $session$
 if p_contact->>'sessionHash' is not null then
  insert into public.cwd_customers(mobile) values(p_mobile) on conflict(mobile) do nothing;
  insert into public.cwd_customer_sessions(session_hash,customer_id,expires_at)
   select p_contact->>'sessionHash',id,now()+interval '7 days' from public.cwd_customers where mobile=p_mobile;
 end if;
 insert into public.cwd_booking_events$session$);
 execute definition;
end $$;
do $$ begin
 if to_regclass('public.self_drive_verifications') is not null then
  alter table public.self_drive_verifications drop constraint if exists self_drive_verifications_booking_id_check;
  alter table public.self_drive_verifications add constraint self_drive_verifications_booking_id_check
   check(booking_id ~ '^([1-9][0-9]{5}|CWD-WD-[0-9]{6}-[0-9]{4})$');
 end if;
end $$;
notify pgrst,'reload schema';


-- Source: supabase/drafts/payment_order_recovery.sql

alter table public.cwd_checkout_orders add column provider_attempted_at timestamptz;
update public.cwd_checkout_orders set provider_attempted_at=created_at;
alter table public.cwd_checkout_orders alter column provider_attempted_at set default now();
create function public.cwd_checkout_claim_order_retry(p_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.cwd_checkout_orders set provider_attempted_at=now()
 where id=p_id and state='creating' and razorpay_order_id is null
 and provider_attempted_at<now()-interval '60 seconds';
 return found;
end $$;
revoke all on function public.cwd_checkout_claim_order_retry(uuid) from public,anon,authenticated;
grant execute on function public.cwd_checkout_claim_order_retry(uuid) to service_role;
notify pgrst,'reload schema';


-- Source: supabase/drafts/customer_login_alerts.sql

create table public.cwd_customer_login_alerts (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.cwd_customers(id),
 mobile text not null check(mobile ~ '^91[6-9][0-9]{9}$'),
 source text not null check(source in ('login','coupon')),
 created_at timestamptz not null default now(),
 email_status text not null default 'pending' check(email_status in ('pending','accepted','failed')),
 email_accepted_at timestamptz
);
create index cwd_customer_login_alerts_created_idx on public.cwd_customer_login_alerts(created_at desc);
alter table public.cwd_customer_login_alerts enable row level security;
revoke all on public.cwd_customer_login_alerts from public,anon,authenticated;
grant select,insert,update on public.cwd_customer_login_alerts to service_role;
create function public.cwd_customer_login_with_alert(p_nonce text,p_mobile text,p_proof_expires timestamptz,p_session_hash text,p_session_expires timestamptz,p_source text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare customer jsonb; alert_id uuid;
begin
 if p_source not in ('login','coupon') then raise exception 'Invalid login source'; end if;
 customer:=public.cwd_customer_login(p_nonce,p_mobile,p_proof_expires,p_session_hash,p_session_expires);
 insert into public.cwd_customer_login_alerts(customer_id,mobile,source)
 values((customer->>'id')::uuid,customer->>'mobile',p_source) returning id into alert_id;
 return jsonb_build_object('customer',customer,'alert_id',alert_id);
end $$;
revoke all on function public.cwd_customer_login_with_alert(text,text,timestamptz,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.cwd_customer_login_with_alert(text,text,timestamptz,text,timestamptz,text) to service_role;
notify pgrst,'reload schema';


-- Source: supabase/drafts/repeat_booking_coupon.sql

alter table public.cwd_login_coupon_uses drop constraint cwd_login_coupon_uses_code_check,
 drop constraint cwd_login_coupon_uses_check1,
 add constraint cwd_login_coupon_uses_code_check check(code in ('CWDLOGIN10','CWD5')),
 add constraint cwd_login_coupon_uses_check1 check(discount_paise=case when code='CWD5' then round(eligible_paise/20.0)::bigint else least(50000,round(eligible_paise/10.0)::bigint) end);
alter table public.cwd_login_coupon_redemptions drop constraint cwd_login_coupon_redemptions_code_check,
 drop constraint cwd_login_coupon_redemptions_mobile_key,
 add constraint cwd_login_coupon_redemptions_code_check check(code in ('CWDLOGIN10','CWD5'));
drop index public.cwd_login_coupon_one_mobile;
create unique index cwd_login_coupon_one_mobile on public.cwd_login_coupon_uses(mobile) where code='CWDLOGIN10' and status in ('reserved','redeemed');
create unique index cwd_login_coupon_redemptions_one_mobile on public.cwd_login_coupon_redemptions(mobile) where code='CWDLOGIN10';
create or replace function public.cwd_checkout_create_coupon(p_nonce text,p_mobile text,p_proof_expires timestamptz,p_submission uuid,
 p_access_hash text,p_choice integer,p_total bigint,p_data jsonb,p_contact jsonb,p_session_hash text,p_code text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.cwd_customers; existing public.cwd_checkout_bookings; result jsonb;
 discount bigint; net bigint; u public.cwd_login_coupon_uses; confirmed boolean;
begin
 if p_code is null or p_code not in ('CWDLOGIN10','CWD5') then raise exception 'CWD_COUPON_INVALID' using errcode='PT409'; end if;
 -- Same lock as existing creation: duplicate submission, OTP use, booking and
 -- coupon reservation/consumption commit together or roll back together.
 perform pg_catalog.pg_advisory_xact_lock(7420161901);
 select c0.* into c from public.cwd_customer_sessions s join public.cwd_customers c0 on c0.id=s.customer_id
  where s.session_hash=p_session_hash and s.revoked_at is null and s.expires_at>clock_timestamp() and c0.mobile=p_mobile
  for share of s,c0;
 if not found then raise exception 'CWD_COUPON_IDENTITY' using errcode='PT409'; end if;
 select * into existing from public.cwd_checkout_bookings where submission_key=p_submission;
 if found then
  if existing.mobile<>p_mobile or existing.access_hash<>p_access_hash or existing.otp_nonce<>p_nonce then raise exception 'Submission collision'; end if;
  return jsonb_build_object('booking_id',existing.booking_id);
 end if;
 if p_code='CWDLOGIN10' and (exists(select 1 from public.cwd_login_coupon_uses where mobile=p_mobile and code='CWDLOGIN10' and status in ('reserved','redeemed'))
  or exists(select 1 from public.cwd_login_coupon_redemptions where mobile=p_mobile and code='CWDLOGIN10')) then
  raise exception 'CWD_COUPON_USED' using errcode='PT409';
 end if;
 if p_code='CWD5' and not exists(select 1 from public.cwd_login_coupon_uses where mobile=p_mobile and code='CWDLOGIN10' and status in ('reserved','redeemed'))
  and not exists(select 1 from public.cwd_login_coupon_redemptions where mobile=p_mobile and code='CWDLOGIN10') then
  raise exception 'CWD_COUPON_FIRST' using errcode='PT409';
 end if;
 if p_total is null or p_total<=0 or p_total>100000000 then raise exception 'Invalid coupon fare'; end if;
 -- p_total is the server-validated with-driver fare, with no deposits or
 -- unpriced toll/parking actuals. Client discount amounts are never accepted.
 discount:=case when p_code='CWD5' then round(p_total/20.0)::bigint else least(50000,round(p_total/10.0)::bigint) end; net:=p_total-discount;
 result:=public.cwd_checkout_create(p_nonce,p_mobile,p_proof_expires,p_submission,p_access_hash,p_choice,net,
  (p_data-'loginCoupon'-'couponCode')||jsonb_build_object('totalFare',net/100.0,'loginCoupon',
   jsonb_build_object('code',p_code,'percent',case when p_code='CWD5' then 5 else 10 end,'grossPaise',p_total,'eligiblePaise',p_total,'discountPaise',discount,'totalPaise',net)),p_contact);
 select booking_status='confirmed' into confirmed from public.inquiries where booking_id=result->>'booking_id';
 insert into public.cwd_login_coupon_uses(code,customer_id,mobile,booking_id,gross_paise,eligible_paise,discount_paise,status,redeemed_at)
 values(p_code,c.id,c.mobile,result->>'booking_id',p_total,p_total,discount,case when confirmed then 'redeemed' else 'reserved' end,
  case when confirmed then now() end) returning * into u;
 if confirmed then
  insert into public.cwd_login_coupon_redemptions(use_id,customer_id,mobile,booking_id,code,eligible_paise,discount_paise)
   values(u.id,c.id,c.mobile,u.booking_id,p_code,p_total,discount);
 end if;
 return result;
end $$;



NOTIFY pgrst, 'reload schema';
COMMIT;
