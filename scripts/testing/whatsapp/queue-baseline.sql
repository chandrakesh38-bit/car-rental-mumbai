-- Exact formatter/queue functions from main b1d82b8; local fixtures only.
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
  return 'Hi '||b.customer_name||E',\n\nYour car is confirmed with booking ID: '||bid||E'. Your trip details include:\n\nItinerary: '||(c->>'route')||' ['||(c->>'type')||' ('||(c->>'journey')||')]'||
   E'\n\nPickup Time & Date: '||(c->>'time')||E'\n\nCar Type: '||b.car_name||E'\n\nPick Up Location: '||(c->>'pickup')||E'\n\nDrop Location: '||(c->>'drop')||
   E'\n\nYou will receive your driver details at least 2 hours before your pickup time. For bookings made less than 2 hours before pickup, our team will share the details as soon as the driver is assigned.\n\nThank you!\n— Team CWD';
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

create or replace function cwd_private.wa_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.inquiries; body text; pickup text;
begin
 if new.event_type not in ('booking_confirmed','payment_captured') then return new; end if;
 select * into b from public.inquiries where booking_id=new.booking_id;
 if not found then return new; end if;
 pickup:=coalesce(substring(b.booking_details from 'Pickup: ([^\n]+)'),substring(b.booking_details from '📅[^\n]+'),'See booking confirmation');
 body:=case when new.event_type='booking_confirmed' then 'Booking confirmed' else 'Payment received' end||
 E'\nBooking ID: '||new.booking_id||E'\nStatus: '||coalesce(b.booking_status,'confirmed')||
 E'\nRoute: '||coalesce(b.route,'As booked')||E'\nPickup: '||pickup||
 E'\nCar: '||coalesce(b.car_name,'As booked')||E'\nBooked fare: INR '||coalesce(b.total_fare,0)::text||
 E'\nTotal paid: INR '||coalesce(b.paid_amount,0)::text||E'\nPending: INR '||greatest(0,coalesce(b.total_fare,0)-coalesce(b.paid_amount,0))::text||
 E'\nApplicable trip extras will be settled after review.';
 if b.booking_status not in ('cancelled','completed') then body:=body||E'\nDriver/car details will follow after assignment.'; end if;
 perform cwd_private.wa_put('checkout:'||new.id,b.customer_phone,body);
 return new;
end $$;

create function cwd_private.wa_offer() returns trigger
language plpgsql security definer set search_path='' as $$
declare phone text;
begin
 if new.status<>'offered' then
  delete from cwd_private.wa_jobs where dedupe_key='offer:'||new.id and status in ('pending','claimed');
  return new;
 end if;
 if tg_op='UPDATE' then return new; end if;
 select primary_whatsapp into phone from public.cwd_vendors where id=new.vendor_id and status='active';
 perform cwd_private.wa_put('offer:'||new.id,phone,'New trip offer — allocation not yet confirmed'||
 E'\nBooking ID: '||new.booking_id||E'\nRoute: '||new.route_summary||
 E'\nPickup (IST): '||coalesce(to_char(new.start_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI'),'See offer')||
 E'\nVehicle: '||coalesce(new.vehicle_required,'See offer')||
 E'\nEstimated vendor payout: INR '||new.estimated_vendor_payout::text||
 E'\nReview inclusions and accept/decline: '||coalesce(new.whatsapp_url,'Open your vendor app')||
 E'\nAccepting an offer does not confirm allocation.');
 return new;
end $$;
revoke all on function cwd_private.wa_offer() from public,anon,authenticated;
create trigger cwd_wa_offer after insert or update on public.cwd_vendor_offers for each row execute function cwd_private.wa_offer();


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
