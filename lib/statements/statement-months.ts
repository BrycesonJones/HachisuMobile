import { MONTH_NAMES } from '@/lib/transactions/activity-utils';

/**
 * Pure month-list derivation for the Account Statements screen.
 *
 * Statements are NOT stored anywhere: the list of selectable months is derived
 * on render from the store's `created_at` and the device clock, and a tapped
 * month is converted into a date range for the existing Activity report export.
 *
 * Timezone semantics deliberately match the Activity feed, which groups and
 * labels payments by DEVICE-LOCAL month (see groupActivityByMonth /
 * formatActivityMonthHeading in lib/transactions/activity-utils.ts). A month's
 * export range is therefore the local half-open interval
 * [first of month 00:00 local, first of next month 00:00 local), serialized to
 * UTC instants — so a statement contains exactly the payments the Activity
 * screen files under that month heading.
 */

export interface StatementMonth {
  /** Stable identifier, e.g. "2026-07" (1-based month). */
  key: string;
  year: number;
  /** 0-based calendar month, matching Date#getMonth(). */
  monthIndex: number;
  /** Display label, e.g. "July 2026" — same vocabulary as Activity headings. */
  label: string;
}

export interface StatementYearSection {
  year: number;
  /** Months of this year, newest first. */
  months: StatementMonth[];
}

/**
 * Lists every calendar month from the current one (month-to-date) back to the
 * month the store was created, grouped by year, newest first.
 *
 * `firstIso` is the store's `created_at`. When it is missing, unparsable, or in
 * the future (clock skew), the list degrades to just the current month — the
 * screen never renders empty for a real store.
 */
export function listStatementYears(
  firstIso: string | null | undefined,
  now: Date = new Date(),
): StatementYearSection[] {
  let cursorYear = now.getFullYear();
  let cursorMonth = now.getMonth();

  let firstYear = cursorYear;
  let firstMonth = cursorMonth;
  if (firstIso) {
    const first = new Date(firstIso);
    if (!Number.isNaN(first.getTime()) && monthOrdinal(first) <= monthOrdinal(now)) {
      firstYear = first.getFullYear();
      firstMonth = first.getMonth();
    }
  }

  const sections: StatementYearSection[] = [];
  while (cursorYear > firstYear || (cursorYear === firstYear && cursorMonth >= firstMonth)) {
    const month = makeMonth(cursorYear, cursorMonth);
    const section = sections[sections.length - 1];
    if (section && section.year === cursorYear) {
      section.months.push(month);
    } else {
      sections.push({ year: cursorYear, months: [month] });
    }

    cursorMonth -= 1;
    if (cursorMonth < 0) {
      cursorMonth = 11;
      cursorYear -= 1;
    }
  }
  return sections;
}

/**
 * The export range for a month: local half-open [start of month, start of next
 * month) as UTC ISO instants. The Date constructor rolls monthIndex 12 into
 * January of the next year, so year boundaries need no special case.
 */
export function statementMonthRange(month: StatementMonth): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: new Date(month.year, month.monthIndex, 1).toISOString(),
    endDate: new Date(month.year, month.monthIndex + 1, 1).toISOString(),
  };
}

/**
 * Deterministic download name, e.g. "hachisu-my-store-statement-2026-07.csv".
 * The slug reduction mirrors the server's buildFilename allow-list in
 * supabase/functions/export-btcpay-store-report/index.ts: merchant-controlled
 * text can contribute only [a-z0-9-].
 */
export function statementFilename(storeName: string, month: StatementMonth): string {
  const slug =
    storeName
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .toLowerCase() || 'store';
  const mm = String(month.monthIndex + 1).padStart(2, '0');
  return `hachisu-${slug}-statement-${month.year}-${mm}.csv`;
}

function makeMonth(year: number, monthIndex: number): StatementMonth {
  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    year,
    monthIndex,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
  };
}

function monthOrdinal(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}
