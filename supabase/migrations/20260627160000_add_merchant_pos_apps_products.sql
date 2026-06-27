-- POS app product menu. Stored as a JSONB array on the app row (the menu is
-- always edited + saved as a whole on the Update POS page, and mirrors BTCPay's
-- app template). The update-btcpay-pos-app edge function writes both this column
-- and the BTCPay app template.
alter table public.merchant_pos_apps
  add column if not exists products jsonb not null default '[]'::jsonb;
