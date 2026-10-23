-- Separate from the email outbox: email cron cannot consume mobile jobs.
create schema if not exists cwd_private;
revoke all on schema cwd_private from public, anon, authenticated;
create table cwd_private.wa_device (
 id boolean primary key default true check(id), token_hash text not null,
 enabled boolean not null default false, activated_at timestamptz,
 last_seen timestamptz
);
create table cwd_private.wa_jobs (
 id uuid primary key default gen_random_uuid(), event_id uuid not null unique references public.cwd_booking_events(id),
 recipient text not null, message text not null, status text not null default 'pending',
 lease uuid, claimed_at timestamptz, message_id text, created_at timestamptz not null default now(),
 accepted_at timestamptz, delivered_at timestamptz,
 check(status in ('pending','claimed','dispatching','accepted','delivered','uncertain'))
);
alter table cwd_private.wa_device enable row level security;
alter table cwd_private.wa_jobs enable row level security;
revoke all on all tables in schema cwd_private from public,anon,authenticated;
create index wa_jobs_pending on cwd_private.wa_jobs(created_at) where status in ('pending','claimed');

create function cwd_private.wa_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.inquiries; phone text; body text; paid numeric; total numeric;
begin
 if new.event_type not in ('booking_confirmed','payment_captured') or
 not exists(select 1 from cwd_private.wa_device where enabled and activated_at<=new.created_at) then return new; end if;
 select * into b from public.inquiries where booking_id=new.booking_id;
 if not found then return new; end if;
 phone:=regexp_replace(coalesce(b.customer_phone,''),'[^0-9]','','g');
 if phone ~ '^[6-9][0-9]{9}$' then phone:='91'||phone; end if;
 if phone !~ '^91[6-9][0-9]{9}$' then return new; end if;
 paid:=coalesce(b.paid_amount,0); total:=coalesce(b.total_fare,0);
 body:='Car With Driver India'||E'\n'||case when new.event_type='booking_confirmed' then 'Booking confirmed' else 'Payment received — booking confirmed' end||
 E'\nBooking ID: '||new.booking_id||E'\nRoute: '||left(coalesce(b.route,'See booking details'),300)||
 E'\nCar: '||left(coalesce(b.car_name,'As booked'),100)||E'\nTotal fare: INR '||total::text||
 E'\nTotal paid: INR '||paid::text||E'\nPending balance: INR '||greatest(0,total-paid)::text||
 E'\nDriver details will be shared separately.\nSupport: +91 9702988465';
 insert into cwd_private.wa_jobs(event_id,recipient,message) values(new.id,phone,body) on conflict(event_id) do nothing;
 return new;
end $$;
revoke all on function cwd_private.wa_enqueue() from public,anon,authenticated;
create trigger cwd_mobile_whatsapp_event after insert on public.cwd_booking_events
 for each row execute function cwd_private.wa_enqueue();

-- Scoped bearer capability: grants access to this worker's queue only, never database credentials.
create function public.cwd_mobile_whatsapp(p_token text,p_action text,p_id uuid default null,p_lease uuid default null,p_message_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j cwd_private.wa_jobs; result jsonb;
begin
 if p_token is null or length(p_token)<>64 or not exists(
 select 1 from cwd_private.wa_device where enabled and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')) then
 raise exception 'Unauthorized' using errcode='28000'; end if;
 update cwd_private.wa_device set last_seen=now() where id;
 if p_action='claim' then
  select * into j from cwd_private.wa_jobs where status='pending' or
   (status='claimed' and claimed_at<now()-interval '2 minutes') order by created_at,id for update skip locked limit 1;
  if not found then return 'null'::jsonb; end if;
  update cwd_private.wa_jobs set status='claimed',lease=gen_random_uuid(),claimed_at=now() where id=j.id returning * into j;
  return jsonb_build_object('id',j.id,'lease',j.lease,'recipient',j.recipient,'message',j.message);
 elsif p_action='begin' then
  update cwd_private.wa_jobs set status='dispatching' where id=p_id and lease=p_lease and status='claimed'
   and claimed_at>now()-interval '2 minutes' returning * into j;
  return jsonb_build_object('ok',found);
 elsif p_action in ('accepted','delivered','uncertain') then
  if p_action<>'uncertain' and (p_message_id is null or length(p_message_id)>200) then raise exception 'Invalid message id'; end if;
  update cwd_private.wa_jobs set
   status=case when status='delivered' then status else p_action end,
   message_id=coalesce(message_id,p_message_id),
   accepted_at=case when p_action in ('accepted','delivered') then coalesce(accepted_at,now()) else accepted_at end,
   delivered_at=case when p_action='delivered' then coalesce(delivered_at,now()) else delivered_at end
  where id=p_id and lease=p_lease and status in ('dispatching','accepted','delivered','uncertain')
   and (message_id is null or message_id=p_message_id or p_action='uncertain') returning * into j;
  return jsonb_build_object('ok',found);
 else raise exception 'Invalid action'; end if;
end $$;
revoke all on function public.cwd_mobile_whatsapp(text,text,uuid,uuid,text) from public;
grant execute on function public.cwd_mobile_whatsapp(text,text,uuid,uuid,text) to anon,authenticated;
