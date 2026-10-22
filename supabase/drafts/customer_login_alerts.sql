-- Isolated testing database only.
begin;
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
commit;
