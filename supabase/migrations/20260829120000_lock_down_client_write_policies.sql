-- Security fix (OWASP A01 / CWE-639, CWE-284, CWE-285, CWE-732, CWE-862):
-- make the merchant tables SELECT-only for the mobile client.
--
-- WHY
-- ---
-- Every BTCPay edge function authorizes by resolving the merchant_stores /
-- merchant_pos_apps row for the authenticated user and then trusting the
-- server-managed identifier columns on that row — btcpay_store_id,
-- btcpay_app_id, merchant_store_id — plus the on-chain wallet-replacement
-- safety primitives (onchain_operation, onchain_operation_token,
-- onchain_scheme_fingerprint) and the *_status columns. The whole model assumes
-- those columns are server-controlled.
--
-- They were not. The original policies (20260611124441_create_merchant_stores,
-- 20260627150000_create_merchant_pos_apps) granted the authenticated OWNER
-- INSERT and UPDATE on their own rows, checking only auth.uid() = user_id.
-- RLS is row-scoped, not column-scoped, so a user could call PostgREST directly
-- (supabase.from('merchant_stores').update({ btcpay_store_id: ... })) and
-- overwrite the exact identifiers the edge functions trust — repointing the
-- privileged BTCPay Greenfield credential at an untracked/orphaned store id, or
-- forging their own store's operation lock / status to defeat the staged
-- wallet-replacement concurrency + idempotency guards.
--
-- The mobile client never legitimately writes these tables: every create/update
-- goes through a service-role edge function, and the service role bypasses RLS.
-- So the client only needs SELECT. Removing the INSERT/UPDATE policies makes the
-- identifier columns genuinely server-controlled (deny-by-default: RLS is on and
-- no write policy remains), matching the already-correct SELECT-only shape of
-- merchant_invoices / merchant_payment_requests.
--
-- Regression coverage: supabase/tests/rls/ (see README) — RED against the old
-- policies, GREEN against this migration.

-- merchant_stores: drop client write policies, keep owner SELECT.
drop policy if exists "merchant_stores_insert_own" on public.merchant_stores;
drop policy if exists "merchant_stores_update_own" on public.merchant_stores;

-- merchant_pos_apps: drop client write policies, keep owner SELECT.
drop policy if exists "merchant_pos_apps_insert_own" on public.merchant_pos_apps;
drop policy if exists "merchant_pos_apps_update_own" on public.merchant_pos_apps;

-- Defense-in-depth: revoke the underlying write privileges from the client roles
-- so these tables stay deny-by-default even if a permissive policy is ever added
-- back by mistake. The service role (used by the edge functions) has its own
-- grants and BYPASSRLS, so provisioning writes are unaffected.
revoke insert, update, delete on public.merchant_stores from anon, authenticated;
revoke insert, update, delete on public.merchant_pos_apps from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Least-privilege hardening for the legacy user_address_balances table.
--
-- This table (20260524044621) predates the BTCPay pipeline; live balances are
-- now BTCPay-derived and store-scoped, and no application code reads it (only a
-- generated type remains). Its policies still granted the owner INSERT/UPDATE/
-- DELETE on a numeric address_balance column — a latent balance-forgery vector.
-- Lock it to SELECT-only to match every other client-readable table. Writes (if
-- the table is ever revived) must go through a trusted server path.
-- ---------------------------------------------------------------------------
drop policy if exists "balances_insert_own" on public.user_address_balances;
drop policy if exists "balances_update_own" on public.user_address_balances;
drop policy if exists "balances_delete_own" on public.user_address_balances;
revoke insert, update, delete on public.user_address_balances from anon, authenticated;
