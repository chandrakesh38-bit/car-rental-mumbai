-- Testing only. Apply after customer_checkout.sql and login_coupon.sql.
begin;
create table public.cwd_booking_references (
 booking_id text primary key check(booking_id ~ '^[1-9][0-9]{5}$'),
 request_key text not null unique,
 created_at timestamptz not null default now()
);
alter table public.cwd_booking_references enable row level security;
revoke all on public.cwd_booking_references from public,anon,authenticated;
grant select,insert on public.cwd_booking_references to service_role;
create function public.cwd_reserve_booking_reference(p_key text) returns text
language plpgsql security invoker set search_path='' as $$
declare reference text; attempts integer:=0;
begin
 if p_key is null or length(p_key)<20 or length(p_key)>200 then raise exception 'Invalid reference request'; end if;
 -- Shared by every booking entry point. Reservations survive incomplete enquiries
 -- and are never recycled into a different customer's booking.
 perform pg_catalog.pg_advisory_xact_lock(7420161902);
 select booking_id into reference from public.cwd_booking_references where request_key=p_key;
 if found then return reference; end if;
 loop
  reference:=(100000+floor(random()*900000))::integer::text;
  exit when not exists(select 1 from public.cwd_booking_references where booking_id=reference)
    and not exists(select 1 from public.inquiries where booking_id=reference);
  attempts:=attempts+1;
  if attempts>1000 then raise exception 'Booking references busy; please contact support'; end if;
 end loop;
 insert into public.cwd_booking_references(booking_id,request_key) values(reference,p_key);
 return reference;
end $$;
revoke all on function public.cwd_reserve_booking_reference(text) from public,anon,authenticated;
grant execute on function public.cwd_reserve_booking_reference(text) to service_role;
-- Replace only the ID allocation block in the existing function. Preserve pricing,
-- idempotency, confirmation, payment and coupon transaction behaviour.
do $$
declare definition text; old_block text;
begin
 select pg_get_functiondef('public.cwd_checkout_create(text,text,timestamptz,uuid,text,integer,bigint,jsonb,jsonb)'::regprocedure) into definition;
 old_block:=substring(definition from ' loop\s+reference:=[\s\S]*?end loop;');
 if old_block is null then raise exception 'Unexpected checkout definition; review before migrating'; end if;
 definition:=replace(definition,old_block,E' reference:=public.cwd_reserve_booking_reference(''checkout:''||p_submission::text);');
 -- Booking OTP is verified by the API. Keep its account/session creation atomic
 -- with the booking; never accept these contact fields directly from a browser.
 definition:=replace(definition,' insert into public.cwd_booking_events', $session$
 if p_contact->>'sessionHash' is not null then
  insert into public.cwd_customers(mobile) values(p_mobile) on conflict(mobile) do nothing;
  insert into public.cwd_customer_sessions(session_hash,customer_id,expires_at)
   select p_contact->>'sessionHash',id,now()+interval '7 days' from public.cwd_customers where mobile=p_mobile;
 end if;
 insert into public.cwd_booking_events$session$);
 execute definition;
end $$;
-- Existing document links continue to work; new enquiries use six digits.
do $$ begin
 if to_regclass('public.self_drive_verifications') is not null then
  alter table public.self_drive_verifications drop constraint if exists self_drive_verifications_booking_id_check;
  alter table public.self_drive_verifications add constraint self_drive_verifications_booking_id_check
   check(booking_id ~ '^([1-9][0-9]{5}|CWD-WD-[0-9]{6}-[0-9]{4})$');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
