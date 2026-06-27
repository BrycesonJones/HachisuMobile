import { useCallback, useEffect, useState } from 'react';

import { fetchPosApps } from '@/lib/btcpay/pos-apps';
import type { PosApp } from '@/types/pos-app';

export interface UsePosAppsResult {
  posApps: PosApp[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** Loads the POS apps for a merchant store. Pass null to stay idle/empty. */
export function usePosApps(merchantStoreId: string | null): UsePosAppsResult {
  const [posApps, setPosApps] = useState<PosApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!merchantStoreId) {
      setPosApps([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPosApps(await fetchPosApps(merchantStoreId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load POS apps.');
      setPosApps([]);
    } finally {
      setLoading(false);
    }
  }, [merchantStoreId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { posApps, loading, error, refetch };
}
