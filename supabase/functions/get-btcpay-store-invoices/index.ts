// Edge Function: get-btcpay-store-invoices
//
// Backs the mobile Invoices screen with the active BTCPay store's REAL invoice
// history — every invoice in the store, regardless of which client created it
// (Hachisu, the BTCPay web UI, POS, Pay Button, an external integration). The
// Hachisu `merchant_invoices` table is an idempotency ledger for Hachisu's own
// creates and is deliberately NOT consulted here; BTCPay is the source of truth.
//
// Flow:
//   1. Authenticate + verify ownership + resolve btcpay_store_id server-side
//      (_shared/store-auth.ts — a client-supplied BTCPay id is never trusted).
//   2. Translate the mobile filters into BTCPay's own query parameters, so
//      status/time/search filtering and paging happen SERVER-side rather than
//      by pulling an unbounded history to the phone:
//        status     -> `status` (+ `additionalStatus` post-filter for the
//                      paid-late/partial/over variants; see _shared/invoice-filters.ts)
//        time       -> `startDate` / `endDate` (unix seconds)
//        search     -> `textSearch` (BTCPay's own invoice text search)
//        pagination -> `skip` / `take`, surfaced as an opaque cursor
//   3. Ask for `includePaymentMethods=true` so each invoice arrives with its
//      payments inline — one Greenfield call per page, never N+1 detail calls.
//   4. Normalize through the SHARED _shared/activity-normalize.ts model, so an
//      invoice looks identical here, on the Activity detail screen, and in the
//      export.
//
// Payload: { merchantStoreId, limit?, cursor?, statusFilter?, search?,
//            startDate?, endDate? }
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  listStoreInvoices,
  type BtcpayConfig,
  type BtcpayInvoice,
} from '../_shared/btcpay-client.ts';
import { resolveOwnedStore } from '../_shared/store-auth.ts';
import { decodeCursor, encodeCursor } from '../_shared/pagination.ts';
import { readJsonObjectBody } from '../_shared/request-body.ts';
import {
  embeddedMethodsOutcome,
  normalizeExceptionStatus,
  normalizeInvoice,
  type ActivityItem,
} from '../_shared/activity-normalize.ts';
import {
  isInvoiceStatusFilterId,
  resolveInvoiceStatusFilter,
  type InvoiceStatusFilterId,
} from '../_shared/invoice-filters.ts';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 200;
/** Bound on Greenfield pages scanned per request when an exception-status
 * filter means a fetched page can yield fewer matches than it holds. */
const MAX_SCAN_PAGES = 8;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const body:
    | {
        merchantStoreId?: unknown;
        limit?: unknown;
        cursor?: unknown;
        statusFilter?: unknown;
        search?: unknown;
        startDate?: unknown;
        endDate?: unknown;
      }
    | null = await readJsonObjectBody(req);
  if (!body) {
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

  const statusFilterId: InvoiceStatusFilterId = isInvoiceStatusFilterId(body.statusFilter)
    ? body.statusFilter
    : 'all';
  if (body.statusFilter != null && !isInvoiceStatusFilterId(body.statusFilter)) {
    return jsonResponse({ ok: false, error: 'Unsupported status filter.' }, 400);
  }
  const statusFilter = resolveInvoiceStatusFilter(statusFilterId);

  const search = typeof body.search === 'string' ? body.search.trim() : '';
  if (search.length > MAX_SEARCH_LENGTH) {
    return jsonResponse({ ok: false, error: 'Search text is too long.' }, 400);
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
    const items: ActivityItem[] = [];
    let skip = cursorSkip;
    let exhausted = false;

    for (let page = 0; page < MAX_SCAN_PAGES; page++) {
      const remaining = limit - items.length;
      // Over-fetch only when an exception-status post-filter can discard rows.
      const take = statusFilter.exceptionStatuses ? limit : remaining;
      const invoices = await listStoreInvoices(config, ctx.btcpayStoreId, {
        skip,
        take,
        includePaymentMethods: true,
        status: statusFilter.btcpayStatuses.length ? statusFilter.btcpayStatuses : undefined,
        textSearch: search || undefined,
        startDate: startDate ? Math.floor(startDate.getTime() / 1000) : undefined,
        endDate: endDate ? Math.floor(endDate.getTime() / 1000) : undefined,
      });

      // `skip` advances ONLY past invoices this page actually consumed. Advancing
      // by the whole fetched page would make the next cursor jump over invoices
      // that were fetched but never returned (possible when an exception-status
      // post-filter fills the page mid-way), silently dropping records.
      let consumed = 0;
      let pageFull = false;
      for (const invoice of invoices) {
        if (items.length >= limit) {
          pageFull = true;
          break;
        }
        consumed++;
        if (!matchesExceptionFilter(invoice, statusFilter.exceptionStatuses)) continue;
        items.push(
          normalizeInvoice(invoice, embeddedMethodsOutcome(invoice), {
            serverUrl: config.serverUrl,
          }),
        );
      }
      skip += consumed;

      // Exhausted only when BTCPay returned a short page AND we consumed all of
      // it — a short page we stopped early on still has history behind it.
      if (invoices.length < take && !pageFull) {
        exhausted = true;
        break;
      }
      if (items.length >= limit) break;
    }

    const nextCursor = exhausted ? null : encodeCursor(skip);

    console.log(
      `[store-invoices] user=${ctx.userId} store=${ctx.merchantStoreId} ` +
        `btcpayStore=${ctx.btcpayStoreId} filter=${statusFilterId} search=${search ? 'yes' : 'no'} ` +
        `limit=${limit} cursorSkip=${cursorSkip} scannedTo=${skip} returned=${items.length} ` +
        `nextCursor=${nextCursor ? 'yes' : 'null'}`,
    );

    return jsonResponse({
      ok: true,
      merchantStoreId: ctx.merchantStoreId,
      btcpayStoreId: ctx.btcpayStoreId,
      source: 'btcpay',
      items,
      nextCursor,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    let message = 'Could not load invoices. Please try again.';
    if (isApiError && (err.status === 401 || err.status === 403)) {
      message = 'BTCPay rejected the request (permission denied).';
    }
    console.error(
      `[store-invoices] user=${ctx.userId} store=${ctx.merchantStoreId} ` +
        `btcpayStore=${ctx.btcpayStoreId} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse({ ok: false, error: message }, 502);
  }
});

/** Exception-status filters (paid late/partial/over) are applied here because
 * BTCPay's list query exposes only the primary status server-side. */
function matchesExceptionFilter(
  invoice: BtcpayInvoice,
  allowed: readonly string[] | undefined,
): boolean {
  if (!allowed) return true;
  return allowed.includes(normalizeExceptionStatus(invoice.additionalStatus));
}

// ---------------------------------------------------------------------------
// Request-payload utilities
// ---------------------------------------------------------------------------

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
