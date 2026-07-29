import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchOnchainWalletBalance,
  type BalanceErrorCode,
  type OnchainWalletBalance,
} from '@/lib/btcpay/wallet-balance';
import type { MerchantStore } from '@/types/merchant-store';

/**
 * The dashboard balance is one of several mutually-exclusive states. These are
 * deliberately distinct so a disconnected/disabled wallet, a loading state, a
 * fetch error, and a real zero balance can never be confused for one another.
 */
export type BalanceViewState =
  | { kind: 'no-store' }
  | { kind: 'not-connected' }
  | { kind: 'disabled' }
  | { kind: 'loading' }
  | { kind: 'error'; code: BalanceErrorCode; message: string }
  | { kind: 'ready'; balance: OnchainWalletBalance };

export interface UseStoreBalanceResult {
  state: BalanceViewState;
  /** Pull-to-refresh in progress (a prior balance stays visible while true). */
  refreshing: boolean;
  refetch: () => Promise<void>;
}

/** Whether a store's wallet is connected AND enabled (so a balance can load). */
function isFetchable(store: MerchantStore | null): boolean {
  return (
    !!store && store.onchain_status === 'connected' && store.onchain_enabled !== false
  );
}

/**
 * Loads the on-chain Bitcoin balance for the ACTIVE merchant store.
 *
 * Store isolation: the balance is cleared IMMEDIATELY when the store changes
 * (synchronously, before any network call) and a stale-response guard drops a
 * slow response from a previous store, so one store's balance can never flash
 * under another. The balance request is only made when the wallet is connected
 * and enabled — otherwise a not-connected / disabled state is shown with no
 * request. A fetch error never becomes a fake zero balance.
 */
export function useStoreBalance(store: MerchantStore | null): UseStoreBalanceResult {
  const [balance, setBalance] = useState<OnchainWalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ code: BalanceErrorCode; message: string } | null>(null);

  const storeId = store?.id ?? null;
  const fetchable = isFetchable(store);
  // Only re-run the loader when something that affects fetching changes.
  const fetchKey = fetchable ? storeId : null;

  // Guards against a stale response from a previous store overwriting newer data.
  const requestKeyRef = useRef<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!fetchKey) {
        requestKeyRef.current = null;
        setBalance(null);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      requestKeyRef.current = fetchKey;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const result = await fetchOnchainWalletBalance(fetchKey);
      if (requestKeyRef.current !== fetchKey) return; // superseded by a newer store

      if (result.ok && result.balance) {
        setBalance(result.balance);
        setError(null);
      } else {
        // Keep any existing balance visible (non-destructive) but record the error
        // so the loading→error transition can show a retry when nothing loaded yet.
        setError({ code: result.code as BalanceErrorCode, message: result.error ?? 'Could not load the balance.' });
      }
      setLoading(false);
      setRefreshing(false);
    },
    [fetchKey],
  );

  // Clear immediately on store change, then load fresh for the new store.
  useEffect(() => {
    setBalance(null);
    setError(null);
    load(false);
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  // Derive the single view state. Connection/enabled states come straight from
  // the store row (no fetch); balance/loading/error come from the request.
  let state: BalanceViewState;
  if (!store) {
    state = { kind: 'no-store' };
  } else if (store.onchain_status !== 'connected') {
    state = { kind: 'not-connected' };
  } else if (store.onchain_enabled === false) {
    state = { kind: 'disabled' };
  } else if (balance) {
    // A real balance takes precedence — a background refresh error never hides it.
    state = { kind: 'ready', balance };
  } else if (error && !loading) {
    state = { kind: 'error', code: error.code, message: error.message };
  } else {
    state = { kind: 'loading' };
  }

  return { state, refreshing, refetch };
}
