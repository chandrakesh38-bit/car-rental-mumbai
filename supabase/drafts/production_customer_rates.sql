-- Authorized customer catalogue rollout: explicit values from testing. Vendor cards and booked fares untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.with_driver_rates ADD COLUMN IF NOT EXISTS outstation_extra_km_rate numeric CHECK(outstation_extra_km_rate>=0);
UPDATE public.with_driver_rates r SET outstation_rate_per_km=v.base, outstation_extra_km_rate=v.extra,local_extra_km_rate=v.base,local_pkg_8hr_80km=v.local_base,local_extra_hour_rate=v.hour,customer_night_charge=v.night
FROM (VALUES
('Hyundai Aura',18,19,3500,180,500),
('Maruti Suzuki Dzire',18,19,3500,180,500),
('Maruti Suzuki Ertiga',20,21,3800,250,500),
('Kia Carens',22,24,4000,250,500),
('Toyota Innova Crysta',27,28,5000,375,500),
('WagonR',10,11,3000,140,300)
) v(name,base,extra,local_base,hour,night) WHERE r.full_name=v.name AND r.is_active=true;
UPDATE public.pricing_rules SET rule_value=300 WHERE rule_name='Minimum Outstation KM/Day';
NOTIFY pgrst,'reload schema';
COMMIT;
