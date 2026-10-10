-- Simplify CWD vendor onboarding vehicle data collection.
-- Keep legacy columns for existing records, but allow new registrations to omit
-- insurance and PUC details. Permit/Fitness columns were already nullable.

alter table public.cwd_vendor_vehicles
  alter column insurance_policy_number drop not null,
  alter column puc_number drop not null;
