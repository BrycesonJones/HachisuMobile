import type { ActivityItem } from '@/types/activity';

// A lightweight in-memory registry of the most recently loaded Activity items,
// scoped by (merchantStoreId, invoiceId). The Activity list populates it on every
// fetch and the detail screen reads it for immediate initial data before the
// authoritative single-record fetch resolves.
//
// It is an OPTIMIZATION, never the source of truth: a miss must trigger a backend
// fetch, not a failure. Keys are scoped by store because a BTCPay invoice id is
// only guaranteed unique WITHIN a store — an invoice id alone could otherwise
// collide across two of the merchant's stores.
const cache = new Map<string, ActivityItem>();

function keyFor(merchantStoreId: string, invoiceId: string): string {
  return `${merchantStoreId}::${invoiceId}`;
}

/** Populates the cache for a store from a freshly loaded list page. */
export function cacheActivityItems(merchantStoreId: string, items: ActivityItem[]): void {
  for (const item of items) {
    cache.set(keyFor(merchantStoreId, item.btcpayInvoiceId), item);
  }
}

/** Reads a cached item for a store, or undefined on a miss (never throws). */
export function getCachedActivityItem(
  merchantStoreId: string,
  invoiceId: string,
): ActivityItem | undefined {
  return cache.get(keyFor(merchantStoreId, invoiceId));
}

/**
 * Patches the cache with an authoritative item after a successful detail fetch,
 * so a later list navigation shows the freshest record. The item carries its own
 * enrichmentStatus, so this never marks a partial record as complete.
 */
export function upsertActivityItem(merchantStoreId: string, item: ActivityItem): void {
  cache.set(keyFor(merchantStoreId, item.btcpayInvoiceId), item);
}

// ---------------------------------------------------------------------------
// Staleness signal
// ---------------------------------------------------------------------------
//
// When the app itself causes a store's BTCPay activity to change (creating an
// invoice, for example), the Activity feed must not wait for a restart or a
// manual pull-to-refresh. Rather than introducing a second activity system, this
// is a minimal notification into the EXISTING pipeline: a producer marks a store
// stale and the existing useStoreActivity hook re-runs its normal fetch.
//
// Deliberately not a cache write: the new record is fetched from the backend
// (BTCPay stays authoritative) instead of being synthesized locally.

type StaleListener = (merchantStoreId: string) => void;

const staleListeners = new Set<StaleListener>();

/** Subscribes to stale notifications. Returns an unsubscribe function. */
export function subscribeActivityStale(listener: StaleListener): () => void {
  staleListeners.add(listener);
  return () => {
    staleListeners.delete(listener);
  };
}

/** Marks a store's activity stale so any mounted feed for it re-fetches. */
export function markStoreActivityStale(merchantStoreId: string): void {
  for (const listener of [...staleListeners]) {
    try {
      listener(merchantStoreId);
    } catch {
      // A misbehaving subscriber must never break the producer's flow.
    }
  }
}
