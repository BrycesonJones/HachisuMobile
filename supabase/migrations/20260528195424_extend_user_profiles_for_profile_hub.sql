-- Additive: extend public.user_profiles with profile-hub columns.
-- All new columns are nullable so existing rows remain valid.
-- Sensitive verification fields (SSN, DOB, EIN) are intentionally NOT stored here.

alter table public.user_profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists personal_address text,
  add column if not exists business_name text,
  add column if not exists business_address text,
  add column if not exists business_website text,
  add column if not exists business_country text,
  add column if not exists business_description text,
  add column if not exists expected_monthly_volume text,
  add column if not exists wallet_address text,
  add column if not exists wallet_connected boolean not null default false,
  add column if not exists onboarding_completed boolean not null default false;
