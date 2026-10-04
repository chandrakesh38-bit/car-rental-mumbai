begin;

alter table public.cwd_vendor_allocations
  add column if not exists early_start_approved_at timestamptz,
  add column if not exists early_start_approved_by text;

commit;
