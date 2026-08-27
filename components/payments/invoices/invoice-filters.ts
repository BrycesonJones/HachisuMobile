/**
 * Filter option metadata for the Invoices list.
 *
 * Every option here maps to something BTCPay Server actually filters on — the
 * primary invoice status (`status`) or its exception status (`additionalStatus`)
 * — and the mapping itself lives server-side in
 * supabase/functions/_shared/invoice-filters.ts, which is the single place
 * BTCPay's vocabulary is translated. Nothing in this list is a label without a
 * real query behind it.
 *
 * The first entry in each list is the default ("show everything"), so a filter
 * is active only when the selected id differs from the list's first id.
 */
import type { InvoiceStatusFilterId } from '@/lib/btcpay/invoice-list';

export interface InvoiceFilterOption<Id extends string = string> {
  id: Id;
  label: string;
}

export const STATUS_OPTIONS: readonly InvoiceFilterOption<InvoiceStatusFilterId>[] = [
  { id: 'all', label: 'All Status' },
  { id: 'new', label: 'Pending' },
  { id: 'processing', label: 'Processing' },
  { id: 'settled', label: 'Settled' },
  { id: 'expired', label: 'Expired' },
  { id: 'invalid', label: 'Invalid' },
  { id: 'settled-late', label: 'Settled Late' },
  { id: 'settled-partial', label: 'Settled Partial' },
  { id: 'settled-over', label: 'Settled Over' },
];

/** Time windows, expressed as a lookback in days (null = all time). */
export interface InvoiceTimeOption extends InvoiceFilterOption {
  days: number | null;
}

export const TIME_OPTIONS: readonly InvoiceTimeOption[] = [
  { id: 'all', label: 'All Time', days: null },
  { id: '24h', label: 'Last 24 hours', days: 1 },
  { id: '3d', label: 'Last 3 days', days: 3 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
];

export const DEFAULT_STATUS_ID = STATUS_OPTIONS[0].id;
export const DEFAULT_TIME_ID = TIME_OPTIONS[0].id;

export function optionLabel(
  options: readonly InvoiceFilterOption[],
  id: string,
): string {
  return options.find((option) => option.id === id)?.label ?? options[0].label;
}

/**
 * Resolves a time filter id to an ISO start timestamp, or null for all time.
 * The cutoff is computed from the current instant in the device's own clock and
 * sent to the server as an absolute UTC instant, so the window means the same
 * thing on both sides regardless of the phone's timezone.
 */
export function timeFilterStartDate(id: string, now: Date = new Date()): string | null {
  const option = TIME_OPTIONS.find((entry) => entry.id === id);
  if (!option || option.days == null) return null;
  return new Date(now.getTime() - option.days * 86_400_000).toISOString();
}
