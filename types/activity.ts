// Mobile-side shapes of BTCPay-derived records. BTCPay Server is the source of
// truth; the app only ever renders these normalized records (never raw BTCPay
// JSON), and never re-derives a status, rail, or asset from a raw string.
//
// Two distinct models live here, and they are deliberately NOT the same dataset:
//
//   ActivityItem       — an INVOICE lifecycle record (created/unpaid/processing/
//                        settled/expired/invalid). Backs the Invoices screen and
//                        the invoice half of the payment detail screen.
//   StoreActivityEvent — a PAYMENT: one financially meaningful transaction the
//                        store actually received. Backs the Activity feed. An
//                        expired unpaid invoice is an ActivityItem with no
//                        StoreActivityEvent.

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

/**
 * BTCPay's invoice EXCEPTION status (`additionalStatus`) — its second status
 * axis, and the only authoritative way to tell a plainly settled invoice from
 * one paid late, partially, or over. Kept separate from the primary status.
 */
export type InvoiceExceptionStatus =
  | 'none'
  | 'paidPartial'
  | 'paidLate'
  | 'paidOver'
  | 'marked'
  | 'invalid'
  | 'unknown';

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
 * Whether an item's enriched (payment-detail) fields loaded. List endpoints now
 * receive payments inline from BTCPay in the SAME request as the invoices, so
 * they report 'complete'/'not_required' and have no partial-failure mode; the
 * single-invoice detail endpoint still fetches payment details separately and
 * reports 'failed' when that call fails. `null` enriched fields alone are
 * ambiguous (unpaid vs. lookup-failed), so this status disambiguates.
 */
export type EnrichmentStatus = 'complete' | 'partial' | 'failed' | 'not_required';

/** Enriched fields an item may report as unavailable when enrichment failed. */
export type UnavailableActivityField =
  | 'cryptoAmount'
  | 'cryptoAsset'
  | 'paymentRail'
  | 'paidAt'
  | 'settledAt';

/** An INVOICE lifecycle record. */
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
  /** Amount received so far in the pricing currency; null when not reported. */
  paidAmount: string | null;
  /** BTCPay's exception status — paid late/partial/over, marked, invalid. */
  exceptionStatus: InvoiceExceptionStatus;
  /** Number of payments BTCPay has recorded against this invoice. */
  paymentCount: number;
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
  /** ISO timestamp the invoice expires/expired, when known. */
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

// ---------------------------------------------------------------------------
// Activity: PAYMENT events
// ---------------------------------------------------------------------------

/** THIS payment's status. BTCPay records Settled | Processing | Invalid. */
export type PaymentEventStatus = 'settled' | 'processing' | 'invalid';
export type PaymentEventDisplayStatus = 'Settled' | 'Processing' | 'Failed';

/**
 * One financially meaningful payment received by the store. The Activity feed is
 * a list of these — NOT of invoices — so two payments against one invoice are
 * two rows and an unpaid invoice is no row at all.
 */
export interface StoreActivityEvent {
  /** Stable unique key `${invoiceId}:${paymentId}` — never deduped by invoice. */
  id: string;
  type: 'payment';
  btcpayInvoiceId: string;
  paymentId: string;
  status: PaymentEventStatus;
  displayStatus: PaymentEventDisplayStatus;
  /** ISO timestamp the payment was received. The feed's sort key. */
  receivedAt: string;
  invoiceCreatedAt: string;
  /** This payment's value in the invoice currency (value x rate). Null when
   * BTCPay reported no rate — never fabricated. */
  fiatAmount: string | null;
  fiatCurrency: string;
  /** The full invoice price, for comparison against this payment. */
  invoiceAmount: string;
  invoiceStatus: ActivityStatus;
  invoiceDisplayStatus: ActivityDisplayStatus;
  invoiceExceptionStatus: InvoiceExceptionStatus;
  /** This payment's crypto amount, exactly as BTCPay reported it. */
  cryptoAmount: string;
  cryptoAsset: PaymentAsset | null;
  paymentRail: PaymentRail;
  paymentMethodId: string | null;
  paymentMethodLabel: PaymentMethodLabel;
  fee: string | null;
  rate: string | null;
  address: string | null;
  orderId: string | null;
  paymentRequestId: string | null;
  description: string | null;
  sourceFeature: ActivitySourceFeature;
  title: string;
}

export interface StoreActivityResponse {
  ok: boolean;
  merchantStoreId: string;
  btcpayStoreId: string;
  source: 'btcpay';
  items: StoreActivityEvent[];
  /** Opaque cursor for the next page, or null when history is exhausted. */
  nextCursor: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Invoices list
// ---------------------------------------------------------------------------

export interface StoreInvoicesResponse {
  ok: boolean;
  merchantStoreId: string;
  btcpayStoreId: string;
  source: 'btcpay';
  items: ActivityItem[];
  nextCursor: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Activity DETAIL (durable single-record retrieval).
//
// The detail screen routes by durable identifiers (merchantStoreId + invoiceId,
// plus an optional paymentId) and fetches the authoritative record from
// get-btcpay-activity-detail, so a payment detail survives app restarts, bundle
// reloads, deep links, and cache loss.
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
  /** Every payment recorded against the invoice (empty when it has none). */
  events?: StoreActivityEvent[];
  /** Present only on failures. */
  code?: ActivityDetailErrorCode;
  error?: string;
}

/** The full detail payload: the invoice plus its individual payments. */
export interface ActivityDetail {
  item: ActivityItem;
  events: StoreActivityEvent[];
}

// ---------------------------------------------------------------------------
// Reporting CSV export
// ---------------------------------------------------------------------------

/** Non-sensitive failure codes from the export endpoint. */
export type StoreReportExportErrorCode =
  | 'INVALID_REQUEST'
  | 'SERVER_MISCONFIGURED'
  | 'REPORT_TOO_LARGE'
  | 'BTCPAY_UNAVAILABLE';

/**
 * A BTCPay-equivalent reporting CSV derived from authoritative Greenfield
 * invoice/payment data — NOT the canonical file BTCPay itself generates. See
 * supabase/functions/_shared/report-rows.ts for which columns are copied
 * verbatim and which are reconstructed.
 *
 * There is deliberately no `truncated` flag: the export is complete for the
 * requested range or it fails with a code. A partial accounting file is never
 * returned.
 */
export interface StoreReportExportResponse {
  ok: boolean;
  merchantStoreId?: string;
  source?: 'btcpay';
  /** Server-authored, path-safe filename. */
  filename?: string;
  csv?: string;
  rowCount?: number;
  invoiceCount?: number;
  /** `startDate` is null when the export covered all available history. */
  range?: { startDate: string | null; endDate: string };
  /** Present only on failures. */
  code?: StoreReportExportErrorCode;
  error?: string;
}
