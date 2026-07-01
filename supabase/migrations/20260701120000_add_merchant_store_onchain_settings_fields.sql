-- On-chain wallet settings (mobile BTC Wallet Settings screen).
--
-- Merchants can toggle their store's on-chain payment method on/off and set a
-- label without disconnecting the wallet. BTCPay remains the source of truth;
-- these columns cache the last-known values for the store list / indicators.
--
-- onchain_enabled: whether the BTC on-chain payment method is enabled at BTCPay.
--   A configured-but-disabled wallet stays onchain_status='connected' (it still
--   has a wallet) but won't accept payments until re-enabled.
-- onchain_label: the merchant-facing label for the wallet at BTCPay.

alter table public.merchant_stores
  add column if not exists onchain_enabled boolean not null default true,
  add column if not exists onchain_label text;
