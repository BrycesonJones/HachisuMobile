// Edge Function: get-btcpay-store-activity
//
// Powers the mobile Activity feed with PAYMENT events — financially meaningful
// transactions — rather than every invoice lifecycle record. BTCPay Server is
// the source of truth; this function is the ONLY path the mobile app uses to
// read it (the app never calls BTCPay directly and never sees the Greenfield
// key or a BTCPay store id it can influence).
//
// Flow:
//   1. Authenticate + verify ownership + resolve btcpay_store_id server-side
//      (_shared/store-auth.ts — a client-supplied BTCPay id is never trusted).
//   2. Scan the store's invoices newest-first via Greenfield with
//      includePaymentMethods=true (verified on BTCPay 2.4.3), so payment
//      details arrive inline — no per-invoice enrichment calls (no N+1).
//   3. Emit one event per PAYMENT via _shared/report-rows.ts — the same
//      derivation the CSV export uses, so Activity and the exported report
//      reconcile by construction. Invoices with no payments emit nothing here
//      (an expired unpaid invoice belongs in Invoices, not Activity).
//   4. Cursor pagination: the cursor encodes how many invoices have been
//      scanned. Each request scans bounded invoice pages until it has a full
//      page of events or history is exhausted — durable history, no 30-day /
//      25-item cap.
//
// Payload: { merchantStoreId, limit?, cursor?, startDate?, endDate? }
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  listStoreInvoices,
  type BtcpayConfig,
} from '../_shared/btcpay-client.ts';
import { resolveOwnedStore } from '../_shared/store-auth.ts';
import { toActivityEvents, type StoreActivityEvent } from '../_shared/report-rows.ts';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
/** Invoices fetched per Greenfield call while filling a page of events. */
const INVOICE_SCAN_PAGE = 25;
/** Upper bound of invoice pages scanned per request (backstop for stores with
 * long runs of unpaid invoices; the cursor lets the client continue). */
const MAX_SCAN_PAGES = 8;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  let body: {
    merchantStoreId?: unknown;
    limit?: unknown;
    cursor?: unknown;
    startDate?: unknown;
    endDate?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const resolved = await resolveOwnedStore(req, body.merchantStoreId);
  if (!resolved.ok) return resolved.response;
  const { ctx } = resolved;

  const limit = clampInt(body.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const cursorSkip = decodeCursor(body.cursor);
  if (cursorSkip === null) {
    return jsonResponse({ ok: false, error: 'Invalid cursor.' }, 400);
  }
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);

  let config: BtcpayConfig;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    const events: StoreActivityEvent[] = [];
    let skip = cursorSkip;
    let exhausted = false;

    for (let page = 0; page < MAX_SCAN_PAGES; page++) {
      const invoices = await listStoreInvoices(config, ctx.btcpayStoreId, {
        skip,
        take: INVOICE_SCAN_PAGE,
        includePaymentMethods: true,
        startDate: startDate ? Math.floor(startDate.getTime() / 1000) : undefined,
        endDate: endDate ? Math.floor(endDate.getTime() / 1000) : undefined,
      });
      // Whole invoice pages are always consumed before the cursor advances, so
      // a payment can never fall between two pages. A page therefore returns
      // AT LEAST `limit` events once history allows — never fewer than the
      // invoices scanned actually contain.
      skip += invoices.length;
      for (const invoice of invoices) {
        events.push(...toActivityEvents(invoice));
      }
      if (invoices.length < INVOICE_SCAN_PAGE) {
        exhausted = true;
        break;
      }
      if (events.length >= limit) break;
    }

    // Events within the scanned window, ordered by when the money actually
    // arrived (payment receivedDate), not by fetch order.
    events.sort((a, b) => toTime(b.receivedAt) - toTime(a.receivedAt));

    const nextCursor = exhausted ? null : encodeCursor(skip);

    console.log(
      `[store-activity] user=${ctx.userId} store=${ctx.merchantStoreId} ` +
        `btcpayStore=${ctx.btcpayStoreId} limit=${limit} cursorSkip=${cursorSkip} ` +
        `scannedTo=${skip} events=${events.length} nextCursor=${nextCursor ?? 'null'}`,
    );

    return jsonResponse({
      ok: true,
      merchantStoreId: ctx.merchantStoreId,
      btcpayStoreId: ctx.btcpayStoreId,
      source: 'btcpay',
      items: events,
      nextCursor,
      scannedInvoices: skip - cursorSkip,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    let message = 'Could not load activity. Please try again.';
    if (isApiError && (err.status === 401 || err.status === 403)) {
      message = 'BTCPay rejected the request (permission denied).';
    }
    console.error(
      `[store-activity] user=${ctx.userId} store=${ctx.merchantStoreId} ` +
        `btcpayStore=${ctx.btcpayStoreId} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse({ ok: false, error: message }, 502);
  }
});

// ---------------------------------------------------------------------------
// Request-payload utilities
// ---------------------------------------------------------------------------

/** Opaque cursor: base64url of `{ v: 1, skip: number }`. */
function encodeCursor(skip: number): string {
  return btoa(JSON.stringify({ v: 1, skip }));
}

/** Returns the skip for a cursor: 0 for absent, null for malformed/foreign. */
function decodeCursor(cursor: unknown): number | null {
  if (cursor == null || cursor === '') return 0;
  if (typeof cursor !== 'string' || cursor.length > 200) return null;
  try {
    const parsed = JSON.parse(atob(cursor));
    if (
      parsed &&
      parsed.v === 1 &&
      typeof parsed.skip === 'number' &&
      Number.isInteger(parsed.skip) &&
      parsed.skip >= 0 &&
      parsed.skip <= 1_000_000
    ) {
      return parsed.skip;
    }
  } catch {
    // fall through
  }
  return null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Parses an ISO date string (or unix-seconds number) to a Date, or null. */
function parseDate(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function toTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}
