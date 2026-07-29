-- Safe, staged on-chain (Bitcoin) wallet REPLACEMENT.
--
-- Replacing a merchant's on-chain wallet is high-risk: a bad key, a failed BTCPay
-- write, stale store state, or a duplicate/accidental confirmation could silently
-- send future payments to the wrong wallet. Prior to this migration "replace" was
-- a UI-only relabel of the initial connect flow (same edge function, no preview
-- proof, no read-back, no concurrency/idempotency guard).
--
-- This migration adds the server-side primitives the staged replace flow needs:
--   1. An OPERATION lock on merchant_stores, kept SEPARATE from the authoritative
--      onchain_status so an in-flight replace never flips a working wallet to a
--      disconnected/transient state.
--   2. A non-sensitive scheme FINGERPRINT (sha256 hex) so we can detect a same-
--      wallet replacement server-side without ever storing or exposing the xpub.
--   3. A preview-VERIFICATION table: a short-lived, single-use record created
--      during the preview step and bound to (user, store, scheme hash, mode). The
--      replace endpoint requires a valid record, so the final write cannot be
--      reached without a fresh, matching, same-store, same-user preview.
--   4. A replacement-OPS table keyed by an idempotency key, so duplicate taps /
--      concurrent requests return the original outcome instead of replacing twice,
--      and reconcile-required states survive across retries.
--
-- We NEVER persist key material (xpub / descriptor / derivation scheme). Only a
-- one-way sha256 fingerprint is stored, purely for same-wallet comparison.

-- 1. Operation lock + fingerprint on the store row -------------------------------

alter table public.merchant_stores
  add column if not exists onchain_operation text not null default 'none',
  add column if not exists onchain_operation_started_at timestamptz,
  add column if not exists onchain_scheme_fingerprint text;

-- Operational state is intentionally distinct from onchain_status. onchain_status
-- remains the authoritative connection state ('connected' throughout a replace);
-- onchain_operation only reflects an in-flight mutation.
alter table public.merchant_stores
  drop constraint if exists merchant_stores_onchain_operation_check;
alter table public.merchant_stores
  add constraint merchant_stores_onchain_operation_check
    check (onchain_operation in ('none', 'connecting', 'replacing', 'removing'));

-- 2. Preview-verification records ------------------------------------------------

create table if not exists public.onchain_wallet_replacement_previews (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_store_id uuid not null references public.merchant_stores (id) on delete cascade,
  btcpay_store_id text not null,

  -- Only 'replace' previews are ever issued here; a 'connect' preview must never
  -- be usable to replace a wallet.
  mode text not null default 'replace',

  -- sha256 hex of the normalized derivation scheme that was previewed. Bound to
  -- the final replace request so a different key can't be swapped in afterwards.
  scheme_fingerprint text not null,

  -- Non-sensitive metadata (never the scheme itself).
  address_type text,
  provider text,

  status text not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,

  constraint onchain_wallet_replacement_previews_mode_check
    check (mode in ('connect', 'replace')),
  constraint onchain_wallet_replacement_previews_status_check
    check (status in ('active', 'used'))
);

create index if not exists onchain_wallet_replacement_previews_store_idx
  on public.onchain_wallet_replacement_previews (merchant_store_id);
create index if not exists onchain_wallet_replacement_previews_user_idx
  on public.onchain_wallet_replacement_previews (user_id);

alter table public.onchain_wallet_replacement_previews enable row level security;

-- Owner may read their own preview records (diagnostics only). All writes happen
-- from the edge functions via the service role, which bypasses RLS.
drop policy if exists "onchain_previews_select_own"
  on public.onchain_wallet_replacement_previews;
create policy "onchain_previews_select_own"
  on public.onchain_wallet_replacement_previews for select
  using (auth.uid() = user_id);

-- 3. Replacement operations (idempotency + reconcile state) ----------------------

create table if not exists public.onchain_wallet_replacement_ops (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_store_id uuid not null references public.merchant_stores (id) on delete cascade,
  idempotency_key text not null,

  -- in_progress -> succeeded | failed | reconcile_required
  status text not null default 'in_progress',
  -- Cached authoritative response body for idempotent replays (no key material).
  result jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint onchain_wallet_replacement_ops_status_check
    check (status in ('in_progress', 'succeeded', 'failed', 'reconcile_required'))
);

-- One row per (store, idempotency key): the unique constraint is the duplicate-
-- submission / concurrency backstop — a second insert for the same key conflicts.
create unique index if not exists onchain_wallet_replacement_ops_key_unique
  on public.onchain_wallet_replacement_ops (merchant_store_id, idempotency_key);

alter table public.onchain_wallet_replacement_ops enable row level security;

drop policy if exists "onchain_replacement_ops_select_own"
  on public.onchain_wallet_replacement_ops;
create policy "onchain_replacement_ops_select_own"
  on public.onchain_wallet_replacement_ops for select
  using (auth.uid() = user_id);

create trigger onchain_wallet_replacement_ops_updated_at
  before update on public.onchain_wallet_replacement_ops
  for each row execute function public.set_updated_at();
