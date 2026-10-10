-- Optional vehicle condition photos for CWD vendor onboarding.
-- Private storage; only service-role APIs can access metadata and signed URLs.

begin;

create table if not exists public.cwd_vendor_vehicle_media (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.cwd_vendors(id) on delete cascade,
  vehicle_id uuid not null references public.cwd_vendor_vehicles(id) on delete cascade,
  view_type text not null check (view_type in ('front','right','left','rear','interior')),
  object_path text not null unique,
  original_filename text,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, view_type)
);

create index if not exists cwd_vendor_vehicle_media_vendor_id_idx
  on public.cwd_vendor_vehicle_media(vendor_id);

create index if not exists cwd_vendor_vehicle_media_vehicle_id_idx
  on public.cwd_vendor_vehicle_media(vehicle_id);

alter table public.cwd_vendor_vehicle_media enable row level security;
revoke all on public.cwd_vendor_vehicle_media from anon, authenticated;
grant select, insert, update, delete on public.cwd_vendor_vehicle_media to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cwd-vendor-registration-photos',
  'cwd-vendor-registration-photos',
  false,
  5242880,
  array['image/jpeg','image/png','application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
