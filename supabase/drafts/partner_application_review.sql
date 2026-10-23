begin;
set local lock_timeout='5s';
alter table public.partner_applications
 add column review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
 add column review_notes text not null default '' check(length(review_notes)<=2000),
 add column reviewed_at timestamptz,
 add column reviewed_by text,
 add column review_version integer not null default 0 check(review_version>=0);
create index partner_applications_review_idx on public.partner_applications(review_status,created_at desc);
notify pgrst,'reload schema';
commit;
