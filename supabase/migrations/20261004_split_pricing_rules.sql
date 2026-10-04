begin;

-- Reuse the old unused "Driver Night Allowance" rule as the actual
-- customer driver allowance/day control, preserving its existing row/id.
update public.pricing_rules
set rule_name = 'Customer Driver Allowance / Day',
    description = 'With Driver outstation customer driver allowance per billed day',
    rule_value = 600
where lower(rule_name) like '%driver%night%allowance%';

insert into public.pricing_rules (rule_name, rule_value, description)
select 'Customer Night Charge', 400, 'With Driver customer night charge when applicable between 10 PM and 6 AM'
where not exists (
  select 1 from public.pricing_rules where lower(rule_name) = lower('Customer Night Charge')
);

commit;
