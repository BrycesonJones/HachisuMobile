-- The FIXED write policies (mirrors migration 20260829120000_lock_down_merchant_write_policies.sql).
-- The mobile client never writes these tables directly — every create/update
-- flows through a service-role edge function, which bypasses RLS. So the client
-- gets SELECT-only: the INSERT and UPDATE policies are removed, and with RLS
-- enabled and no write policy present, all client INSERT/UPDATE are denied by
-- default. This makes the BTCPay routing identifiers genuinely server-controlled.

create policy "merchant_stores_select_own"
  on public.merchant_stores for select
  using (auth.uid() = user_id);

create policy "merchant_pos_apps_select_own"
  on public.merchant_pos_apps for select
  using (auth.uid() = user_id);

-- Defense-in-depth revoke (mirrors the migration).
revoke insert, update, delete on public.merchant_stores from authenticated;
revoke insert, update, delete on public.merchant_pos_apps from authenticated;
