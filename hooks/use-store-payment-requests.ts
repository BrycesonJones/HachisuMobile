import { useCallback } from 'react';

import {
  usePaginatedStoreList,
  type UsePaginatedStoreListResult,
} from '@/hooks/use-paginated-store-list';
import type { PaymentRequestListItem } from '@/lib/btcpay/payment-request-list';
import { fetchStorePaymentRequests } from '@/lib/btcpay/payment-request-list-query';

export interface UseStorePaymentRequestsOptions {
  /** ISO start of the time filter, or null for all time. */
  startDate: string | null;
}

export type UseStorePaymentRequestsResult = UsePaginatedStoreListResult<PaymentRequestListItem>;

/**
 * Loads the active store's Hachisu-created payment requests, newest first, with
 * the same store-isolated, cursor-paginated loading as Invoices and Activity.
 * The time window is part of the fetch identity (changing it resets to page 1);
 * text search is applied by the screen over the loaded rows.
 */
export function useStorePaymentRequests(
  merchantStoreId: string | null,
  { startDate }: UseStorePaymentRequestsOptions,
): UseStorePaymentRequestsResult {
  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!merchantStoreId) return { items: [], nextCursor: null };
      return fetchStorePaymentRequests(merchantStoreId, { cursor, startDate });
    },
    [merchantStoreId, startDate],
  );

  return usePaginatedStoreList<PaymentRequestListItem>({
    merchantStoreId,
    fetchPage,
    keyOf: paymentRequestKey,
    fallbackError: 'Could not load payment requests.',
  });
}

function paymentRequestKey(item: PaymentRequestListItem): string {
  return item.btcpayPaymentRequestId;
}
