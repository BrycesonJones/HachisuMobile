// Data access for the Payment Requests LIST: the merchant's own rows in
// merchant_payment_requests, read directly through PostgREST under the
// owner-read RLS policy (merchant_payment_requests_select_own). No Edge
// Function is involved because nothing here touches BTCPay — live request
// state is fetched by the detail screen (get-btcpay-payment-request).
//
// The app sends only its internal merchantStoreId; btcpay_store_id and every
// other server-controlled column stay out of the query and the response.

import { isDevAuthActive } from '@/lib/auth/dev-session';
import {
  nextPaymentRequestCursor,
  PAYMENT_REQUEST_PAGE_SIZE,
  paymentRequestItemFromRow,
  paymentRequestOffset,
  type PaymentRequestListItem,
  type PaymentRequestListRow,
} from '@/lib/btcpay/payment-request-list';
import { supabase } from '@/lib/supabase';

// A single literal (not a concatenation) so supabase-js can type the result rows.
const LIST_COLUMNS =
  'merchant_store_id,btcpay_payment_request_id,title,amount,currency,reference_id,allow_custom_amounts,created_at,expires_at,request_url';

export interface FetchStorePaymentRequestsOptions {
  cursor?: string | null;
  /** ISO start of the time window, or null for all time. Applied server-side. */
  startDate?: string | null;
}

export interface StorePaymentRequestsResult {
  items: PaymentRequestListItem[];
  nextCursor: string | null;
}

/**
 * Loads one page (newest first) of the payment requests created for a store.
 * Throws with a merchant-facing message on failure so the shared list hook can
 * render a retryable error state rather than an empty list.
 */
export async function fetchStorePaymentRequests(
  merchantStoreId: string,
  options: FetchStorePaymentRequestsOptions = {},
): Promise<StorePaymentRequestsResult> {
  if (isDevAuthActive()) {
    return { items: [], nextCursor: null };
  }

  const offset = paymentRequestOffset(options.cursor);
  let query = supabase
    .from('merchant_payment_requests')
    .select(LIST_COLUMNS)
    .eq('merchant_store_id', merchantStoreId)
    .not('btcpay_payment_request_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAYMENT_REQUEST_PAGE_SIZE - 1);
  if (options.startDate) {
    query = query.gte('created_at', options.startDate);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error('Could not load payment requests. Check your connection and try again.');
  }

  const rows: PaymentRequestListRow[] = data ?? [];
  return {
    items: rows.map(paymentRequestItemFromRow).filter((item) => item != null),
    nextCursor: nextPaymentRequestCursor(options.cursor, rows.length),
  };
}
