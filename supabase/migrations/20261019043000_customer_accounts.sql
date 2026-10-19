-- Testing only. Apply to an isolated database, never the production project.
-- Additive: no changes to bookings, rates, payments, vendor tables or their RLS.
begin;

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
-- Separate consumption ledger avoids changing booking/partner proof semantics.
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

-- Caller is the trusted API after verifying an origin-bound customer OTP proof.
-- SECURITY INVOKER: service_role is the only principal granted execution.
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
commit;
