alter table public.inquiries
  add column if not exists original_fare numeric not null default 0,
  add column if not exists extra_km numeric not null default 0,
  add column if not exists extra_km_rate numeric not null default 0,
  add column if not exists extra_km_charge numeric not null default 0,
  add column if not exists night_charge numeric not null default 0,
  add column if not exists toll_charge numeric not null default 0,
  add column if not exists parking_charge numeric not null default 0,
  add column if not exists state_tax_charge numeric not null default 0,
  add column if not exists other_charge numeric not null default 0,
  add column if not exists final_charges_updated_at timestamptz;

update public.inquiries
set original_fare = coalesce(nullif(fare_amount, 0), total_fare, 0)
where coalesce(original_fare, 0) = 0;

alter table public.inquiries
  drop constraint if exists inquiries_final_charges_nonnegative,
  add constraint inquiries_final_charges_nonnegative check (
    original_fare >= 0 and extra_km >= 0 and extra_km_rate >= 0 and extra_km_charge >= 0
    and night_charge >= 0 and toll_charge >= 0 and parking_charge >= 0
    and state_tax_charge >= 0 and other_charge >= 0
  );
