-- Apply only to isolated testing project musjsnzcuqrxvkvyshfi.
-- Preserve the application's existing delivery defaults and 200 km/day policy.
begin;
create table if not exists public.pricing_rules (
  rule_name text primary key,
  rule_value numeric not null check (rule_value >= 0),
  description text
);
alter table public.pricing_rules enable row level security;
revoke all on public.pricing_rules from anon, authenticated;
grant select on public.pricing_rules to anon, authenticated;
grant select, insert, update, delete on public.pricing_rules to service_role;
create policy pricing_rules_public_read on public.pricing_rules
  for select to anon, authenticated using (true);
insert into public.pricing_rules (rule_name, rule_value) values
  ('Base Delivery Charge',500), ('Extra Delivery Charge Per KM',25),
  ('Free Delivery Threshold KM',25), ('Minimum Outstation KM/Day',200)
on conflict (rule_name) do nothing;
notify pgrst, 'reload schema';
commit;
