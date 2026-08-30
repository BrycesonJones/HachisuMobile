-- Security fix (OWASP A06:2025 Insecure Design / CWE-642, CWE-807, CWE-501,
-- CWE-451): make the SERVER-OWNED columns of public.user_profiles genuinely
-- server-owned.
--
-- WHY
-- ---
-- user_profiles is deliberately client-writable: the profile hub edits name,
-- phone, address, business details and onboarding state directly from the app.
-- But the SAME row also carries the "default store summary" the edge functions
-- and the dashboard treat as server facts — btcpay_store_id, btcpay_user_id,
-- btcpay_store_name, default_merchant_store_id, store_count, has_stores,
-- wallet_address, wallet_connected and the *_status columns.
--
-- RLS is row-scoped, not column-scoped. `profiles_update_own` only asserts
-- auth.uid() = id, so the owner could rewrite ANY column of their own row via
-- PostgREST. That turned two of those columns into privileged inputs:
--
--   1. delete-account collected user_profiles.btcpay_store_id and passed it to
--      Greenfield DELETE /api/v1/stores/{id}. Hachisu's BTCPay credential is
--      server-wide — it can see and delete EVERY merchant's store. An attacker
--      who set their own btcpay_store_id to a VICTIM merchant's store id (those
--      ids are published verbatim in that merchant's Pay Button HTML and POS
--      links) and then closed their own account made Hachisu permanently delete
--      the victim's store: wallet configuration, POS apps, Pay Button and the
--      ability to take payment at all. The partial unique index on
--      user_profiles.btcpay_store_id only shields a victim's DEFAULT store, so
--      any merchant's second or later store was a valid target.
--
--   2. The dashboard's wallet/store status is rendered from this summary, so a
--      forged wallet_status / onchain_status / wallet_connected value could make
--      the app assert a payment destination is connected when none is.
--
-- Ownership of a value has to be established where the value is written, not
-- re-litigated at every reader. So the client keeps exactly the columns it
-- legitimately edits and loses the rest.
--
-- HOW
-- ---
-- Column-level INSERT/UPDATE grants. RLS still restricts WHICH row (auth.uid()
-- = id); the grants now restrict WHICH COLUMNS. The service role used by the
-- edge functions has its own grants and BYPASSRLS, so every server write —
-- syncUserStoreSummary in particular — is unaffected.
--
-- The client's real write path is an UPSERT (`insert ... on conflict (id) do
-- update set ...`), which needs both INSERT and UPDATE on each column it names,
-- including `id`; both are granted. `id` cannot be pointed at another user:
-- `profiles_update_own` declares no WITH CHECK, so PostgreSQL applies the USING
-- expression to the new row as well.
--
-- Regression coverage: supabase/tests/design/ (see README) — RED against the
-- table-level grants, GREEN against these column grants.

-- Deny by default, then re-grant exactly the profile-hub surface. SELECT is
-- unchanged: reading your own row was never the problem.
revoke insert, update, delete on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;

grant insert (
  id,
  email,
  account_type,
  onboarding_status,
  onboarding_completed,
  username,
  display_name,
  full_name,
  phone,
  country,
  personal_address,
  business_name,
  business_address,
  business_website,
  business_country,
  business_description,
  expected_monthly_volume
) on public.user_profiles to authenticated;

grant update (
  id,
  email,
  account_type,
  onboarding_status,
  onboarding_completed,
  username,
  display_name,
  full_name,
  phone,
  country,
  personal_address,
  business_name,
  business_address,
  business_website,
  business_country,
  business_description,
  expected_monthly_volume
) on public.user_profiles to authenticated;

-- NOT granted, and therefore server-owned from here on:
--   btcpay_user_id, btcpay_store_id, btcpay_store_name,
--   store_provisioning_status, wallet_status,
--   lightning_status, lightning_provider,
--   onchain_status, onchain_provider,
--   store_count, has_stores, default_merchant_store_id,
--   wallet_address, wallet_connected,
--   created_at, updated_at
