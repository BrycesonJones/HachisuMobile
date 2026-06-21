/**
 * Filter option metadata for the Invoices list. The first entry in each list is
 * the default ("show everything") option, so a filter is considered active only
 * when the selected id differs from the list's first id.
 *
 * Labels mirror BTCPay Server's invoice status / time filters so the mobile UI
 * stays conceptually aligned, but no filtering is wired to real data yet.
 */
export interface InvoiceFilterOption {
  id: string;
  label: string;
}

export const STATUS_OPTIONS: readonly InvoiceFilterOption[] = [
  { id: 'all', label: 'All Status' },
  { id: 'settled', label: 'Settled' },
  { id: 'processing', label: 'Processing' },
  { id: 'expired', label: 'Expired' },
  { id: 'invalid', label: 'Invalid' },
  { id: 'settled-late', label: 'Settled Late' },
  { id: 'settled-partial', label: 'Settled Partial' },
  { id: 'settled-over', label: 'Settled Over' },
  { id: 'unusual', label: 'Unusual' },
  { id: 'include-archived', label: 'Include archived' },
];

export const TIME_OPTIONS: readonly InvoiceFilterOption[] = [
  { id: 'all', label: 'All Time' },
  { id: '24h', label: 'Last 24 hours' },
  { id: '3d', label: 'Last 3 days' },
  { id: '7d', label: 'Last 7 days' },
];

export const DEFAULT_STATUS_ID = STATUS_OPTIONS[0].id;
export const DEFAULT_TIME_ID = TIME_OPTIONS[0].id;

export function optionLabel(
  options: readonly InvoiceFilterOption[],
  id: string,
): string {
  return options.find((option) => option.id === id)?.label ?? options[0].label;
}
