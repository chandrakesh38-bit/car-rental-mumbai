begin;

alter table public.with_driver_rates
  add column if not exists customer_night_charge numeric(12,2);

update public.with_driver_rates
set customer_night_charge = coalesce(
  customer_night_charge,
  (select rule_value from public.pricing_rules where lower(rule_name)=lower('Customer Night Charge') limit 1),
  400
);

alter table public.with_driver_rates
  alter column customer_night_charge set default 400;

alter table public.with_driver_rates
  alter column customer_night_charge set not null;

commit;
