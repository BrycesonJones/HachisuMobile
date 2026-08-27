// Unit tests for the pagination primitives.
//
// Run from supabase/functions with a deno.json containing
// {"nodeModulesDir":"auto"}:  deno test --allow-read _shared/pagination.test.ts
//
// These cover the completeness invariants the CSV export depends on: a report
// must never omit or duplicate a record, and must fail rather than truncate.

import { assertEquals } from 'jsr:@std/assert@1';

import {
  decodeCursor,
  encodeCursor,
  scanAllPages,
  type ScanAllResult,
} from './pagination.ts';

// ---------------------------------------------------------------------------
// Cursor codec
// ---------------------------------------------------------------------------

Deno.test('cursor round-trips an offset', () => {
  assertEquals(decodeCursor(encodeCursor(0)), 0);
  assertEquals(decodeCursor(encodeCursor(25)), 25);
  assertEquals(decodeCursor(encodeCursor(1_000_000)), 1_000_000);
});

Deno.test('absent cursor means the first page', () => {
  assertEquals(decodeCursor(undefined), 0);
  assertEquals(decodeCursor(null), 0);
  assertEquals(decodeCursor(''), 0);
});

Deno.test('malformed or hostile cursors are rejected, not coerced', () => {
  assertEquals(decodeCursor('not-a-cursor'), null);
  assertEquals(decodeCursor(btoa('{"v":1}')), null); // no skip
  assertEquals(decodeCursor(btoa('{"v":2,"skip":5}')), null); // wrong version
  assertEquals(decodeCursor(btoa('{"v":1,"skip":-1}')), null); // negative
  assertEquals(decodeCursor(btoa('{"v":1,"skip":1.5}')), null); // non-integer
  assertEquals(decodeCursor(btoa('{"v":1,"skip":99999999}')), null); // out of range
  assertEquals(decodeCursor(btoa('[]')), null);
  assertEquals(decodeCursor(123), null);
  assertEquals(decodeCursor('x'.repeat(500)), null); // oversized
});

// ---------------------------------------------------------------------------
// scanAllPages
// ---------------------------------------------------------------------------

interface Row {
  id: string;
}

/** A fake upstream holding `total` rows, served in `pageSize` slices. */
function fakeUpstream(total: number) {
  const all: Row[] = Array.from({ length: total }, (_, i) => ({ id: `inv-${i}` }));
  const calls: { skip: number; take: number }[] = [];
  return {
    calls,
    fetchPage: (skip: number, take: number) => {
      calls.push({ skip, take });
      return Promise.resolve(all.slice(skip, skip + take));
    },
  };
}

const OPTS = { pageSize: 10, maxItems: 10_000, maxPages: 1_000, timeBudgetMs: 60_000 };

function expectOk<T>(result: ScanAllResult<T>): { items: T[]; pages: number } {
  if (!result.ok) throw new Error(`expected ok, aborted: ${result.reason}`);
  return result;
}

Deno.test('scan reads every record across multiple pages', async () => {
  const up = fakeUpstream(35);
  const result = expectOk(await scanAllPages(up.fetchPage, (r) => r.id, OPTS));
  assertEquals(result.items.length, 35);
  assertEquals(result.items[0].id, 'inv-0');
  assertEquals(result.items[34].id, 'inv-34');
  // 10 + 10 + 10 + 5(short) -> terminates on the short page.
  assertEquals(result.pages, 4);
});

Deno.test('exact page boundary terminates on the trailing empty page', async () => {
  const up = fakeUpstream(30);
  const result = expectOk(await scanAllPages(up.fetchPage, (r) => r.id, OPTS));
  assertEquals(result.items.length, 30);
  // 10 + 10 + 10 (all full) + one empty page to learn the range is exhausted.
  assertEquals(result.pages, 4);
  assertEquals(up.calls[3], { skip: 30, take: 10 });
});

Deno.test('empty upstream yields no rows and one request', async () => {
  const up = fakeUpstream(0);
  const result = expectOk(await scanAllPages(up.fetchPage, (r) => r.id, OPTS));
  assertEquals(result.items.length, 0);
  assertEquals(result.pages, 1);
});

Deno.test('single short page terminates immediately', async () => {
  const up = fakeUpstream(4);
  const result = expectOk(await scanAllPages(up.fetchPage, (r) => r.id, OPTS));
  assertEquals(result.items.length, 4);
  assertEquals(result.pages, 1);
});

Deno.test('no record is omitted: skip advances by exactly what was returned', async () => {
  const up = fakeUpstream(23);
  const result = expectOk(await scanAllPages(up.fetchPage, (r) => r.id, OPTS));
  const ids = result.items.map((r) => r.id);
  assertEquals(new Set(ids).size, 23);
  for (let i = 0; i < 23; i++) assertEquals(ids.includes(`inv-${i}`), true);
  assertEquals(up.calls.map((c) => c.skip), [0, 10, 20]);
});

Deno.test('a record repeated by a shifting upstream is emitted once', async () => {
  // Page 2 re-serves one row from page 1, as a live list can when rows shift.
  const pages: Row[][] = [
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'b' }, { id: 'c' }],
    [],
  ];
  let call = 0;
  const result = expectOk(
    await scanAllPages(
      () => Promise.resolve(pages[call++] ?? []),
      (r) => r.id,
      { ...OPTS, pageSize: 2 },
    ),
  );
  assertEquals(result.items.map((r) => r.id), ['a', 'b', 'c']);
});

Deno.test('records without a stable id are kept rather than dropped', async () => {
  const pages: { id?: string }[][] = [[{ id: undefined }, { id: undefined }], []];
  let call = 0;
  const result = expectOk(
    await scanAllPages(
      () => Promise.resolve(pages[call++] ?? []),
      (r) => r.id,
      { ...OPTS, pageSize: 2 },
    ),
  );
  assertEquals(result.items.length, 2);
});

Deno.test('item ceiling ABORTS and returns no partial data', async () => {
  const up = fakeUpstream(100);
  const result = await scanAllPages(up.fetchPage, (r) => r.id, {
    ...OPTS,
    maxItems: 25,
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, 'item-ceiling');
  // The failure branch carries no items at all — a caller cannot serve a partial set.
  assertEquals('items' in result, false);
});

Deno.test('page ceiling ABORTS', async () => {
  const up = fakeUpstream(1_000);
  const result = await scanAllPages(up.fetchPage, (r) => r.id, { ...OPTS, maxPages: 3 });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, 'page-ceiling');
});

Deno.test('time budget ABORTS', async () => {
  const up = fakeUpstream(1_000);
  let clock = 0;
  const result = await scanAllPages(up.fetchPage, (r) => r.id, {
    ...OPTS,
    timeBudgetMs: 50,
    now: () => (clock += 30), // exceeds 50ms on the third check
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, 'time-budget');
});

Deno.test('a scan that fits inside its budget still succeeds', async () => {
  const up = fakeUpstream(15);
  let clock = 0;
  const result = await scanAllPages(up.fetchPage, (r) => r.id, {
    ...OPTS,
    timeBudgetMs: 10_000,
    now: () => (clock += 10),
  });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.items.length, 15);
});
