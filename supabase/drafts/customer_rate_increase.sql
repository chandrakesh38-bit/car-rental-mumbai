-- Testing catalogue only. Explicit targets make reruns idempotent.
begin;
alter table public.with_driver_rates add column if not exists outstation_extra_km_rate numeric check(outstation_extra_km_rate >= 0);
update public.with_driver_rates r
set outstation_rate_per_km=v.base_rate, local_extra_km_rate=v.local_extra,
    outstation_extra_km_rate=v.outstation_extra
from (values
 ('Maruti Suzuki Dzire',18,18,19),
 ('Hyundai Aura',18,18,19),
 ('Maruti Suzuki Ertiga',20,20,21),
 ('Kia Carens',22,22,24), -- Existing public XL6 alias.
 ('Toyota Innova Crysta',27,27,28)
) as v(name,base_rate,local_extra,outstation_extra)
where r.full_name=v.name and r.is_active=true;
notify pgrst,'reload schema';
commit;
