import type {
  ActivityDisplayStatus,
  ActivityItem,
  ActivityPaymentMethod,
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

export function getPaymentMethodLabel(method: ActivityPaymentMethod): string {
  switch (method) {
    case 'BTC':
      return 'Bitcoin (on-chain)';
    case 'BTC-LN':
      return 'Lightning';
    case 'unknown':
      return 'Bitcoin';
  }
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
