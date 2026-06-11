-- Phase 1.5: multi-store support.
--
-- Phase 1 stored a single btcpay_store_id on user_profiles. A merchant can have
-- multiple stores/locations (e.g. "Bryceson LLC - Atlanta", "- Online"), so we
-- introduce a proper public.merchant_stores table. The user_profiles BTCPay
-- columns are KEPT as a "default store summary" for backward compatibility and
-- are kept in sync with the user's default store by the edge function.

create table if not exists public.merchant_stores (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid references public.user_profiles (id) on delete cascade,

  name text not null,
  display_name text,
  default_currency text not null default 'USD',
  preferred_price_source text not null default 'kraken',

  btcpay_store_id text not null,
  btcpay_store_name text,

  store_provisioning_status text not null default 'active',
  wallet_status text not null default 'store_created',

  lightning_status text not null default 'not_connected',
  lightning_provider text,

  onchain_status text not null default 'not_connected',
  onchain_provider text,

  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_stores_store_provisioning_status_check
    check (store_provisioning_status in ('provisioning', 'active', 'failed')),
  constraint merchant_stores_wallet_status_check
    check (wallet_status in ('not_connected', 'store_created', 'payment_destination_connected', 'error')),
  constraint merchant_stores_lightning_status_check
    check (lightning_status in ('not_connected', 'connected', 'error')),
  constraint merchant_stores_lightning_provider_check
    check (lightning_provider is null or lightning_provider in ('strike', 'external_node')),
  constraint merchant_stores_onchain_status_check
    check (onchain_status in ('not_connected', 'connected', 'error')),
  constraint merchant_stores_onchain_provider_check
    check (onchain_provider is null or onchain_provider in ('xpub', 'descriptor', 'external_wallet'))
);

create index if not exists merchant_stores_user_id_idx
  on public.merchant_stores (user_id);

create unique index if not exists merchant_stores_btcpay_store_id_unique
  on public.merchant_stores (btcpay_store_id);

-- At most one default store per user.
create unique index if not exists merchant_stores_one_default_per_user
  on public.merchant_stores (user_id)
  where is_default = true;

create trigger merchant_stores_updated_at
  before update on public.merchant_stores
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-only. Provisioning writes happen from the edge
-- function via the service role, which bypasses RLS.
alter table public.merchant_stores enable row level security;

drop policy if exists "merchant_stores_select_own" on public.merchant_stores;
create policy "merchant_stores_select_own"
  on public.merchant_stores for select
  using (auth.uid() = user_id);

drop policy if exists "merchant_stores_insert_own" on public.merchant_stores;
create policy "merchant_stores_insert_own"
  on public.merchant_stores for insert
  with check (auth.uid() = user_id);

drop policy if exists "merchant_stores_update_own" on public.merchant_stores;
create policy "merchant_stores_update_own"
  on public.merchant_stores for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
