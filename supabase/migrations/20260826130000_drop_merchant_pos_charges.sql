-- Phase 2 review follow-up (Option B): Hachisu configures the POS mode, BTCPay
-- owns the POS runtime. The native Quick Charge path (create-btcpay-pos-charge
-- + this claim table) was removed before any use — the table was confirmed
-- empty at drop time. Phase 4's Open POS / Show POS QR will resolve the
-- authoritative BTCPay Light keypad instead.
--
-- The pos_style constraint extension from 20260826120000 is deliberately KEPT:
-- 'quick-charge' remains a valid persisted mode (mapped to defaultView 'Light').

drop table if exists public.merchant_pos_charges;

-- The guard raises if the drop ever runs against a database where the drop was
-- skipped: merchant_pos_apps must still accept 'quick-charge'.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'merchant_pos_apps_pos_style_check'
      and pg_get_constraintdef(oid) like '%quick-charge%'
  ) then
    raise exception 'pos_style constraint must keep quick-charge';
  end if;
end $$;
