-- Phase 1 (Lightning / Boltz): per-store Lightning via the BTCPay Boltz plugin.
--
-- Hachisu abstracts BTCPay's "connect a Lightning node" choice away from the
-- merchant: every store uses Boltz (submarine swaps to Liquid / L-BTC). The
-- connection flow gains intermediate states between not_connected and connected:
--   not_connected  -> boltz_ready      (plugin available for the store)
--                  -> pending_lbtc_wallet (Boltz selected; awaiting L-BTC descriptor)
--                  -> connected        (L-BTC descriptor imported; BTC-LN enabled)
--                  -> error
--
-- We NEVER store wallet seeds, private keys, or the full L-BTC descriptor here.
-- Only non-sensitive status + metadata (provider, timestamp, safe error message).

-- 1. Non-sensitive metadata columns (lightning_provider already exists).
alter table public.merchant_stores
  add column if not exists lightning_configured_at timestamptz,
  add column if not exists lightning_error text;

-- 2. Widen the lightning_status allow-list to include the Boltz transitional
--    states. Existing rows keep their value (not_connected/connected/error are
--    still permitted), so connected Lightning stores are never disturbed.
alter table public.merchant_stores
  drop constraint if exists merchant_stores_lightning_status_check;
alter table public.merchant_stores
  add constraint merchant_stores_lightning_status_check
    check (lightning_status in (
      'not_connected',
      'boltz_ready',
      'pending_lbtc_wallet',
      'connected',
      'error'
    ));

-- 3. Allow 'boltz' as a lightning_provider (keep strike/external_node for back-compat).
alter table public.merchant_stores
  drop constraint if exists merchant_stores_lightning_provider_check;
alter table public.merchant_stores
  add constraint merchant_stores_lightning_provider_check
    check (lightning_provider is null or lightning_provider in (
      'strike',
      'external_node',
      'boltz'
    ));

-- 4. user_profiles caches the DEFAULT store's lightning summary (written by
--    syncUserStoreSummary). Its check constraints must accept the same widened
--    sets, or syncing a default store that is mid-Boltz-setup would fail.
do $$
begin
  alter table public.user_profiles
    drop constraint if exists user_profiles_lightning_status_check;
  alter table public.user_profiles
    add constraint user_profiles_lightning_status_check
    check (lightning_status in (
      'not_connected',
      'boltz_ready',
      'pending_lbtc_wallet',
      'connected',
      'error'
    ));

  alter table public.user_profiles
    drop constraint if exists user_profiles_lightning_provider_check;
  alter table public.user_profiles
    add constraint user_profiles_lightning_provider_check
    check (lightning_provider is null or lightning_provider in (
      'strike',
      'external_node',
      'boltz'
    ));
end $$;
