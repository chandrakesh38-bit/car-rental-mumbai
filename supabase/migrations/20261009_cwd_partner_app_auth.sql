-- CWD Partner mobile app: additive schema, version CWD-PARTNER-APP-AUTH-V1.
-- Apply on the actual CWD vendor Supabase project ONLY after identifying it.
-- Existing vendors, vendor codes, bookings and financial ledgers remain intact.
begin;

create table if not exists public.cwd_vendor_app_login_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_hash text not null unique,
  vendor_id uuid not null references public.cwd_vendors(id),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  msg91_req_id text not null,
  ip_hash text not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cwd_vendor_app_login_mobile_idx
  on public.cwd_vendor_app_login_challenges (mobile,created_at desc);
create index if not exists cwd_vendor_app_login_ip_idx
  on public.cwd_vendor_app_login_challenges (ip_hash,created_at desc);

create table if not exists public.cwd_vendor_app_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  vendor_id uuid not null references public.cwd_vendors(id),
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists cwd_vendor_app_sessions_vendor_idx
  on public.cwd_vendor_app_sessions(vendor_id,expires_at desc);

create table if not exists public.cwd_vendor_app_vehicle_blocks (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.cwd_vendors(id),
  vehicle_id uuid not null references public.cwd_vendor_vehicles(id),
  blocked_date date not null,
  reason text check (reason is null or length(reason)<=200),
  created_at timestamptz not null default now(),
  unique(vehicle_id,blocked_date)
);
create index if not exists cwd_vendor_app_blocks_vendor_date
  on public.cwd_vendor_app_vehicle_blocks(vendor_id,blocked_date);

create table if not exists public.cwd_vendor_app_devices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.cwd_vendors(id),
  device_token_hash text not null unique,
  provider text not null default 'fcm' check(provider='fcm'),
  device_token text not null,
  platform text not null default 'android',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists cwd_vendor_app_devices_vendor_idx
  on public.cwd_vendor_app_devices(vendor_id);

alter table public.cwd_vendor_offers
  add column if not exists selected_vendor_vehicle_id uuid
    references public.cwd_vendor_vehicles(id);
alter table public.cwd_vendor_offers
  add column if not exists vendor_cancel_unlocked_at timestamptz;
alter table public.cwd_vendor_offers
  add column if not exists vendor_response_reason text;


alter table public.cwd_vendor_app_login_challenges enable row level security;
alter table public.cwd_vendor_app_sessions enable row level security;
alter table public.cwd_vendor_app_vehicle_blocks enable row level security;
alter table public.cwd_vendor_app_devices enable row level security;

revoke all on public.cwd_vendor_app_login_challenges,
 public.cwd_vendor_app_sessions,
 public.cwd_vendor_app_vehicle_blocks,
 public.cwd_vendor_app_devices
from anon,authenticated,public;

grant select,insert,update,delete on public.cwd_vendor_app_login_challenges,
 public.cwd_vendor_app_sessions,
 public.cwd_vendor_app_vehicle_blocks,
 public.cwd_vendor_app_devices
to service_role;

-- No RLS policies for untrusted clients. Server code checks each vendor_id
-- and validates every booking/vehicle ownership before any mutation.
commit;
