import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import {
  usePaginatedStoreList,
  type UsePaginatedStoreListResult,
} from '@/hooks/use-paginated-store-list';
import { fetchStoreActivity } from '@/lib/btcpay/activity';
import type { StoreActivityEvent } from '@/types/activity';

export type UseStoreActivityResult = UsePaginatedStoreListResult<StoreActivityEvent>;

/**
 * Loads the store's PAYMENT activity — the financially meaningful transactions
 * BTCPay recorded — with durable cursor pagination (no 30-day window, no
 * 25-item ceiling).
 *
 * Store isolation: when `merchantStoreId` changes, items are cleared
 * IMMEDIATELY (synchronously, before the network call) so store A's activity can
 * never flash under store B. Pass null to stay idle/empty.
 */
export function useStoreActivity(merchantStoreId: string | null): UseStoreActivityResult {
  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!merchantStoreId) return { items: [], nextCursor: null };
      return fetchStoreActivity(merchantStoreId, { cursor });
    },
    [merchantStoreId],
  );

  const list = usePaginatedStoreList<StoreActivityEvent>({
    merchantStoreId,
    fetchPage,
    keyOf: eventKey,
    fallbackError: 'Could not load activity.',
  });

  // Payment status changes on BTCPay's side (a processing payment confirming,
  // for instance) without any action in the app, so returning to the foreground
  // re-checks the first page rather than trusting what was loaded earlier.
  const { refresh } = list;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && merchantStoreId) void refresh();
    });
    return () => subscription.remove();
  }, [refresh, merchantStoreId]);

  return list;
}

/** Payment-scoped identity: two payments on one invoice are two distinct rows. */
function eventKey(event: StoreActivityEvent): string {
  return event.id;
}
