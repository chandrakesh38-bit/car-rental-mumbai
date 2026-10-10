-- Reserve quota before contacting MSG91. No OTPs or provider tokens are stored.
-- Apply before deploying the API that calls this function.
begin;
create or replace function public.cwd_vendor_app_reserve_otp(
  p_vendor_id uuid, p_mobile text, p_ip_hash text, p_challenge_hash text
) returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_mobile_count bigint;
  v_ip_count bigint;
  v_latest timestamptz;
begin
  if p_vendor_id is null or p_mobile is null or p_mobile !~ '^[6-9][0-9]{9}$'
    or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$'
    or p_challenge_hash is null or p_challenge_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('code','invalid');
  end if;
  -- Fixed order prevents deadlocks; namespaces separate IP and mobile locks.
  -- All Vercel instances share these short transaction-scoped locks.
  perform pg_catalog.pg_advisory_xact_lock(193701,pg_catalog.hashtext(p_ip_hash));
  perform pg_catalog.pg_advisory_xact_lock(193702,pg_catalog.hashtext(p_mobile));
  v_now := pg_catalog.clock_timestamp();
  if not exists(select 1 from public.cwd_vendors
    where id=p_vendor_id and primary_whatsapp=p_mobile
      and lower(btrim(status)) in ('active','approved')) then
    return jsonb_build_object('code','not_approved');
  end if;
  select count(*),max(created_at) into v_mobile_count,v_latest
    from public.cwd_vendor_app_login_challenges
    where mobile=p_mobile and created_at>=v_now-interval '1 hour';
  select count(*) into v_ip_count from public.cwd_vendor_app_login_challenges
    where ip_hash=p_ip_hash and created_at>=v_now-interval '1 hour';
  if v_mobile_count>=5 or v_ip_count>=20 then
    return jsonb_build_object('code','rate_limited');
  end if;
  if v_latest>v_now-interval '30 seconds' then
    return jsonb_build_object('code','cooldown');
  end if;
  -- Expired until provider success is durably attached by the API.
  -- Failed sends retain their quota reservation, preventing unlimited retries.
  insert into public.cwd_vendor_app_login_challenges
    (challenge_hash,vendor_id,mobile,msg91_req_id,ip_hash,expires_at,last_sent_at,created_at)
    values(p_challenge_hash,p_vendor_id,p_mobile,'pending',p_ip_hash,v_now,v_now,v_now);
  return jsonb_build_object('code','reserved');
end;
$$;
revoke all on function public.cwd_vendor_app_reserve_otp(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.cwd_vendor_app_reserve_otp(uuid,text,text,text)
  to service_role;
commit;
