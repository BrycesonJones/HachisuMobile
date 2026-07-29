-- Ownership token for the on-chain replacement operation lock.
--
-- The lock (onchain_operation='replacing') can be superseded once it is older
-- than a stale window, so an abandoned/crashed operation never wedges a store.
-- The token makes supersession SAFE: a replacement generates a unique token when
-- it acquires the lock, re-checks it still owns that token before the BTCPay
-- write, and makes the final DB commit conditional on the token. If a later
-- operation superseded the lock, the earlier one can no longer commit — so two
-- operations can never both write BTCPay/DB state for the same store.
alter table public.merchant_stores
  add column if not exists onchain_operation_token uuid;
