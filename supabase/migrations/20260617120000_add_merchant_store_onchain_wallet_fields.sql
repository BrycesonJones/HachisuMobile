-- Phase 2 (on-chain): per-store Bitcoin on-chain wallet connection.
--
-- Each merchant_stores row maps to one BTCPay store and connects its OWN on-chain
-- wallet via an extended public key / output descriptor. We already track
-- onchain_status + onchain_provider; this migration adds non-sensitive metadata
-- captured when a wallet is connected, and widens onchain_status to allow a
-- transient 'pending_confirmation' state during the connect flow.
--
-- We NEVER store private keys or seed phrases. The extended public key itself is
-- submitted to BTCPay (NBXplorer) and is not persisted here.

alter table public.merchant_stores
  add column if not exists onchain_address_type text,
  add column if not exists onchain_wallet_configured_at timestamptz;

-- Widen the onchain_status allow-list to include 'pending_confirmation'.
alter table public.merchant_stores
  drop constraint if exists merchant_stores_onchain_status_check;
alter table public.merchant_stores
  add constraint merchant_stores_onchain_status_check
    check (onchain_status in ('not_connected', 'pending_confirmation', 'connected', 'error'));
