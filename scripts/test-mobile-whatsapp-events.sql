-- Run in a transaction on the migrated database; all fixtures roll back.
begin;

do $test$
declare vid uuid:=gen_random_uuid(); oid uuid:=gen_random_uuid(); bid text:='WA-TEST-'||gen_random_uuid()::text; n int;
begin
insert into public.inquiries(booking_id,customer_name,customer_phone,service_type,car_name,route,full_address,total_fare,paid_amount,booking_status)
values(bid,'Test customer','6999999902','Outstation','Test car','Mumbai to Pune','Test pickup address',5000,1000,'confirmed');
insert into public.cwd_vendors(id,vendor_code,owner_business_name,primary_whatsapp,base_location,address,pan,status)
values(vid,'CWD6999999901','Test vendor','6999999901','Mumbai','Test address','ABCDE1234F','active');
insert into public.cwd_vendor_offers(id,vendor_id,booking_id,offer_token_hash,trip_type,route_summary,estimated_vendor_payout,whatsapp_url)
values(oid,vid,bid,gen_random_uuid()::text,'Outstation','Mumbai to Pune',3000,'https://carswithdriverindia.com/vendor-booking?offer=test');
if not exists(select 1 from cwd_private.wa_jobs where dedupe_key='offer:'||oid and recipient='916999999901' and message not like '%6999999902%' and message not like '%Test pickup address%') then raise exception 'offer privacy or enqueue failed'; end if;
update public.cwd_vendor_offers set status='accepted' where id=oid;
if exists(select 1 from cwd_private.wa_jobs where dedupe_key='offer:'||oid) then raise exception 'stale offer retained'; end if;
insert into public.cwd_vendor_allocations(booking_id,offer_id,vendor_id,allocation_token_hash,whatsapp_url)
values(bid,oid,vid,gen_random_uuid()::text,'https://carswithdriverindia.com/vendor-booking?allocation=test');
if not exists(select 1 from cwd_private.wa_jobs where dedupe_key like 'allocation:'||bid||':%' and message like '%6999999902%') then raise exception 'allocation missing contact'; end if;
update public.cwd_vendor_allocations set driver_name='Test driver',driver_mobile='6999999903',vehicle_number='MH01TEST',updated_at=clock_timestamp() where booking_id=bid;
select count(*) into n from cwd_private.wa_jobs where dedupe_key like 'driver:'||bid||':%';
if n<>1 then raise exception 'driver enqueue failed'; end if;
update public.cwd_vendor_allocations set updated_at=clock_timestamp() where booking_id=bid;
select count(*) into n from cwd_private.wa_jobs where dedupe_key like 'driver:'||bid||':%';
if n<>1 then raise exception 'no-op duplicate'; end if;
update public.cwd_vendor_allocations set driver_name='Replacement',updated_at=clock_timestamp() where booking_id=bid;
select count(*) into n from cwd_private.wa_jobs where dedupe_key like 'driver:'||bid||':%';
if n<>1 or not exists(select 1 from cwd_private.wa_jobs where dedupe_key like 'driver:'||bid||':%' and message like '%Replacement%' and message not like '%vendor payout%') then raise exception 'driver replacement/privacy failed'; end if;
update public.cwd_vendor_allocations set status='trip_started',updated_at=clock_timestamp() where booking_id=bid;
update public.cwd_vendor_allocations set status='trip_completed_review_required',updated_at=clock_timestamp() where booking_id=bid;
if (select count(*) from cwd_private.wa_jobs where dedupe_key like 'started:'||bid||':%' or dedupe_key like 'ended:'||bid||':%')<>2 then raise exception 'lifecycle missing'; end if;
insert into public.cwd_vendor_trip_events(booking_id,review_status) values(bid,'review_required');
insert into public.cwd_customer_invoices(booking_id,invoice_token_hash,invoice_snapshot,whatsapp_url)
values(bid,gen_random_uuid()::text,'{"booking_fare":5000,"customer_total":5500,"customer_advance":1000,"customer_balance":4500,"toll":500}', 'https://carswithdriverindia.com/customer-invoice?t=test');
if exists(select 1 from cwd_private.wa_jobs where dedupe_key like 'invoice:'||bid||':%') then raise exception 'unapproved invoice sent'; end if;
update public.cwd_vendor_trip_events set review_status='approved' where booking_id=bid;
update public.cwd_customer_invoices set invoice_token_hash=gen_random_uuid()::text where booking_id=bid;
if not exists(select 1 from cwd_private.wa_jobs where dedupe_key like 'invoice:'||bid||':%' and message like '%4500%' and message like '%customer-invoice?t=test%') then raise exception 'invoice failed'; end if;
perform cwd_private.wa_put('invalid-test','123','bad phone');
if exists(select 1 from cwd_private.wa_jobs where dedupe_key='invalid-test') then raise exception 'invalid phone accepted'; end if;
end $test$;
select 'PASS: offer privacy, allocation, driver correction, no-op dedupe, trip events, invoice approval/link, invalid phone' as result;

rollback;
