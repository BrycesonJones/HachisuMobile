import { useCallback, useEffect, useState } from 'react';

import {
  usePaginatedStoreList,
  type UsePaginatedStoreListResult,
} from '@/hooks/use-paginated-store-list';
import { cacheActivityItems } from '@/lib/btcpay/activity-cache';
import {
  fetchStoreInvoices,
  type InvoiceStatusFilterId,
} from '@/lib/btcpay/invoice-list';
import type { ActivityItem } from '@/types/activity';

/** Keystroke debounce before a search term becomes a server request. */
const SEARCH_DEBOUNCE_MS = 350;

export interface UseStoreInvoicesOptions {
  statusFilter: InvoiceStatusFilterId;
  /** Raw search text from the input; debounced here, then sent to BTCPay. */
  search: string;
  /** ISO start of the time filter, or null for all time. */
  startDate: string | null;
}

export type UseStoreInvoicesResult = UsePaginatedStoreListResult<ActivityItem>;

/**
 * Loads the active BTCPay store's real invoice history with server-side status,
 * time, and text filtering and durable cursor pagination.
 *
 * Every filter is part of the fetch identity, so changing one resets to page 1
 * rather than filtering a partially-loaded list on the phone — the counts the
 * merchant sees always reflect the whole store, not just what happened to be
 * downloaded.
 */
export function useStoreInvoices(
  merchantStoreId: string | null,
  { statusFilter, search, startDate }: UseStoreInvoicesOptions,
): UseStoreInvoicesResult {
  const debouncedSearch = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!merchantStoreId) return { items: [], nextCursor: null };
      const page = await fetchStoreInvoices(merchantStoreId, {
        cursor,
        statusFilter,
        search: debouncedSearch || undefined,
        startDate: startDate ?? undefined,
      });
      // Seed the detail cache so opening an invoice paints immediately; the
      // detail screen still fetches the authoritative record.
      cacheActivityItems(merchantStoreId, page.items);
      return page;
    },
    [merchantStoreId, statusFilter, debouncedSearch, startDate],
  );

  return usePaginatedStoreList<ActivityItem>({
    merchantStoreId,
    fetchPage,
    keyOf: invoiceKey,
    fallbackError: 'Could not load invoices.',
  });
}

function invoiceKey(invoice: ActivityItem): string {
  return invoice.btcpayInvoiceId;
}

/** Delays a value so each keystroke does not become its own BTCPay request. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
