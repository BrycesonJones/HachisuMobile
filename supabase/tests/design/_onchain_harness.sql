-- Mock BTCPay: the authoritative on-chain payment-method state per store.
-- Payments route to whatever THIS table holds; merchant_stores is only Hachisu's
-- mirror of it. A divergence between the two is the defect under test.
set client_min_messages = warning;

drop table if exists public.btcpay_onchain cascade;
create table public.btcpay_onchain (
  btcpay_store_id text primary key,
  configured boolean not null default false,
  derivation_scheme text
);
insert into public.btcpay_onchain (btcpay_store_id, configured, derivation_scheme)
values ('btcpay-victim-default', true, 'ORIGINAL');

-- merchant_stores starts in the steady state the endpoints see: a connected
-- wallet, no operation in flight.
update public.merchant_stores
  set onchain_status = 'connected',
      wallet_status = 'payment_destination_connected',
      onchain_scheme_fingerprint = 'ORIGINAL',
      onchain_operation = 'none',
      onchain_operation_started_at = null,
      onchain_operation_token = null
  where btcpay_store_id = 'btcpay-victim-default';

-- BTCPay side effects ---------------------------------------------------------
create or replace function public.btcpay_put(p_store text, p_scheme text)
returns void language sql as $$
  update public.btcpay_onchain
    set configured = true, derivation_scheme = p_scheme
    where btcpay_store_id = p_store;
$$;

create or replace function public.btcpay_delete(p_store text)
returns void language sql as $$
  update public.btcpay_onchain
    set configured = false, derivation_scheme = null
    where btcpay_store_id = p_store;
$$;

-- The staged replacement's lock, exactly as replace-btcpay-onchain-wallet issues
-- it today. This half is already correct and is identical in RED and GREEN.
create or replace function public.op_replace_acquire(p_store uuid, p_token uuid)
returns boolean language plpgsql as $$
declare n int;
begin
  update public.merchant_stores
    set onchain_operation = 'replacing',
        onchain_operation_started_at = now(),
        onchain_operation_token = p_token
    where id = p_store
      and (onchain_operation = 'none'
           or onchain_operation_started_at < now() - interval '15 minutes');
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.op_replace_commit(p_store uuid, p_token uuid, p_scheme text)
returns boolean language plpgsql as $$
declare n int;
begin
  update public.merchant_stores
    set onchain_status = 'connected',
        wallet_status = 'payment_destination_connected',
        onchain_scheme_fingerprint = p_scheme,
        onchain_operation = 'none',
        onchain_operation_started_at = null,
        onchain_operation_token = null
    where id = p_store
      and onchain_operation_token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end $$;
