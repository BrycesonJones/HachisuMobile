import { isDevAuthActive } from '@/lib/auth/dev-session';
import { readFunctionError } from '@/lib/btcpay/function-error';
import { supabase } from '@/lib/supabase';
import type { ActivityItem, StoreInvoicesResponse } from '@/types/activity';

/** Status filter ids understood by the backend. Mirrors _shared/invoice-filters.ts. */
export type InvoiceStatusFilterId =
  | 'all'
  | 'new'
  | 'processing'
  | 'settled'
  | 'expired'
  | 'invalid'
  | 'settled-late'
  | 'settled-partial'
  | 'settled-over';

export interface FetchStoreInvoicesOptions {
  cursor?: string | null;
  limit?: number;
  statusFilter?: InvoiceStatusFilterId;
  /** BTCPay's own invoice text search (invoice id, order id, item description,
   * buyer email, payment address). Applied server-side. */
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface StoreInvoicesResult {
  items: ActivityItem[];
  nextCursor: string | null;
}

/**
 * Loads a page of the active BTCPay store's REAL invoice history via the
 * get-btcpay-store-invoices Edge Function — every invoice in the store,
 * whichever client created it, not only the ones Hachisu created.
 *
 * Filtering, searching, and paging all happen server-side against BTCPay's own
 * query parameters; the phone never pulls an unbounded history. The app never
 * calls BTCPay directly and never sends a btcpay_store_id.
 */
export async function fetchStoreInvoices(
  merchantStoreId: string,
  options: FetchStoreInvoicesOptions = {},
): Promise<StoreInvoicesResult> {
  if (isDevAuthActive()) {
    return { items: [], nextCursor: null };
  }

  const { data, error } = await supabase.functions.invoke<StoreInvoicesResponse>(
    'get-btcpay-store-invoices',
    {
      method: 'POST',
      body: {
        merchantStoreId,
        cursor: options.cursor ?? undefined,
        limit: options.limit,
        statusFilter: options.statusFilter,
        search: options.search,
        startDate: options.startDate,
        endDate: options.endDate,
      },
    },
  );

  if (error) {
    throw new Error((await readFunctionError(error)) ?? error.message);
  }
  if (!data?.ok) {
    throw new Error(data?.error ?? 'Could not load invoices.');
  }

  return {
    items: data.items ?? [],
    nextCursor: data.nextCursor ?? null,
  };
}
