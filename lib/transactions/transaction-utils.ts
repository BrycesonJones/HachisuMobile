import type { PaymentNetwork, Transaction, TransactionStatus } from '@/types/transaction';

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

export interface TransactionSection {
  title: string;
  monthKey: string;
  data: Transaction[];
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatListDate(date: string): string {
  const parsed = parseDateParts(date);
  if (!parsed) return date;

  const { year, month, day } = parsed;
  const monthLabel = MONTH_NAMES[month - 1]?.slice(0, 3) ?? '';
  return `${monthLabel} ${day}, ${year}`;
}

export function formatDetailDateTime(date: string, time: string): string {
  const parsed = parseDateParts(date);
  if (!parsed) return `${date} at ${formatTime12Hour(time)}`;

  const { year, month, day } = parsed;
  const monthLabel = MONTH_NAMES[month - 1]?.slice(0, 3) ?? '';
  return `${monthLabel} ${day}, ${year} at ${formatTime12Hour(time)}`;
}

export function formatMonthHeading(date: string): string {
  const parsed = parseDateParts(date);
  if (!parsed) return date;

  const { year, month } = parsed;
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function getMonthKey(date: string): string {
  const parsed = parseDateParts(date);
  if (!parsed) return date;
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
}

export function groupTransactionsByMonth(transactions: Transaction[]): TransactionSection[] {
  const sorted = [...transactions].sort((a, b) => {
    const aDate = new Date(`${a.date}T${a.time}`);
    const bDate = new Date(`${b.date}T${b.time}`);
    return bDate.getTime() - aDate.getTime();
  });

  const sections: TransactionSection[] = [];

  for (const transaction of sorted) {
    const monthKey = getMonthKey(transaction.date);
    const existingSection = sections.find((section) => section.monthKey === monthKey);

    if (existingSection) {
      existingSection.data.push(transaction);
      continue;
    }

    sections.push({
      title: formatMonthHeading(transaction.date),
      monthKey,
      data: [transaction],
    });
  }

  return sections;
}

export function getStatusLabel(status: TransactionStatus): string {
  const labels: Record<TransactionStatus, string> = {
    complete: 'Complete',
    failed: 'Failed',
    canceled: 'Canceled',
    pending: 'Pending',
  };

  return labels[status];
}

export function getStatusDescription(status: TransactionStatus): string {
  const descriptions: Record<TransactionStatus, string> = {
    complete: 'Payment sent successfully',
    failed: 'Payment could not be completed',
    canceled: 'Payment was canceled',
    pending: 'Payment is being processed',
  };

  return descriptions[status];
}

export function getPaymentSourceLabel(transaction: Transaction): string {
  if (transaction.paymentSource) return transaction.paymentSource;

  const networkLabels: Record<PaymentNetwork, string> = {
    bitcoin: 'Bitcoin wallet',
    lightning: 'Lightning wallet',
    cash_balance: 'Cash balance',
    external_wallet: 'External wallet',
  };

  if (transaction.paymentNetwork) {
    return networkLabels[transaction.paymentNetwork];
  }

  return 'Bitcoin wallet';
}

export function getTransactionTitle(transaction: Transaction): string {
  return transaction.payerName;
}

export function getTransactionSubtitle(transaction: Transaction): string {
  if (transaction.amountBtc && transaction.payerName === 'Bitcoin buy') {
    return `${transaction.amountBtc} BTC`;
  }

  return transaction.description;
}

export function getAvatarInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}

export function isMutedTransaction(status: TransactionStatus): boolean {
  return status === 'failed' || status === 'canceled';
}

function parseDateParts(date: string): { year: number; month: number; day: number } | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatTime12Hour(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;

  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${minutes} ${period}`;
}
