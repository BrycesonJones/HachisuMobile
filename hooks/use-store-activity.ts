import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchStoreActivity } from '@/lib/btcpay/activity';
import { cacheActivityItems } from '@/lib/btcpay/activity-cache';
import type { ActivityItem } from '@/types/activity';

export interface UseStoreActivityResult {
  items: ActivityItem[];
  /** Initial / store-switch load. */
  loading: boolean;
  /** Pull-to-refresh load (keeps existing items visible). */
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Loads BTCPay-derived Activity for a merchant store.
 *
 * Store isolation: when `merchantStoreId` changes, items are cleared IMMEDIATELY
 * (synchronously, before the network call) so Store A's activity can never flash
 * under Store B. Pass null to stay idle/empty (e.g. no store connected yet).
 */
export function useStoreActivity(merchantStoreId: string | null): UseStoreActivityResult {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a stale response from a previous store overwriting the newer
  // store's data if the user switches mid-request.
  const requestStoreRef = useRef<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!merchantStoreId) {
        setItems([]);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      requestStoreRef.current = merchantStoreId;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const { items: fetched } = await fetchStoreActivity(merchantStoreId);
        if (requestStoreRef.current !== merchantStoreId) return; // superseded
        cacheActivityItems(fetched);
        setItems(fetched);
      } catch (e) {
        if (requestStoreRef.current !== merchantStoreId) return; // superseded
        setError(e instanceof Error ? e.message : 'Could not load activity.');
        setItems([]);
      } finally {
        if (requestStoreRef.current === merchantStoreId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [merchantStoreId],
  );

  // Clear immediately on store change, then load fresh for the new store.
  useEffect(() => {
    setItems([]);
    setError(null);
    load(false);
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return { items, loading, refreshing, error, refetch };
}
