-- Pre-fix: only replace-btcpay-onchain-wallet participates in the on-chain
-- operation lock. connect / remove / sync mutate the very same BTCPay payment
-- method and the very same merchant_stores columns without ever taking it, and
-- sync additionally CLEARS the lock unconditionally.

-- remove-btcpay-onchain-wallet: ownership check only, no lock.
create or replace function public.op_remove_begin(p_store uuid)
returns boolean language sql as $$ select true $$;

-- remove's DB write: unconditional on the operation lock.
create or replace function public.op_remove_commit(p_store uuid)
returns boolean language plpgsql as $$
declare n int;
begin
  update public.merchant_stores
    set onchain_status = 'not_connected',
        wallet_status = 'store_created',
        onchain_enabled = false,
        onchain_label = null
    where id = p_store;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- connect-btcpay-onchain-wallet: no lock either.
create or replace function public.op_connect_begin(p_store uuid)
returns boolean language sql as $$ select true $$;

-- sync-btcpay-onchain-wallet: writes state AND wipes the lock, token and all.
create or replace function public.op_sync(p_store uuid, p_configured boolean, p_scheme text)
returns boolean language plpgsql as $$
begin
  update public.merchant_stores
    set onchain_status = case when p_configured then 'connected' else 'not_connected' end,
        wallet_status = case when p_configured then 'payment_destination_connected' else 'store_created' end,
        onchain_scheme_fingerprint = p_scheme,
        onchain_operation = 'none',
        onchain_operation_started_at = null,
        onchain_operation_token = null
    where id = p_store;
  return true;
end $$;

-- update-btcpay-onchain-wallet-settings: no lock either. It does a GET-then-PUT
-- that echoes the derivation scheme back, so interleaved with a replacement it
-- can re-write the OLD wallet over the new one at BTCPay.
create or replace function public.op_settings_begin(p_store uuid)
returns boolean language sql as $$ select true $$;

-- Pre-fix release: clears the lock without proving ownership.
create or replace function public.op_release(p_store uuid, p_token uuid)
returns boolean language plpgsql as $$
declare n int;
begin
  update public.merchant_stores
    set onchain_operation='none', onchain_operation_started_at=null, onchain_operation_token=null
    where id = p_store;
  get diagnostics n = row_count;
  return n > 0;
end $$;
