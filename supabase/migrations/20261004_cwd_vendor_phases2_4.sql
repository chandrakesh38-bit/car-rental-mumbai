-- CWD With-Driver Vendor Operations phases 2-4
-- Additive only. Depends on 20261004_cwd_vendor_phase1.sql.
begin;

create table if not exists public.cwd_vendor_offers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.cwd_vendors(id),
  booking_id text not null,
  offer_token_hash text not null unique,
  status text not null default 'offered' check(status in ('offered','accepted','declined','allocated','expired','revoked')),
  trip_type text not null,
  vehicle_required text,
  route_summary text not null,
  start_at timestamptz,
  final_drop_at timestamptz,
  estimated_km numeric(10,2) not null default 0,
  duty_days integer not null default 1,
  night_count integer not null default 0,
  local_package text,
  extra_km numeric(10,2) not null default 0,
  extra_hours numeric(10,2) not null default 0,
  estimated_vendor_payout numeric(12,2) not null default 0,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists cwd_vendor_offers_booking_idx on public.cwd_vendor_offers(booking_id);
create index if not exists cwd_vendor_offers_vendor_idx on public.cwd_vendor_offers(vendor_id);

create table if not exists public.cwd_vendor_allocations (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null unique,
  offer_id uuid not null references public.cwd_vendor_offers(id),
  vendor_id uuid not null references public.cwd_vendors(id),
  allocation_token_hash text not null unique,
  status text not null default 'allocated' check(status in ('allocated','trip_started','trip_completed_review_required','approved','cancelled','reallocated')),
  allocated_at timestamptz not null default now(),
  revoked_at timestamptz,
  vehicle_number text,
  driver_name text,
  driver_mobile text,
  updated_at timestamptz not null default now()
);
create index if not exists cwd_vendor_alloc_vendor_idx on public.cwd_vendor_allocations(vendor_id);

create table if not exists public.cwd_vendor_trip_events (
  booking_id text primary key references public.cwd_vendor_allocations(booking_id),
  starting_odometer numeric(12,1),
  starting_photo_path text,
  started_at timestamptz,
  closing_odometer numeric(12,1),
  closing_photo_path text,
  ended_at timestamptz,
  toll numeric(12,2) not null default 0,
  parking numeric(12,2) not null default 0,
  state_tax numeric(12,2) not null default 0,
  night_charge boolean not null default false,
  other_amount numeric(12,2) not null default 0,
  other_reason text,
  calculated_trip_km numeric(12,1),
  review_status text not null default 'not_submitted'
    check(review_status in ('not_submitted','review_required','approved','query_vendor','corrected')),
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by text
);

create table if not exists public.cwd_customer_billing_ledger (
  booking_id text primary key,
  customer_km_rate numeric(12,2) not null default 13,
  billable_km numeric(12,1) not null default 0,
  customer_da numeric(12,2) not null default 0,
  customer_night numeric(12,2) not null default 0,
  toll numeric(12,2) not null default 0,
  parking numeric(12,2) not null default 0,
  state_tax numeric(12,2) not null default 0,
  approved_other numeric(12,2) not null default 0,
  customer_advance numeric(12,2) not null default 0,
  customer_total numeric(12,2) not null default 0,
  customer_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.cwd_vendor_settlement_ledger (
  booking_id text primary key,
  vendor_id uuid not null references public.cwd_vendors(id),
  vendor_km_rate numeric(12,2) not null default 11,
  billable_km numeric(12,1) not null default 0,
  vendor_da numeric(12,2) not null default 0,
  vendor_night numeric(12,2) not null default 0,
  toll numeric(12,2) not null default 0,
  parking numeric(12,2) not null default 0,
  state_tax numeric(12,2) not null default 0,
  approved_other numeric(12,2) not null default 0,
  penalty numeric(12,2) not null default 0,
  vendor_final_payout numeric(12,2) not null default 0,
  payout_status text not null default 'pending' check(payout_status in ('pending','paid')),
  payout_due_at timestamptz,
  paid_at timestamptz,
  utr_reference text,
  updated_at timestamptz not null default now()
);

create table if not exists public.cwd_customer_invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null unique,
  invoice_token_hash text not null unique,
  invoice_snapshot jsonb not null,
  payment_url text,
  created_at timestamptz not null default now()
);

alter table public.cwd_vendor_offers enable row level security;
alter table public.cwd_vendor_allocations enable row level security;
alter table public.cwd_vendor_trip_events enable row level security;
alter table public.cwd_customer_billing_ledger enable row level security;
alter table public.cwd_vendor_settlement_ledger enable row level security;
alter table public.cwd_customer_invoices enable row level security;

revoke all on public.cwd_vendor_offers, public.cwd_vendor_allocations,
 public.cwd_vendor_trip_events, public.cwd_customer_billing_ledger,
 public.cwd_vendor_settlement_ledger, public.cwd_customer_invoices
from anon, authenticated;
grant select,insert,update,delete on public.cwd_vendor_offers, public.cwd_vendor_allocations,
 public.cwd_vendor_trip_events, public.cwd_customer_billing_ledger,
 public.cwd_vendor_settlement_ledger, public.cwd_customer_invoices
to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cwd-vendor-trip-photos','cwd-vendor-trip-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

create policy cwd_vendor_trip_photos_server_only on storage.objects as restrictive
for all to anon, authenticated
using(bucket_id <> 'cwd-vendor-trip-photos')
with check(bucket_id <> 'cwd-vendor-trip-photos');

commit;