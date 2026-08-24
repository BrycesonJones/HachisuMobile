import type { CreatedInvoice } from '@/lib/btcpay/invoices';
import type {
  ActivityDisplayStatus,
  ActivityItem,
  ActivityStatus,
} from '@/types/activity';

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

// ---------------------------------------------------------------------------
// Seeding a just-created invoice
// ---------------------------------------------------------------------------

/**
 * Seeds the cache from the authoritative create-invoice response so the Payment
 * Details screen can paint — and share the checkout URL — without waiting for a
 * second backend round-trip for data Hachisu already holds.
 *
 * This is still only initial data: useActivityDetail always fetches the
 * authoritative record and overwrites this entry. It is therefore written to be
 * conservative and never optimistic:
 *   - Payment fields (crypto amount, asset, rail, paidAt, settledAt) are null /
 *     unknown, because a brand-new invoice has no payment. Nothing is fabricated.
 *   - `enrichmentStatus` is 'not_required' — there is genuinely nothing to
 *     enrich yet, which is different from "enrichment failed".
 *   - If BTCPay reported a status this mapping does not recognize, NOTHING is
 *     seeded and the screen simply waits for the authoritative fetch, rather
 *     than guessing a status.
 */
export function seedCreatedInvoice(
  merchantStoreId: string,
  invoice: CreatedInvoice,
): void {
  const mapped = mapBtcpayStatus(invoice.status);
  if (!mapped) return; // Unknown/absent status — never guess; let the fetch decide.

  const item: ActivityItem = {
    id: invoice.btcpayInvoiceId,
    type: 'invoice',
    btcpayInvoiceId: invoice.btcpayInvoiceId,
    status: mapped.status,
    displayStatus: mapped.displayStatus,
    amount: invoice.amount,
    currency: invoice.currency,
    cryptoAmount: null,
    cryptoAsset: null,
    paymentRail: 'unknown',
    paymentMethodId: null,
    paymentMethodLabel: 'Payment method unavailable',
    multiMethod: false,
    breakdown: [],
    title: 'Invoice',
    description: invoice.description,
    orderId: invoice.orderId,
    createdAt: invoice.createdAt,
    expiresAt: invoice.expiresAt,
    paidAt: null,
    settledAt: null,
    checkoutUrl: invoice.checkoutUrl,
    sourceFeature: 'invoice',
    rawStatus: invoice.status ?? '',
    enrichmentStatus: 'not_required',
    unavailableFields: [],
  };
  upsertActivityItem(merchantStoreId, item);
}

/** Maps BTCPay's raw invoice status to Hachisu's normalized pair. Mirrors the
 * backend's normalizeStatus for the statuses a NEWLY created invoice can carry;
 * anything else returns null so the caller declines to seed. */
function mapBtcpayStatus(
  raw: string | null,
): { status: ActivityStatus; displayStatus: ActivityDisplayStatus } | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'new':
      return { status: 'new', displayStatus: 'Pending' };
    case 'processing':
      return { status: 'processing', displayStatus: 'Processing' };
    case 'expired':
      return { status: 'expired', displayStatus: 'Expired' };
    case 'invalid':
      return { status: 'invalid', displayStatus: 'Failed' };
    default:
      return null;
  }
}
