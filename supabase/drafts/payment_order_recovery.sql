-- Testing only. Never discard uncertain provider orders or change booking/payment amounts.
begin;
alter table public.cwd_checkout_orders add column provider_attempted_at timestamptz;
update public.cwd_checkout_orders set provider_attempted_at=created_at;
alter table public.cwd_checkout_orders alter column provider_attempted_at set default now();
create function public.cwd_checkout_claim_order_retry(p_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.cwd_checkout_orders set provider_attempted_at=now()
 where id=p_id and state='creating' and razorpay_order_id is null
 and provider_attempted_at<now()-interval '60 seconds';
 return found;
end $$;
revoke all on function public.cwd_checkout_claim_order_retry(uuid) from public,anon,authenticated;
grant execute on function public.cwd_checkout_claim_order_retry(uuid) to service_role;
notify pgrst,'reload schema';
commit;
