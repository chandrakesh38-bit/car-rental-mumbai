-- LOCAL TESTING ONLY; unapplied to any remote project.
-- Depends on customer_accounts migration and drafts/customer_checkout.sql.
-- CLI is unavailable here: retain reviewed source until a migration is generated.
begin;
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
-- Mobile identity, not a browser/session/coupon string, enforces lifetime use.
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
for each row execute function public.cwd_coupon_sync_confirmation();

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
commit;
