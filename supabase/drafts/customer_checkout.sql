-- UNAPPLIED migration source: isolated testing database only.
-- Generate the migration filename with `supabase migration new customer_checkout`
-- when the CLI is available, then place this reviewed source in that file.
-- Requires the existing inquiries/booking_payments/otp_proof_uses tables and
-- 20261019043000_customer_accounts.sql. No existing booking or pricing rows change.
begin;
-- Fail safely if historical duplicate IDs exist; never rewrite/delete existing rows.
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
commit;
