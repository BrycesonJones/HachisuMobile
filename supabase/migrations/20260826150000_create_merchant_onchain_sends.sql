-- PROPOSED (not yet applied): on-chain Bitcoin SEND attempts prepared from the
-- Hachisu app.
--
-- Hachisu is NON-CUSTODIAL: store wallets are watch-only (xpub/descriptor), so
-- a send is a three-party handshake — BTCPay constructs an UNSIGNED PSBT, the
-- merchant signs it in their own wallet, and BTCPay broadcasts the signed
-- result. This table is the durable record of that handshake:
--   * idempotency (claim-first: one row per prepare attempt, claimed BEFORE the
--     BTCPay call, so a double tap can never produce two competing prepared
--     sends for the same attempt)
--   * the authoritative reviewed numbers (amount / fee / total decoded from the
--     actual PSBT, not estimates)
--   * the prepared transaction's OUTPUT SUMMARY (script + value per output),
--     which is what lets broadcast verify the merchant-signed payload pays
--     EXACTLY what was reviewed
--   * broadcast state + txid, so "Sent" is only ever shown for a transaction
--     BTCPay actually accepted
--
-- Deliberately NOT stored here:
--   * private keys, seeds, xprvs (never exist anywhere in Hachisu), and the
--     merchant's signed transaction (forwarded to BTCPay, then dropped)
--   * the RAW UNSIGNED PSBT. BTCPay rebases key paths into it and it can carry
--     global-xpub / key-origin material — the same class of data this codebase
--     already refuses to persist (see onchain-fingerprint.ts). The PSBT lives
--     only in the API response and the client's in-memory flow state; the
--     output summary below is sufficient for broadcast-time verification, and
--     a lost PSBT simply means preparing a fresh send (a PSBT reserves
--     nothing, so an abandoned one is inert). psbt_hash (sha256) is kept for
--     correlation/debugging only.

create table if not exists public.merchant_onchain_sends (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_store_id uuid not null references public.merchant_stores (id) on delete cascade,

  -- Mirrored for reconciliation without a join (BTCPay ids are opaque strings).
  btcpay_store_id text not null,

  -- One per prepare attempt. Generated client-side, validated server-side.
  idempotency_key text not null,

  -- Where the money goes. Address only — never a full BIP21 URI (payjoin and
  -- other transports are deliberately out of scope).
  destination text not null,

  -- What the merchant asked to send, in integer satoshis. For a MAX send
  -- (subtract_fee = true) this is the full spendable balance; the network fee
  -- comes out of it.
  requested_amount_sats bigint not null,
  subtract_fee boolean not null default false,

  -- The speed option the merchant chose and its confirmation block target.
  speed text not null,
  confirmation_target integer not null,

  -- The reviewed numbers, decoded from the ACTUAL unsigned PSBT (exact integer
  -- satoshis). Null only while status = 'preparing'. amount_sats is what the
  -- destination receives; total_sats ( = amount + fee ) is the wallet debit.
  amount_sats bigint,
  fee_sats bigint,
  total_sats bigint,
  -- The sat/vB BTCPay's fee source returned for the confirmation target.
  fee_rate_sat_vb numeric(12, 3),

  -- The prepared transaction's outputs, for broadcast-time verification:
  -- [{ "script": <hex>, "valueSats": <string>, "address": <string|null> }, ...]
  -- Public transaction data only (scripts + amounts) — no keys, no paths.
  output_summary jsonb,

  -- sha256 (hex) of the unsigned PSBT base64. Correlation/debugging only —
  -- the PSBT itself is deliberately not recoverable from this table.
  psbt_hash text,

  -- preparing -> awaiting_signature -> broadcasting -> broadcast,
  -- with terminal/recovery states: failed | reconcile_required.
  --   preparing:          claim row; BTCPay build in flight
  --   broadcasting:       short-lived CAS lock so two submissions of the same
  --                       send can never race a double broadcast
  --   failed:             terminal, ONLY when we know nothing was broadcast
  --                       (e.g. a signed payload that did not match the
  --                       reviewed outputs — never retryable against this row)
  --   reconcile_required: the signed transaction was submitted but the outcome
  --                       could not be determined (timeout / lost response).
  --                       Never invites a new send; resolved by looking
  --                       expected_txid up in the wallet's transactions.
  status text not null default 'preparing',

  -- The txid DERIVED from the finalized signed payload just before submission
  -- (null when the payload could not be finalized locally). This is what makes
  -- reconciliation deterministic: an uncertain broadcast is resolved by asking
  -- BTCPay whether this exact transaction exists — never by guessing.
  expected_txid text,

  -- Set only from BTCPay's broadcast response (or confirmed reconciliation).
  -- Never synthesized client-side. (BTCPay has no separate transaction
  -- identifier for a send; the network txid is the only id.)
  txid text,

  -- Machine-readable reason for status='failed' (sanitized, never a raw body).
  error_code text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_onchain_sends_status_check
    check (status in ('preparing', 'awaiting_signature', 'broadcasting', 'broadcast', 'failed', 'reconcile_required')),
  constraint merchant_onchain_sends_speed_check
    check (speed in ('fast', 'standard', 'economy')),
  constraint merchant_onchain_sends_requested_positive
    check (requested_amount_sats > 0),
  constraint merchant_onchain_sends_amount_positive
    check (amount_sats is null or amount_sats > 0),
  constraint merchant_onchain_sends_fee_nonnegative
    check (fee_sats is null or fee_sats >= 0),
  constraint merchant_onchain_sends_total_consistent
    check (total_sats is null or total_sats = amount_sats + fee_sats)
);

-- Idempotency: at most one prepare attempt per (store, key). This unique index
-- — not the disabled React button — is the real duplicate-submission guard.
create unique index if not exists merchant_onchain_sends_store_idempotency_unique
  on public.merchant_onchain_sends (merchant_store_id, idempotency_key);

create index if not exists merchant_onchain_sends_user_id_idx
  on public.merchant_onchain_sends (user_id);
create index if not exists merchant_onchain_sends_store_created_idx
  on public.merchant_onchain_sends (merchant_store_id, created_at desc);

create trigger merchant_onchain_sends_updated_at
  before update on public.merchant_onchain_sends
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-read only. All writes happen from the edge
-- functions via the service role (which bypasses RLS), so there is no client
-- write policy — a client must never be able to author or mutate a send record
-- directly (that would let it forge reviewed amounts or a broadcast state).
alter table public.merchant_onchain_sends enable row level security;

drop policy if exists "merchant_onchain_sends_select_own" on public.merchant_onchain_sends;
create policy "merchant_onchain_sends_select_own"
  on public.merchant_onchain_sends for select
  using (auth.uid() = user_id);
