-- Phase 1: BTCPay store provisioning + wallet/store status.
--
-- HachisuMobile stores all business-profile data inline on public.user_profiles
-- (there is no separate `businesses` table). Per the "update, don't duplicate"
-- rule we extend user_profiles with the BTCPay store + payment-destination status
-- columns instead of creating a parallel table. The audit/event table references
-- user_profiles(id) as the business id.
--
-- All new columns are additive and nullable (or have safe defaults) so existing
-- rows remain valid. No secrets (Greenfield API key) are ever stored here.

-- 1. Status / BTCPay columns on user_profiles ------------------------------------

alter table public.user_profiles
  -- Optional merchant-facing display name (falls back to business_name when null).
  add column if not exists display_name text,

  -- BTCPay Greenfield identifiers (never the API key).
  add column if not exists btcpay_user_id text,
  add column if not exists btcpay_store_id text,
  add column if not exists btcpay_store_name text,

  -- Store provisioning lifecycle.
  add column if not exists store_provisioning_status text not null default 'not_started',
  add column if not exists wallet_status text not null default 'not_connected',

  -- Lightning payment destination (Phase 2+: strike / external_node).
  add column if not exists lightning_status text not null default 'not_connected',
  add column if not exists lightning_provider text,

  -- On-chain payment destination (Phase 2+: xpub / descriptor / external_wallet).
  add column if not exists onchain_status text not null default 'not_connected',
  add column if not exists onchain_provider text;

-- Enum-like guards. Use NOT VALID-free simple checks; values match the app model.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_store_provisioning_status_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_store_provisioning_status_check
      check (store_provisioning_status in ('not_started', 'provisioning', 'active', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_wallet_status_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_wallet_status_check
      check (wallet_status in ('not_connected', 'store_created', 'payment_destination_connected', 'error'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_lightning_status_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_lightning_status_check
      check (lightning_status in ('not_connected', 'connected', 'error'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_lightning_provider_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_lightning_provider_check
      check (lightning_provider is null or lightning_provider in ('strike', 'external_node'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_onchain_status_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_onchain_status_check
      check (onchain_status in ('not_connected', 'connected', 'error'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_onchain_provider_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_onchain_provider_check
      check (onchain_provider is null or onchain_provider in ('xpub', 'descriptor', 'external_wallet'));
  end if;
end $$;

-- Only one BTCPay store per business. Partial unique index ignores nulls so
-- un-provisioned profiles don't collide.
create unique index if not exists user_profiles_btcpay_store_id_key
  on public.user_profiles (btcpay_store_id)
  where btcpay_store_id is not null;

-- 2. Provisioning audit/event table ---------------------------------------------

create table if not exists public.btcpay_store_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.user_profiles (id) on delete cascade,

  event_type text not null,
  status text not null,
  message text,
  btcpay_store_id text,
  raw_error jsonb,

  created_at timestamptz not null default now()
);

create index if not exists btcpay_store_provisioning_events_user_id_idx
  on public.btcpay_store_provisioning_events (user_id);

create index if not exists btcpay_store_provisioning_events_created_at_idx
  on public.btcpay_store_provisioning_events (created_at desc);

-- 3. Row Level Security ----------------------------------------------------------
-- user_profiles RLS already enforces self-only select/insert/update (created in
-- 20260524043719_create_user_profiles.sql). Provisioning writes happen from the
-- edge function using the service role, which bypasses RLS.

alter table public.btcpay_store_provisioning_events enable row level security;

-- Users may read only their own provisioning events. There is intentionally no
-- INSERT/UPDATE/DELETE policy for authenticated users: only the service role
-- (which bypasses RLS) writes events. This prevents one merchant from reading or
-- forging another merchant's BTCPay store metadata.
drop policy if exists "provisioning_events_select_own" on public.btcpay_store_provisioning_events;
create policy "provisioning_events_select_own"
  on public.btcpay_store_provisioning_events for select
  using (auth.uid() = user_id);
