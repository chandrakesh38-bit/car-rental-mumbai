begin;

create table if not exists public.cwd_booking_commercial_overrides (
  booking_id text primary key,
  original_customer_fare numeric(12,2),
  negotiated_customer_fare numeric(12,2),
  customer_override_reason text,
  customer_overridden_at timestamptz,
  customer_overridden_by text,

  vendor_rate_per_km_override numeric(12,2),
  vendor_final_payout_override numeric(12,2),
  vendor_override_reason text,
  vendor_overridden_at timestamptz,
  vendor_overridden_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cwd_booking_commercial_overrides enable row level security;
revoke all on public.cwd_booking_commercial_overrides from anon, authenticated;
grant select, insert, update, delete on public.cwd_booking_commercial_overrides to service_role;

commit;
