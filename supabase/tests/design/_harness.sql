-- A06 (Insecure Design) regression harness.
--
-- Reproduces the security-relevant slice of the Hachisu schema on a bare
-- PostgreSQL so the user_profiles write surface and the on-chain operation lock
-- can be exercised exactly the way Supabase enforces them:
--   * auth.uid() reads request.jwt.claims->>'sub' (identical to Supabase GoTrue)
--   * `authenticated` is a PUBLIC member holding Supabase's default table grants
--   * the table owner (postgres) seeds rows bypassing RLS, mirroring the
--     service-role writes performed by the edge functions
--
-- Two tenants are seeded: an ATTACKER and a VICTIM merchant.
--
-- This file sets up schema + seed only. A grants file and then an attack file
-- are run on top of it.

set client_min_messages = warning;

drop schema if exists auth cascade;
create schema auth;

create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

drop table if exists public.btcpay_store_provisioning_events cascade;
drop table if exists public.merchant_stores cascade;
drop table if exists public.user_profiles cascade;

-- user_profiles: the profile-hub columns the client legitimately edits, plus the
-- server-owned "default store summary" the edge functions write.
create table public.user_profiles (
  id uuid primary key,
  email text not null,
  account_type text not null,
  onboarding_status text not null default 'started',
  onboarding_completed boolean not null default false,
  username text unique,
  display_name text,
  full_name text,
  phone text,
  country text,
  personal_address text,
  business_name text,
  business_address text,
  business_website text,
  business_country text,
  business_description text,
  expected_monthly_volume text,
  -- server-owned summary
  btcpay_user_id text,
  btcpay_store_id text,
  btcpay_store_name text,
  store_provisioning_status text not null default 'not_started',
  wallet_status text not null default 'not_connected',
  lightning_status text not null default 'not_connected',
  lightning_provider text,
  onchain_status text not null default 'not_connected',
  onchain_provider text,
  store_count integer not null default 0,
  has_stores boolean not null default false,
  default_merchant_store_id uuid,
  wallet_address text,
  wallet_connected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index user_profiles_btcpay_store_id_unique
  on public.user_profiles (btcpay_store_id)
  where btcpay_store_id is not null;

create table public.merchant_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  btcpay_store_id text not null,
  name text not null,
  onchain_status text not null default 'not_connected',
  wallet_status text not null default 'store_created',
  onchain_enabled boolean not null default false,
  onchain_label text,
  lightning_status text not null default 'not_connected',
  onchain_operation text not null default 'none',
  onchain_operation_started_at timestamptz,
  onchain_operation_token uuid,
  onchain_scheme_fingerprint text,
  is_default boolean not null default false
);
create unique index merchant_stores_btcpay_store_id_unique
  on public.merchant_stores (btcpay_store_id);

create table public.btcpay_store_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  status text not null,
  btcpay_store_id text,
  created_at timestamptz not null default now()
);

-- Faithful to production: a BEFORE UPDATE trigger stamps updated_at. Column-level
-- UPDATE privileges are checked against the statement's SET list, not against
-- what a trigger writes, but the trigger is present so the test proves that.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.merchant_stores enable row level security;
alter table public.btcpay_store_provisioning_events enable row level security;

-- Policies that are NOT under test here (fixed by A01) stay in their final form.
create policy "profiles_select_own" on public.user_profiles for select
  using (auth.uid() = id);
create policy "profiles_insert_own" on public.user_profiles for insert
  with check (auth.uid() = id);
create policy "profiles_update_own" on public.user_profiles for update
  using (auth.uid() = id);

create policy "merchant_stores_select_own" on public.merchant_stores for select
  using (auth.uid() = user_id);
create policy "provisioning_events_select_own" on public.btcpay_store_provisioning_events
  for select using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.merchant_stores to anon, authenticated;
grant select on public.btcpay_store_provisioning_events to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed: attacker + victim, as the service role would have written them.
-- ---------------------------------------------------------------------------
insert into public.user_profiles (id, email, account_type, btcpay_store_id, btcpay_store_name,
                                  store_provisioning_status, wallet_status, onchain_status,
                                  store_count, has_stores)
values
  ('11111111-1111-1111-1111-111111111111', 'attacker@example.test', 'business',
   'btcpay-attacker-default', 'Attacker Store', 'active', 'store_created', 'not_connected', 1, true),
  ('22222222-2222-2222-2222-222222222222', 'victim@example.test', 'business',
   'btcpay-victim-default', 'Victim Store', 'active', 'payment_destination_connected', 'connected', 2, true);

insert into public.merchant_stores (id, user_id, btcpay_store_id, name, onchain_status, wallet_status, is_default)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'btcpay-attacker-default', 'Attacker Store', 'not_connected', 'store_created', true),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'btcpay-victim-default', 'Victim Store', 'connected', 'payment_destination_connected', true),
  -- The victim's SECOND store. Its BTCPay id is published in that merchant's Pay
  -- Button HTML / POS links, and no user_profiles row mirrors it, so the unique
  -- index on user_profiles.btcpay_store_id does not stand in the attacker's way.
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'btcpay-victim-second', 'Victim Store — Online', 'connected', 'payment_destination_connected', false);

insert into public.btcpay_store_provisioning_events (user_id, event_type, status, btcpay_store_id)
values
  ('11111111-1111-1111-1111-111111111111', 'store_created', 'ok', 'btcpay-attacker-default'),
  ('22222222-2222-2222-2222-222222222222', 'store_created', 'ok', 'btcpay-victim-default'),
  ('22222222-2222-2222-2222-222222222222', 'store_created', 'ok', 'btcpay-victim-second');
