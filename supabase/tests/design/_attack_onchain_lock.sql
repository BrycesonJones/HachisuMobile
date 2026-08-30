-- A06 attack: interleave the on-chain wallet endpoints and check whether
-- Hachisu's stored wallet state can end up disagreeing with the wallet BTCPay
-- actually routes payments to.
--
-- Every scenario RAISEs when the design permits the unsafe outcome, so psql
-- exits non-zero on the pre-fix operations (RED) and zero once every endpoint
-- shares the lock (GREEN).
--
-- These run as the table owner: the point is not "can the client write this row"
-- (A01 settled that — it cannot), it is "does the SERVER's own sequencing hold".

set client_min_messages = warning;

\set store '''bbbbbbbb-0000-0000-0000-000000000001'''
\set btcstore '''btcpay-victim-default'''

-- ---------------------------------------------------------------------------
-- Scenario 1 — remove interleaved with replace.
--
--   remove starts -> replace acquires the lock -> remove deletes at BTCPay ->
--   replace writes the NEW wallet at BTCPay and commits -> remove's DB write
--   lands last.
--
-- Unsafe outcome: BTCPay holds and routes to the replacement wallet while
-- Hachisu records "no wallet connected".
-- ---------------------------------------------------------------------------
do $$
declare
  store uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t1 uuid := gen_random_uuid();
  remove_started boolean;
  replace_locked boolean;
  remove_committed boolean;
  db_status text;
  btc_configured boolean;
  btc_scheme text;
begin
  remove_started := public.op_remove_begin(store);
  replace_locked := public.op_replace_acquire(store, t1);

  if remove_started then
    perform public.btcpay_delete('btcpay-victim-default');
  end if;
  if replace_locked then
    perform public.btcpay_put('btcpay-victim-default', 'REPLACEMENT');
    perform public.op_replace_commit(store, t1, 'REPLACEMENT');
  end if;
  if remove_started then
    remove_committed := public.op_remove_commit(store);
  end if;

  select onchain_status into db_status from public.merchant_stores where id = store;
  select configured, derivation_scheme into btc_configured, btc_scheme
    from public.btcpay_onchain where btcpay_store_id = 'btcpay-victim-default';

  if btc_configured and db_status <> 'connected' then
    raise exception
      'SCENARIO 1 UNSAFE: BTCPay routes payments to "%" but Hachisu records onchain_status=%',
      btc_scheme, db_status;
  end if;
  if (not btc_configured) and db_status = 'connected' then
    raise exception
      'SCENARIO 1 UNSAFE: Hachisu reports a connected wallet but BTCPay has none';
  end if;
end $$;

-- Reset to the steady state for the next scenario.
update public.btcpay_onchain
  set configured = true, derivation_scheme = 'ORIGINAL'
  where btcpay_store_id = 'btcpay-victim-default';
update public.merchant_stores
  set onchain_status = 'connected', wallet_status = 'payment_destination_connected',
      onchain_scheme_fingerprint = 'ORIGINAL', onchain_operation = 'none',
      onchain_operation_started_at = null, onchain_operation_token = null
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Scenario 2 — sync steals the replacement's lock.
--
-- A replacement is in flight. sync-btcpay-onchain-wallet is called (it is a
-- plain authenticated endpoint the merchant can hit at any time). If sync can
-- clear a LIVE lock, a second replacement acquires it while the first is still
-- mid-flight and two operations write the same store's BTCPay payment method.
-- ---------------------------------------------------------------------------
do $$
declare
  store uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  second_locked boolean;
begin
  if not public.op_replace_acquire(store, t1) then
    raise exception 'PRECONDITION FAILED: first replacement could not take the lock';
  end if;

  perform public.op_sync(store, true, 'ORIGINAL');

  second_locked := public.op_replace_acquire(store, t2);
  if second_locked then
    raise exception
      'SCENARIO 2 UNSAFE: sync cleared a live replacement lock, so a second replacement acquired it';
  end if;
end $$;

update public.merchant_stores
  set onchain_status = 'connected', wallet_status = 'payment_destination_connected',
      onchain_scheme_fingerprint = 'ORIGINAL', onchain_operation = 'none',
      onchain_operation_started_at = null, onchain_operation_token = null
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Scenario 3 — connect interleaved with replace.
--
-- connect's "does a wallet already exist" guard reads BTCPay, so a replacement
-- that has removed-then-rewritten the payment method leaves a window where
-- connect sees nothing configured and writes a THIRD wallet. Mutual exclusion,
-- not the BTCPay read, is what has to close that window.
-- ---------------------------------------------------------------------------
do $$
declare
  store uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t1 uuid := gen_random_uuid();
begin
  if not public.op_replace_acquire(store, t1) then
    raise exception 'PRECONDITION FAILED: replacement could not take the lock';
  end if;
  if public.op_connect_begin(store) then
    raise exception
      'SCENARIO 3 UNSAFE: connect proceeded while a replacement held the on-chain operation lock';
  end if;
end $$;

update public.merchant_stores
  set onchain_operation = 'none', onchain_operation_started_at = null,
      onchain_operation_token = null
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Scenario 4 — settings mutation interleaved with replace.
--
-- update-btcpay-onchain-wallet-settings does a GET-then-PUT of the payment
-- method that echoes the derivation scheme back. Interleaved with a replacement
-- it re-writes the OLD wallet over the new one at BTCPay, while the replacement
-- records the new wallet in the DB: payments to the retired wallet, dashboard
-- showing the new one.
-- ---------------------------------------------------------------------------
do $$
declare
  store uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t1 uuid := gen_random_uuid();
  settings_started boolean;
  btc_scheme text;
begin
  if not public.op_replace_acquire(store, t1) then
    raise exception 'PRECONDITION FAILED: replacement could not take the lock';
  end if;

  settings_started := public.op_settings_begin(store);
  if settings_started then
    -- Settings echoes back the scheme it read BEFORE the replacement landed.
    perform public.btcpay_put('btcpay-victim-default', 'ORIGINAL');
  end if;
  perform public.btcpay_put('btcpay-victim-default', 'REPLACEMENT');
  perform public.op_replace_commit(store, t1, 'REPLACEMENT');
  if settings_started then
    perform public.btcpay_put('btcpay-victim-default', 'ORIGINAL');
  end if;

  select derivation_scheme into btc_scheme
    from public.btcpay_onchain where btcpay_store_id = 'btcpay-victim-default';

  if settings_started then
    raise exception
      'SCENARIO 4 UNSAFE: settings mutation proceeded during a replacement; BTCPay now holds "%" while Hachisu recorded REPLACEMENT',
      btc_scheme;
  end if;
end $$;

update public.btcpay_onchain
  set configured = true, derivation_scheme = 'ORIGINAL'
  where btcpay_store_id = 'btcpay-victim-default';
update public.merchant_stores
  set onchain_status='connected', wallet_status='payment_destination_connected',
      onchain_scheme_fingerprint='ORIGINAL', onchain_operation='none',
      onchain_operation_started_at=null, onchain_operation_token=null
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Scenario 5 — a non-owner releasing someone else's lock.
--
-- Failure-cleanup paths run in every operation. If cleanup can clear a lock it
-- does not own, a failing operation unlocks the operation that superseded it and
-- the mutual exclusion collapses at exactly the moment it matters most.
-- ---------------------------------------------------------------------------
do $$
declare
  store uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  owner_token uuid := gen_random_uuid();
  stranger_token uuid := gen_random_uuid();
  released boolean;
  op text;
begin
  if not public.op_replace_acquire(store, owner_token) then
    raise exception 'PRECONDITION FAILED: could not take the lock';
  end if;

  released := public.op_release(store, stranger_token);

  select onchain_operation into op from public.merchant_stores where id = store;
  if released or op <> 'replacing' then
    raise exception
      'SCENARIO 5 UNSAFE: a non-owner cleared the lock (released=%, operation now %)', released, op;
  end if;

  -- The rightful owner must still be able to release it.
  if not public.op_release(store, owner_token) then
    raise exception 'REGRESSION: the lock owner could not release its own lock';
  end if;
end $$;

update public.merchant_stores
  set onchain_operation='none', onchain_operation_started_at=null, onchain_operation_token=null
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Liveness: the lock must not be able to wedge a store. An ABANDONED operation
-- (older than the stale window, which exceeds the platform's maximum Edge
-- Function runtime) must still be supersedable, or a crashed request would lock
-- a merchant out of their own wallet settings forever.
-- ---------------------------------------------------------------------------
do $$
declare
  store uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
begin
  update public.merchant_stores
    set onchain_operation = 'replacing',
        onchain_operation_started_at = now() - interval '30 minutes',
        onchain_operation_token = gen_random_uuid()
    where id = store;

  if not public.op_remove_begin(store) then
    raise exception 'REGRESSION: a stale lock wedged the store — remove could not proceed';
  end if;
end $$;

update public.merchant_stores
  set onchain_operation = 'none', onchain_operation_started_at = null,
      onchain_operation_token = null
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Liveness: with no operation in flight, every endpoint still works normally.
do $$
declare store uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
begin
  if not public.op_remove_begin(store) then
    raise exception 'REGRESSION: remove was refused on an idle store';
  end if;
  if not public.op_remove_commit(store) then
    raise exception 'REGRESSION: remove could not commit the operation it started';
  end if;
end $$;
