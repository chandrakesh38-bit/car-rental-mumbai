-- Run only against the disposable codex_vendor_otp_test_20261009 schema.
-- Its minimal vendor/challenge fixtures and a schema-qualified copy of the
-- migration must be installed in the existing testing database first.
-- No provider calls. Roll back all test changes; never target production tables.
begin;
do $$
declare
 result jsonb;
 v_id uuid;
 v_mobile text;
 i integer;
begin
 if has_function_privilege('anon',
  'codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(uuid,text,text,text)','execute')
 or has_function_privilege('authenticated',
  'codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(uuid,text,text,text)','execute')
 or not has_function_privilege('service_role',
  'codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(uuid,text,text,text)','execute') then
  raise exception 'Incorrect reservation execution privileges';
 end if;
 update codex_vendor_otp_test_20261009.cwd_vendor_app_login_challenges
  set created_at=clock_timestamp()-interval '2 hours';
 for i in 1..5 loop
  result:=codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(
   '00000000-0000-4000-8000-000000000001','9876543210',repeat('e',64),repeat(md5('mobile-test-'||i),2));
  if result->>'code'<>'reserved' then raise exception 'Mobile request % rejected: %',i,result; end if;
  update codex_vendor_otp_test_20261009.cwd_vendor_app_login_challenges
   set created_at=clock_timestamp()-interval '1 minute'
   where challenge_hash=repeat(md5('mobile-test-'||i),2);
 end loop;
 result:=codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(
  '00000000-0000-4000-8000-000000000001','9876543210',repeat('e',64),repeat('f',64));
 if result->>'code'<>'rate_limited' then raise exception 'Sixth mobile request accepted'; end if;
 for i in 1..21 loop
  v_id:=gen_random_uuid();v_mobile:='9'||lpad(i::text,9,'0');
  insert into codex_vendor_otp_test_20261009.cwd_vendors values(v_id,v_mobile,'approved');
  result:=codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(
   v_id,v_mobile,repeat('d',64),repeat(md5('ip-test-'||i),2));
  if (i<=20 and result->>'code'<>'reserved') or (i=21 and result->>'code'<>'rate_limited') then
   raise exception 'Incorrect IP quota at request %: %',i,result;
  end if;
 end loop;
 update codex_vendor_otp_test_20261009.cwd_vendors set status='suspended'
  where id='00000000-0000-4000-8000-000000000001';
 result:=codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(
  '00000000-0000-4000-8000-000000000001','9876543210',repeat('e',64),repeat('f',64));
 if result->>'code'<>'not_approved' then raise exception 'Suspended vendor admitted'; end if;
 result:=codex_vendor_otp_test_20261009.cwd_vendor_app_reserve_otp(
  null,'9876543210',repeat('e',64),repeat('f',64));
 if result->>'code'<>'invalid' then raise exception 'Invalid input accepted'; end if;
 if exists(select 1 from codex_vendor_otp_test_20261009.cwd_vendor_app_login_challenges
  where msg91_req_id<>'pending' or expires_at>clock_timestamp()) then
  raise exception 'Reservation became a usable OTP without provider verification';
 end if;
end $$;
select 'PASS: mobile/IP quota, admission, expired reservation and least privilege' as result;
rollback;
