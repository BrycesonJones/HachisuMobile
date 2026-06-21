/**
 * Simple filter options for the Payment Requests list. Mirrors the invoice
 * filter shape so the shared filter button can be reused. The first entry in
 * each list is the default ("show everything"). No real filtering is wired to
 * data yet.
 */
export interface RequestFilterOption {
  id: string;
  label: string;
}

export const STATUS_OPTIONS: readonly RequestFilterOption[] = [
  { id: 'all', label: 'All Status' },
  { id: 'pending', label: 'Pending' },
  { id: 'settled', label: 'Settled' },
  { id: 'expired', label: 'Expired' },
  { id: 'archived', label: 'Archived' },
];

export const TIME_OPTIONS: readonly RequestFilterOption[] = [
  { id: 'all', label: 'All Time' },
  { id: '24h', label: 'Last 24 hours' },
  { id: '3d', label: 'Last 3 days' },
  { id: '7d', label: 'Last 7 days' },
];

export const DEFAULT_STATUS_ID = STATUS_OPTIONS[0].id;
export const DEFAULT_TIME_ID = TIME_OPTIONS[0].id;
