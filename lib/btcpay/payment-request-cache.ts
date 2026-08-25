import type { HachisuPaymentRequest } from '@/lib/btcpay/payment-requests';

// In-memory registry of recently seen payment requests, scoped by
// (merchantStoreId, paymentRequestId) — same shape and same rules as
// activity-cache: it is an OPTIMIZATION, never the source of truth. The create
// screen seeds it from the authoritative create response so the detail screen
// paints — and can share the request URL — without a second round-trip; the
// detail screen still fetches the authoritative record and overwrites this.
// A miss must trigger a backend fetch, not a failure.
const cache = new Map<string, HachisuPaymentRequest>();

function keyFor(merchantStoreId: string, paymentRequestId: string): string {
  return `${merchantStoreId}::${paymentRequestId}`;
}

/** Seeds/refreshes the cache with an authoritative backend record. */
export function upsertPaymentRequest(
  merchantStoreId: string,
  paymentRequest: HachisuPaymentRequest,
): void {
  cache.set(keyFor(merchantStoreId, paymentRequest.btcpayPaymentRequestId), paymentRequest);
}

/** Reads a cached record, or undefined on a miss (never throws). */
export function getCachedPaymentRequest(
  merchantStoreId: string,
  paymentRequestId: string,
): HachisuPaymentRequest | undefined {
  return cache.get(keyFor(merchantStoreId, paymentRequestId));
}
