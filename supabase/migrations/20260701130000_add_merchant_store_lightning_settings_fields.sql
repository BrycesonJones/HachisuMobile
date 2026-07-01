-- Lightning wallet settings (mobile Lightning Settings screen).
--
-- Mirrors the on-chain settings model. Merchants can toggle their store's
-- Lightning (Boltz) payment method on/off and edit the invoice description
-- template without disconnecting. BTCPay remains the source of truth; these
-- columns cache the last-known values for the store list / indicators.
--
-- lightning_enabled: whether the BTC-LN payment method is enabled at BTCPay.
--   A configured-but-disabled connection stays lightning_status='connected'
--   (it still has a connection) but won't accept payments until re-enabled.
-- lightning_label: reserved merchant-facing label (parity with onchain_label).
-- lightning_description_template: the store's Lightning invoice description
--   template (BTCPay store field lightningDescriptionTemplate). Non-sensitive.

alter table public.merchant_stores
  add column if not exists lightning_enabled boolean not null default true,
  add column if not exists lightning_label text,
  add column if not exists lightning_description_template text;
