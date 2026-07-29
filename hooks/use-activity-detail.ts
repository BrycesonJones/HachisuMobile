import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCachedActivityItem,
  upsertActivityItem,
} from '@/lib/btcpay/activity-cache';
import { ActivityDetailError, fetchActivityDetail } from '@/lib/btcpay/activity-detail';
import type { ActivityItem } from '@/types/activity';

export interface UseActivityDetailResult {
  /** Best available record: cached initial data first, then the authoritative fetch. */
  item: ActivityItem | null;
  /** A fetch is in flight and there is nothing to show yet (no cached initial data). */
  isLoading: boolean;
  /** Any fetch (including a background refresh over cached data) is in flight. */
  isFetching: boolean;
  /** The last fetch error, surfaced ONLY when there is no item to show. */
  error: ActivityDetailError | null;
  refetch: () => void;
}

/**
 * Durable, cache-first loader for a single Activity record.
 *
 * Strategy (the cache is an optimization, never the source of truth):
 *   1. Seed synchronously from the (store, invoice)-scoped cache for instant paint.
 *   2. Always fetch the authoritative record from the backend — a cache MISS
 *      triggers a fetch, it never fails or bounces the screen.
 *   3. On success, replace the item and patch the cache so a later list nav is fresh.
 *
 * The request is bound to the passed `merchantStoreId` (the ROUTE's store). It is
 * NOT the globally active store, so switching the active store while this screen
 * is open never changes what is fetched. Pass null ids to stay idle (the screen
 * renders its own invalid-route state).
 */
export function useActivityDetail(
  merchantStoreId: string | null,
  invoiceId: string | null,
): UseActivityDetailResult {
  const cached =
    merchantStoreId && invoiceId ? getCachedActivityItem(merchantStoreId, invoiceId) : undefined;

  const [item, setItem] = useState<ActivityItem | null>(cached ?? null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<ActivityDetailError | null>(null);

  // Guards against a stale response (e.g. rapid param change) overwriting newer
  // state. Bound to the exact (store, invoice) pair the request was issued for.
  const requestKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!merchantStoreId || !invoiceId) return;
    const key = `${merchantStoreId}::${invoiceId}`;
    requestKeyRef.current = key;

    // Re-seed from cache in case the list populated it after mount.
    const seed = getCachedActivityItem(merchantStoreId, invoiceId);
    if (seed && requestKeyRef.current === key) setItem((prev) => prev ?? seed);

    setIsFetching(true);
    setError(null);
    try {
      const fetched = await fetchActivityDetail(merchantStoreId, invoiceId);
      if (requestKeyRef.current !== key) return; // superseded
      upsertActivityItem(merchantStoreId, fetched);
      setItem(fetched);
      setError(null);
    } catch (e) {
      if (requestKeyRef.current !== key) return; // superseded
      const detailError =
        e instanceof ActivityDetailError
          ? e
          : new ActivityDetailError('BTCPAY_DETAIL_FETCH_FAILED', 'Payment details could not be loaded.');
      setError(detailError);
    } finally {
      if (requestKeyRef.current === key) setIsFetching(false);
    }
  }, [merchantStoreId, invoiceId]);

  useEffect(() => {
    // Reset to the new pair's cached seed (never leak the previous record).
    setItem(merchantStoreId && invoiceId ? getCachedActivityItem(merchantStoreId, invoiceId) ?? null : null);
    setError(null);
    load();
  }, [load, merchantStoreId, invoiceId]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  // Only a hard failure (no item to show at all) becomes a screen-level error.
  // A retryable failure that arrives over valid cached data keeps showing the data.
  const visibleError = item ? null : error;

  return {
    item,
    isLoading: isFetching && item == null && error == null,
    isFetching,
    error: visibleError,
    refetch,
  };
}
