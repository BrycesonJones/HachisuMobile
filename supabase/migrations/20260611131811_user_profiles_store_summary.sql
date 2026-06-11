-- Phase 1.5 fix: user_profiles becomes a reliable "default store summary" cache.
--
-- merchant_stores is the source of truth for the full store list. user_profiles
-- holds only summary/default-store fields. This migration adds the missing
-- summary columns and backfills existing data so the summary matches
-- merchant_stores for every user.

-- 1. New summary columns -------------------------------------------------------
alter table public.user_profiles
  add column if not exists store_count integer not null default 0,
  add column if not exists has_stores boolean not null default false,
  add column if not exists default_merchant_store_id uuid
    references public.merchant_stores (id) on delete set null;

-- 2. Backfill: create a merchant_stores row for any user that has a Phase 1
--    user_profiles.btcpay_store_id but no matching merchant_stores row. Mark it
--    default only if the user has no existing default (avoids violating the
--    one-default-per-user unique index).
insert into public.merchant_stores (
  user_id, profile_id, name, display_name, default_currency, preferred_price_source,
  btcpay_store_id, btcpay_store_name, store_provisioning_status, wallet_status,
  lightning_status, lightning_provider, onchain_status, onchain_provider, is_default
)
select
  up.id,
  up.id,
  coalesce(up.btcpay_store_name, up.display_name, up.business_name, 'Store'),
  coalesce(up.btcpay_store_name, up.display_name, up.business_name),
  'USD',
  'kraken',
  up.btcpay_store_id,
  up.btcpay_store_name,
  'active',
  case when up.wallet_status in ('not_connected', 'store_created', 'payment_destination_connected', 'error')
       then up.wallet_status else 'store_created' end,
  case when up.lightning_status in ('not_connected', 'connected', 'error')
       then up.lightning_status else 'not_connected' end,
  up.lightning_provider,
  case when up.onchain_status in ('not_connected', 'connected', 'error')
       then up.onchain_status else 'not_connected' end,
  up.onchain_provider,
  not exists (
    select 1 from public.merchant_stores d
    where d.user_id = up.id and d.is_default = true
  )
from public.user_profiles up
where up.btcpay_store_id is not null
  and not exists (
    select 1 from public.merchant_stores ms
    where ms.btcpay_store_id = up.btcpay_store_id
  );

-- 3. Ensure every user with stores has exactly one default (oldest wins).
update public.merchant_stores
set is_default = true
where id in (
  select (
    select ms2.id
    from public.merchant_stores ms2
    where ms2.user_id = u.user_id
    order by ms2.created_at asc, ms2.id asc
    limit 1
  )
  from (
    select user_id
    from public.merchant_stores
    group by user_id
    having bool_or(is_default) = false
  ) u
);

-- 4. Recompute the user_profiles summary from merchant_stores for every user
--    that has stores.
with agg as (
  select
    user_id,
    count(*) as cnt,
    bool_or(wallet_status = 'payment_destination_connected') as has_dest
  from public.merchant_stores
  group by user_id
),
def as (
  select
    user_id, id, btcpay_store_id, btcpay_store_name, name,
    lightning_status, lightning_provider, onchain_status, onchain_provider
  from public.merchant_stores
  where is_default = true
)
update public.user_profiles up
set
  store_count = agg.cnt,
  has_stores = agg.cnt > 0,
  default_merchant_store_id = def.id,
  btcpay_store_id = coalesce(def.btcpay_store_id, up.btcpay_store_id),
  btcpay_store_name = coalesce(def.btcpay_store_name, def.name, up.btcpay_store_name),
  store_provisioning_status = 'active',
  wallet_status = case when agg.has_dest then 'payment_destination_connected' else 'store_created' end,
  lightning_status = coalesce(def.lightning_status, up.lightning_status),
  lightning_provider = def.lightning_provider,
  onchain_status = coalesce(def.onchain_status, up.onchain_status),
  onchain_provider = def.onchain_provider
from agg
left join def on def.user_id = agg.user_id
where up.id = agg.user_id;
