-- Remove per-invoice notification configuration from merchant_invoices.
--
-- Product decision: notification behavior is NOT a per-invoice concern. It will
-- become a store-wide setting later (likely backed by BTCPay Email Rules / SMTP)
-- under Store Settings. Until then the invoice feature should not carry the
-- fields at all rather than accumulate dead columns.
--
-- These two columns were introduced with merchant_invoices in
-- 20260821120000_create_merchant_invoices and only ever WRITTEN by the
-- create-btcpay-invoice edge function — nothing read them. They were never
-- forwarded to BTCPay either (Greenfield v1 on the deployed 2.4.3 has no
-- per-invoice notification URL/email field at all), and nothing in Hachisu ever
-- dereferenced the URL. Confirmed before dropping: no views, indexes, RLS
-- policies, or constraints reference either column, and the feature has not
-- shipped to users, so there is no data worth preserving.
--
-- buyer_email is intentionally NOT touched — it remains valid invoice metadata
-- and is still forwarded to BTCPay as metadata.buyerEmail.

alter table public.merchant_invoices
  drop column if exists notification_url,
  drop column if exists notification_email;
