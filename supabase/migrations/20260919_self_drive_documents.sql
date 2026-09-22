-- Apply only to the Supabase project used by the testing preview.
begin;
create table if not exists public.self_drive_verifications (
  booking_id text primary key check (booking_id ~ '^CWD-WD-[0-9]{6}-[0-9]{4}$'),
  token_hash text not null,
  request_hash text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  enquiry_details text not null,
  alternate_phone text,
  status text not null default 'awaiting_documents' check (status in ('awaiting_documents','pending_verification','verified','rejected')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create table if not exists public.self_drive_document_files (
  booking_id text not null references public.self_drive_verifications(booking_id),
  kind text not null check (kind in ('aadhaar','licence_front','licence_back','pan','address_proof')),
  filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  primary key (booking_id,kind)
);
alter table public.self_drive_verifications enable row level security;
alter table public.self_drive_document_files enable row level security;
revoke all on public.self_drive_verifications, public.self_drive_document_files from anon, authenticated;
grant select, insert, update, delete on public.self_drive_verifications, public.self_drive_document_files to service_role;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('self-drive-documents','self-drive-documents',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
-- Prevent any pre-existing broad client policy from exposing this new bucket.
create policy self_drive_documents_server_only on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'self-drive-documents') with check (bucket_id <> 'self-drive-documents');
commit;
