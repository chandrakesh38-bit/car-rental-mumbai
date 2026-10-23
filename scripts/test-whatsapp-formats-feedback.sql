-- Apply the format/feedback migration first; fixtures roll back without sends.
begin;

do $test$
declare bid text:='WA-FORMAT-'||gen_random_uuid()::text; vid uuid:=gen_random_uuid(); oid uuid:=gen_random_uuid(); raw text; result jsonb; n integer; msg text;
begin
insert into public.inquiries(booking_id,customer_name,customer_phone,service_type,car_name,route,total_fare,paid_amount,booking_status)
values(bid,'Rahul','6999999902','With Driver','Wagon R or similar','Garage → Mumbai → Lonavala → Garage',3500,1000,'confirmed');
insert into public.cwd_checkout_bookings(booking_id,submission_key,otp_nonce,mobile,access_hash,payment_choice,total_paise,booking_data)
values(bid,gen_random_uuid(),gen_random_uuid()::text,'916999999902',repeat('a',64),0,350000,
'{"tripType":"outstation","journeyType":"round-trip","pickupLocation":"Mumbai","destination":"Lonavala","customerAddress":"Vikhroli East, Mumbai","pickupAt":"2026-10-25T00:30:00Z","includedKm":200,"stops":[]}');
insert into public.cwd_booking_events(booking_id,event_key,event_type) values(bid,bid,'booking_confirmed');
select j.message into msg from cwd_private.wa_jobs j join public.cwd_booking_events e on j.dedupe_key='checkout:'||e.id where e.booking_id=bid;
if msg not like '%Mumbai → Lonavala → Mumbai%' or msg like '%Garage%' or msg not like '%at least 2 hours before%' or msg not like '%6:00 am on 25 Oct 2026%' then raise exception 'Confirmation format failed: %',msg; end if;
insert into public.cwd_vendors(id,vendor_code,owner_business_name,primary_whatsapp,base_location,address,pan,status)
values(vid,'CWD6999999901','Amit','6999999901','Mumbai','Test address','ABCDE1234F','active');
insert into public.cwd_vendor_offers(id,vendor_id,booking_id,offer_token_hash,trip_type,route_summary,estimated_vendor_payout,pricing_snapshot)
values(oid,vid,bid,gen_random_uuid()::text,'Outstation','Mumbai to Lonavala',2500,'{"vendor_km_rate":12,"local_extra_hour":150}');
insert into public.cwd_vendor_allocations(booking_id,offer_id,vendor_id,allocation_token_hash,whatsapp_url)
values(bid,oid,vid,gen_random_uuid()::text,'https://carswithdriverindia.com/vendor-booking?allocation=test');
if not exists(select 1 from cwd_private.wa_jobs where dedupe_key like 'allocation:'||bid||':%' and message like '%Namaste Amit ji%' and message like '%₹2500%' and message like '%₹12/km%') then raise exception 'Vendor format failed'; end if;
update public.cwd_vendor_allocations set driver_name='Abdullah Sayyed',driver_mobile='6999999903',vehicle_number='MH03EG9225',updated_at=clock_timestamp() where booking_id=bid;
if not exists(select 1 from cwd_private.wa_jobs where dedupe_key like 'driver:'||bid||':%' and message like '%odometer%' and message like '%200 km%' and message like '%6:00 am%') then raise exception 'Driver format failed'; end if;
insert into public.cwd_vendor_trip_events(booking_id,ended_at,review_status) values(bid,now(),'approved');
update public.inquiries set total_fare=3965 where booking_id=bid;
insert into public.cwd_customer_invoices(booking_id,invoice_token_hash,invoice_snapshot,whatsapp_url,payment_url)
values(bid,gen_random_uuid()::text,'{"booking_fare":3500,"customer_total":3965,"customer_advance":1000,"customer_balance":2965,"extra_km":11,"extra_km_charge":165,"extra_hours":2,"extra_hour_charge":300}', 'https://carswithdriverindia.com/customer-invoice?t=test','https://rzp.io/test');
if not exists(select 1 from cwd_private.wa_jobs where dedupe_key like 'invoice:'||bid||':%' and message like '%Pending Payment: ₹2965%' and message like '%Balance Before Trip: ₹2500%' and message like '%above booked fare): ₹465%') then raise exception 'Final bill arithmetic format failed'; end if;
if exists(select 1 from public.cwd_trip_feedback where booking_id=bid) then raise exception 'Feedback before final payment'; end if;
update public.inquiries set paid_amount=3965 where booking_id=bid;
select substring(message from '#t=([a-f0-9]{64})') into raw from cwd_private.wa_jobs where dedupe_key='feedback:'||bid;
if raw is null then raise exception 'Feedback not queued'; end if;
update public.inquiries set paid_amount=3965 where booking_id=bid;
select count(*) into n from cwd_private.wa_jobs where dedupe_key='feedback:'||bid;
if n<>1 then raise exception 'Duplicate invite'; end if;
result:=public.cwd_feedback_access(raw,1,'Please improve punctuality <script>alert(1)</script>');
if not (result->>'submitted')::boolean then raise exception 'Submission failed'; end if;
perform public.cwd_feedback_access(raw,5,'overwrite attempt');
if not exists(select 1 from public.cwd_trip_feedback where booking_id=bid and rating=1) then raise exception 'Duplicate changed response'; end if;
begin
 perform public.cwd_feedback_access(repeat('0',64),5,'forged');
 raise exception 'forged accepted';
exception when others then if sqlerrm='forged accepted' then raise; end if;
end;
if has_function_privilege('anon','public.cwd_feedback_access(text,integer,text)','execute') or has_table_privilege('anon','public.cwd_trip_feedback','select') then raise exception 'Feedback access exposed'; end if;
end $test$;
select 'PASS: formats, IST, route, fare arithmetic, settled-only feedback, idempotency, token access, RLS grants' as result;

rollback;
