// Pure helpers for the Payment Requests LIST — row mapping, client-side search,
// and offset paging. No React Native or Supabase imports, so this is testable
// under node --test (lib/btcpay/payment-request-list.test.ts).
//
// What the list is: the payment requests THIS merchant created through Hachisu,
// read from merchant_payment_requests (owner-read RLS). It is an index into
// BTCPay, not a mirror of it: live status is deliberately absent here because
// the row only records BTCPay's status at creation time. Tapping a row opens the
// detail screen, which re-reads the authoritative record from BTCPay.

/** The columns the list reads. Mirrors the generated Row type in types/supabase.ts. */
export interface PaymentRequestListRow {
  merchant_store_id: string;
  btcpay_payment_request_id: string | null;
  title: string;
  /** numeric(20,8) — PostgREST serialises it as a JSON number. */
  amount: number;
  currency: string;
  reference_id: string | null;
  allow_custom_amounts: boolean;
  created_at: string;
  expires_at: string | null;
  request_url: string | null;
}

/** One row of the list. Display-only: no status, no payment state. */
export interface PaymentRequestListItem {
  merchantStoreId: string;
  btcpayPaymentRequestId: string;
  title: string;
  /** Decimal string for rendering — the app never does arithmetic on it. */
  amount: string;
  currency: string;
  referenceId: string | null;
  allowCustomAmounts: boolean;
  createdAt: string;
  expiresAt: string | null;
  requestUrl: string | null;
}

export const PAYMENT_REQUEST_PAGE_SIZE = 50;

function blankToNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Maps a persisted row to a list item. Returns null for a row whose BTCPay
 * request does not exist yet (a creation attempt still in flight) — the list
 * must only offer rows the detail screen can resolve.
 */
export function paymentRequestItemFromRow(row: PaymentRequestListRow): PaymentRequestListItem | null {
  const id = blankToNull(row.btcpay_payment_request_id);
  if (!id) return null;
  return {
    merchantStoreId: row.merchant_store_id,
    btcpayPaymentRequestId: id,
    title: row.title,
    amount: typeof row.amount === 'string' ? row.amount : String(row.amount),
    currency: row.currency,
    referenceId: blankToNull(row.reference_id),
    allowCustomAmounts: row.allow_custom_amounts === true,
    createdAt: row.created_at,
    expiresAt: blankToNull(row.expires_at),
    requestUrl: blankToNull(row.request_url),
  };
}

export interface PaymentRequestListFilters {
  /** Raw search text; matched case-insensitively against title, reference id
   * and the BTCPay request id. Blank means "no search". */
  search: string;
}

/** Applies the client-side search over the rows already loaded. */
export function filterPaymentRequestItems(
  items: readonly PaymentRequestListItem[],
  { search }: PaymentRequestListFilters,
): PaymentRequestListItem[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      (item.referenceId?.toLowerCase().includes(needle) ?? false) ||
      item.btcpayPaymentRequestId.toLowerCase().includes(needle),
  );
}

/** Parses an offset cursor. Anything that is not a non-negative integer is page one. */
export function paymentRequestOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/** Next offset cursor after a page of `received` rows, or null when history is exhausted. */
export function nextPaymentRequestCursor(
  cursor: string | null | undefined,
  received: number,
  pageSize: number = PAYMENT_REQUEST_PAGE_SIZE,
): string | null {
  if (received < pageSize) return null;
  return String(paymentRequestOffset(cursor) + pageSize);
}
