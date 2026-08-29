-- Adversarial regression: authenticate as User A (attacker) and attempt to
-- write the server-managed columns that the BTCPay edge functions trust.
--
-- Security property under test: an authenticated user must NOT be able to
-- INSERT or UPDATE these tables directly (all writes belong to service-role
-- edge functions). Each attack records blocked=true/false; if any attack was
-- ALLOWED the script RAISES, so psql exits non-zero.
--
--   RED   = run on top of _policies_vulnerable.sql -> attacks ALLOWED -> raises.
--   GREEN = run on top of _policies_fixed.sql      -> attacks BLOCKED -> passes.

set client_min_messages = notice;

-- Become User A. Identity comes only from the JWT claim, exactly as in production.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
set role authenticated;

drop table if exists results;
create temp table results(prop text, blocked boolean);

-- P1: repoint OWN store's btcpay_store_id to an untracked/orphan BTCPay id.
-- (The privileged edge functions would then operate this id under Hachisu's key.)
do $$
declare n int;
begin
  update public.merchant_stores
     set btcpay_store_id = 'ORPHAN-STORE-HIJACK'
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  insert into results values ('P1_repoint_own_btcpay_store_id', n = 0);
exception when insufficient_privilege then
  insert into results values ('P1_repoint_own_btcpay_store_id', true);
end $$;

-- P2: forge/clear the on-chain wallet-replacement operation lock on OWN store.
do $$
declare n int;
begin
  update public.merchant_stores
     set onchain_operation = 'none',
         onchain_operation_token = null,
         onchain_scheme_fingerprint = 'forged'
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  insert into results values ('P2_forge_own_operation_lock', n = 0);
exception when insufficient_privilege then
  insert into results values ('P2_forge_own_operation_lock', true);
end $$;

-- P3: forge OWN store state (claim connected / alter wallet_status).
do $$
declare n int;
begin
  update public.merchant_stores
     set onchain_status = 'connected', wallet_status = 'payment_destination_connected'
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  insert into results values ('P3_forge_own_status', n = 0);
exception when insufficient_privilege then
  insert into results values ('P3_forge_own_status', true);
end $$;

-- P4: INSERT a POS-app row owned by A but pointing btcpay_app_id at a value of
-- A's choosing (an untracked victim app id), plus arbitrary store binding.
-- With the fix, INSERT is denied by RLS (raises insufficient_privilege).
do $$
declare n int;
begin
  insert into public.merchant_pos_apps
    (id, user_id, merchant_store_id, btcpay_store_id, btcpay_app_id, app_name, status)
  values
    (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ORPHAN-STORE-X', 'ORPHAN-APP-HIJACK', 'evil', 'active');
  get diagnostics n = row_count;
  insert into results values ('P4_insert_forged_posapp', n = 0);
exception when insufficient_privilege then
  insert into results values ('P4_insert_forged_posapp', true);
end $$;

-- Verdict.
do $$
declare allowed int;
declare summary text;
begin
  select string_agg(prop || '=' || case when blocked then 'BLOCKED' else 'ALLOWED(VULNERABLE)' end, E'\n  '
                    order by prop)
    into summary from results;
  raise notice E'RLS write-lockdown results:\n  %', summary;
  select count(*) into allowed from results where not blocked;
  if allowed > 0 then
    raise exception 'RED: % client write attack(s) succeeded against server-managed columns', allowed;
  else
    raise notice 'GREEN: all client write attacks blocked';
  end if;
end $$;

reset role;
