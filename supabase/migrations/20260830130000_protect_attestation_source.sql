-- Security hardening (OWASP A06:2025 Insecure Design / CWE-693, CWE-657):
-- protect the table that the A06-01 fix now depends on.
--
-- WHY
-- ---
-- 20260830120000 made the user_profiles BTCPay summary columns server-owned, and
-- delete-account now admits a profile-supplied store id ONLY when
-- public.btcpay_store_provisioning_events attests that the store was provisioned
-- for that user. That promotes the events table from an audit log into a
-- load-bearing authorization input: forge a row there and the cross-tenant
-- store-deletion path re-opens.
--
-- Today the table is safe. RLS is enabled with a single select-own policy and no
-- INSERT/UPDATE/DELETE policy, so client writes match zero rows. Verified live
-- against production before this migration: INSERT blocked by grant, UPDATE and
-- DELETE affected 0 rows, SELECT returned 0 rows for a non-owner.
--
-- But that safety rests on ONE layer — the absence of a policy — while the
-- underlying UPDATE/DELETE grants to anon/authenticated still exist. A single
-- future migration adding a permissive policy (or a broad `for all` policy) would
-- silently re-open a Critical finding, with nothing else standing in the way.
-- 20260829120000 established the rule for exactly this situation: revoke the
-- privilege so the table stays deny-by-default even if a policy is added back by
-- mistake. That rule now applies here with more force than anywhere else.
--
-- The client never writes this table: every row is inserted by an edge function
-- through the service role, which bypasses RLS and holds its own grants. Owner
-- SELECT (the diagnostics read) is deliberately untouched.

revoke insert, update, delete on public.btcpay_store_provisioning_events
  from anon, authenticated;

-- The replacement-flow tables are the same shape and the same argument: the
-- staged wallet replacement trusts the preview record and the idempotency row to
-- decide whether a wallet change may proceed and whether it has already been
-- applied. Both are written exclusively by the service role.
revoke insert, update, delete on public.onchain_wallet_replacement_previews
  from anon, authenticated;
revoke insert, update, delete on public.onchain_wallet_replacement_ops
  from anon, authenticated;
