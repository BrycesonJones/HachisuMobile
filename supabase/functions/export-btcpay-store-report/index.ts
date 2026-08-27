// Edge Function: export-btcpay-store-report
//
// Produces a BTCPay-EQUIVALENT reporting CSV for the active store, derived from
// authoritative Greenfield invoice/payment data.
//
// This is NOT the canonical CSV that BTCPay itself generates. Most columns are
// verbatim BTCPay values; InvoiceFullStatus, InvoiceDue and PaymentInvoiceAmount
// are reconstructed because Greenfield exposes no equivalent Reporting-model
// property. The full column-provenance table and the exact formulas live in
// ../_shared/report-rows.ts — that module is the one place to read (and update)
// when describing this output.
//
// Why derive rather than proxy (current production server: BTCPay Server 2.4.3):
//   - `POST /api/v1/stores/{storeId}/reports` returns 404 on this deployment;
//     upstream that controller action is marked [NonAction].
//   - BTCPay's web Reporting page is cookie/anti-forgery authenticated and builds
//     its CSV in the browser, so a Greenfield API key cannot fetch it.
//
// COMPLETENESS CONTRACT — a financial export is complete for the requested range
// or it FAILS. It is never silently truncated, and it never returns a partial
// file flagged as partial: a downloadable accounting file that is missing rows is
// worse than no file, because it looks authoritative. The function pages through
// the ENTIRE requested period; if a safety ceiling is reached it returns
// REPORT_TOO_LARGE and no CSV at all.
//
// The Greenfield key never leaves the server; the client receives only CSV text.
//
// Payload:  { merchantStoreId, startDate?, endDate? }
// Success:  { ok: true, filename, csv, rowCount, invoiceCount, range }
// Failure:  { ok: false, code, error }

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  listStoreInvoices,
  type BtcpayConfig,
} from '../_shared/btcpay-client.ts';
import { resolveOwnedStore } from '../_shared/store-auth.ts';
import { scanAllPages, type ScanAbortReason } from '../_shared/pagination.ts';
import {
  buildReportRows,
  collectMetadataColumns,
  reportRowsToCsv,
  type ReportRow,
} from '../_shared/report-rows.ts';

/** Upstream page size. 100 is verified working against this BTCPay deployment;
 * larger values are unverified, so the round-trip count is traded for certainty. */
const INVOICE_PAGE = 100;

// Emergency circuit breakers. These are NOT a merchant-visible record cutoff:
// reaching either aborts the export with REPORT_TOO_LARGE and returns no file.
// The binding constraint in practice is wall-clock time (one upstream round-trip
// per page), not memory, so the time budget is the one that normally trips first.
const MAX_INVOICES = 100_000;
const TIME_BUDGET_MS = 90_000;

/** Guards against a pathological upstream that keeps returning full pages. */
const MAX_PAGES = Math.ceil(MAX_INVOICES / INVOICE_PAGE) + 1;

type ExportErrorCode =
  | 'INVALID_REQUEST'
  | 'SERVER_MISCONFIGURED'
  | 'REPORT_TOO_LARGE'
  | 'BTCPAY_UNAVAILABLE';

function errorResponse(code: ExportErrorCode, message: string, status: number): Response {
  return jsonResponse({ ok: false, code, error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('INVALID_REQUEST', 'Method not allowed', 405);
  }

  let body: { merchantStoreId?: unknown; startDate?: unknown; endDate?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON body.', 400);
  }

  const resolved = await resolveOwnedStore(req, body.merchantStoreId);
  if (!resolved.ok) return resolved.response;
  const { ctx } = resolved;

  // Date bounds are optional. `endDate` is pinned to the instant the request
  // started so the window cannot drift while paging: invoices created mid-export
  // fall outside it, which is what makes skip-based paging stable here.
  const requestStartedAt = Date.now();
  const endDate = parseDate(body.endDate) ?? new Date(requestStartedAt);
  if (body.endDate != null && parseDate(body.endDate) == null) {
    return errorResponse('INVALID_REQUEST', 'endDate is not a valid date.', 400);
  }
  const startDate = parseDate(body.startDate);
  if (body.startDate != null && startDate == null) {
    return errorResponse('INVALID_REQUEST', 'startDate is not a valid date.', 400);
  }
  if (startDate && startDate.getTime() > endDate.getTime()) {
    return errorResponse('INVALID_REQUEST', 'The start date is after the end date.', 400);
  }

  let config: BtcpayConfig;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_MISCONFIGURED', message, 500);
  }

  try {
    // Complete-or-fail scan of the WHOLE requested period. `scanAllPages` owns
    // the completeness invariants (no omission, no duplication, abort rather
    // than truncate) and is unit-tested in _shared/pagination.test.ts.
    const scan = await scanAllPages(
      (skip, take) =>
        listStoreInvoices(config, ctx.btcpayStoreId, {
          skip,
          take,
          includePaymentMethods: true,
          startDate: startDate ? Math.floor(startDate.getTime() / 1000) : undefined,
          endDate: Math.floor(endDate.getTime() / 1000),
        }),
      (invoice) => invoice.id,
      {
        pageSize: INVOICE_PAGE,
        maxItems: MAX_INVOICES,
        maxPages: MAX_PAGES,
        timeBudgetMs: TIME_BUDGET_MS,
      },
    );

    if (!scan.ok) {
      return tooLarge(ctx, scan.reason, scan.scanned, requestStartedAt);
    }

    const rows: ReportRow[] = [];
    for (const invoice of scan.items) {
      rows.push(...buildReportRows(invoice));
    }

    // Deterministic order: newest invoice first (BTCPay's own list order), with
    // each invoice's payment rows kept adjacent and in sequence — Array#sort is
    // stable, so the first row of an invoice keeps carrying the invoice fields.
    rows.sort((a, b) => String(b.base[0] ?? '').localeCompare(String(a.base[0] ?? '')));

    const csv = reportRowsToCsv(rows, collectMetadataColumns(rows));
    const filename = buildFilename(ctx.storeName, startDate, endDate);

    console.log(
      `[report-export] user=${ctx.userId} store=${ctx.merchantStoreId} ` +
        `btcpayStore=${ctx.btcpayStoreId} ` +
        `range=${startDate ? startDate.toISOString() : 'all'}..${endDate.toISOString()} ` +
        `pages=${scan.pages} invoices=${scan.items.length} rows=${rows.length} ` +
        `durationMs=${Date.now() - requestStartedAt}`,
    );

    return jsonResponse({
      ok: true,
      merchantStoreId: ctx.merchantStoreId,
      source: 'btcpay',
      filename,
      csv,
      rowCount: rows.length,
      invoiceCount: scan.items.length,
      range: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate.toISOString(),
      },
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    let message = 'Could not build the report. Please try again.';
    if (isApiError && (err.status === 401 || err.status === 403)) {
      message = 'BTCPay rejected the request (permission denied).';
    }
    console.error(
      `[report-export] user=${ctx.userId} store=${ctx.merchantStoreId} ` +
        `btcpayStore=${ctx.btcpayStoreId} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return errorResponse('BTCPAY_UNAVAILABLE', message, 502);
  }
});

/** Aborts the export without a file. Returning a partial CSV here would hand the
 * merchant an accounting document that silently omits records. */
function tooLarge(
  ctx: { userId: string; merchantStoreId: string; btcpayStoreId: string },
  reason: ScanAbortReason,
  scanned: number,
  startedAt: number,
): Response {
  console.error(
    `[report-export] aborted user=${ctx.userId} store=${ctx.merchantStoreId} ` +
      `btcpayStore=${ctx.btcpayStoreId} reason=${reason} scanned=${scanned} ` +
      `durationMs=${Date.now() - startedAt}`,
  );
  return errorResponse(
    'REPORT_TOO_LARGE',
    'This date range is too large to export in one request. ' +
      'Choose a shorter period and export again.',
    413,
  );
}

/**
 * Builds a safe download filename. The store name is merchant-controlled text,
 * so it is reduced to an allow-list of characters — no separators, no dots, no
 * traversal sequences can survive.
 */
function buildFilename(storeName: string, startDate: Date | null, endDate: Date): string {
  const slug =
    storeName
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .toLowerCase() || 'store';
  const from = startDate ? isoDay(startDate) : 'all';
  return `hachisu-${slug}-report-${from}-to-${isoDay(endDate)}.csv`;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
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
