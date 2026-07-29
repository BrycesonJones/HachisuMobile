import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { fetchStoreActivity } from '@/lib/btcpay/activity';
import { cacheActivityItems } from '@/lib/btcpay/activity-cache';
import type { ActivityFeedEnrichment } from '@/types/activity';
import type { ActivityItem } from '@/types/activity';

const NOT_REQUIRED_ENRICHMENT: ActivityFeedEnrichment = {
  status: 'not_required',
  attemptedCount: 0,
  succeededCount: 0,
  failedCount: 0,
  retryableCount: 0,
};

export interface UseStoreActivityResult {
  items: ActivityItem[];
  /** Feed-level enrichment rollup for the currently displayed items. */
  enrichment: ActivityFeedEnrichment;
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
  const [enrichment, setEnrichment] = useState<ActivityFeedEnrichment>(
    NOT_REQUIRED_ENRICHMENT,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a stale response from a previous store overwriting the newer
  // store's data if the user switches mid-request.
  const requestStoreRef = useRef<string | null>(null);
  // Latest enrichment status, read by the focus listener without re-subscribing.
  const enrichmentStatusRef = useRef(enrichment.status);
  enrichmentStatusRef.current = enrichment.status;

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!merchantStoreId) {
        setItems([]);
        setEnrichment(NOT_REQUIRED_ENRICHMENT);
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
        const { items: fetched, enrichment: fetchedEnrichment } =
          await fetchStoreActivity(merchantStoreId);
        if (requestStoreRef.current !== merchantStoreId) return; // superseded
        cacheActivityItems(merchantStoreId, fetched);
        setItems(fetched);
        setEnrichment(fetchedEnrichment);
      } catch (e) {
        if (requestStoreRef.current !== merchantStoreId) return; // superseded
        setError(e instanceof Error ? e.message : 'Could not load activity.');
        setItems([]);
        setEnrichment(NOT_REQUIRED_ENRICHMENT);
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
    setEnrichment(NOT_REQUIRED_ENRICHMENT);
    setError(null);
    load(false);
  }, [load]);

  // Degraded (partial/failed) data is never left stale: when the app returns to
  // the foreground, silently re-run to try to recover the missing details. A
  // fully complete feed is not re-fetched on focus (no infinite-stale, no churn).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const status = enrichmentStatusRef.current;
      if (status === 'partial' || status === 'failed') {
        void load(true);
      }
    });
    return () => sub.remove();
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return { items, enrichment, loading, refreshing, error, refetch };
}
