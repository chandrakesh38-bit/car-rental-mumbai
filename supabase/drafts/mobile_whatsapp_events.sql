-- Operational messages share the existing phone queue; no historical backfill.
alter table cwd_private.wa_jobs alter column event_id drop not null;
alter table cwd_private.wa_jobs add column dedupe_key text unique;
alter table public.cwd_vendor_offers add column whatsapp_url text;
alter table public.cwd_vendor_allocations add column whatsapp_url text;
alter table public.cwd_customer_invoices add column whatsapp_url text;

create function cwd_private.wa_put(k text, phone text, body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from cwd_private.wa_device where enabled and activated_at<=now()) then return; end if;
 phone:=regexp_replace(coalesce(phone,''),'[^0-9]','','g');
 if phone ~ '^[6-9][0-9]{9}$' then phone:='91'||phone; end if;
 if phone !~ '^91[6-9][0-9]{9}$' or nullif(body,'') is null then return; end if;
 insert into cwd_private.wa_jobs(dedupe_key,recipient,message)
 values(k,phone,'Car With Driver India'||E'\n'||body||E'\nSupport: +91 9702988465') on conflict(dedupe_key) do nothing;
end $$;
revoke all on function cwd_private.wa_put(text,text,text) from public,anon,authenticated;

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

create function cwd_private.wa_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.inquiries; v public.cwd_vendors; o public.cwd_vendor_offers; changed boolean;
begin
 select * into b from public.inquiries where booking_id=new.booking_id;
 if not found then return new; end if;
 select * into v from public.cwd_vendors where id=new.vendor_id;
 select * into o from public.cwd_vendor_offers where id=new.offer_id;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then changed:=new.offer_id is distinct from old.offer_id or new.allocated_at is distinct from old.allocated_at; end if;
 if new.status in ('cancelled','reallocated') then
  if tg_op='UPDATE' and old.status is distinct from new.status then
   delete from cwd_private.wa_jobs where (dedupe_key like 'allocation:'||new.booking_id||':%' or dedupe_key like 'driver:'||new.booking_id||':%') and status in ('pending','claimed');
   perform cwd_private.wa_put('revoked:'||new.booking_id||':'||new.updated_at::text,v.primary_whatsapp,
    'Trip allocation withdrawn'||E'\nBooking ID: '||new.booking_id||E'\nPlease do not dispatch for this allocation. Contact CWD for clarification.');
  end if;
  return new;
 end if;
 if new.status='allocated' and changed then
  perform cwd_private.wa_put('allocation:'||new.booking_id||':'||new.allocated_at::text,v.primary_whatsapp,
   'Trip allocated to you'||E'\nBooking ID: '||new.booking_id||E'\nRoute: '||coalesce(b.route,'See booking')||
   E'\nPickup (IST): '||coalesce(to_char(o.start_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI'),'See booking')||
   E'\nCustomer: '||b.customer_name||E'\nCustomer phone: '||b.customer_phone||
   E'\nPickup address: '||coalesce(b.full_address,'See booking')||
   E'\nVehicle: '||coalesce(o.vehicle_required,b.car_name)||E'\nEstimated vendor payout: INR '||coalesce(o.estimated_vendor_payout,0)::text||
   E'\nSubmit driver name, mobile and vehicle number: '||coalesce(new.whatsapp_url,'Open your vendor app'));
 end if;
 if new.status in ('allocated','trip_started') and nullif(trim(new.driver_name),'') is not null and
  new.driver_mobile ~ '^[6-9][0-9]{9}$' and nullif(trim(new.vehicle_number),'') is not null then
  if tg_op='UPDATE' then
   changed:=changed or (new.driver_name,new.driver_mobile,new.vehicle_number) is distinct from (old.driver_name,old.driver_mobile,old.vehicle_number);
  end if;
  if changed then
   delete from cwd_private.wa_jobs where dedupe_key like 'driver:'||new.booking_id||':%' and status in ('pending','claimed');
   perform cwd_private.wa_put('driver:'||new.booking_id||':'||new.updated_at::text,b.customer_phone,
    'Your driver and car details'||E'\nBooking ID: '||new.booking_id||E'\nRoute: '||coalesce(b.route,'As booked')||
    E'\nDriver: '||new.driver_name||E'\nDriver phone: +91 '||new.driver_mobile||
    E'\nCar: '||coalesce(o.vehicle_required,b.car_name)||E'\nVehicle number: '||new.vehicle_number||
    E'\nThese are your latest assigned driver/car details.');
  end if;
 end if;
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if new.status='trip_started' then
   perform cwd_private.wa_put('started:'||new.booking_id||':'||new.allocated_at::text,b.customer_phone,'Your trip has started'||E'\nBooking ID: '||new.booking_id||E'\nHave a pleasant journey. For any concern, contact CWD.');
  elsif new.status='trip_completed_review_required' then
   perform cwd_private.wa_put('ended:'||new.booking_id||':'||new.allocated_at::text,b.customer_phone,'Trip closure submitted'||E'\nBooking ID: '||new.booking_id||E'\nThank you for travelling with us. Trip extras are under review. Your final bill and balance will follow after approval.');
  end if;
 end if;
 return new;
end $$;
revoke all on function cwd_private.wa_allocation() from public,anon,authenticated;
create trigger cwd_wa_allocation after insert or update on public.cwd_vendor_allocations for each row execute function cwd_private.wa_allocation();

create function cwd_private.wa_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
declare phone text; s jsonb;
begin
 if new.whatsapp_url is null then return new; end if;
 if tg_op='UPDATE' and (new.invoice_token_hash,new.invoice_snapshot) is not distinct from (old.invoice_token_hash,old.invoice_snapshot) then return new; end if;
 if not exists(select 1 from public.cwd_vendor_trip_events where booking_id=new.booking_id and review_status in ('approved','corrected')) then return new; end if;
 select customer_phone into phone from public.inquiries where booking_id=new.booking_id;
 s:=new.invoice_snapshot;
 -- Regeneration invalidates the previous invoice link; replace unsent jobs.
 delete from cwd_private.wa_jobs where dedupe_key like 'invoice:'||new.booking_id||':%' and status in ('pending','claimed');
 perform cwd_private.wa_put('invoice:'||new.booking_id||':'||new.invoice_token_hash,phone,
 'Final trip invoice'||E'\nBooking ID: '||new.booking_id||
 E'\nBooked fare: INR '||coalesce(s->>'booking_fare','0')||
 E'\nExtra KM: '||coalesce(s->>'extra_km','0')||' | INR '||coalesce(s->>'extra_km_charge','0')||
 E'\nExtra hours: INR '||coalesce(s->>'extra_hour_charge','0')||
 E'\nNight charges: INR '||coalesce(s->>'customer_night','0')||
 E'\nToll: INR '||coalesce(s->>'toll','0')||E'\nParking: INR '||coalesce(s->>'parking','0')||
 E'\nState tax: INR '||coalesce(s->>'state_tax','0')||E'\nOther approved charges: INR '||coalesce(s->>'approved_other','0')||
 E'\nFinal total: INR '||coalesce(s->>'customer_total','0')||E'\nAdvance credited: INR '||coalesce(s->>'customer_advance','0')||
 E'\nBalance at invoice issue: INR '||coalesce(s->>'customer_balance','0')||
 E'\nView/download invoice: '||new.whatsapp_url||
 case when nullif(new.payment_url,'') is not null then E'\nPayment link: '||new.payment_url else '' end);
 return new;
end $$;
revoke all on function cwd_private.wa_invoice() from public,anon,authenticated;
create trigger cwd_wa_invoice after insert or update on public.cwd_customer_invoices for each row execute function cwd_private.wa_invoice();
