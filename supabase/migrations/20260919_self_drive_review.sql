-- Apply after 20260919_self_drive_documents.sql. Do not apply to a remote project automatically.
begin;
alter table public.self_drive_document_files
  add column review_status text not null default 'pending' check (review_status in ('pending','approved','reupload_required')),
  add column rejection_reason text,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid,
  add column upload_revision integer not null default 0 check (upload_revision >= 0);
alter table public.self_drive_verifications
  add column upload_token_encrypted text,
  add column site_origin text,
  add column verified_at timestamptz,
  add column verified_by uuid,
  add column notification_event_id uuid,
  add column notification_kind text check (notification_kind in ('submitted','reupload','verified')),
  add column notification_sent_at timestamptz,
  add column notification_payload jsonb;
alter table public.self_drive_verifications drop constraint self_drive_verifications_status_check;
alter table public.self_drive_verifications add constraint self_drive_verifications_status_check
  check (status in ('awaiting_documents','pending_verification','reupload_required','verified','rejected'));

-- Serialize changes on the booking so stale reviews and customer uploads cannot race.
create or replace function public.sd_record_document(p_booking_id text,p_kind text,p_filename text,p_mime text,p_size integer,p_path text,p_revision integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare b self_drive_verifications; d self_drive_document_files;
begin
  select * into b from self_drive_verifications where booking_id=p_booking_id for update;
  if not found or b.status not in ('awaiting_documents','reupload_required') then raise exception 'Documents are locked'; end if;
  select * into d from self_drive_document_files where booking_id=p_booking_id and kind=p_kind for update;
  if found then
    if d.review_status='approved' then raise exception 'Approved document is locked'; end if;
    if d.review_status='pending' and d.storage_path=p_path and d.upload_revision=p_revision then return to_jsonb(d); end if;
    if d.review_status<>'reupload_required' or d.upload_revision<>p_revision then raise exception 'Document changed; refresh and retry'; end if;
    if p_path<>p_booking_id||'/'||p_kind||'/v'||p_revision then raise exception 'Invalid storage path'; end if;
    update self_drive_document_files set filename=p_filename,mime_type=p_mime,size_bytes=p_size,storage_path=p_path,
      uploaded_at=now(),review_status='pending',rejection_reason=null,reviewed_at=null,reviewed_by=null
      where booking_id=p_booking_id and kind=p_kind returning * into d;
  else
    if b.status<>'awaiting_documents' or p_revision<>0 or p_path<>p_booking_id||'/'||p_kind then raise exception 'Invalid initial document'; end if;
    insert into self_drive_document_files(booking_id,kind,filename,mime_type,size_bytes,storage_path)
      values(p_booking_id,p_kind,p_filename,p_mime,p_size,p_path) returning * into d;
  end if;
  return to_jsonb(d);
end $$;

create or replace function public.sd_submit_documents(p_booking_id text,p_alternate_phone text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare b self_drive_verifications;
begin
  select * into b from self_drive_verifications where booking_id=p_booking_id for update;
  if not found then raise exception 'Unknown booking'; end if;
  if b.status='pending_verification' then return to_jsonb(b); end if;
  if b.status not in ('awaiting_documents','reupload_required') then raise exception 'Documents are locked'; end if;
  if p_alternate_phone !~ '^[6-9][0-9]{9}$' or p_alternate_phone is null then raise exception 'Invalid alternate mobile'; end if;
  if (select count(*) from self_drive_document_files where booking_id=p_booking_id and review_status in ('pending','approved'))<>5 then raise exception 'Required documents missing'; end if;
  update self_drive_verifications set alternate_phone=p_alternate_phone,status='pending_verification',submitted_at=now(),
    notification_event_id=gen_random_uuid(),notification_kind='submitted',notification_sent_at=null,notification_payload=null
    where booking_id=p_booking_id returning * into b;
  return to_jsonb(b);
end $$;

create or replace function public.sd_review_documents(p_booking_id text,p_admin uuid,p_action text,p_decisions jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare b self_drive_verifications; d self_drive_document_files; item jsonb; has_rejection boolean:=false;
begin
  select * into b from self_drive_verifications where booking_id=p_booking_id for update;
  if not found then raise exception 'Unknown booking'; end if;
  if p_action='verify' and b.status='verified' then return to_jsonb(b); end if;
  if b.status<>'pending_verification' then raise exception 'This request is not pending review'; end if;
  if p_action='verify' then
    if (select count(*) from self_drive_document_files where booking_id=p_booking_id and review_status='approved')<>5 then raise exception 'Approve all five documents first'; end if;
    update self_drive_verifications set status='verified',verified_at=now(),verified_by=p_admin,
      notification_event_id=gen_random_uuid(),notification_kind='verified',notification_sent_at=null,notification_payload=null
      where booking_id=p_booking_id returning * into b;
    return to_jsonb(b);
  end if;
  if p_action<>'review' or jsonb_typeof(p_decisions)<>'array' or jsonb_array_length(p_decisions) not between 1 and 5 then raise exception 'Invalid review'; end if;
  for item in select * from jsonb_array_elements(p_decisions) loop
    select * into d from self_drive_document_files where booking_id=p_booking_id and kind=item->>'kind' for update;
    if not found or d.review_status<>'pending' or d.upload_revision<>(item->>'revision')::integer or item->>'revision' is null then raise exception 'Document changed or locked; refresh'; end if;
    if item->>'status' not in ('approved','reupload_required') or item->>'status' is null then raise exception 'Invalid review status'; end if;
    if item->>'status'='reupload_required' then
      if length(trim(coalesce(item->>'reason',''))) not between 1 and 2000 then raise exception 'Re-upload reason required'; end if;
      if b.upload_token_encrypted is null then raise exception 'Customer must open their existing upload link before requesting re-upload'; end if;
      has_rejection:=true;
    end if;
    update self_drive_document_files set review_status=item->>'status',
      rejection_reason=case when item->>'status'='reupload_required' then trim(item->>'reason') else null end,
      reviewed_at=now(),reviewed_by=p_admin,
      upload_revision=upload_revision+case when item->>'status'='reupload_required' then 1 else 0 end
      where booking_id=p_booking_id and kind=item->>'kind';
  end loop;
  if has_rejection then
    update self_drive_verifications set status='reupload_required',expires_at=now()+interval '7 days',
      notification_event_id=gen_random_uuid(),notification_kind='reupload',notification_sent_at=null,
      notification_payload=(select jsonb_agg(jsonb_build_object('kind',kind,'rejection_reason',rejection_reason)) from self_drive_document_files where booking_id=p_booking_id and review_status='reupload_required')
      where booking_id=p_booking_id returning * into b;
  end if;
  return to_jsonb(b);
end $$;
-- Only the already-authorized server may invoke these transactions.
revoke all on function public.sd_record_document(text,text,text,text,integer,text,integer) from public,anon,authenticated;
revoke all on function public.sd_submit_documents(text,text) from public,anon,authenticated;
revoke all on function public.sd_review_documents(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sd_record_document(text,text,text,text,integer,text,integer) to service_role;
grant execute on function public.sd_submit_documents(text,text) to service_role;
grant execute on function public.sd_review_documents(text,uuid,text,jsonb) to service_role;
commit;
