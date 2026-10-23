-- Testing-only public catalogue; no customer data or production writes.
create table public.vehicles (
id uuid primary key default gen_random_uuid(), brand text not null, model text not null,
full_name text not null, segment text, service_type text not null,
transmission text, fuel_type text, seating_capacity integer not null check(seating_capacity>0),
rate_per_hour numeric(12,2) not null check(rate_per_hour>=0),
refundable_deposit numeric(12,2) not null check(refundable_deposit>=0),
image_url text, display_order integer default 0, is_active boolean not null default true
);
alter table public.vehicles enable row level security;
revoke all on public.vehicles from anon, authenticated;
grant select on public.vehicles to anon, authenticated;
grant all on public.vehicles to service_role;
create policy vehicles_public_catalogue on public.vehicles for select to anon,authenticated using (is_active and service_type in ('Self-Drive','Both'));
