-- Post-fix: the on-chain operation lock is a SYSTEM-WIDE invariant. Every
-- endpoint that mutates the store's on-chain payment destination acquires it
-- through the same predicate, and none may clear a lock it does not own.
-- Mirrors supabase/functions/_shared/onchain-lock.ts.

create or replace function public.acquire_onchain_lock(
  p_store uuid, p_token uuid, p_operation text
) returns boolean language plpgsql as $$
declare n int;
begin
  update public.merchant_stores
    set onchain_operation = p_operation,
        onchain_operation_started_at = now(),
        onchain_operation_token = p_token
    where id = p_store
      and (onchain_operation = 'none'
           or onchain_operation_started_at < now() - interval '15 minutes');
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.op_remove_begin(p_store uuid)
returns boolean language sql as $$
  select public.acquire_onchain_lock(p_store, gen_random_uuid(), 'removing')
$$;

-- remove's DB write is conditional on still holding the lock it took.
create or replace function public.op_remove_commit(p_store uuid)
returns boolean language plpgsql as $$
declare n int;
begin
  update public.merchant_stores
    set onchain_status = 'not_connected',
        wallet_status = 'store_created',
        onchain_enabled = false,
        onchain_label = null,
        onchain_scheme_fingerprint = null,
        onchain_operation = 'none',
        onchain_operation_started_at = null,
        onchain_operation_token = null
    where id = p_store
      and onchain_operation = 'removing';
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.op_connect_begin(p_store uuid)
returns boolean language sql as $$
  select public.acquire_onchain_lock(p_store, gen_random_uuid(), 'connecting')
$$;

-- sync re-reads BTCPay and may clear a FREE or STALE lock, never a live one.
create or replace function public.op_sync(p_store uuid, p_configured boolean, p_scheme text)
returns boolean language plpgsql as $$
declare tok uuid := gen_random_uuid(); n int;
begin
  if not public.acquire_onchain_lock(p_store, tok, 'connecting') then
    return false;
  end if;
  update public.merchant_stores
    set onchain_status = case when p_configured then 'connected' else 'not_connected' end,
        wallet_status = case when p_configured then 'payment_destination_connected' else 'store_created' end,
        onchain_scheme_fingerprint = p_scheme,
        onchain_operation = 'none',
        onchain_operation_started_at = null,
        onchain_operation_token = null
    where id = p_store
      and onchain_operation_token = tok;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.op_settings_begin(p_store uuid)
returns boolean language sql as $$
  select public.acquire_onchain_lock(p_store, gen_random_uuid(), 'connecting')
$$;

-- Post-fix release: only the token holder may release. A failing operation can
-- never unlock an operation that superseded it.
create or replace function public.op_release(p_store uuid, p_token uuid)
returns boolean language plpgsql as $$
declare n int;
begin
  update public.merchant_stores
    set onchain_operation='none', onchain_operation_started_at=null, onchain_operation_token=null
    where id = p_store and onchain_operation_token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end $$;
