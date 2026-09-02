import type { Tables } from '@/types/supabase';

// The wallet-readiness predicate lives in the framework-free payment gate module
// (unit-tested under node --test) and is re-exported here so existing callers can
// keep importing it from the store types. Single source of truth.
export { isOnchainReadyForPayments } from '@/lib/payments/wallet-gate';

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

/** Bitcoin on-chain wallet status label for a single store. */
export function onchainStatusLabel(store: MerchantStore): string {
  switch (store.onchain_status) {
    case 'connected':
      return 'Connected';
    case 'pending_confirmation':
      return 'Pending…';
    case 'error':
      return 'Error';
    case 'not_connected':
    default:
      return 'Not connected';
  }
}

/** True when the store's Bitcoin on-chain wallet is connected. */
export function isOnchainConnected(store: MerchantStore): boolean {
  return store.onchain_status === 'connected';
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
