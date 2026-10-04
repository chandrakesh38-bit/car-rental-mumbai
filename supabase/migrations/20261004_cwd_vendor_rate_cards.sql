-- CWD Vendor Rate Card linked to Global With-Driver vehicle master.
-- vehicle_rate_id stores the canonical with_driver_rates.id as text so it works
-- regardless of whether the existing ID column is UUID, bigint or another scalar type.

begin;

create table if not exists public.cwd_vendor_rate_cards (
  id uuid primary key default gen_random_uuid(),
  vehicle_rate_id text not null unique,
  outstation_rate_per_km numeric(12,2) not null default 0,
  minimum_outstation_km_per_day integer not null default 240,
  driver_allowance_per_day numeric(12,2) not null default 500,
  night_charge numeric(12,2) not null default 300,
  local_pkg_8hr_80km numeric(12,2) not null default 0,
  local_pkg_10hr_100km numeric(12,2) not null default 0,
  local_pkg_12hr_120km numeric(12,2) not null default 0,
  local_extra_km_rate numeric(12,2) not null default 0,
  local_extra_hour_rate numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (outstation_rate_per_km >= 0),
  check (minimum_outstation_km_per_day >= 0),
  check (driver_allowance_per_day >= 0),
  check (night_charge >= 0),
  check (local_pkg_8hr_80km >= 0),
  check (local_pkg_10hr_100km >= 0),
  check (local_pkg_12hr_120km >= 0),
  check (local_extra_km_rate >= 0),
  check (local_extra_hour_rate >= 0)
);

alter table public.cwd_vendor_rate_cards enable row level security;
revoke all on public.cwd_vendor_rate_cards from anon, authenticated;
grant select, insert, update, delete on public.cwd_vendor_rate_cards to service_role;

commit;
