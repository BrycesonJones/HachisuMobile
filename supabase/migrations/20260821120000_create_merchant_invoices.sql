-- Merchant invoices created from the Hachisu app (Create Invoice screen).
--
-- BTCPay remains the AUTHORITATIVE source for invoice/payment state — the
-- Activity feed reads invoices straight from Greenfield and never joins this
-- table. This row exists only to support:
--   * idempotency (one row per user submission attempt, so a double tap or a
--     retried request can never create two BTCPay invoices)
--   * store association + Hachisu feature origin
--   * fast internal lookup / reporting / reconciliation
--   * Hachisu-side invoice metadata that Greenfield has no field for
--     (notification_url / notification_email — see the note below)
--
-- Deliberately NOT stored here: wallet descriptors, xpubs, customer payment
-- addresses, Greenfield secrets, or raw payment-method configuration.
--
-- NOTE on notification_url / notification_email: BTCPay Greenfield v1 (verified
-- against the deployed 2.4.3 OpenAPI document) has NO per-invoice notification
-- URL or notification email field, and CreateInvoiceRequest is
-- additionalProperties:false. These two columns are therefore Hachisu-side
-- metadata ONLY. Nothing in Hachisu dereferences notification_url — it is never
-- fetched, so it carries no SSRF risk — and no notification delivery is
-- implemented yet. They are recorded so the merchant's intent is not silently
-- discarded and so delivery can be built later without a data backfill.

create table if not exists public.merchant_invoices (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_store_id uuid not null references public.merchant_stores (id) on delete cascade,

  -- Mirrored for reconciliation without a join (BTCPay ids are opaque strings).
  btcpay_store_id text not null,
  -- Null only while a creation attempt is in flight (sync_status='creating').
  btcpay_invoice_id text,

  -- One per user submission attempt. Generated client-side, validated server-side.
  idempotency_key text not null,

  -- Lifecycle of THIS row, not of the payment. Payment state lives in BTCPay.
  sync_status text not null default 'creating',

  -- BTCPay's invoice status as observed at creation/last sync. Never used to
  -- decide that an invoice is paid — the Activity pipeline re-reads BTCPay.
  btcpay_status text,

  -- Exact decimal as sent to BTCPay. numeric (never float) so reporting sums
  -- cannot drift.
  amount numeric(20, 8) not null,
  currency text not null,

  description text,
  order_id text,
  buyer_email text,

  -- Hachisu-side only. See the note above.
  notification_url text,
  notification_email text,

  checkout_link text,

  -- Rails the merchant asked for, e.g. {onchain,lightning}. BTCPay stays
  -- authoritative for what checkout actually exposes.
  requested_payment_rails text[] not null default '{}',

  source_feature text not null default 'invoice',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,

  constraint merchant_invoices_sync_status_check
    check (sync_status in ('creating', 'created', 'sync_failed')),
  constraint merchant_invoices_amount_positive
    check (amount > 0),
  constraint merchant_invoices_source_feature_check
    check (source_feature in ('invoice'))
);

-- Idempotency: at most one attempt per (store, key). This unique index — not the
-- disabled React button — is the real duplicate-submission guard.
create unique index if not exists merchant_invoices_store_idempotency_unique
  on public.merchant_invoices (merchant_store_id, idempotency_key);

-- Persistence is idempotent around (store, btcpay invoice) so a retried write
-- after a partial failure can upsert rather than duplicate.
create unique index if not exists merchant_invoices_store_invoice_unique
  on public.merchant_invoices (merchant_store_id, btcpay_invoice_id)
  where btcpay_invoice_id is not null;

create index if not exists merchant_invoices_user_id_idx
  on public.merchant_invoices (user_id);
create index if not exists merchant_invoices_store_created_idx
  on public.merchant_invoices (merchant_store_id, created_at desc);

create trigger merchant_invoices_updated_at
  before update on public.merchant_invoices
  for each row execute function public.set_updated_at();

-- Row Level Security: owner-read only. All writes happen from the edge function
-- via the service role (which bypasses RLS), so there is no client write policy —
-- a client must never be able to author an invoice record directly.
alter table public.merchant_invoices enable row level security;

drop policy if exists "merchant_invoices_select_own" on public.merchant_invoices;
create policy "merchant_invoices_select_own"
  on public.merchant_invoices for select
  using (auth.uid() = user_id);
