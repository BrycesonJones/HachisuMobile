-- POS apps: store-scoped Point of Sale applications.
--
-- Mirrors the merchant_stores conventions (owner-only RLS, set_updated_at
-- trigger, check constraints). One row per BTCPay POS app, scoped to a single
-- merchant_stores row. Creation happens via the create-btcpay-pos-app edge
-- function (service role, which bypasses RLS); owners may read and update their
-- own rows directly under RLS.

create table if not exists public.merchant_pos_apps (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_store_id uuid not null references public.merchant_stores (id) on delete cascade,

  btcpay_store_id text not null,
  btcpay_app_id text not null,

  app_name text not null,
  display_title text not null,
  pos_style text not null,
  currency text not null,
  description text,

  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_pos_apps_pos_style_check
    check (pos_style in ('product-list', 'product-list-cart')),
  constraint merchant_pos_apps_status_check
    check (status in ('active', 'archived', 'disabled'))
);

create index if not exists merchant_pos_apps_user_id_idx
  on public.merchant_pos_apps (user_id);

create index if not exists merchant_pos_apps_merchant_store_id_idx
  on public.merchant_pos_apps (merchant_store_id);

create unique index if not exists merchant_pos_apps_btcpay_app_id_unique
  on public.merchant_pos_apps (btcpay_app_id);

-- A POS app name is unique within a single store (BTCPay allows reuse across
-- stores, so this is scoped to merchant_store_id rather than globally).
create unique index if not exists merchant_pos_apps_store_app_name_unique
  on public.merchant_pos_apps (merchant_store_id, app_name);

create trigger merchant_pos_apps_updated_at
  before update on public.merchant_pos_apps
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-only. Creation writes happen from the edge function
-- via the service role, which bypasses RLS.
alter table public.merchant_pos_apps enable row level security;

drop policy if exists "merchant_pos_apps_select_own" on public.merchant_pos_apps;
create policy "merchant_pos_apps_select_own"
  on public.merchant_pos_apps for select
  using (auth.uid() = user_id);

drop policy if exists "merchant_pos_apps_insert_own" on public.merchant_pos_apps;
create policy "merchant_pos_apps_insert_own"
  on public.merchant_pos_apps for insert
  with check (auth.uid() = user_id);

drop policy if exists "merchant_pos_apps_update_own" on public.merchant_pos_apps;
create policy "merchant_pos_apps_update_own"
  on public.merchant_pos_apps for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
