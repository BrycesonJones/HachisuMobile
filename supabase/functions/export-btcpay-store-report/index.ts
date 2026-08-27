// Edge Function: export-btcpay-store-report
//
// Produces the authoritative BTCPay-backed reporting CSV for the active store,
// matching BTCPay Server's own Reporting -> Invoices export.
//
// Why this reconstructs rather than proxies (verified against this deployment,
// BTCPay 2.4.3):
//   - There is NO Greenfield reporting/export endpoint. `POST /api/v1/stores/
//     {storeId}/reports` returns 404 here, and upstream that controller action
//     is marked [NonAction] with the comment "Disabling this endpoint as we
//     still need to figure out the request/response model".
//   - BTCPay's web Reporting page is cookie/anti-forgery authenticated and
//     builds the CSV in the browser, so it cannot be proxied with a Greenfield
//     API key.
// Therefore the rows are rebuilt from the SAME authoritative invoice + payment
// data BTCPay's own report provider reads, replicating v2.4.3's
// InvoicesReportProvider column set and row-emission rules exactly
// (see _shared/report-rows.ts, which the Activity feed shares — so the export
// and the in-app feed reconcile by construction rather than by coincidence).
//
// The Greenfield key never leaves the server; the client receives only CSV text.
//
// Payload: { merchantStoreId, startDate?, endDate? }
// Response: { ok, filename, csv, rowCount, range, truncated }

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  listStoreInvoices,
  type BtcpayConfig,
} from '../_shared/btcpay-client.ts';
import { resolveOwnedStore } from '../_shared/store-auth.ts';
import {
  buildReportRows,
  collectMetadataColumns,
  reportRowsToCsv,
  type ReportRow,
} from '../_shared/report-rows.ts';

const INVOICE_PAGE = 50;
/** Hard bound on one export so a very large store cannot exhaust the function's
 * memory/time. When hit, the response says so explicitly (never silently). */
const MAX_INVOICES = 5_000;
const DEFAULT_RANGE_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  let body: { merchantStoreId?: unknown; startDate?: unknown; endDate?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const resolved = await resolveOwnedStore(req, body.merchantStoreId);
  if (!resolved.ok) return resolved.response;
  const { ctx } = resolved;

  const now = new Date();
  const endDate = parseDate(body.endDate) ?? now;
  const startDate =
    parseDate(body.startDate) ??
    new Date(endDate.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);
  if (startDate.getTime() > endDate.getTime()) {
    return jsonResponse({ ok: false, error: 'The start date is after the end date.' }, 400);
  }

  let config: BtcpayConfig;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    const rows: ReportRow[] = [];
    let skip = 0;
    let invoiceCount = 0;
    let truncated = false;

    for (;;) {
      const invoices = await listStoreInvoices(config, ctx.btcpayStoreId, {
        skip,
        take: INVOICE_PAGE,
        includePaymentMethods: true,
        startDate: Math.floor(startDate.getTime() / 1000),
        endDate: Math.floor(endDate.getTime() / 1000),
      });
      for (const invoice of invoices) {
        rows.push(...buildReportRows(invoice));
      }
      invoiceCount += invoices.length;
      skip += invoices.length;
      if (invoices.length < INVOICE_PAGE) break;
      if (invoiceCount >= MAX_INVOICES) {
        truncated = true;
        break;
      }
    }

    // Deterministic order: newest invoice first (BTCPay's own list order), with
    // each invoice's payment rows kept adjacent and in sequence — Array#sort is
    // stable, so the first row of an invoice keeps carrying the invoice fields.
    rows.sort((a, b) => String(b.base[0] ?? '').localeCompare(String(a.base[0] ?? '')));

    const csv = reportRowsToCsv(rows, collectMetadataColumns(rows));
    const filename = buildFilename(ctx.storeName, startDate, endDate);

    console.log(
      `[report-export] user=${ctx.userId} store=${ctx.merchantStoreId} ` +
        `btcpayStore=${ctx.btcpayStoreId} range=${startDate.toISOString()}..${endDate.toISOString()} ` +
        `invoices=${invoiceCount} rows=${rows.length} truncated=${truncated}`,
    );

    return jsonResponse({
      ok: true,
      merchantStoreId: ctx.merchantStoreId,
      source: 'btcpay',
      filename,
      csv,
      rowCount: rows.length,
      invoiceCount,
      range: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      truncated,
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
    return jsonResponse({ ok: false, error: message }, 502);
  }
});

/**
 * Builds a safe download filename. The store name is merchant-controlled text,
 * so it is reduced to an allow-list of characters — no separators, no dots, no
 * traversal sequences can survive.
 */
function buildFilename(storeName: string, startDate: Date, endDate: Date): string {
  const slug =
    storeName
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .toLowerCase() || 'store';
  return `hachisu-${slug}-report-${isoDay(startDate)}-to-${isoDay(endDate)}.csv`;
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
