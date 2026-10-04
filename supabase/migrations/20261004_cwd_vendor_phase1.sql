-- CWD With-Driver Vendor Operations - Phase 1
-- Apply only to the Supabase project used by the testing preview.
-- This migration is isolated from the existing Self Drive partner system.

begin;

create table if not exists public.cwd_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique check (vendor_code ~ '^CWD[6-9][0-9]{9}$'),
  owner_business_name text not null check (char_length(owner_business_name) between 2 and 160),
  primary_whatsapp text not null unique check (primary_whatsapp ~ '^[6-9][0-9]{9}$'),
  alternate_mobile text check (alternate_mobile is null or alternate_mobile ~ '^[6-9][0-9]{9}$'),
  email text check (email is null or char_length(email) <= 254),
  base_location text not null check (char_length(base_location) between 2 and 160),
  address text not null check (char_length(address) between 5 and 1000),
  pan text not null check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  status text not null default 'pending_review'
    check (status in ('pending_review','active','suspended','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cwd_vendor_payout_accounts (
  vendor_id uuid primary key references public.cwd_vendors(id) on delete cascade,
  payout_mode text not null check (payout_mode in ('upi','bank','bank_upi')),
  account_holder_name text,
  bank_name text,
  account_number text,
  ifsc text,
  upi_id text,
  created_at timestamptz not null default now(),
  check (
    (payout_mode = 'upi' and upi_id is not null)
    or
    (payout_mode = 'bank' and account_holder_name is not null and account_number is not null and ifsc is not null)
    or
    (payout_mode = 'bank_upi' and account_holder_name is not null and account_number is not null and ifsc is not null and upi_id is not null)
  )
);

create table if not exists public.cwd_vendor_vehicles (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.cwd_vendors(id) on delete cascade,
  vehicle_number text not null unique,
  make_model text not null check (char_length(make_model) between 2 and 160),
  category text not null check (char_length(category) between 2 and 80),
  manufacturing_year integer not null check (manufacturing_year between 1990 and 2100),
  fuel text not null check (fuel in ('Petrol','Diesel','CNG','Petrol+CNG','Electric','Hybrid','Other')),
  seating integer not null check (seating between 2 and 20),
  commercial_permit_type text not null check (char_length(commercial_permit_type) between 2 and 120),
  rc_number text not null check (char_length(rc_number) between 3 and 80),
  insurance_policy_number text not null check (char_length(insurance_policy_number) between 3 and 120),
  insurance_expiry date,
  puc_number text not null check (char_length(puc_number) between 2 and 100),
  puc_expiry date,
  permit_fitness_number text,
  permit_fitness_expiry date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists cwd_vendor_vehicles_vendor_id_idx
  on public.cwd_vendor_vehicles(vendor_id);

create table if not exists public.cwd_vendor_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.cwd_vendors(id) on delete cascade,
  terms_version text not null,
  rate_card_versions jsonb not null,
  terms_snapshot text not null,
  accepted_at timestamptz not null default now(),
  audit_ip_hash text,
  audit_user_agent text,
  audit_request_id uuid not null,
  unique (vendor_id, terms_version)
);

create index if not exists cwd_vendor_terms_vendor_id_idx
  on public.cwd_vendor_terms_acceptances(vendor_id);

alter table public.cwd_vendors enable row level security;
alter table public.cwd_vendor_payout_accounts enable row level security;
alter table public.cwd_vendor_vehicles enable row level security;
alter table public.cwd_vendor_terms_acceptances enable row level security;

revoke all on public.cwd_vendors,
  public.cwd_vendor_payout_accounts,
  public.cwd_vendor_vehicles,
  public.cwd_vendor_terms_acceptances
from anon, authenticated;

grant select, insert, update, delete on public.cwd_vendors,
  public.cwd_vendor_payout_accounts,
  public.cwd_vendor_vehicles,
  public.cwd_vendor_terms_acceptances
to service_role;

commit;
