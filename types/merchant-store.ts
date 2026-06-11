import type { Tables } from '@/types/supabase';

export type MerchantStore = Tables<'merchant_stores'>;

/** Aggregate view of a merchant's stores, used by the Wallet UI + profile menu. */
export interface StoreSummary {
  storeCount: number;
  defaultStore: MerchantStore | null;
  hasAnyStore: boolean;
  hasPaymentDestinationConnected: boolean;
}

/** True when a store has any Lightning or on-chain destination connected. */
export function storeHasPaymentDestination(store: MerchantStore): boolean {
  return (
    store.wallet_status === 'payment_destination_connected' ||
    store.lightning_status === 'connected' ||
    store.onchain_status === 'connected'
  );
}

export function summarizeStores(stores: readonly MerchantStore[]): StoreSummary {
  const defaultStore = stores.find((s) => s.is_default) ?? stores[0] ?? null;
  return {
    storeCount: stores.length,
    defaultStore,
    hasAnyStore: stores.length > 0,
    hasPaymentDestinationConnected: stores.some(storeHasPaymentDestination),
  };
}

/** "1 store ready" / "2 stores ready" / "Not set up". */
export function storeCountLabel(summary: StoreSummary): string {
  if (!summary.hasAnyStore) return 'Not set up';
  const noun = summary.storeCount === 1 ? 'store' : 'stores';
  return `${summary.storeCount} ${noun} ready`;
}

/** Wallet/payment-destination status label for a single store row. */
export function merchantStoreStatusLabel(store: MerchantStore): string {
  if (storeHasPaymentDestination(store)) return 'Connected';
  switch (store.store_provisioning_status) {
    case 'provisioning':
      return 'Creating store…';
    case 'failed':
      return 'Setup failed';
    case 'active':
    default:
      return 'Store ready';
  }
}
