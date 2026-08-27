-- Phase 2: Quick Charge POS mode (BTCPay Light).
--
-- 1. merchant_pos_apps.pos_style gains 'quick-charge'. Existing values are
--    preserved: 'product-list' (legacy Static, normalizes to Cart on save) and
--    'product-list-cart' (Products & Cart) both mean mode "products";
--    'quick-charge' means the keypad mode (BTCPay defaultView 'Light').
--
-- 2. merchant_pos_charges: one row per Quick Charge submission ATTEMPT,
--    mirroring merchant_invoices. BTCPay remains AUTHORITATIVE for payment
--    state — Activity reads invoices straight from Greenfield and never joins
--    this table. The row exists for idempotency (the unique (store, key) index
--    is the real double-tap guard), store/POS association, and reconciliation.

alter table public.merchant_pos_apps
  drop constraint if exists merchant_pos_apps_pos_style_check;
alter table public.merchant_pos_apps
  add constraint merchant_pos_apps_pos_style_check
    check (pos_style in ('product-list', 'product-list-cart', 'quick-charge'));

create table if not exists public.merchant_pos_charges (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_store_id uuid not null references public.merchant_stores (id) on delete cascade,
  merchant_pos_app_id uuid not null references public.merchant_pos_apps (id) on delete cascade,

  -- Mirrored for reconciliation without a join (BTCPay ids are opaque strings).
  btcpay_store_id text not null,
  btcpay_app_id text not null,
  -- Null only while a creation attempt is in flight (sync_status='creating').
  btcpay_invoice_id text,

  -- One per user submission attempt. Generated client-side, validated server-side.
  idempotency_key text not null,

  -- Lifecycle of THIS row, not of the payment. Payment state lives in BTCPay.
  sync_status text not null default 'creating',
  btcpay_status text,

  -- Exact decimal as sent to BTCPay. numeric (never float) so sums cannot drift.
  amount numeric(20, 8) not null,
  currency text not null,

  checkout_link text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,

  constraint merchant_pos_charges_sync_status_check
    check (sync_status in ('creating', 'created', 'sync_failed')),
  constraint merchant_pos_charges_amount_positive
    check (amount > 0)
);

-- Idempotency: at most one attempt per (store, key).
create unique index if not exists merchant_pos_charges_store_idempotency_unique
  on public.merchant_pos_charges (merchant_store_id, idempotency_key);

create unique index if not exists merchant_pos_charges_store_invoice_unique
  on public.merchant_pos_charges (merchant_store_id, btcpay_invoice_id)
  where btcpay_invoice_id is not null;

create index if not exists merchant_pos_charges_user_id_idx
  on public.merchant_pos_charges (user_id);
create index if not exists merchant_pos_charges_app_created_idx
  on public.merchant_pos_charges (merchant_pos_app_id, created_at desc);

create trigger merchant_pos_charges_updated_at
  before update on public.merchant_pos_charges
  for each row execute function public.set_updated_at();

-- Owner-read only. All writes happen from the edge function via the service
-- role, so there is no client write policy.
alter table public.merchant_pos_charges enable row level security;

drop policy if exists "merchant_pos_charges_select_own" on public.merchant_pos_charges;
create policy "merchant_pos_charges_select_own"
  on public.merchant_pos_charges for select
  using (auth.uid() = user_id);
