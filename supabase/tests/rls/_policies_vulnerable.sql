-- The CURRENT (pre-fix) write policies, copied verbatim from:
--   20260611124441_create_merchant_stores.sql
--   20260627150000_create_merchant_pos_apps.sql
-- These allow an authenticated owner to write EVERY column of their own row,
-- including the server-managed BTCPay routing identifiers and on-chain
-- operation-lock fields. Used to demonstrate RED.

create policy "merchant_stores_select_own"
  on public.merchant_stores for select
  using (auth.uid() = user_id);
create policy "merchant_stores_insert_own"
  on public.merchant_stores for insert
  with check (auth.uid() = user_id);
create policy "merchant_stores_update_own"
  on public.merchant_stores for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "merchant_pos_apps_select_own"
  on public.merchant_pos_apps for select
  using (auth.uid() = user_id);
create policy "merchant_pos_apps_insert_own"
  on public.merchant_pos_apps for insert
  with check (auth.uid() = user_id);
create policy "merchant_pos_apps_update_own"
  on public.merchant_pos_apps for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
