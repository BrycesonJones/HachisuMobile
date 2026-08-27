// Shared mapping between Hachisu's invoice filter vocabulary and BTCPay's.
//
// BTCPay's invoice list exposes `status` (InvoiceStatus) server-side, while the
// "settled late / partial / over" distinctions live in the invoice's EXCEPTION
// status (Greenfield `additionalStatus`). Both are real BTCPay data — nothing
// here is invented — but they are filtered at different layers, so the mapping
// is declared once and consumed by the invoices endpoint.

import type { InvoiceExceptionStatus } from './activity-normalize.ts';

/** Filter ids the mobile UI sends. Mirrors components/payments/invoices/invoice-filters.ts. */
export type InvoiceStatusFilterId =
  | 'all'
  | 'new'
  | 'processing'
  | 'settled'
  | 'expired'
  | 'invalid'
  | 'settled-late'
  | 'settled-partial'
  | 'settled-over';

interface InvoiceStatusFilter {
  /** BTCPay InvoiceStatus values sent as `status` query params (server-side). */
  btcpayStatuses: string[];
  /** When set, additionally require one of these exception statuses. */
  exceptionStatuses?: InvoiceExceptionStatus[];
}

const FILTERS: Record<InvoiceStatusFilterId, InvoiceStatusFilter> = {
  all: { btcpayStatuses: [] },
  new: { btcpayStatuses: ['New'] },
  processing: { btcpayStatuses: ['Processing'] },
  settled: { btcpayStatuses: ['Settled'] },
  expired: { btcpayStatuses: ['Expired'] },
  invalid: { btcpayStatuses: ['Invalid'] },
  'settled-late': { btcpayStatuses: ['Settled'], exceptionStatuses: ['paidLate'] },
  'settled-partial': {
    // A partially-paid invoice can be left Expired or marked Settled.
    btcpayStatuses: ['Settled', 'Expired'],
    exceptionStatuses: ['paidPartial'],
  },
  'settled-over': { btcpayStatuses: ['Settled'], exceptionStatuses: ['paidOver'] },
};

export function isInvoiceStatusFilterId(value: unknown): value is InvoiceStatusFilterId {
  return typeof value === 'string' && Object.hasOwn(FILTERS, value);
}

export function resolveInvoiceStatusFilter(id: InvoiceStatusFilterId): InvoiceStatusFilter {
  return FILTERS[id];
}
