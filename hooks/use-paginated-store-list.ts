import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribeActivityStale } from '@/lib/btcpay/activity-cache';

export interface StoreListPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UsePaginatedStoreListOptions<T> {
  /** The store the list belongs to. Null keeps the list idle and empty. */
  merchantStoreId: string | null;
  /** Fetches one page. Must be memoized: a new identity resets to page 1, which
   * is exactly what a changed store, filter, or search term should do. */
  fetchPage: (cursor: string | null) => Promise<StoreListPage<T>>;
  /** Stable key for an item, used to drop duplicates across page boundaries. */
  keyOf: (item: T) => string;
  /** Message shown when the fetch throws something without one. */
  fallbackError: string;
}

export interface UsePaginatedStoreListResult<T> {
  items: T[];
  /** First page for a new store/filter (the list is empty behind this). */
  loading: boolean;
  /** Pull-to-refresh (existing items stay visible). */
  refreshing: boolean;
  /** A load-more page is in flight. */
  loadingMore: boolean;
  /** True while more history exists behind the current page. */
  hasMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * Cursor-paginated, store-scoped list loading shared by Invoices and Activity.
 *
 * Store isolation is structural, not incidental:
 *   - changing `merchantStoreId` (or any input baked into `fetchPage`) clears
 *     items SYNCHRONOUSLY, before the network call, so store A's rows can never
 *     flash under store B;
 *   - every in-flight request carries a generation token and a store id, and a
 *     response whose generation is stale is DISCARDED rather than merged.
 *
 * There is no separate caching layer: the visible page set is the state, and a
 * store's data is re-fetched from the backend (BTCPay stays authoritative)
 * whenever it is marked stale, refreshed, or re-entered.
 */
export function usePaginatedStoreList<T>({
  merchantStoreId,
  fetchPage,
  keyOf,
  fallbackError,
}: UsePaginatedStoreListOptions<T>): UsePaginatedStoreListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(merchantStoreId != null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Bumped on every reset (store/filter change). A response tagged with an old
  // generation belongs to a list the user has already navigated away from.
  const generationRef = useRef(0);
  const cursorRef = useRef<string | null>(null);
  // Generation of the request currently in flight, or null. Tracking the
  // generation (rather than a boolean) means a reset can abandon an old request
  // without its completion clearing the flag for the new one.
  const inFlightGenerationRef = useRef<number | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more') => {
      if (!merchantStoreId) {
        setItems([]);
        setNextCursor(null);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }
      // Never run two requests for the same list at once: a load-more racing a
      // refresh could otherwise append a page from a superseded cursor.
      const generation = generationRef.current;
      if (inFlightGenerationRef.current === generation) return;
      if (mode === 'more' && cursorRef.current == null) return;

      inFlightGenerationRef.current = generation;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'more') setLoadingMore(true);
      else setLoading(true);
      if (mode !== 'more') setError(null);

      try {
        const cursor = mode === 'more' ? cursorRef.current : null;
        const page = await fetchPage(cursor);
        if (generation !== generationRef.current) return; // superseded — discard
        cursorRef.current = page.nextCursor;
        setNextCursor(page.nextCursor);
        setItems((previous) => {
          if (mode !== 'more') return page.items;
          // A cursor walks invoices, so one record can straddle a page boundary.
          // De-duplicate by stable key — never by a coincidence like an amount.
          const seen = new Set(previous.map(keyOf));
          return [...previous, ...page.items.filter((item) => !seen.has(keyOf(item)))];
        });
        setError(null);
      } catch (e) {
        if (generation !== generationRef.current) return;
        const message = e instanceof Error ? e.message : fallbackError;
        setError(message);
        // A failed FIRST page must not leave a half-list that reads as "this
        // store has no data"; a failed load-more keeps what already loaded.
        if (mode !== 'more') {
          setItems([]);
          setNextCursor(null);
          cursorRef.current = null;
        }
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
        if (inFlightGenerationRef.current === generation) {
          inFlightGenerationRef.current = null;
        }
      }
    },
    [merchantStoreId, fetchPage, keyOf, fallbackError],
  );

  // Reset + reload whenever the store or the query inputs change.
  useEffect(() => {
    generationRef.current += 1;
    cursorRef.current = null;
    setItems([]);
    setNextCursor(null);
    setError(null);
    void load('initial');
  }, [load]);

  // An in-app action that changed this store's BTCPay data (creating an invoice,
  // for example) re-runs the normal fetch, so the app is never permanently stale.
  useEffect(() => {
    return subscribeActivityStale((staleStoreId) => {
      if (staleStoreId === merchantStoreId) void load('refresh');
    });
  }, [load, merchantStoreId]);

  const refresh = useCallback(async () => {
    generationRef.current += 1;
    cursorRef.current = null;
    await load('refresh');
  }, [load]);

  const loadMore = useCallback(() => load('more'), [load]);

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    hasMore: nextCursor != null,
    error,
    refresh,
    loadMore,
  };
}
