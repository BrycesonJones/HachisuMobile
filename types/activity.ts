// Mobile-side shape of a BTCPay-derived Activity item. Mirrors the normalized
// output of the get-btcpay-store-activity Edge Function. BTCPay is the source of
// truth; the app only ever renders these normalized records (never raw BTCPay JSON).

export type ActivityStatus =
  | 'new'
  | 'processing'
  | 'settled'
  | 'expired'
  | 'invalid'
  | 'failed';

export type ActivityDisplayStatus =
  | 'Pending'
  | 'Processing'
  | 'Paid'
  | 'Settled'
  | 'Expired'
  | 'Failed';

/** Settlement asset of a received crypto payment. Distinct from invoice currency. */
export type PaymentAsset = 'BTC' | 'L-BTC';

/** The rail a payment arrived on. `unknown` is used rather than guessing. */
export type PaymentRail = 'onchain' | 'lightning' | 'liquid' | 'unknown';

/** User-facing payment-method label, authored server-side from authoritative data. */
export type PaymentMethodLabel =
  | 'Bitcoin · On-chain'
  | 'Bitcoin · Lightning'
  | 'Liquid'
  | 'Payment method unavailable'
  | 'Paid with multiple methods';

/** One settled (asset, rail) leg of a multi-method invoice. */
export interface PaymentBreakdownEntry {
  cryptoAmount: string | null;
  cryptoAsset: PaymentAsset | null;
  paymentRail: PaymentRail;
  paymentMethodId: string | null;
  paymentMethodLabel: Exclude<PaymentMethodLabel, 'Paid with multiple methods'>;
}

export type ActivitySourceFeature =
  | 'pay_button'
  | 'invoice'
  | 'pos'
  | 'request'
  | 'unknown';

/**
 * Whether an item's/feed's enriched (payment-detail) fields loaded. Enrichment is
 * a SEPARATE stage from base retrieval: a base success is never shown as fully
 * complete when enrichment failed silently. `null` enriched fields alone are
 * ambiguous (unpaid vs. lookup-failed), so this status disambiguates.
 *   complete     — every required enrichment succeeded
 *   partial      — some succeeded, some failed
 *   failed       — all required enrichment failed (base records still valid)
 *   not_required — no items needed enrichment
 */
export type EnrichmentStatus = 'complete' | 'partial' | 'failed' | 'not_required';

/** Enriched fields an item may report as unavailable when enrichment failed. */
export type UnavailableActivityField =
  | 'cryptoAmount'
  | 'cryptoAsset'
  | 'paymentRail'
  | 'paidAt'
  | 'settledAt';

/** Feed-level enrichment rollup (aggregate counts only; no raw error details). */
export interface ActivityFeedEnrichment {
  status: EnrichmentStatus;
  attemptedCount: number;
  succeededCount: number;
  failedCount: number;
  retryableCount: number;
}

export interface ActivityItem {
  id: string;
  type: 'invoice';
  btcpayInvoiceId: string;
  status: ActivityStatus;
  displayStatus: ActivityDisplayStatus;
  /** Invoice pricing amount (fiat/display) as a string, e.g. "1.00". NOT crypto. */
  amount: string;
  /** Invoice pricing currency, e.g. "USD". NOT the settlement asset. */
  currency: string;
  /** Crypto amount actually received (single-asset invoices), as a string. */
  cryptoAmount: string | null;
  /** Settlement asset of the received crypto. Null when unknown/unavailable. */
  cryptoAsset: PaymentAsset | null;
  /** Rail the payment arrived on. `unknown` when not authoritatively derivable. */
  paymentRail: PaymentRail;
  /** Raw BTCPay payment-method id, preserved for debugging (e.g. "BTC-CHAIN"). */
  paymentMethodId: string | null;
  paymentMethodLabel: PaymentMethodLabel;
  /** True when the invoice was settled across more than one asset/rail. */
  multiMethod: boolean;
  /** Per-(asset,rail) legs. Empty unless `multiMethod` is true. */
  breakdown: PaymentBreakdownEntry[];
  title: string;
  description: string | null;
  orderId: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp the invoice expires/expired, when known. Present on detail fetches. */
  expiresAt?: string | null;
  paidAt: string | null;
  settledAt: string | null;
  checkoutUrl: string | null;
  sourceFeature: ActivitySourceFeature;
  rawStatus: string;
  /** Whether this item's enriched (payment-detail) fields loaded successfully. */
  enrichmentStatus: EnrichmentStatus;
  /** Enriched fields that could not be loaded (empty unless enrichment failed). */
  unavailableFields: UnavailableActivityField[];
}

export interface StoreActivityRange {
  startDate: string;
  endDate: string;
}

export interface StoreActivityResponse {
  ok: boolean;
  merchantStoreId: string;
  btcpayStoreId: string;
  source: 'btcpay';
  range: StoreActivityRange;
  items: ActivityItem[];
  /** Feed-level enrichment rollup. Optional for back-compat with older responses. */
  enrichment?: ActivityFeedEnrichment;
  nextOffset: number | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Activity DETAIL (durable single-record retrieval).
//
// The detail screen routes by durable identifiers (merchantStoreId + invoiceId)
// and fetches the authoritative record from get-btcpay-activity-detail, so a
// payment detail survives app restarts, bundle reloads, deep links, and cache
// loss. The returned `item` is the SAME normalized ActivityItem shape as the
// feed, so a cached list item is valid initial data for the detail screen.
// ---------------------------------------------------------------------------

/** Non-sensitive error codes the detail endpoint returns; each maps to a screen state. */
export type ActivityDetailErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_ACCESS_DENIED'
  | 'INVOICE_NOT_FOUND'
  | 'BTCPAY_DETAIL_FETCH_FAILED'
  | 'BTCPAY_DETAIL_TIMEOUT'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'SERVER_MISCONFIGURED';

export interface ActivityDetailResponse {
  ok: boolean;
  merchantStoreId?: string;
  btcpayStoreId?: string;
  source?: 'btcpay';
  item?: ActivityItem;
  /** Present only on failures. */
  code?: ActivityDetailErrorCode;
  error?: string;
}
