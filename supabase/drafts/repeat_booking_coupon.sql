-- Testing coupon extension. Existing one-time coupon history is preserved.
begin;
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

commit;
