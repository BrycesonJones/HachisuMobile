// Shared pagination primitives for the store-scoped BTCPay endpoints.
//
// Two concerns live here so they can be unit-tested in isolation and cannot
// drift between the endpoints that use them:
//
//   1. The opaque list cursor (Invoices + Activity feeds).
//   2. `scanAllPages`, the complete-or-fail scan behind the CSV export.
//
// Both encode the same invariant: a caller must never be handed a set of
// records that silently omits or duplicates entries.

// ---------------------------------------------------------------------------
// Opaque list cursor
// ---------------------------------------------------------------------------
//
// The cursor is a base64 JSON envelope carrying the upstream `skip`. It is
// opaque to the client on purpose — the paging strategy is a server concern —
// and it is validated on the way back in, so a malformed or hand-crafted value
// is rejected rather than coerced into an unintended offset.

/** Upper bound on a decoded cursor offset; rejects absurd hand-crafted values. */
const MAX_CURSOR_SKIP = 1_000_000;
/** Cursors are tiny; anything larger is not one of ours. */
const MAX_CURSOR_LENGTH = 200;

export function encodeCursor(skip: number): string {
  return btoa(JSON.stringify({ v: 1, skip }));
}

/**
 * Decodes a cursor to its upstream offset.
 *   - absent/empty -> 0 (first page)
 *   - malformed, foreign, or out-of-range -> null (caller must reject with 400)
 */
export function decodeCursor(cursor: unknown): number | null {
  if (cursor == null || cursor === '') return 0;
  if (typeof cursor !== 'string' || cursor.length > MAX_CURSOR_LENGTH) return null;
  try {
    const parsed = JSON.parse(atob(cursor));
    if (
      parsed &&
      parsed.v === 1 &&
      typeof parsed.skip === 'number' &&
      Number.isInteger(parsed.skip) &&
      parsed.skip >= 0 &&
      parsed.skip <= MAX_CURSOR_SKIP
    ) {
      return parsed.skip;
    }
  } catch {
    // Not valid base64/JSON — fall through to the rejection below.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Complete-or-fail page scan (CSV export)
// ---------------------------------------------------------------------------

export interface ScanAllOptions {
  /** Upstream page size. */
  pageSize: number;
  /** Emergency ceiling on distinct items. Exceeding it ABORTS (never truncates). */
  maxItems: number;
  /** Emergency ceiling on upstream requests. */
  maxPages: number;
  /** Wall-clock budget in ms, measured from the first call to `now`. */
  timeBudgetMs: number;
  /** Injectable clock (tests). */
  now?: () => number;
}

export type ScanAbortReason = 'time-budget' | 'item-ceiling' | 'page-ceiling';

export type ScanAllResult<T> =
  | { ok: true; items: T[]; pages: number }
  | { ok: false; reason: ScanAbortReason; pages: number; scanned: number };

/**
 * Reads EVERY page the upstream will serve, or fails.
 *
 * Completeness rules:
 *   - `skip` advances by exactly the number of records returned, so no record is
 *     stepped over;
 *   - a short page (fewer than `pageSize`) is the ONLY termination condition, so
 *     the scan always reaches the end of the range;
 *   - records are de-duplicated by stable id, so a shifting upstream ordering
 *     cannot emit one twice;
 *   - hitting any ceiling returns `ok: false` and DISCARDS the partial result —
 *     callers must not be able to accidentally serve a partial set.
 *
 * `idOf` returning undefined means the record has no stable identity; it is kept
 * (dropping it would silently omit data) but cannot participate in de-duplication.
 */
export async function scanAllPages<T>(
  fetchPage: (skip: number, take: number) => Promise<T[]>,
  idOf: (item: T) => string | undefined,
  options: ScanAllOptions,
): Promise<ScanAllResult<T>> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const items: T[] = [];
  const seen = new Set<string>();
  let skip = 0;
  let pages = 0;

  for (;;) {
    if (pages >= options.maxPages) {
      return { ok: false, reason: 'page-ceiling', pages, scanned: skip };
    }
    if (now() - startedAt > options.timeBudgetMs) {
      return { ok: false, reason: 'time-budget', pages, scanned: skip };
    }

    const page = await fetchPage(skip, options.pageSize);
    pages++;

    for (const item of page) {
      const id = idOf(item);
      if (id !== undefined) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      items.push(item);
    }

    if (items.length > options.maxItems) {
      return { ok: false, reason: 'item-ceiling', pages, scanned: skip + page.length };
    }

    skip += page.length;
    // A short page means the upstream has nothing further in range. An empty
    // page is also short, so an exact-multiple total terminates on the next
    // (empty) page rather than looping forever.
    if (page.length < options.pageSize) break;
  }

  return { ok: true, items, pages };
}
