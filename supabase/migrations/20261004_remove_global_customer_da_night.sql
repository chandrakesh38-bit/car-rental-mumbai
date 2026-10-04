begin;

-- Vehicle-specific customer commercial terms are the source of truth.
-- The night charge column is added separately and seeded before removing legacy globals.
delete from public.pricing_rules
where lower(rule_name) in (
  lower('Customer Driver Allowance / Day'),
  lower('Customer Night Charge')
);

commit;
