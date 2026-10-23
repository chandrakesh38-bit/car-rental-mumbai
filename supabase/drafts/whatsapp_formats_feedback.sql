create function cwd_private.wa_trip_context(bid text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.inquiries; d jsonb; pickup text; dropoff text; route text; journey text; dt text;
begin
 select * into b from public.inquiries where booking_id=bid;
 select booking_data into d from public.cwd_checkout_bookings where booking_id=bid;
 d:=coalesce(d,'{}');
 pickup:=coalesce(nullif(d->>'customerAddress',''),nullif(b.full_address,''),d->>'pickupLocation','See booking details');
 dropoff:=coalesce(d->>'destination','As per booked itinerary');
 journey:=case d->>'journeyType' when 'round-trip' then 'Round Trip' when 'one-way' then 'One Way' else coalesce(d->>'localPackage',d->>'airportType',b.trip_type,'As booked') end;
 if d->>'journeyType'='round-trip' then dropoff:='Same as pickup location'; end if;
 route:=coalesce(b.route,'As booked');
 if d->>'tripType'='outstation' then
  select string_agg(x,' → ') into route from (
   select 0 as ord,d->>'pickupLocation' as x union all
   select ordinality::int,value->>'name' from jsonb_array_elements(coalesce(d->'stops','[]')) with ordinality union all
   select 100,d->>'destination' union all
   select 101,d->>'pickupLocation' where d->>'journeyType'='round-trip'
  ) q where nullif(x,'') is not null;
 elsif d->>'tripType'='airport' then
  if d->>'airportType'='pickup' then pickup:='Mumbai Airport '||coalesce(d->>'airportTerminal',''); dropoff:=coalesce(d->>'customerAddress',d->>'pickupLocation',dropoff);
  else dropoff:='Mumbai Airport '||coalesce(d->>'airportTerminal',''); end if;
  route:=pickup||' → '||dropoff;
 end if;
 begin dt:=to_char((d->>'pickupAt')::timestamptz at time zone 'Asia/Kolkata','FMHH12:MI am "on" DD Mon YYYY')||' (IST)'; exception when others then dt:=null; end;
 dt:=coalesce(dt,substring(b.booking_details from 'Pickup: ([^\n]+)'),substring(b.booking_details from '📅[^\n]+'),'See booking details');
 return jsonb_build_object('name',b.customer_name,'route',coalesce(route,b.route),'pickup',pickup,'drop',dropoff,'time',dt,'type',coalesce(b.trip_type,'As booked'),'journey',journey,'car',b.car_name,'km',d->>'includedKm','hours',d->>'includedHours');
end $$;
revoke all on function cwd_private.wa_trip_context(text) from public,anon,authenticated;

create function cwd_private.wa_format(k text,fallback text) returns text
language plpgsql security definer set search_path='' as $$
declare bid text; kind text:=split_part(k,':',1); c jsonb; b public.inquiries; a public.cwd_vendor_allocations; o public.cwd_vendor_offers; v public.cwd_vendors; i public.cwd_customer_invoices; e public.cwd_booking_events; s jsonb; body text; total numeric; paid numeric; basefare numeric; balance numeric;
begin
 if kind='checkout' then
  select * into e from public.cwd_booking_events where id=split_part(k,':',2)::uuid;
  if e.event_type<>'booking_confirmed' and (e.event_type<>'payment_captured' or
   exists(select 1 from public.cwd_booking_events prev where prev.booking_id=e.booking_id and prev.id<>e.id and prev.event_type in ('booking_confirmed','payment_captured'))) then return fallback; end if;
  bid:=e.booking_id;
 elsif kind in ('driver','allocation','invoice') then bid:=split_part(k,':',2);
 else return fallback; end if;
 select * into b from public.inquiries where booking_id=bid;
 if not found then return fallback; end if;
 if kind='checkout' and b.booking_status in ('cancelled','completed') then return fallback; end if;
 c:=cwd_private.wa_trip_context(bid);
 if kind='checkout' then
  return cwd_private.wa_booking_confirmation(to_jsonb(b),(select booking_data from public.cwd_checkout_bookings where booking_id=bid));
 end if;
 select * into a from public.cwd_vendor_allocations where booking_id=bid;
 select * into o from public.cwd_vendor_offers where id=a.offer_id;
 if kind='driver' then
  return 'Hi '||b.customer_name||E',\n\nHere are the driver details for your upcoming trip.\nBooking ID: '||bid||E'\nItinerary: '||(c->>'route')||
   E'\n\nDriver Name: '||a.driver_name||E'\nMobile Number: +91 '||a.driver_mobile||E'\nCar Details: '||coalesce(o.vehicle_required,b.car_name)||' - '||a.vehicle_number||E'\nPickup Time & Date: '||(c->>'time')||
   E'\n\nImportant trip terms:\nYour trip has a kilometre limit'||case when c->>'km' is not null then ' ('||(c->>'km')||' km)' else '' end||
   case when c->>'hours' is not null then ' and an hours limit ('||(c->>'hours')||' hours)' else '. Certain packages also have an hours limit' end||
   E'. Usage beyond the booked limits is charged at the agreed extra KM/hour rates.\nFor transparency, please check the odometer reading when you board the cab and again at trip end.\n\n— Team CWD';
 elsif kind='allocation' then
  select * into v from public.cwd_vendors where id=a.vendor_id;
  return '🚗 New Trip Assigned'||E'\n\nNamaste '||v.owner_business_name||E' ji,\n\nAapke liye ek new trip assign hui hai. Please neeche di gayi details check karein.\n\nBooking ID: '||bid||
   E'\n\n👤 Customer Details\nName: '||b.customer_name||E'\nMobile: '||b.customer_phone||
   E'\n\n📍 Trip Details\nTrip Type: '||(c->>'type')||E'\nJourney: '||(c->>'journey')||E'\nPickup: '||(c->>'pickup')||E'\nDrop: '||(c->>'drop')||E'\nPickup Time & Date: '||(c->>'time')||E'\nVehicle: '||coalesce(o.vehicle_required,b.car_name)||
   E'\n\n💰 Your Payment Details\nAgreed Amount: ₹'||o.estimated_vendor_payout::text||
   E'\nExtra KM Rate: '||case when o.pricing_snapshot->>'trip_type' ilike '%local%' then coalesce('₹'||(o.pricing_snapshot->>'local_extra_km')||'/km','See agreed offer') else coalesce('₹'||(o.pricing_snapshot->>'vendor_km_rate')||'/km','See agreed offer') end||
   E'\nExtra Hours Rate: '||coalesce('₹'||(o.pricing_snapshot->>'local_extra_hour')||'/hour (where applicable)','As per agreed terms')||
   E'\nDriver Allowance: Included in agreed amount\nYour Expected Earning: ₹'||o.estimated_vendor_payout::text||
   E'\nExtra charges, if applicable, will be calculated as per agreed terms.\n\nSubmit driver/car details and report on time at pickup: '||coalesce(a.whatsapp_url,'Open your vendor app')||E'\n\nThank you,\nCar With Driver India – Operations';
 end if;
 select * into i from public.cwd_customer_invoices where booking_id=bid;
 s:=i.invoice_snapshot;
 total:=coalesce((s->>'customer_total')::numeric,b.total_fare,0); paid:=coalesce(b.paid_amount,0); basefare:=coalesce((s->>'booking_fare')::numeric,0); balance:=greatest(0,total-paid);
 body:='Trip Completed'||E'\n\nHi '||b.customer_name||E' 👋,\n\nThank you for travelling with Car With Driver India! We hope you had a comfortable journey.\n\nYour final trip details and payment summary are below.\n\nBooking ID: '||bid||E'\nRoute: '||(c->>'route')||E'\nVehicle: '||b.car_name||
 E'\n\nFinal Fare Breakdown\nBase Booking Fare: ₹'||basefare::text||E'\nExtra Kilometres ('||coalesce(s->>'extra_km','0')||' km): ₹'||coalesce(s->>'extra_km_charge','0')||
 E'\nExtra Hours ('||coalesce(s->>'extra_hours','0')||' hrs): ₹'||coalesce(s->>'extra_hour_charge','0')||
 E'\nNight Charges: ₹'||coalesce(s->>'customer_night','0')||E'\nToll: ₹'||coalesce(s->>'toll','0')||E'\nParking: ₹'||coalesce(s->>'parking','0')||E'\nState Tax: ₹'||coalesce(s->>'state_tax','0')||E'\nOther Approved Charges: ₹'||coalesce(s->>'approved_other','0')||
 E'\n\nFinal Trip Amount: ₹'||total::text||E'\nAdvance Already Paid: ₹'||coalesce(s->>'customer_advance','0')||E'\nBalance Before Trip: ₹'||greatest(0,basefare-coalesce((s->>'customer_advance')::numeric,0))::text||
 E'\nExtra Charges (net above booked fare): ₹'||greatest(0,total-basefare)::text||E'\nTotal Paid Till Now: ₹'||paid::text||E'\nPending Payment: ₹'||balance::text||
 case when balance>0 then case when nullif(i.payment_url,'') is not null then E'\n\nPlease complete your pending payment using the secure link below.\nPay Pending Amount: '||i.payment_url else E'\n\nPlease contact our team to complete your pending payment.' end else E'\n\nPayment complete. Thank you!' end||
 E'\nView/download invoice: '||i.whatsapp_url||E'\n\nThank you for choosing us. We look forward to serving you again! 🚗';
 return body;
end $$;
revoke all on function cwd_private.wa_format(text,text) from public,anon,authenticated;

create or replace function cwd_private.wa_put(k text,phone text,body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from cwd_private.wa_device where enabled and activated_at<=now()) then return; end if;
 phone:=regexp_replace(coalesce(phone,''),'[^0-9]','','g');
 if phone ~ '^[6-9][0-9]{9}$' then phone:='91'||phone; end if;
 if phone !~ '^91[6-9][0-9]{9}$' or nullif(body,'') is null then return; end if;
 insert into cwd_private.wa_jobs(dedupe_key,recipient,message,created_at) values(k,phone,
 'Car With Driver India'||E'\n\n'||cwd_private.wa_format(k,body)||E'\nSupport: +91 9702988465',clock_timestamp()) on conflict(dedupe_key) do nothing;
end $$;

create table public.cwd_trip_feedback (
 booking_id text primary key, token_hash text not null unique, customer_name text not null,
 rating smallint check(rating between 1 and 5), comment text check(length(comment)<=2000),
 invited_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days', submitted_at timestamptz
);
alter table public.cwd_trip_feedback enable row level security;
revoke all on public.cwd_trip_feedback from public,anon,authenticated;
grant select,insert,update,delete on public.cwd_trip_feedback to service_role;

create function cwd_private.wa_feedback_issue(bid text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.inquiries; i public.cwd_customer_invoices; raw text; inserted text;
begin
 select * into b from public.inquiries where booking_id=bid;
 select * into i from public.cwd_customer_invoices where booking_id=bid;
 if b.booking_id is null or i.id is null or b.booking_status='cancelled' or coalesce(b.total_fare,0)<=0 or coalesce(b.paid_amount,0)<b.total_fare or
  coalesce((i.invoice_snapshot->>'customer_total')::numeric,-1)<>b.total_fare or
  not exists(select 1 from public.cwd_vendor_trip_events where booking_id=bid and ended_at is not null and review_status in ('approved','corrected')) or
  not exists(select 1 from cwd_private.wa_device where enabled) then return; end if;
 raw:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.cwd_trip_feedback(booking_id,token_hash,customer_name)
 values(bid,encode(extensions.digest(raw,'sha256'),'hex'),b.customer_name) on conflict(booking_id) do nothing returning booking_id into inserted;
 if inserted is null then return; end if;
 perform cwd_private.wa_put('feedback:'||bid,b.customer_phone,'Hi '||b.customer_name||E',\n\nYour final payment is complete for booking '||bid||E'. Thank you for travelling with Car With Driver India!\n\nHow was your trip? Please share your honest feedback:\nhttps://carswithdriverindia.com/trip-feedback#t='||raw||E'\n\nYou can also leave an honest Google review:\nhttps://g.page/r/CW3DNel65kuNEBM/review\n\n— Team CWD');
end $$;
revoke all on function cwd_private.wa_feedback_issue(text) from public,anon,authenticated;
create function cwd_private.wa_feedback_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform cwd_private.wa_feedback_issue(new.booking_id); return new; end $$;
revoke all on function cwd_private.wa_feedback_event() from public,anon,authenticated;
create trigger zz_cwd_feedback_payment after update of paid_amount,total_fare on public.inquiries for each row execute function cwd_private.wa_feedback_event();
create trigger zz_cwd_feedback_invoice after insert or update on public.cwd_customer_invoices for each row execute function cwd_private.wa_feedback_event();

create function public.cwd_feedback_access(p_token text,p_rating integer default null,p_comment text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare f public.cwd_trip_feedback;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid feedback link'; end if;
 select * into f from public.cwd_trip_feedback where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now() for update;
 if not found then raise exception 'Feedback link is invalid or expired'; end if;
 if p_rating is not null then
  if p_rating not between 1 and 5 or length(coalesce(p_comment,''))>2000 then raise exception 'Invalid feedback'; end if;
  if f.submitted_at is null then
   update public.cwd_trip_feedback set rating=p_rating,comment=trim(coalesce(p_comment,'')),submitted_at=now() where booking_id=f.booking_id returning * into f;
  end if;
 end if;
 return jsonb_build_object('booking_id',f.booking_id,'submitted',f.submitted_at is not null);
end $$;
revoke all on function public.cwd_feedback_access(text,integer,text) from public,anon,authenticated;
grant execute on function public.cwd_feedback_access(text,integer,text) to service_role;
