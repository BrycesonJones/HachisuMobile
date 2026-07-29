-- Pay Button feature state (mobile Pay Button screen).
--
-- In BTCPay Server the store-level "Pay Button" is enabled by the store setting
-- "Allow anyone to create invoices" (Greenfield: anyoneCanCreateInvoice). That is
-- exactly the toggle behind the green "Enable" button on the BTCPay Pay Button
-- page. The mobile app drives it through an edge function; BTCPay is the source
-- of truth. These columns are a CACHED MIRROR only, written AFTER BTCPay confirms
-- the setting — they must never override BTCPay's live state.
--
-- pay_button_enabled:      last-known BTCPay anyoneCanCreateInvoice value.
-- pay_button_status:       normalized status for the UI (disabled|enabled|error).
-- pay_button_last_synced_at: when we last read/wrote the value from/to BTCPay.
-- pay_button_error:        last user-readable error (nullable; cleared on success).

alter table public.merchant_stores
  add column if not exists pay_button_enabled boolean not null default false,
  add column if not exists pay_button_status text not null default 'disabled',
  add column if not exists pay_button_last_synced_at timestamptz,
  add column if not exists pay_button_error text;

alter table public.merchant_stores
  drop constraint if exists merchant_stores_pay_button_status_check;
alter table public.merchant_stores
  add constraint merchant_stores_pay_button_status_check
  check (pay_button_status in ('disabled', 'enabled', 'error'));
