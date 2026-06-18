import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useMerchantStores } from '@/hooks/use-merchant-stores';
import type { MerchantStore } from '@/types/merchant-store';

const ACTIVE_STORE_STORAGE_KEY = 'hachisu.activeMerchantStoreId';

interface ActiveStoreContextValue {
  /** All of the authenticated merchant's stores (default first, then oldest). */
  stores: MerchantStore[];
  /** The currently selected store the dashboard is scoped to, or null. */
  activeStore: MerchantStore | null;
  /** Convenience accessor for `activeStore?.id ?? null`. */
  activeMerchantStoreId: string | null;
  /** Select a store as the dashboard context. Persists across launches. */
  setActiveStoreId: (storeId: string) => void;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const ActiveStoreContext = createContext<ActiveStoreContextValue | null>(null);

/**
 * Tracks which merchant store the dashboard is currently scoped to.
 *
 * Resolution order for the active store:
 *   1. The in-app selection (if that store still exists)
 *   2. The selection persisted to AsyncStorage on a previous launch
 *   3. user_profiles.default_merchant_store_id
 *   4. The first / oldest available store
 */
export function ActiveStoreProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { stores, loading, error, refetch } = useMerchantStores();

  // `selectedId` is the user's explicit choice. `null` means "not chosen yet",
  // in which case we fall back to the persisted / default / first store.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [persistedId, setPersistedId] = useState<string | null>(null);

  // Hydrate the last-used store id from storage once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ACTIVE_STORE_STORAGE_KEY)
      .then((value) => {
        if (!cancelled && value) setPersistedId(value);
      })
      .catch(() => {
        // Non-fatal: fall back to default/first store.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeStore = useMemo<MerchantStore | null>(() => {
    if (stores.length === 0) return null;

    const byId = (id: string | null | undefined) =>
      id ? stores.find((s) => s.id === id) ?? null : null;

    return (
      byId(selectedId) ??
      byId(persistedId) ??
      byId(profile?.default_merchant_store_id) ??
      stores.find((s) => s.is_default) ??
      stores[0] ??
      null
    );
  }, [stores, selectedId, persistedId, profile?.default_merchant_store_id]);

  const setActiveStoreId = useCallback((storeId: string) => {
    setSelectedId(storeId);
    setPersistedId(storeId);
    AsyncStorage.setItem(ACTIVE_STORE_STORAGE_KEY, storeId).catch(() => {
      // Non-fatal: selection still applies for this session.
    });
  }, []);

  const value = useMemo<ActiveStoreContextValue>(
    () => ({
      stores,
      activeStore,
      activeMerchantStoreId: activeStore?.id ?? null,
      setActiveStoreId,
      loading,
      error,
      refetch,
    }),
    [stores, activeStore, setActiveStoreId, loading, error, refetch],
  );

  return (
    <ActiveStoreContext.Provider value={value}>{children}</ActiveStoreContext.Provider>
  );
}

export function useActiveStore(): ActiveStoreContextValue {
  const context = useContext(ActiveStoreContext);

  if (!context) {
    throw new Error('useActiveStore must be used within an ActiveStoreProvider');
  }

  return context;
}
