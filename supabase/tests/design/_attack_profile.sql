-- A06 attack: repoint the client-writable profile summary at a VICTIM merchant's
-- BTCPay store id, and forge the wallet/status summary the dashboard renders.
--
-- Why this matters: delete-account feeds user_profiles.btcpay_store_id into
-- Greenfield DELETE /api/v1/stores/{id} under a server-wide BTCPay credential
-- that can see and delete EVERY merchant's store. If the client can write that
-- column, closing your own account destroys someone else's store.
--
-- Each attack RAISEs when it SUCCEEDS, so psql exits non-zero on the vulnerable
-- grants (RED) and zero once the columns are server-owned (GREEN).

set client_min_messages = warning;
set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  false
);

-- Sanity: the attacker can still read their own profile (SELECT is untouched).
do $$
begin
  if not exists (select 1 from public.user_profiles
                 where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'PRECONDITION FAILED: attacker cannot read their own profile';
  end if;
end $$;

-- Attack 1: point the deletion target at the victim's second BTCPay store.
do $$
declare updated int;
begin
  begin
    update public.user_profiles
      set btcpay_store_id = 'btcpay-victim-second'
      where id = '11111111-1111-1111-1111-111111111111';
    get diagnostics updated = row_count;
  exception when insufficient_privilege then
    updated := 0;
  end;
  if updated > 0 then
    raise exception
      'ATTACK 1 SUCCEEDED: client rewrote user_profiles.btcpay_store_id to a victim store id';
  end if;
end $$;

-- Attack 2: same via UPSERT (the exact shape the mobile client uses).
do $$
declare updated int;
begin
  begin
    insert into public.user_profiles (id, email, account_type, btcpay_store_id)
    values ('11111111-1111-1111-1111-111111111111', 'attacker@example.test', 'business',
            'btcpay-victim-second')
    on conflict (id) do update set btcpay_store_id = excluded.btcpay_store_id;
    get diagnostics updated = row_count;
  exception when insufficient_privilege then
    updated := 0;
  end;
  if updated > 0 then
    raise exception
      'ATTACK 2 SUCCEEDED: client rewrote btcpay_store_id through the upsert path';
  end if;
end $$;

-- Attack 3: forge the wallet/status summary the dashboard renders (CWE-451).
do $$
declare updated int;
begin
  begin
    update public.user_profiles
      set wallet_status = 'payment_destination_connected',
          onchain_status = 'connected',
          wallet_connected = true,
          store_count = 99
      where id = '11111111-1111-1111-1111-111111111111';
    get diagnostics updated = row_count;
  exception when insufficient_privilege then
    updated := 0;
  end;
  if updated > 0 then
    raise exception
      'ATTACK 3 SUCCEEDED: client forged the server-owned wallet/status summary';
  end if;
end $$;

-- Attack 4: repoint the default store at another merchant's store row.
do $$
declare updated int;
begin
  begin
    update public.user_profiles
      set default_merchant_store_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      where id = '11111111-1111-1111-1111-111111111111';
    get diagnostics updated = row_count;
  exception when insufficient_privilege then
    updated := 0;
  end;
  if updated > 0 then
    raise exception
      'ATTACK 4 SUCCEEDED: client rewrote default_merchant_store_id';
  end if;
end $$;

-- Legitimate profile edits must still work after the fix. A regression here is
-- as much a failure as an attack succeeding.
do $$
declare updated int;
begin
  update public.user_profiles
    set full_name = 'Attacker Name',
        phone = '+15550000000',
        business_name = 'Attacker LLC',
        business_website = 'https://example.test',
        country = 'United States',
        onboarding_completed = true,
        onboarding_status = 'onboarding_complete',
        username = 'attacker'
    where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'REGRESSION: legitimate profile-hub edit was blocked';
  end if;
end $$;

-- The client's real write path is an UPSERT; it must survive column grants.
do $$
begin
  insert into public.user_profiles (id, email, account_type, onboarding_status,
                                    onboarding_completed, full_name)
  values ('11111111-1111-1111-1111-111111111111', 'attacker@example.test', 'business',
          'onboarding_complete', true, 'Attacker Name 2')
  on conflict (id) do update set
    email = excluded.email,
    account_type = excluded.account_type,
    onboarding_status = excluded.onboarding_status,
    onboarding_completed = excluded.onboarding_completed,
    full_name = excluded.full_name;
exception when insufficient_privilege then
  raise exception 'REGRESSION: the client profile UPSERT path was blocked';
end $$;

reset role;
