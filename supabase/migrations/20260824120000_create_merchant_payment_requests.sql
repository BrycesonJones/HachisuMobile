-- Merchant payment requests created from the Hachisu app (Create Payment
-- Request screen).
--
-- BTCPay remains the AUTHORITATIVE source for payment request state — the
-- detail screen re-reads BTCPay through get-btcpay-payment-request, and the
-- payments a request generates flow through the existing Activity pipeline
-- (their invoices carry metadata.paymentRequestId). This row exists only to
-- support:
--   * idempotency (one row per user submission attempt, so a double tap or a
--     retried request can never create two BTCPay payment requests)
--   * store association + fast internal lookup / reconciliation
--   * the merchant-typed plain-text memo (BTCPay stores the html-escaped form)
--
-- Deliberately NOT stored: wallet descriptors, xpubs, Greenfield secrets, raw
-- BTCPay payloads, or any payment state.

create table if not exists public.merchant_payment_requests (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_store_id uuid not null references public.merchant_stores (id) on delete cascade,

  -- Mirrored for reconciliation without a join (BTCPay ids are opaque strings).
  btcpay_store_id text not null,
  -- Null only while a creation attempt is in flight (sync_status='creating').
  btcpay_payment_request_id text,

  -- One per user submission attempt. Generated client-side, validated server-side.
  idempotency_key text not null,

  -- Lifecycle of THIS row, not of the request. Request state lives in BTCPay.
  sync_status text not null default 'creating',

  -- BTCPay's status as observed at creation/last sync. Never used to decide
  -- that a request is paid — the detail screen re-reads BTCPay.
  btcpay_status text,

  -- Exact decimal as sent to BTCPay. numeric (never float).
  amount numeric(20, 8) not null,
  currency text not null,

  title text not null,
  -- The merchant's memo EXACTLY as typed (plain text). BTCPay holds the
  -- html-escaped rendering of this.
  memo text,
  reference_id text,
  -- Metadata only: attached to invoices the request generates. Hachisu sends no
  -- email because of it.
  recipient_email text,

  allow_custom_amounts boolean not null default false,
  -- Built-in BTCPay customer-data form, if requested.
  form_id text,

  -- The public payment page URL, built server-side from the configured BTCPay
  -- origin (Greenfield returns no URL field for payment requests).
  request_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,

  constraint merchant_payment_requests_sync_status_check
    check (sync_status in ('creating', 'created', 'sync_failed')),
  constraint merchant_payment_requests_amount_positive
    check (amount > 0),
  constraint merchant_payment_requests_form_id_check
    check (form_id is null or form_id in ('Email', 'Address'))
);

-- Idempotency: at most one attempt per (store, key). This unique index — not the
-- disabled React button — is the real duplicate-submission guard.
create unique index if not exists merchant_payment_requests_store_idempotency_unique
  on public.merchant_payment_requests (merchant_store_id, idempotency_key);

-- Persistence is idempotent around (store, btcpay payment request) so a retried
-- write after a partial failure can upsert rather than duplicate.
create unique index if not exists merchant_payment_requests_store_request_unique
  on public.merchant_payment_requests (merchant_store_id, btcpay_payment_request_id)
  where btcpay_payment_request_id is not null;

create index if not exists merchant_payment_requests_user_id_idx
  on public.merchant_payment_requests (user_id);
create index if not exists merchant_payment_requests_store_created_idx
  on public.merchant_payment_requests (merchant_store_id, created_at desc);

create trigger merchant_payment_requests_updated_at
  before update on public.merchant_payment_requests
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-read only. All writes happen from the edge function
-- via the service role (which bypasses RLS) — a client must never be able to
-- author a payment request record directly.
alter table public.merchant_payment_requests enable row level security;

drop policy if exists "merchant_payment_requests_select_own" on public.merchant_payment_requests;
create policy "merchant_payment_requests_select_own"
  on public.merchant_payment_requests for select
  using (auth.uid() = user_id);
