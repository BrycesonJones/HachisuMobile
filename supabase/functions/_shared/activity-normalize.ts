// Shared BTCPay-invoice normalization + failure-isolated enrichment.
//
// This is the SINGLE source of truth for turning a raw BTCPay invoice into the
// mobile-facing Activity model. Both the Activity FEED (get-btcpay-store-activity)
// and the Activity DETAIL (get-btcpay-activity-detail) import from here so a
// record looks identical whether it arrived in a list page or was fetched on its
// own by durable id. BTCPay is the source of truth; the app only ever renders
// these normalized records (never raw BTCPay JSON).
//
// Design invariants (do not weaken):
//   - Base retrieval and per-invoice enrichment (the payment-methods call) are
//     SEPARATE stages. Enrichment failure NEVER overwrites the authoritative base
//     invoice status (a settled invoice stays Settled even if paidAt can't load).
//   - `null` enriched fields alone are ambiguous (unpaid vs. lookup-failed), so
//     every item carries an explicit enrichmentStatus + the fields that could not
//     be loaded.
//   - A payment rail/asset is NEVER guessed. `unknown` is used instead.

import {
  BtcpayApiError,
  BtcpayTimeoutError,
  getInvoicePaymentMethods,
  sanitizeCheckoutLink,
  type BtcpayConfig,
  type BtcpayInvoice,
  type BtcpayInvoicePaymentMethod,
} from './btcpay-client.ts';
import {
  normalizeBtcpayPaymentMethod,
  sumCryptoAmounts,
  cryptoAmountToBaseUnits,
  type PaymentAsset,
  type PaymentMethodLabel,
  type PaymentRail,
} from './payment-method.ts';

// Per-invoice enrichment (the payment-methods call) is failure-isolated and
// bounded so a slow or broken BTCPay can never hang or silently degrade a record.
export const ENRICH_CONCURRENCY = 6;
export const ENRICH_TIMEOUT_MS = 8_000;

export type NormalizedStatus =
  | 'new'
  | 'processing'
  | 'settled'
  | 'expired'
  | 'invalid'
  | 'failed';
export type DisplayStatus =
  | 'Pending'
  | 'Processing'
  | 'Paid'
  | 'Settled'
  | 'Expired'
  | 'Failed';
export type SourceFeature = 'pay_button' | 'invoice' | 'pos' | 'request' | 'unknown';

/**
 * Normalized invoice EXCEPTION status (Greenfield `additionalStatus`). This is
 * BTCPay's own second status axis and is what distinguishes a plainly settled
 * invoice from one that was paid late, partially, or over. It is deliberately
 * separate from the primary status rather than collapsed into it.
 */
export type InvoiceExceptionStatus =
  | 'none'
  | 'paidPartial'
  | 'paidLate'
  | 'paidOver'
  | 'marked'
  | 'invalid'
  | 'unknown';

export function normalizeExceptionStatus(raw: unknown): InvoiceExceptionStatus {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  switch (value) {
    case '':
    case 'none':
      return 'none';
    case 'paidpartial':
      return 'paidPartial';
    case 'paidlate':
      return 'paidLate';
    case 'paidover':
      return 'paidOver';
    case 'marked':
      return 'marked';
    case 'invalid':
      return 'invalid';
    default:
      return 'unknown';
  }
}

/** Top-level label; adds a multi-method value to the per-method labels. */
export type ActivityPaymentLabel = PaymentMethodLabel | 'Paid with multiple methods';

// ---------------------------------------------------------------------------
// Enrichment status: makes partial/failed enrichment explicit and truthful.
// ---------------------------------------------------------------------------

export type EnrichmentStatus = 'complete' | 'partial' | 'failed' | 'not_required';

/** Enriched fields that can be reported as unavailable (existing item field names). */
export type UnavailableField =
  | 'cryptoAmount'
  | 'cryptoAsset'
  | 'paymentRail'
  | 'paidAt'
  | 'settledAt';

/** Normalized, non-sensitive enrichment error codes (internal diagnostics). */
export type EnrichmentErrorCode =
  | 'PAYMENT_DETAILS_NOT_FOUND'
  | 'PAYMENT_METHOD_FETCH_FAILED'
  | 'BTCPAY_ENRICHMENT_TIMEOUT'
  | 'BTCPAY_RATE_LIMITED'
  | 'BTCPAY_UNAUTHORIZED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'UNKNOWN_ENRICHMENT_ERROR';

interface EnrichmentSuccess {
  ok: true;
  methods: BtcpayInvoicePaymentMethod[];
}
interface EnrichmentFailure {
  ok: false;
  code: EnrichmentErrorCode;
  retryable: boolean;
  httpStatus?: number;
}
export type EnrichmentOutcome = EnrichmentSuccess | EnrichmentFailure;

/** Feed-level rollup returned to the client (aggregate only — no raw errors). */
export interface FeedEnrichment {
  status: EnrichmentStatus;
  attemptedCount: number;
  succeededCount: number;
  failedCount: number;
  retryableCount: number;
}

/** A single settled (asset, rail) leg of a payment, for multi-method invoices. */
export interface PaymentBreakdownEntry {
  cryptoAmount: string | null;
  cryptoAsset: PaymentAsset | null;
  paymentRail: PaymentRail;
  paymentMethodId: string | null;
  paymentMethodLabel: PaymentMethodLabel;
}

export interface ActivityItem {
  id: string;
  type: 'invoice';
  btcpayInvoiceId: string;
  status: NormalizedStatus;
  displayStatus: DisplayStatus;
  /** Invoice pricing amount (fiat/display), e.g. "25.00". NOT the crypto amount. */
  amount: string;
  /** Invoice pricing currency, e.g. "USD". NOT the settlement asset. */
  currency: string;
  /** Amount received so far, in the invoice's pricing currency. Null when
   * BTCPay did not report it. Distinguishes partial from full payment. */
  paidAmount: string | null;
  /** BTCPay's exception status — paid late/partial/over, marked, invalid. */
  exceptionStatus: InvoiceExceptionStatus;
  /** How many payments BTCPay has recorded against this invoice. */
  paymentCount: number;
  /** Crypto amount actually received (single-asset invoices), as a string. */
  cryptoAmount: string | null;
  /** Settlement asset of the received crypto: "BTC" | "L-BTC" | null. */
  cryptoAsset: PaymentAsset | null;
  /** Rail the payment arrived on. Never guessed; `unknown` when not derivable. */
  paymentRail: PaymentRail;
  /** Raw BTCPay payment-method id, preserved for debugging (e.g. "BTC-CHAIN"). */
  paymentMethodId: string | null;
  paymentMethodLabel: ActivityPaymentLabel;
  /** True when the invoice was settled across more than one asset/rail. */
  multiMethod: boolean;
  /** Per-(asset,rail) legs. Empty unless multiMethod is true. */
  breakdown: PaymentBreakdownEntry[];
  title: string;
  description: string | null;
  orderId: string | null;
  createdAt: string;
  /** ISO timestamp the invoice expires/expired, when known. */
  expiresAt: string | null;
  paidAt: string | null;
  settledAt: string | null;
  checkoutUrl: string | null;
  sourceFeature: SourceFeature;
  rawStatus: string;
  /** Whether this item's enriched (payment-detail) fields loaded successfully. */
  enrichmentStatus: EnrichmentStatus;
  /** Enriched fields that could not be loaded (empty unless enrichment failed). */
  unavailableFields: UnavailableField[];
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export interface NormalizeInvoiceOptions {
  /** Configured BTCPay server URL. When given, the invoice's checkout link is
   * only surfaced if it belongs to that origin (see sanitizeCheckoutLink). */
  serverUrl?: string;
}

export function normalizeInvoice(
  invoice: BtcpayInvoice,
  outcome: EnrichmentOutcome | undefined,
  options: NormalizeInvoiceOptions = {},
): ActivityItem {
  const rawStatus = rawStatusOf(invoice);
  const status = normalizeStatus(rawStatus);
  const displayStatus = toDisplayStatus(status);

  const metadata = (invoice.metadata ?? {}) as Record<string, unknown>;
  const orderId = strOrNull(metadata.orderId);
  const itemDesc = strOrNull(metadata.itemDesc);
  const source = deriveSourceFeature(invoice, metadata, orderId);
  const createdAt = unixToIso(invoice.createdTime) ?? new Date().toISOString();
  const expiresAt = unixToIso(invoice.expirationTime);

  // Base record fields (authoritative) stay separate from enriched fields. The
  // enrichmentStatus reflects ONLY the enriched (payment-detail) stage; it never
  // overwrites the base invoice status above.
  const base = {
    id: invoice.id,
    type: 'invoice' as const,
    btcpayInvoiceId: invoice.id,
    status,
    displayStatus,
    amount: typeof invoice.amount === 'string' ? invoice.amount : '0',
    currency: typeof invoice.currency === 'string' ? invoice.currency : 'USD',
    paidAmount: strOrNull(invoice.paidAmount),
    exceptionStatus: normalizeExceptionStatus(invoice.additionalStatus),
    paymentCount: countInvoicePayments(invoice, outcome),
    title: titleForSource(source),
    description: itemDesc,
    orderId,
    createdAt,
    expiresAt,
    // Origin-checked against the configured BTCPay server when available, so a
    // link the merchant may share with a customer can never point elsewhere.
    checkoutUrl: options.serverUrl
      ? sanitizeCheckoutLink(invoice.checkoutLink, options.serverUrl)
      : strOrNull(invoice.checkoutLink),
    sourceFeature: source,
    rawStatus,
  };

  // Enrichment failed: do NOT fabricate values or guess a rail. Surface every
  // enriched field as unavailable while preserving the authoritative base status
  // (a settled invoice stays Settled even though its paid date could not load).
  if (outcome && !outcome.ok) {
    const unavailableFields: UnavailableField[] = [
      'cryptoAmount',
      'cryptoAsset',
      'paymentRail',
      'paidAt',
    ];
    if (status === 'settled') unavailableFields.push('settledAt');
    return {
      ...base,
      cryptoAmount: null,
      cryptoAsset: null,
      paymentRail: 'unknown',
      paymentMethodId: null,
      paymentMethodLabel: 'Payment method unavailable',
      multiMethod: false,
      breakdown: [],
      paidAt: null,
      settledAt: null,
      enrichmentStatus: 'failed',
      unavailableFields,
    };
  }

  // Enrichment succeeded (or wasn't required): derive from authoritative records.
  const methods = outcome?.ok ? outcome.methods : [];
  const payment = summarizeInvoicePayments(invoice, methods);
  const settledAt = status === 'settled' ? payment.paidAt : null;

  return {
    ...base,
    cryptoAmount: payment.cryptoAmount,
    cryptoAsset: payment.cryptoAsset,
    paymentRail: payment.paymentRail,
    paymentMethodId: payment.paymentMethodId,
    paymentMethodLabel: payment.paymentMethodLabel,
    multiMethod: payment.multiMethod,
    breakdown: payment.breakdown,
    paidAt: payment.paidAt,
    settledAt,
    enrichmentStatus: outcome ? 'complete' : 'not_required',
    unavailableFields: [],
  };
}

export function rawStatusOf(invoice: BtcpayInvoice): string {
  return typeof invoice.status === 'string' ? invoice.status : 'Unknown';
}

/**
 * Wraps payment methods that BTCPay already embedded in the invoice (from
 * `includePaymentMethods=true`) as a successful enrichment outcome. This is how
 * the list endpoints avoid an N+1 fetch: one Greenfield call returns invoices
 * AND their payments, so there is no separate stage that can partially fail.
 * Returns undefined when the invoice carries no embedded methods, so the caller
 * falls back to an explicit fetch rather than treating "absent" as "none".
 */
export function embeddedMethodsOutcome(
  invoice: BtcpayInvoice,
): EnrichmentOutcome | undefined {
  return Array.isArray(invoice.paymentMethods)
    ? { ok: true, methods: invoice.paymentMethods }
    : undefined;
}

/** Number of payments recorded against the invoice, from whichever authoritative
 * source is available. Returns 0 when payment data could not be loaded — callers
 * pair this with `enrichmentStatus`, so 0 is never read as "definitely unpaid". */
function countInvoicePayments(
  invoice: BtcpayInvoice,
  outcome: EnrichmentOutcome | undefined,
): number {
  const methods = outcome?.ok
    ? outcome.methods
    : Array.isArray(invoice.paymentMethods)
      ? invoice.paymentMethods
      : [];
  let total = 0;
  for (const method of methods) {
    if (Array.isArray(method.payments)) total += method.payments.length;
  }
  return total;
}

// NOTE: there is deliberately no status-based "does this invoice need payment
// details?" predicate any more. BTCPay leaves a PARTIALLY paid invoice in `New`
// until it expires, and an expired or invalid invoice can still hold real
// payments, so any status-based skip silently hides money. List endpoints now
// get payments inline (includePaymentMethods=true) and the single-invoice detail
// endpoint always fetches them.

export function normalizeStatus(raw: string): NormalizedStatus {
  switch (raw.toLowerCase()) {
    case 'new':
      return 'new';
    case 'processing':
    case 'paid': // legacy: seen-but-unconfirmed
      return 'processing';
    case 'settled':
    case 'complete': // legacy
    case 'confirmed': // legacy
      return 'settled';
    case 'expired':
      return 'expired';
    case 'invalid':
      return 'invalid';
    default:
      return 'failed';
  }
}

export function toDisplayStatus(status: NormalizedStatus): DisplayStatus {
  switch (status) {
    case 'new':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'settled':
      return 'Settled';
    case 'expired':
      return 'Expired';
    case 'invalid':
    case 'failed':
      return 'Failed';
  }
}

/** Detection of which feature created the invoice. Invoices Hachisu itself
 * created carry an explicit marker; for everything else this stays best-effort,
 * and a Pay Button payment vs. an invoice created outside the app remain
 * indistinguishable in Greenfield metadata, so that case is reported as
 * 'unknown' rather than guessed. Exported so report/event derivation
 * (_shared/report-rows.ts) attributes records identically to the feed. */
export function deriveSourceFeature(
  invoice: BtcpayInvoice,
  metadata: Record<string, unknown>,
  orderId: string | null,
): SourceFeature {
  // An invoice created by Hachisu's Create Invoice screen stamps its own marker
  // into BTCPay's (free-form) invoice metadata, so it can be attributed exactly
  // rather than guessed. Anything without a marker keeps the previous behavior.
  const hachisuSource = strOrNull(metadata.hachisuSource);
  if (hachisuSource === 'invoice') return 'invoice';

  if (metadata.paymentRequestId != null) return 'request';
  if (
    metadata.appId != null ||
    metadata.posData != null ||
    (orderId != null && orderId.toLowerCase().startsWith('pos'))
  ) {
    return 'pos';
  }
  return 'unknown';
}

export function titleForSource(source: SourceFeature): string {
  switch (source) {
    case 'request':
      return 'Payment Request';
    case 'pos':
      return 'Point of Sale';
    case 'pay_button':
      return 'Pay Button payment';
    case 'invoice':
      return 'Invoice';
    case 'unknown':
      return 'Payment';
  }
}

interface InvoicePaymentSummary {
  cryptoAmount: string | null;
  cryptoAsset: PaymentAsset | null;
  paymentRail: PaymentRail;
  paymentMethodId: string | null;
  paymentMethodLabel: ActivityPaymentLabel;
  multiMethod: boolean;
  breakdown: PaymentBreakdownEntry[];
  paidAt: string | null;
}

/**
 * Derives the crypto amount, asset, and rail from AUTHORITATIVE BTCPay payment
 * records only — never from store config, enabled methods, or the amount format.
 * Aggregates same-asset/rail legs exactly (BigInt) and reports multi-method
 * invoices as such rather than collapsing them into one mislabeled amount.
 */
function summarizeInvoicePayments(
  invoice: BtcpayInvoice,
  methods: BtcpayInvoicePaymentMethod[],
): InvoicePaymentSummary {
  // One accumulator per distinct (asset, rail) leg that actually received funds.
  const legs = new Map<
    string,
    {
      asset: PaymentAsset | null;
      paymentRail: PaymentRail;
      paymentMethodId: string | null;
      paymentMethodLabel: PaymentMethodLabel;
      amounts: string[];
    }
  >();
  let earliestReceived: number | null = null;

  for (const method of methods) {
    const rawId =
      typeof method.paymentMethodId === 'string'
        ? method.paymentMethodId
        : typeof method.paymentMethod === 'string'
          ? method.paymentMethod
          : null;
    const cryptoCode = typeof method.cryptoCode === 'string' ? method.cryptoCode : null;
    const payments = Array.isArray(method.payments) ? method.payments : [];

    // Amount RECEIVED on this method (not amount due). Only funded legs count.
    const paidRaw =
      firstNonEmptyString(method.totalPaid, method.paymentMethodPaid) ?? null;
    const paidUnits = paidRaw != null ? cryptoAmountToBaseUnits(paidRaw) : null;
    const hasFunds = (paidUnits != null && paidUnits > 0n) || payments.length > 0;
    if (!hasFunds) continue;

    if (paidRaw != null && paidUnits == null) {
      console.warn(
        `[activity-normalize] INVALID_CRYPTO_AMOUNT invoice=${invoice.id} ` +
          `method=${rawId ?? cryptoCode ?? 'null'} value=${JSON.stringify(paidRaw)}`,
      );
    }

    const norm = normalizeBtcpayPaymentMethod(rawId, cryptoCode);
    if (norm.warning) {
      console.warn(
        `[activity-normalize] ${norm.warning} invoice=${invoice.id} ` +
          `paymentMethodId=${JSON.stringify(rawId)} cryptoCode=${JSON.stringify(cryptoCode)}`,
      );
    }

    const key = `${norm.asset ?? 'null'}|${norm.paymentRail}`;
    const leg = legs.get(key) ?? {
      asset: norm.asset,
      paymentRail: norm.paymentRail,
      paymentMethodId: norm.paymentMethodId,
      paymentMethodLabel: norm.paymentMethodLabel,
      amounts: [] as string[],
    };
    if (paidUnits != null && paidUnits > 0n && paidRaw != null) {
      leg.amounts.push(paidRaw);
    }
    legs.set(key, leg);

    for (const payment of payments) {
      const received = typeof payment.receivedDate === 'number' ? payment.receivedDate : null;
      if (received != null && (earliestReceived == null || received < earliestReceived)) {
        earliestReceived = received;
      }
    }
  }

  const paidAt = unixToIso(earliestReceived ?? undefined);

  // No authoritative payment yet (new / expired / unpaid). Do NOT guess a method
  // from the store's enabled methods — an unpaid invoice has no rail.
  if (legs.size === 0) {
    return {
      cryptoAmount: null,
      cryptoAsset: null,
      paymentRail: 'unknown',
      paymentMethodId: null,
      paymentMethodLabel: 'Payment method unavailable',
      multiMethod: false,
      breakdown: [],
      paidAt,
    };
  }

  const breakdown: PaymentBreakdownEntry[] = Array.from(legs.values()).map((leg) => ({
    cryptoAmount: leg.amounts.length > 0 ? sumCryptoAmounts(leg.amounts) : null,
    cryptoAsset: leg.asset,
    paymentRail: leg.paymentRail,
    paymentMethodId: leg.paymentMethodId,
    paymentMethodLabel: leg.paymentMethodLabel,
  }));

  // Single (asset, rail) leg: a plain, correctly-labeled payment.
  if (breakdown.length === 1) {
    const only = breakdown[0];
    return {
      cryptoAmount: only.cryptoAmount,
      cryptoAsset: only.cryptoAsset,
      paymentRail: only.paymentRail,
      paymentMethodId: only.paymentMethodId,
      paymentMethodLabel: only.paymentMethodLabel,
      multiMethod: false,
      breakdown: [],
      paidAt,
    };
  }

  // Multiple legs. If they settled in more than one asset, flag it explicitly.
  const assets = new Set(breakdown.map((b) => b.cryptoAsset));
  if (assets.size > 1) {
    console.warn(
      `[activity-normalize] MULTIPLE_PAYMENT_ASSETS invoice=${invoice.id} ` +
        `assets=${JSON.stringify(Array.from(assets))}`,
    );
  }

  // Do not collapse different rails/assets into one label.
  return {
    cryptoAmount: null,
    cryptoAsset: null,
    paymentRail: 'unknown',
    paymentMethodId: null,
    paymentMethodLabel: 'Paid with multiple methods',
    multiMethod: true,
    breakdown,
    paidAt,
  };
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Enrichment (failure-isolated)
// ---------------------------------------------------------------------------

/** Enriches a single invoice with its payment methods, capturing (never throwing)
 * any failure as a classified, non-sensitive outcome. */
export async function enrichOne(
  config: BtcpayConfig,
  btcpayStoreId: string,
  invoice: BtcpayInvoice,
): Promise<EnrichmentOutcome> {
  try {
    const methods = await getInvoicePaymentMethods(config, btcpayStoreId, invoice.id, {
      timeoutMs: ENRICH_TIMEOUT_MS,
    });
    return { ok: true, methods };
  } catch (err) {
    const { code, retryable } = classifyEnrichmentError(err);
    const httpStatus =
      err instanceof BtcpayApiError && err.status > 0 ? err.status : undefined;
    return { ok: false, code, retryable, httpStatus };
  }
}

/** Normalizes an enrichment error into a non-sensitive code + retryability.
 * Transient/infrastructure failures are retryable; genuine "not found" or a
 * schema/permission problem (which a retry cannot fix) are not. */
function classifyEnrichmentError(err: unknown): {
  code: EnrichmentErrorCode;
  retryable: boolean;
} {
  if (err instanceof BtcpayTimeoutError) {
    return { code: 'BTCPAY_ENRICHMENT_TIMEOUT', retryable: true };
  }
  if (err instanceof BtcpayApiError) {
    const s = err.status;
    if (s === 0) return { code: 'PAYMENT_METHOD_FETCH_FAILED', retryable: true }; // network
    if (s === 401 || s === 403) return { code: 'BTCPAY_UNAUTHORIZED', retryable: false };
    if (s === 404) return { code: 'PAYMENT_DETAILS_NOT_FOUND', retryable: false };
    if (s === 429) return { code: 'BTCPAY_RATE_LIMITED', retryable: true };
    if (s >= 500) return { code: 'PAYMENT_METHOD_FETCH_FAILED', retryable: true };
    // A 2xx with a malformed body (needs a code fix) is not retryable.
    if (s === 200) return { code: 'INVALID_BTCPAY_RESPONSE', retryable: false };
    return { code: 'UNKNOWN_ENRICHMENT_ERROR', retryable: false };
  }
  return { code: 'UNKNOWN_ENRICHMENT_ERROR', retryable: false };
}

/** Runs `fn` over items with a bounded number of concurrent calls. `fn` must not
 * throw (enrichOne captures its own errors), so all items always complete —
 * failure isolation without an uncontrolled fan-out. Order of side effects is
 * irrelevant here; final item order is preserved by the caller's invoices.map. */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
}

/** Rolls per-item outcomes into the feed-level enrichment summary. */
export function summarizeEnrichment(
  outcomes: Map<string, EnrichmentOutcome>,
): FeedEnrichment {
  const values = Array.from(outcomes.values());
  const attemptedCount = values.length;
  const succeededCount = values.filter((o) => o.ok).length;
  const failedCount = attemptedCount - succeededCount;
  const retryableCount = values.filter((o) => !o.ok && o.retryable).length;

  let status: EnrichmentStatus;
  if (attemptedCount === 0) status = 'not_required';
  else if (failedCount === 0) status = 'complete';
  else if (succeededCount === 0) status = 'failed';
  else status = 'partial';

  return { status, attemptedCount, succeededCount, failedCount, retryableCount };
}

// ---------------------------------------------------------------------------
// Small shared utilities
// ---------------------------------------------------------------------------

export function unixToIso(seconds: number | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

export function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
