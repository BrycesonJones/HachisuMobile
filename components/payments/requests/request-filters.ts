/**
 * Filter options for the Payment Requests list. Only the time window is
 * offered: it maps to a real server-side `created_at` bound. There is
 * deliberately no status filter — the list is read from Hachisu's own records,
 * which hold BTCPay's status only as of creation, and a filter over a stale
 * status would mislead. Live status is shown on the detail screen.
 *
 * The first entry is the default ("show everything"), so a filter is active
 * only when the selected id differs from the first id.
 */
export interface RequestTimeOption {
  id: string;
  label: string;
  /** Lookback in days; null = all time. */
  days: number | null;
}

export const TIME_OPTIONS: readonly RequestTimeOption[] = [
  { id: 'all', label: 'All Time', days: null },
  { id: '24h', label: 'Last 24 hours', days: 1 },
  { id: '3d', label: 'Last 3 days', days: 3 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
];

export const DEFAULT_TIME_ID = TIME_OPTIONS[0].id;

/** Resolves a time filter id to an ISO start instant, or null for all time. */
export function requestTimeFilterStartDate(id: string, now: Date = new Date()): string | null {
  const option = TIME_OPTIONS.find((entry) => entry.id === id);
  if (!option || option.days == null) return null;
  return new Date(now.getTime() - option.days * 86_400_000).toISOString();
}
