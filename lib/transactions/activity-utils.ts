import type {
  ActivityDisplayStatus,
  ActivityFeedEnrichment,
  ActivityItem,
  PaymentAsset,
  PaymentMethodLabel,
  PaymentRail,
} from '@/types/activity';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface ActivitySection {
  title: string;
  monthKey: string;
  data: ActivityItem[];
}

/** Currency codes we render with a leading symbol; everything else gets a suffix. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: '$',
  AUD: '$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
};

/** Formats the fiat amount, e.g. "$1.00" (USD) or "1.00 SATS". */
export function formatActivityAmount(amount: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency?.toUpperCase()];
  if (symbol) return `${symbol}${amount}`;
  return `${amount} ${currency}`.trim();
}

/** "Jul 7, 2026" from an ISO timestamp (local time). */
export function formatActivityListDate(iso: string): string {
  const parsed = parseIso(iso);
  if (!parsed) return iso;
  const month = MONTH_NAMES[parsed.getMonth()]?.slice(0, 3) ?? '';
  return `${month} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

/** "Jul 7, 2026, 8:14 PM" from an ISO timestamp (local time). */
export function formatActivityDateTime(iso: string): string {
  const parsed = parseIso(iso);
  if (!parsed) return iso;
  const month = MONTH_NAMES[parsed.getMonth()]?.slice(0, 3) ?? '';
  return `${month} ${parsed.getDate()}, ${parsed.getFullYear()}, ${formatTime12Hour(parsed)}`;
}

export function getActivityMonthKey(iso: string): string {
  const parsed = parseIso(iso);
  if (!parsed) return iso;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

export function formatActivityMonthHeading(iso: string): string {
  const parsed = parseIso(iso);
  if (!parsed) return iso;
  return `${MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

/** Groups items into month sections, newest first (both within and across). */
export function groupActivityByMonth(items: ActivityItem[]): ActivitySection[] {
  const sorted = [...items].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

  const sections: ActivitySection[] = [];
  for (const item of sorted) {
    const monthKey = getActivityMonthKey(item.createdAt);
    const existing = sections.find((section) => section.monthKey === monthKey);
    if (existing) {
      existing.data.push(item);
      continue;
    }
    sections.push({
      title: formatActivityMonthHeading(item.createdAt),
      monthKey,
      data: [item],
    });
  }
  return sections;
}

/**
 * Formats an exact crypto amount with its asset, e.g. "0.000125 BTC" or
 * "0.000125 L-BTC". String-only arithmetic (never floating point):
 *  - preserves up to 8 decimals, trims trailing zeros,
 *  - never rounds a small nonzero value down to zero,
 *  - returns "—" when the amount or asset is unavailable (never fabricates "BTC").
 */
export function formatCryptoAmount(
  amount: string | null | undefined,
  asset: PaymentAsset | null | undefined,
): string {
  if (!amount || !asset) return '—';
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return '—';

  const [intPart, fracRaw = ''] = trimmed.split('.');
  // Cap at 8 decimals WITHOUT rounding (truncate), then trim trailing zeros.
  let frac = fracRaw.slice(0, 8).replace(/0+$/, '');
  // Guard: if truncation zeroed a value that was nonzero within 8dp, keep the raw
  // (trimmed) fraction so a real small amount never renders as a whole number.
  if (frac === '' && /[1-9]/.test(fracRaw.slice(0, 8))) frac = fracRaw.slice(0, 8);
  const display = frac ? `${intPart}.${frac}` : intPart;
  return `${display} ${asset}`;
}

/** Fallback rail label when the server-authored `paymentMethodLabel` is absent. */
export function getPaymentRailLabel(rail: PaymentRail): string {
  switch (rail) {
    case 'onchain':
      return 'Bitcoin · On-chain';
    case 'lightning':
      return 'Bitcoin · Lightning';
    case 'liquid':
      return 'Liquid';
    case 'unknown':
      return 'Payment method unavailable';
  }
}

/**
 * The user-facing payment-method label for an activity item. Prefers the
 * authoritative server-authored label; falls back to the rail (older cached
 * records may predate `paymentMethodLabel`). Never defaults to "BTC".
 */
export function getActivityPaymentLabel(item: ActivityItem): PaymentMethodLabel | string {
  return item.paymentMethodLabel ?? getPaymentRailLabel(item.paymentRail ?? 'unknown');
}

export function getSourceFeatureLabel(item: ActivityItem): string {
  switch (item.sourceFeature) {
    case 'pay_button':
      return 'Pay Button';
    case 'pos':
      return 'Point of Sale';
    case 'request':
      return 'Payment Request';
    case 'invoice':
      return 'Invoice';
    case 'unknown':
      return 'Payment';
  }
}

/** Muted styling for statuses that did not result in a payment. */
export function isMutedActivity(status: ActivityItem['status']): boolean {
  return status === 'expired' || status === 'invalid' || status === 'failed';
}

/** Whether an item should read as "successfully paid" (drives amount styling). */
export function isPaidActivity(status: ActivityItem['status']): boolean {
  return status === 'settled' || status === 'processing';
}

export function getActivityStatusDescription(status: ActivityItem['status']): string {
  switch (status) {
    case 'new':
      return 'Waiting for payment';
    case 'processing':
      return 'Payment seen, awaiting confirmation';
    case 'settled':
      return 'Payment confirmed';
    case 'expired':
      return 'Invoice expired before payment';
    case 'invalid':
      return 'Payment was marked invalid';
    case 'failed':
      return 'Payment could not be completed';
  }
}

/** Placeholder for an enriched field that could not be loaded. Distinct from a
 * genuine zero/empty value — never render "0" or "0 BTC" in its place. */
export const UNAVAILABLE_FIELD_PLACEHOLDER = '—';

/** True when THIS item's payment details failed to enrich (base record is still
 * valid and shown). Drives the item-level "some details unavailable" marker. */
export function isItemEnrichmentDegraded(item: ActivityItem): boolean {
  return item.enrichmentStatus === 'failed' || item.enrichmentStatus === 'partial';
}

export interface ActivityDegradedBannerCopy {
  message: string;
  /** Whether to offer a Retry action (only when something can actually recover). */
  showRetry: boolean;
}

/**
 * Feed-level degraded-state copy, or null when the feed is fully loaded / empty /
 * nothing-to-enrich. Deliberately non-alarming: base activity DID load; only some
 * payment details are missing, so it never implies payments are gone. Retry is
 * offered only when at least one failure is retryable.
 */
export function getActivityDegradedBannerCopy(
  enrichment: ActivityFeedEnrichment | undefined,
  itemCount: number,
): ActivityDegradedBannerCopy | null {
  if (!enrichment || itemCount === 0) return null;
  const showRetry = enrichment.retryableCount > 0;
  if (enrichment.status === 'partial') {
    return {
      message: 'Some payment details could not be loaded. Pull to refresh and try again.',
      showRetry,
    };
  }
  if (enrichment.status === 'failed') {
    return {
      message:
        'Payment activity loaded, but some details are unavailable. Pull to refresh and try again.',
      showRetry,
    };
  }
  return null;
}

export function getDisplayStatusTone(
  display: ActivityDisplayStatus,
): 'positive' | 'pending' | 'muted' {
  switch (display) {
    case 'Paid':
    case 'Settled':
      return 'positive';
    case 'Pending':
    case 'Processing':
      return 'pending';
    case 'Expired':
    case 'Failed':
      return 'muted';
  }
}

function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toTime(iso: string): number {
  const parsed = parseIso(iso);
  return parsed ? parsed.getTime() : 0;
}

function formatTime12Hour(date: Date): string {
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}
