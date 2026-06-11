import { useCallback, useEffect, useState } from 'react';

import { fetchMerchantStores } from '@/lib/btcpay/stores';
import {
  summarizeStores,
  type MerchantStore,
  type StoreSummary,
} from '@/types/merchant-store';

export interface UseMerchantStoresResult {
  stores: MerchantStore[];
  summary: StoreSummary;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** Loads the authenticated merchant's stores and a derived summary. */
export function useMerchantStores(): UseMerchantStoresResult {
  const [stores, setStores] = useState<MerchantStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStores(await fetchMerchantStores());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load stores.');
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { stores, summary: summarizeStores(stores), loading, error, refetch };
}
