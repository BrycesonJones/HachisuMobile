// Shared derivation of PAYMENT-level records from authoritative BTCPay invoices.
//
// This is the single source of truth for two surfaces that must reconcile:
//   - the mobile Activity feed (get-btcpay-store-activity): one event per payment
//   - the CSV export (export-btcpay-store-report): the report rows
//
// WHAT THIS PRODUCES — read this before describing the export anywhere.
//
// The output is a BTCPay-EQUIVALENT report derived from authoritative Greenfield
// invoice/payment data. It is NOT the canonical CSV that BTCPay itself generates,
// and it must never be described as "the exact BTCPay CSV", "identical to
// BTCPay's export", or "the canonical BTCPay export". Most columns are verbatim
// BTCPay values; two are RECONSTRUCTED because Greenfield does not expose the
// Reporting model's equivalent property (see the DERIVED table below).
//
// VERSION ANCHOR. Everything below was verified against BTCPay Server 2.4.3, the
// current production server for this project. Earlier Hachisu work referenced
// 2.3.9; that is historical and no longer describes the deployed API surface. On
// any BTCPay upgrade, re-verify the three version-sensitive facts this module
// depends on: (1) no Greenfield reports endpoint, (2) `includePaymentMethods`
// embeds payments in the invoice list, (3) the InvoicesReportProvider column set
// and row rules replicated below.
//
// Why derive at all (current production server: BTCPay Server 2.4.3):
//   - There is NO Greenfield reporting/export endpoint to proxy. `POST
//     /api/v1/stores/{storeId}/reports` returns 404 on this deployment, and
//     upstream that controller action is marked [NonAction] ("Disabling this
//     endpoint as we still need to figure out the request/response model").
//   - BTCPay's web Reporting page is cookie/anti-forgery authenticated and builds
//     its CSV in the browser, so it cannot be fetched with a Greenfield API key.
// The columns and row rules below therefore replicate the v2.4.3
// InvoicesReportProvider (BTCPayServer/Services/Reporting/InvoicesReportProvider.cs)
// from `GET /invoices?includePaymentMethods=true`, which carries every input that
// provider reads (payment id/receivedDate/value/fee/destination, method
// rate/currency/paymentMethodId, invoice status/additionalStatus/metadata).
//
// COLUMN PROVENANCE
//
// DIRECT — copied verbatim from the Greenfield payload, no arithmetic:
//   InvoiceCreatedDate     invoice.createdTime (unix seconds -> ISO 8601 UTC)
//   InvoiceId              invoice.id
//   InvoiceCurrency        invoice.currency
//   InvoicePrice           invoice.amount
//   InvoiceStatus          invoice.status
//   InvoiceExceptionStatus invoice.additionalStatus ("None" normalized to "")
//   InvoiceComment         invoice.metadata.comment
//   PaymentReceivedDate    payment.receivedDate (unix seconds -> ISO 8601 UTC)
//   PaymentId              payment.id
//   PaymentRate            paymentMethod.rate
//   PaymentAddress         payment.destination
//   PaymentMethodId        paymentMethod.paymentMethodId
//   PaymentCurrency        paymentMethod.currency (falls back to cryptoCode)
//   PaymentAmount          payment.value
//   PaymentMethodFee       payment.fee
//   <metadata columns>     invoice.metadata, flattened (see below)
//
// DERIVED — reconstructed here; Greenfield exposes no equivalent property:
//   InvoiceFullStatus      = `${status} (${exception})` when an exception status
//                            is present, else `${status}`. Mirrors
//                            InvoiceState.ToString(). String composition only.
//   InvoiceDue             = InvoicePrice - invoice.paidAmount, computed as exact
//                            decimal strings (BigInt, scale = max of operands).
//                            BTCPay's own column is InvoiceEntity.NetDue, which
//                            Greenfield does not return. Overpayment therefore
//                            yields a NEGATIVE due (not clamped to zero) and a
//                            partial payment yields the outstanding remainder.
//                            When paidAmount is absent the full price is used.
//   PaymentInvoiceAmount   = PaymentAmount x PaymentRate, rounded HALF-EVEN
//                            (banker's, .NET's default midpoint mode) to the
//                            invoice currency's divisibility — 2 for most fiat,
//                            0 for JPY/KRW/VND/SATS, 3 for BHD/IQD/JOD/KWD/OMR/TND,
//                            8 for BTC. BTCPay computes this from
//                            payment.InvoicePaidAmount.Gross, which Greenfield
//                            does not return. When the payment method carries NO
//                            rate the cell is EMPTY — a fiat value is never
//                            invented from a missing rate.
//
// ROW RULES (verified against the v2.4.3 provider source):
//   - One row per payment. A single invoice with three payments is three rows,
//     never collapsed or deduplicated.
//   - An invoice with NO payments still emits one row UNLESS its state is exactly
//     (New, none) or (Expired, none) — those are excluded entirely, which is why
//     a store of expired unpaid invoices reports zero rows.
//   - Invoice-level fields (currency/due/price/statuses/comment) are populated
//     only on an invoice's FIRST row ("we don't want to duplicate the data on all
//     payments"); later rows leave them empty.
//   - Metadata columns: leaf-name flattening with posData.tax, itemDesc and
//     top-level receiptData skipped; posData.cart items become
//     `${itemId}-${field}` (id/image/title/inventory dropped, price formatted to
//     the invoice currency). First value wins on duplicate column names.

import {
  deriveSourceFeature,
  normalizeExceptionStatus,
  normalizeStatus,
  strOrNull,
  titleForSource,
  toDisplayStatus,
  unixToIso,
  type DisplayStatus,
  type InvoiceExceptionStatus,
  type NormalizedStatus,
  type SourceFeature,
} from './activity-normalize.ts';
import {
  normalizeBtcpayPaymentMethod,
  type PaymentAsset,
  type PaymentMethodLabel,
  type PaymentRail,
} from './payment-method.ts';
import type {
  BtcpayInvoice,
  BtcpayInvoicePayment,
  BtcpayInvoicePaymentMethod,
} from './btcpay-client.ts';

// ---------------------------------------------------------------------------
// Report columns — the v2.4.3 InvoicesReportProvider order and names.
// See the COLUMN PROVENANCE table above for which are direct vs derived.
// ---------------------------------------------------------------------------

export const REPORT_BASE_COLUMNS = [
  'InvoiceCreatedDate',
  'InvoiceId',
  'InvoiceCurrency',
  'InvoiceDue',
  'InvoicePrice',
  'InvoiceFullStatus',
  'InvoiceStatus',
  'InvoiceExceptionStatus',
  'InvoiceComment',
  'PaymentReceivedDate',
  'PaymentId',
  'PaymentRate',
  'PaymentAddress',
  'PaymentMethodId',
  'PaymentCurrency',
  'PaymentAmount',
  'PaymentMethodFee',
  'PaymentInvoiceAmount',
] as const;

export type ReportCellValue = string | number | boolean | null;

export interface ReportRow {
  /** Values for REPORT_BASE_COLUMNS, in the same order. */
  base: ReportCellValue[];
  /** Flattened invoice-metadata columns (leaf name -> value). */
  metadata: Record<string, ReportCellValue>;
}

// ---------------------------------------------------------------------------
// Mobile Activity event (payment-oriented; the feed's item model)
// ---------------------------------------------------------------------------

export type PaymentEventStatus = 'settled' | 'processing' | 'invalid';
export type PaymentEventDisplayStatus = 'Settled' | 'Processing' | 'Failed';

export interface StoreActivityEvent {
  /** Stable unique key: `${invoiceId}:${paymentId}`. Two legitimate payments on
   * one invoice are two events — never deduplicated by invoice id. */
  id: string;
  type: 'payment';
  btcpayInvoiceId: string;
  paymentId: string;
  /** THIS payment's status (BTCPay: Settled | Processing | Invalid). */
  status: PaymentEventStatus;
  displayStatus: PaymentEventDisplayStatus;
  /** ISO timestamp the payment was received (the feed's sort key). */
  receivedAt: string;
  invoiceCreatedAt: string;
  /** Fiat-equivalent of THIS payment in the invoice currency (value x rate),
   * or null when BTCPay reported no rate. Never fabricated. */
  fiatAmount: string | null;
  fiatCurrency: string;
  /** Invoice pricing amount (the full invoice price, not this payment). */
  invoiceAmount: string;
  invoiceStatus: NormalizedStatus;
  invoiceDisplayStatus: DisplayStatus;
  invoiceExceptionStatus: InvoiceExceptionStatus;
  /** Crypto amount of this payment, as BTCPay reported it. */
  cryptoAmount: string;
  cryptoAsset: PaymentAsset | null;
  paymentRail: PaymentRail;
  paymentMethodId: string | null;
  paymentMethodLabel: PaymentMethodLabel;
  /** Network/method fee BTCPay recorded for this payment (crypto units). */
  fee: string | null;
  /** Exchange rate used for this payment method (invoice currency per coin). */
  rate: string | null;
  /** Destination address/invoice of the payment (the merchant's own). */
  address: string | null;
  orderId: string | null;
  paymentRequestId: string | null;
  description: string | null;
  sourceFeature: SourceFeature;
  title: string;
}

// ---------------------------------------------------------------------------
// Payment extraction
// ---------------------------------------------------------------------------

interface RawPaymentRecord {
  method: BtcpayInvoicePaymentMethod;
  payment: BtcpayInvoicePayment;
}

function paymentMethodsOf(
  invoice: BtcpayInvoice,
  explicit?: BtcpayInvoicePaymentMethod[],
): BtcpayInvoicePaymentMethod[] {
  if (explicit) return explicit;
  return Array.isArray(invoice.paymentMethods) ? invoice.paymentMethods : [];
}

/** All payments recorded against the invoice, in BTCPay's own order. */
function rawPaymentsOf(
  invoice: BtcpayInvoice,
  explicit?: BtcpayInvoicePaymentMethod[],
): RawPaymentRecord[] {
  const records: RawPaymentRecord[] = [];
  for (const method of paymentMethodsOf(invoice, explicit)) {
    const payments = Array.isArray(method.payments) ? method.payments : [];
    for (const payment of payments) {
      records.push({ method, payment });
    }
  }
  return records;
}

function methodIdOf(method: BtcpayInvoicePaymentMethod): string | null {
  return (
    strOrNull(method.paymentMethodId) ??
    strOrNull(method.paymentMethod) ??
    null
  );
}

function paymentIdOf(payment: BtcpayInvoicePayment, index: number): string {
  return strOrNull(payment.id) ?? `payment-${index}`;
}

function normalizePaymentStatus(raw: unknown): PaymentEventStatus {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'settled') return 'settled';
  if (value === 'processing') return 'processing';
  // BTCPay payment statuses are exactly Settled/Processing/Invalid; anything
  // unrecognized is surfaced as invalid rather than guessed as money received.
  return 'invalid';
}

function paymentDisplayStatus(status: PaymentEventStatus): PaymentEventDisplayStatus {
  switch (status) {
    case 'settled':
      return 'Settled';
    case 'processing':
      return 'Processing';
    case 'invalid':
      return 'Failed';
  }
}

// ---------------------------------------------------------------------------
// Activity events (the mobile feed's records)
// ---------------------------------------------------------------------------

/**
 * Derives the financially-meaningful payment events of one invoice. An invoice
 * with no payments produces NO events (an expired unpaid invoice belongs in
 * Invoices, not Activity). Every payment — including a second payment on the
 * same invoice, a partial payment on an expired invoice, or an invalid payment
 * — is its own event with a stable payment-scoped key.
 *
 * `explicitMethods` is for callers that fetched the payment methods separately
 * (the single-invoice detail path); list callers pass invoices that already
 * embed them via includePaymentMethods=true.
 */
export function toActivityEvents(
  invoice: BtcpayInvoice,
  explicitMethods?: BtcpayInvoicePaymentMethod[],
): StoreActivityEvent[] {
  const metadata = (invoice.metadata ?? {}) as Record<string, unknown>;
  const orderId = strOrNull(metadata.orderId);
  const sourceFeature = deriveSourceFeature(invoice, metadata, orderId);
  const invoiceStatus = normalizeStatus(
    typeof invoice.status === 'string' ? invoice.status : 'Unknown',
  );
  const invoiceCreatedAt = unixToIso(invoice.createdTime) ?? '';
  const invoiceCurrency = typeof invoice.currency === 'string' ? invoice.currency : 'USD';
  const exceptionStatus = normalizeExceptionStatus(invoice.additionalStatus);

  return rawPaymentsOf(invoice, explicitMethods).map(({ method, payment }, index) => {
    const rawMethodId = methodIdOf(method);
    const norm = normalizeBtcpayPaymentMethod(
      rawMethodId,
      strOrNull(method.cryptoCode) ?? strOrNull(method.currency),
    );
    if (norm.warning) {
      console.warn(
        `[report-rows] ${norm.warning} invoice=${invoice.id} ` +
          `paymentMethodId=${JSON.stringify(rawMethodId)}`,
      );
    }
    const paymentId = paymentIdOf(payment, index);
    const status = normalizePaymentStatus(payment.status);
    const value = strOrNull(payment.value) ?? '0';
    const rate = strOrNull(method.rate);
    const fiatAmount =
      rate != null
        ? multiplyDecimalStrings(value, rate, currencyDivisibility(invoiceCurrency))
        : null;

    return {
      id: `${invoice.id}:${paymentId}`,
      type: 'payment' as const,
      btcpayInvoiceId: invoice.id,
      paymentId,
      status,
      displayStatus: paymentDisplayStatus(status),
      receivedAt: unixToIso(payment.receivedDate) ?? invoiceCreatedAt,
      invoiceCreatedAt,
      fiatAmount,
      fiatCurrency: invoiceCurrency,
      invoiceAmount: typeof invoice.amount === 'string' ? invoice.amount : '0',
      invoiceStatus,
      invoiceDisplayStatus: toDisplayStatus(invoiceStatus),
      invoiceExceptionStatus: exceptionStatus,
      cryptoAmount: value,
      cryptoAsset: norm.asset,
      paymentRail: norm.paymentRail,
      paymentMethodId: rawMethodId,
      paymentMethodLabel: norm.paymentMethodLabel,
      fee: strOrNull(payment.fee),
      rate,
      address: strOrNull(payment.destination),
      orderId,
      paymentRequestId: strOrNull(metadata.paymentRequestId),
      description: strOrNull(metadata.itemDesc),
      sourceFeature,
      title: titleForSource(sourceFeature),
    };
  });
}

// ---------------------------------------------------------------------------
// Report rows (CSV export; BTCPay-equivalent InvoicesReportProvider semantics)
// ---------------------------------------------------------------------------

/**
 * Builds the report rows for one invoice, replicating the v2.4.3 provider:
 * one row per payment (invoice fields on the first row only), and a single
 * payment-less row for exceptional unpaid invoices.
 */
export function buildReportRows(invoice: BtcpayInvoice): ReportRow[] {
  const metadataColumns = flattenReportMetadata(invoice);
  const createdDate = unixToIso(invoice.createdTime);
  const status = typeof invoice.status === 'string' ? invoice.status : '';
  const rawException = strOrNull(invoice.additionalStatus);
  const exception = rawException && rawException.toLowerCase() !== 'none' ? rawException : '';
  const fullStatus = exception ? `${status} (${exception})` : status;
  const currency = typeof invoice.currency === 'string' ? invoice.currency : '';
  const price = strOrNull(invoice.amount) ?? '0';
  const paidAmount = strOrNull(invoice.paidAmount);
  // DERIVED. BTCPay's column is InvoiceEntity.NetDue, which Greenfield does not
  // expose, so it is reconstructed as price - paidAmount using exact decimal
  // strings. Deliberately NOT clamped at zero: an overpaid invoice reports a
  // negative due, which is the accounting-meaningful value. A missing paidAmount
  // means nothing is known to have been received, so the full price is due.
  const due =
    paidAmount != null ? subtractDecimalStrings(price, paidAmount) : price;
  const comment = strOrNull(
    ((invoice.metadata ?? {}) as Record<string, unknown>).comment,
  );

  const invoiceFields = (first: boolean): ReportCellValue[] => [
    createdDate,
    invoice.id,
    first ? currency : null,
    first ? due : null,
    first ? price : null,
    first ? fullStatus : null,
    first ? status : null,
    first ? exception : null,
    first ? comment : null,
  ];

  const payments = rawPaymentsOf(invoice);
  if (payments.length === 0) {
    // Plain unpaid New/Expired invoices are excluded from the report — every
    // other payment-less state (Invalid, Settled (marked), PaidPartial after
    // pruning, ...) still emits one row so the record is not silently dropped.
    const statusLower = status.toLowerCase();
    const isPlain = exception === '';
    if (isPlain && (statusLower === 'new' || statusLower === 'expired')) return [];
    return [
      {
        base: [...invoiceFields(true), null, null, null, null, null, null, null, null, null],
        metadata: metadataColumns,
      },
    ];
  }

  return payments.map(({ method, payment }, index) => {
    const rate = strOrNull(method.rate);
    const value = strOrNull(payment.value) ?? '0';
    // DERIVED. BTCPay computes this from payment.InvoicePaidAmount.Gross, which
    // Greenfield does not expose, so it is reconstructed as value x rate rounded
    // half-even to the invoice currency's divisibility. With no rate the cell
    // stays EMPTY — a fiat figure is never invented from a missing rate.
    const invoiceAmount =
      rate != null
        ? multiplyDecimalStrings(value, rate, currencyDivisibility(currency))
        : null;
    return {
      base: [
        ...invoiceFields(index === 0),
        unixToIso(payment.receivedDate),
        paymentIdOf(payment, index),
        rate,
        strOrNull(payment.destination),
        methodIdOf(method),
        strOrNull(method.currency) ?? strOrNull(method.cryptoCode),
        value,
        strOrNull(payment.fee),
        invoiceAmount,
      ],
      metadata: metadataColumns,
    };
  });
}

// ---------------------------------------------------------------------------
// Metadata flattening (FlattenFields replication)
// ---------------------------------------------------------------------------

function flattenReportMetadata(invoice: BtcpayInvoice): Record<string, ReportCellValue> {
  // Prototype-free accumulator: the KEYS are upstream data (BTCPay invoice
  // metadata, which any integration on the store — including BTCPay's own admin
  // UI — can name freely). On a plain `{}` a field called `toString`, `valueOf`,
  // `constructor`, ... is already "present" via Object.prototype, so the TryAdd
  // guard below would discard real upstream data, and a later `metadata[name]`
  // could read an inherited member instead of a cell. Object.create(null) has no
  // prototype, so a metadata key can only ever collide with another metadata key.
  const result: Record<string, ReportCellValue> = Object.create(null);
  const metadata = invoice.metadata;
  if (!metadata || typeof metadata !== 'object') return result;
  const currency = typeof invoice.currency === 'string' ? invoice.currency : '';
  flattenNode(metadata, [], result, currency);
  return result;
}

function flattenNode(
  node: unknown,
  path: string[],
  result: Record<string, ReportCellValue>,
  invoiceCurrency: string,
): void {
  // Skipped subtrees: posData.tax duplicates taxIncluded; itemDesc is verbose.
  if (
    (path.length === 2 && path[0] === 'posData' && path[1] === 'tax') ||
    (path.length === 1 && path[0] === 'itemDesc')
  ) {
    return;
  }

  if (Array.isArray(node)) {
    const isCart = path.length === 2 && path[0] === 'posData' && path[1] === 'cart';
    for (const item of node) {
      if (isCart && item && typeof item === 'object' && !Array.isArray(item)) {
        const itemId = strOrNull((item as Record<string, unknown>).id);
        if (itemId != null) {
          flattenNode(item, [...path, itemId], result, invoiceCurrency);
          continue;
        }
      }
      flattenNode(item, path, result, invoiceCurrency);
    }
    return;
  }

  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      // Top-level receiptData is already covered by the receipt itself.
      if (path.length === 0 && key === 'receiptData') continue;
      flattenNode(value, [...path, key], result, invoiceCurrency);
    }
    return;
  }

  // Leaf value.
  if (node == null || path.length === 0) return;
  let fieldName = path[path.length - 1];
  let value: ReportCellValue =
    typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean'
      ? node
      : String(node);

  // Cart item leaves become `${itemId}-${field}` (noise fields dropped, price
  // formatted to the invoice currency) — matching the provider exactly.
  if (path.length >= 4 && path[0] === 'posData' && path[1] === 'cart') {
    const itemId = path[2];
    if (
      fieldName === 'id' ||
      fieldName === 'image' ||
      fieldName === 'title' ||
      fieldName === 'inventory'
    ) {
      return;
    }
    if (fieldName === 'price' && typeof node === 'number') {
      value = formatDecimal(node, currencyDivisibility(invoiceCurrency));
    }
    fieldName = `${itemId}-${fieldName}`;
  }

  // TryAdd: first value wins. Own-key test (the accumulator is prototype-free,
  // so this is the same set `in` would see — stated explicitly so the invariant
  // survives a future change of accumulator).
  if (!Object.hasOwn(result, fieldName)) {
    result[fieldName] = value;
  }
}

// ---------------------------------------------------------------------------
// CSV serialization
// ---------------------------------------------------------------------------

/** Union of metadata column names across rows, in first-seen order. */
export function collectMetadataColumns(rows: ReportRow[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of rows) {
    for (const name of Object.keys(row.metadata)) {
      if (!seen.has(name)) {
        seen.add(name);
        columns.push(name);
      }
    }
  }
  return columns;
}

/**
 * RFC 4180 CSV: header row + one line per report row. Timestamps are ISO 8601
 * UTC. Every cell — header names included — is written through `csvCell`, which
 * also neutralizes spreadsheet-formula syntax (see below).
 */
export function reportRowsToCsv(rows: ReportRow[], metadataColumns: string[]): string {
  const header = [...REPORT_BASE_COLUMNS, ...metadataColumns];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const cells = [
      ...row.base,
      // Own-key lookup: a cell is filled only from this row's OWN metadata, never
      // from anything reachable on a prototype chain.
      ...metadataColumns.map((name) =>
        Object.hasOwn(row.metadata, name) ? row.metadata[name] : null,
      ),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Leading characters Excel / LibreOffice / Google Sheets may read as the start
 * of a formula or a DDE payload. */
const FORMULA_LEAD_RE = /^[=+\-@\t\r]/;

/** A plain decimal, optionally negative. These are real accounting figures and
 * are never rewritten — InvoiceDue is legitimately negative on an overpayment. */
const PLAIN_NUMBER_RE = /^-?\d+(\.\d+)?$/;

/**
 * Serializes one cell: spreadsheet-formula neutralization first, then RFC 4180
 * quoting.
 *
 * The two are NOT the same protection and quoting alone does not stop the first.
 * A spreadsheet strips the surrounding quotes while parsing and THEN evaluates a
 * leading =/+/-/@ (or a leading tab/CR), so `"=HYPERLINK(...)"` is still a live
 * formula when the file is opened.
 *
 * This matters because the report's metadata columns are not all merchant-typed.
 * Enabling the Pay Button sets BTCPay's `anyoneCanCreateInvoice`, and the
 * merchant publishes the store id in the snippet they paste on their website, so
 * BTCPay's public pay-button endpoint lets an UNAUTHENTICATED payer choose the
 * `orderId` / `checkoutDesc` that land on the invoice metadata this module
 * flattens. Nothing attacker-chosen may reach the merchant's spreadsheet as
 * executable syntax.
 *
 * A leading apostrophe is the neutralizer: the spreadsheet renders the value as
 * literal text, and the text itself stays intact and legible for the merchant.
 */
function csvCell(value: ReportCellValue): string {
  if (value == null) return '';
  let text = typeof value === 'string' ? value : String(value);
  if (FORMULA_LEAD_RE.test(text) && !PLAIN_NUMBER_RE.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Exact decimal-string arithmetic (BigInt; money is never a float)
// ---------------------------------------------------------------------------

/** Divisibility of the invoice (pricing) currency. Mirrors the common BTCPay
 * currency data: zero-decimal and three-decimal fiat exceptions, 8 for BTC. */
export function currencyDivisibility(currency: string): number {
  const code = currency.trim().toUpperCase();
  if (code === 'BTC') return 8;
  if (code === 'SATS') return 0;
  if (code === 'JPY' || code === 'VND' || code === 'KRW') return 0;
  if (['BHD', 'IQD', 'JOD', 'KWD', 'OMR', 'TND'].includes(code)) return 3;
  return 2;
}

interface ScaledDecimal {
  units: bigint;
  scale: number;
}

function parseDecimal(value: string): ScaledDecimal | null {
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return null;
  const [, sign, intPart, fracPart = ''] = match;
  try {
    const units = BigInt(intPart + fracPart) * (sign === '-' ? -1n : 1n);
    return { units, scale: fracPart.length };
  } catch {
    return null;
  }
}

function formatScaled(units: bigint, scale: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const digits = abs.toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale) || '0';
  const fracPart = scale > 0 ? `.${digits.slice(digits.length - scale)}` : '';
  return `${negative ? '-' : ''}${intPart}${fracPart}`;
}

/** value x rate, rounded HALF-EVEN to `decimals` places (BTCPay/.NET default
 * midpoint rounding). Returns null if either operand is not a plain decimal. */
export function multiplyDecimalStrings(
  value: string,
  rate: string,
  decimals: number,
): string | null {
  const a = parseDecimal(value);
  const b = parseDecimal(rate);
  if (!a || !b) return null;
  const product = a.units * b.units;
  const scale = a.scale + b.scale;
  if (scale <= decimals) {
    return formatScaled(product * 10n ** BigInt(decimals - scale), decimals);
  }
  const drop = 10n ** BigInt(scale - decimals);
  const negative = product < 0n;
  const abs = negative ? -product : product;
  let quotient = abs / drop;
  const remainder = abs % drop;
  const twice = remainder * 2n;
  if (twice > drop || (twice === drop && quotient % 2n === 1n)) {
    quotient += 1n;
  }
  return formatScaled(negative ? -quotient : quotient, decimals);
}

/** a - b as decimal strings (exact; scale = max of the operands). */
export function subtractDecimalStrings(a: string, b: string): string | null {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  if (!pa || !pb) return null;
  const scale = Math.max(pa.scale, pb.scale);
  const ua = pa.units * 10n ** BigInt(scale - pa.scale);
  const ub = pb.units * 10n ** BigInt(scale - pb.scale);
  return formatScaled(ua - ub, scale);
}

/** Formats a JS number to a fixed-decimals string without float artifacts for
 * the magnitudes invoice metadata carries (cart prices). */
function formatDecimal(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(decimals);
}
