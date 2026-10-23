-- Formatter only. No queue writes, triggers, backfill or live database activation.
-- Install before the revised whatsapp_formats_feedback.sql on a NEW setup.
-- Existing installations require a separately reviewed replacement of wa_format's
-- checkout branch; a Git/Vercel deployment does not apply PostgreSQL functions.
create schema if not exists cwd_private;
revoke all on schema cwd_private from public,anon,authenticated;

create or replace function cwd_private.wa_confirmation_text(value text) returns text
language sql immutable set search_path='' as $$
 select nullif(trim(regexp_replace(replace(coalesce(value,''),'*',''),'[[:cntrl:]]+',' ','g')),'');
$$;
create or replace function cwd_private.wa_confirmation_date(value text) returns text
language plpgsql stable set search_path='' as $$
begin
 if value is null or value !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return null; end if;
 return to_char(value::timestamptz at time zone 'Asia/Kolkata','FMHH12:MI am "on" DD Mon YYYY')||' (IST)';
 exception when others then return null;
end $$;
create or replace function cwd_private.wa_confirmation_route(places text[]) returns text
language plpgsql immutable set search_path='' as $$
declare names text[]; common_state text; all_shared boolean; result text;
begin
 select array_agg(cwd_private.wa_confirmation_text(x) order by ord) into names
 from unnest(places) with ordinality p(x,ord) where cwd_private.wa_confirmation_text(x) is not null;
 -- Only remove a state when EVERY stop explicitly shares that state and India.
 -- City/locality parts remain intact; cross-state routes retain their states.
 select substring(names[1] from ',\s*([^,]+),\s*India$') into common_state;
 select bool_and(x ~ ',[^,]+,[^,]+$' and
  substring(x from ',\s*([^,]+),\s*India$') is not distinct from common_state)
 into all_shared from unnest(names) x;
 select string_agg(case when common_state is not null and all_shared
  then regexp_replace(x,',\s*[^,]+,\s*India$','')
  else regexp_replace(x,',\s*India$','') end,' → ' order by ord)
 into result from unnest(names) with ordinality p(x,ord);
 return result;
end $$;
create or replace function cwd_private.wa_confirmation_number(value text) returns numeric
language plpgsql immutable set search_path='' as $$
begin
 if value ~ '^\d+(\.\d+)?$' then return value::numeric; end if;
 return null;
end $$;

-- b is an inquiries row; d is cwd_checkout_bookings.booking_data.
-- Pure input/output makes the exact SQL formatter testable without remote access.
create or replace function cwd_private.wa_booking_confirmation(b jsonb,d jsonb) returns text
language plpgsql stable set search_path='' as $$
declare body text; mode text; self_drive boolean; places text[]; route text; address text; area text;
 pickup_at text; return_at text; label text; n numeric; total numeric; paid numeric;
begin
 d:=coalesce(d,'{}');
 self_drive:=lower(coalesce(b->>'service_type','')) in ('self drive','self-drive','selfdrive') or lower(coalesce(b->>'trip_type',''))='self drive';
 mode:=case when self_drive then 'selfdrive' else d->>'tripType' end;
 body:='Hi'||coalesce(' '||cwd_private.wa_confirmation_text(b->>'customer_name'),'')||E',\n\nYour booking is confirmed.\n*Booking ID:* '||coalesce(cwd_private.wa_confirmation_text(b->>'booking_id'),'See booking details');
 label:=coalesce(cwd_private.wa_confirmation_text(b->>'trip_type'),case when self_drive then 'Self Drive' else cwd_private.wa_confirmation_text(mode) end);
 if d->>'journeyType' in ('round-trip','one-way') and mode='outstation' then label:=concat_ws(' · ',label,case d->>'journeyType' when 'round-trip' then 'Round Trip' else 'One Way' end); end if;
 if label is not null then body:=body||E'\n*Trip:* '||label; end if;
 area:=cwd_private.wa_confirmation_text(d->>'pickupLocation');
 address:=coalesce(cwd_private.wa_confirmation_text(d->>'customerAddress'),cwd_private.wa_confirmation_text(b->>'full_address'));
 if mode='outstation' then
  places:=array[area];
  if jsonb_typeof(d->'stops')='array' then
   select places||coalesce(array_agg(cwd_private.wa_confirmation_text(value->>'name') order by ordinality),'{}') into places from jsonb_array_elements(d->'stops') with ordinality;
  end if;
  places:=array_append(places,cwd_private.wa_confirmation_text(d->>'destination'));
  if d->>'journeyType'='round-trip' then places:=array_append(places,area); end if;
  route:=cwd_private.wa_confirmation_route(places);
 elsif mode='airport' then
  label:=case when cwd_private.wa_confirmation_text(d->>'airportTerminal') is not null then 'Mumbai Airport '||cwd_private.wa_confirmation_text(d->>'airportTerminal') end;
  if d->>'airportType'='pickup' then
   route:=cwd_private.wa_confirmation_route(array[label,area]);
   -- customerAddress is the CUSTOMER end of an airport transfer, not the terminal.
   if label is not null then body:=body||E'\n*Pickup location:* '||label; end if;
   if address is not null then body:=body||E'\n*Drop address / landmark:* '||address; end if;
   if area is not null then body:=body||E'\n*Drop area:* '||area; end if;
   address:=null;area:=null;
  else route:=cwd_private.wa_confirmation_route(array[area,label]); end if;
 elsif self_drive then
  route:=cwd_private.wa_confirmation_text(b->>'route');
  if d->>'deliveryMode'='home' then
   label:=cwd_private.wa_confirmation_text(d->>'deliveryLocation');
   if label is not null then body:=body||E'\n*Delivery location:* '||label; end if;
  end if;
 else route:=cwd_private.wa_confirmation_route(array[area]); end if;
 route:=coalesce(route,cwd_private.wa_confirmation_text(b->>'route'));
 if route is not null then body:=body||E'\n*Itinerary:* '||route; end if;
 if address is not null then body:=body||E'\n*Pickup address / landmark:* '||address; end if;
 if area is not null and area is distinct from address then body:=body||E'\n*Pickup area:* '||area; end if;
 pickup_at:=cwd_private.wa_confirmation_date(d->>'pickupAt');
 if pickup_at is not null then body:=body||E'\n*Pickup:* '||pickup_at; end if;
 return_at:=cwd_private.wa_confirmation_date(d->>'returnAt');
 if return_at is not null and (self_drive or mode='outstation') then
  body:=body||E'\n*'||case when self_drive or d->>'journeyType'='round-trip' then 'Return' else 'Final drop' end||':* '||return_at;
 end if;
 label:=cwd_private.wa_confirmation_text(b->>'car_name');
 if label is not null then body:=body||E'\n*Car type:* '||label; end if;
 total:=cwd_private.wa_confirmation_number(b->>'total_fare');paid:=cwd_private.wa_confirmation_number(b->>'paid_amount');
 if total is not null then body:=body||E'\n\n*Total fare:* INR '||round(total,2)::text; end if;
 if paid is not null then body:=body||E'\n*Paid:* INR '||round(paid,2)::text; end if;
 if total is not null and paid is not null then body:=body||E'\n*Balance:* INR '||round(greatest(0,total-paid),2)::text; end if;
 -- Only with-driver snapshots have server-validated allowance/rate fields.
 if not self_drive and mode in ('local','airport','outstation') then
  n:=cwd_private.wa_confirmation_number(d->>'includedKm');
  if n>0 then body:=body||E'\n*Included KM:* '||n::text||' km'; end if;
  n:=cwd_private.wa_confirmation_number(d->>'includedHours');
  if n>0 and mode='local' then body:=body||E'\n*Included time:* '||n::text||' hours'; end if;
  n:=cwd_private.wa_confirmation_number(d->>'customerExtraKmRate');
  if n is not null then body:=body||E'\n*Extra KM rate:* INR '||n::text||'/km'; end if;
  -- No persisted toll/parking policy exists for Local/Outstation. Do not infer
  -- historic terms from today's UI defaults. Airport policy is server-owned.
  if mode='airport' then
   label:=cwd_private.wa_confirmation_text(d->>'airportWaitingPolicy');
   if label is not null then body:=body||E'\n*Airport terms:* '||label; end if;
  end if;
 end if;
 if not self_drive and (lower(coalesce(b->>'service_type','')) in ('with driver','with-driver','withdriver') or mode in ('local','airport','outstation')) then
  body:=body||E'\n\nYou will receive your driver details at least 2 hours before your pickup time. For bookings made less than 2 hours before pickup, our team will share the details as soon as the driver is assigned.';
 end if;
 return body||E'\n\nThank you!\n— Team CWD\ncarswithdriverindia.com';
end $$;
revoke all on function cwd_private.wa_confirmation_text(text),cwd_private.wa_confirmation_date(text),cwd_private.wa_confirmation_route(text[]),cwd_private.wa_confirmation_number(text),cwd_private.wa_booking_confirmation(jsonb,jsonb) from public,anon,authenticated;
