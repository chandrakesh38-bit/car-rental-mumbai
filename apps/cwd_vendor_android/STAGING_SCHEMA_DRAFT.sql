-- SCHEMA DRAFT ONLY. Do NOT execute on the shared production Supabase project.
-- Provision an isolated staging Supabase project, confirm organization with owner,
-- then generate an official migration using "supabase migration new ..."
-- and review with the project-specific Supabase security advisors first.

create table if not exists public.cwd_vendor_app_login_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_hash text not null unique,
  vendor_id uuid not null references public.cwd_vendors(id),
  mobile text not null,
  msg91_req_id text not null,
  ip_hash text not null,
  attempt_count integer not null default 0,
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cwd_vendor_login_attempt_limit check (attempt_count between 0 and 8)
);
create index if not exists cwd_vendor_login_by_ip on public.cwd_vendor_app_login_challenges (ip_hash,created_at desc);
create index if not exists cwd_vendor_login_by_mobile on public.cwd_vendor_app_login_challenges (mobile,created_at desc);

create table if not exists public.cwd_vendor_app_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  vendor_id uuid not null references public.cwd_vendors(id),
  device_label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz
);
create index if not exists cwd_vendor_sessions_by_vendor on public.cwd_vendor_app_sessions (vendor_id,created_at desc);

-- Staging schema should also have cwd_vendors, cwd_vendor_vehicles and
-- cwd_vendor_offers created via existing vendor migrations.
alter table public.cwd_vendor_app_login_challenges enable row level security;
alter table public.cwd_vendor_app_sessions enable row level security;
revoke all on public.cwd_vendor_app_login_challenges from anon,authenticated,public;
revoke all on public.cwd_vendor_app_sessions from anon,authenticated,public;
grant select,insert,update,delete on public.cwd_vendor_app_login_challenges to service_role;
grant select,insert,update,delete on public.cwd_vendor_app_sessions to service_role;
-- No public policies. Access only through Vercel functions with service credentials.
