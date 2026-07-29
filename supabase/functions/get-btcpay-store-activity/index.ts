// Edge Function: get-btcpay-store-activity
//
// Powers the mobile Activity feed. BTCPay Server is the payment/reporting source
// of truth; this function is the ONLY path the mobile app uses to read it (the app
// never calls BTCPay directly and never sees the Greenfield key or the BTCPay
// store id it can influence).
//
// Flow:
//   1. Authenticate the caller (JWT -> getUser).
//   2. Verify the caller OWNS merchantStoreId (server-side, service role).
//   3. Resolve btcpay_store_id from the owned row (never trust a client value).
//   4. List the store's invoices for the requested range via Greenfield.
//   5. Best-effort, failure-isolated enrichment (crypto amount + received date).
//   6. Normalize into mobile-friendly Activity items and return them.
//
// The normalization + enrichment core lives in ../_shared/activity-normalize.ts
// and is shared verbatim with get-btcpay-activity-detail so a record looks
// identical whether fetched in a list page or on its own by durable id.
//
// Payload: { merchantStoreId, startDate?, endDate?, tab?, limit?, offset? }
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  listStoreInvoices,
  type BtcpayConfig,
} from '../_shared/btcpay-client.ts';
import {
  ENRICH_CONCURRENCY,
  enrichOne,
  mapWithConcurrency,
  normalizeInvoice,
  normalizeStatus,
  rawStatusOf,
  requiresEnrichment,
  summarizeEnrichment,
  type EnrichmentOutcome,
} from '../_shared/activity-normalize.ts';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_RANGE_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Server is not configured.' }, 500);
  }

  // 1. Authenticate.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, error: 'Missing or invalid Authorization header.' }, 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ ok: false, error: 'Not authenticated.' }, 401);
  }

  // Parse + validate the payload.
  let body: {
    merchantStoreId?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    tab?: unknown;
    limit?: unknown;
    offset?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return jsonResponse({ ok: false, error: 'merchantStoreId is required.' }, 400);
  }

  const limit = clampInt(body.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(body.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  // Resolve the date range (default: last 30 days). Range is inclusive; endDate
  // defaults to "now" so newly created invoices are always in range.
  const now = new Date();
  const endDate = parseDate(body.endDate) ?? now;
  const defaultStart = new Date(endDate.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);
  const startDate = parseDate(body.startDate) ?? defaultStart;

  // 2. Verify ownership + 3. resolve btcpay_store_id server-side.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name')
    .eq('id', merchantStoreId)
    .maybeSingle<{ id: string; user_id: string; btcpay_store_id: string; name: string }>();
  if (storeError) {
    return jsonResponse({ ok: false, error: 'Could not load the store.' }, 500);
  }
  if (!store || store.user_id !== user.id) {
    return jsonResponse({ ok: false, error: 'Store not found.' }, 404);
  }
  if (!store.btcpay_store_id) {
    return jsonResponse(
      { ok: false, error: 'This store is not connected to BTCPay yet.' },
      409,
    );
  }

  let config: BtcpayConfig;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  const range = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  try {
    // 4. List invoices for the range (BTCPay expects unix seconds).
    const invoices = await listStoreInvoices(config, store.btcpay_store_id, {
      startDate: Math.floor(startDate.getTime() / 1000),
      endDate: Math.floor(endDate.getTime() / 1000),
      skip: offset,
      take: limit,
    });

    // 5. Failure-isolated enrichment. Only invoices whose base status implies a
    // payment exists are enriched; each call is bounded by ENRICH_TIMEOUT_MS and
    // ENRICH_CONCURRENCY, and a single failure is CAPTURED (not swallowed) so the
    // item can be marked degraded rather than silently shown as "no payment".
    const enrichTargets = invoices.filter(
      (invoice) => invoice.id && requiresEnrichment(normalizeStatus(rawStatusOf(invoice))),
    );
    const outcomes = new Map<string, EnrichmentOutcome>();
    await mapWithConcurrency(enrichTargets, ENRICH_CONCURRENCY, async (invoice) => {
      const outcome = await enrichOne(config, store.btcpay_store_id, invoice);
      outcomes.set(invoice.id, outcome);
      if (!outcome.ok) {
        // Per-item diagnostic. IDs + normalized code only — never keys, tokens,
        // wallet descriptors, or raw BTCPay bodies.
        console.error(
          `[store-activity] enrich-fail store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
            `invoice=${invoice.id} code=${outcome.code} retryable=${outcome.retryable} ` +
            `http=${outcome.httpStatus ?? 'n/a'}`,
        );
      }
    });

    // 6. Normalize, preserving original order. Each item carries an explicit
    // enrichmentStatus so the client never infers failure from a null field.
    const items = invoices.map((invoice) =>
      normalizeInvoice(invoice, invoice.id ? outcomes.get(invoice.id) : undefined),
    );

    // Feed-level rollup from the enrichment outcomes.
    const enrichment = summarizeEnrichment(outcomes);

    // Pagination: if we filled the page, there may be more.
    const nextOffset = invoices.length === limit ? offset + limit : null;

    console.log(
      `[store-activity] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `range=${range.startDate}..${range.endDate} limit=${limit} offset=${offset} ` +
        `returned=${items.length} nextOffset=${nextOffset ?? 'null'}`,
    );
    console.log(
      `[store-activity] enrichment store=${store.id} attempted=${enrichment.attemptedCount} ` +
        `succeeded=${enrichment.succeededCount} failed=${enrichment.failedCount} ` +
        `retryable=${enrichment.retryableCount} status=${enrichment.status}`,
    );

    return jsonResponse({
      ok: true,
      merchantStoreId: store.id,
      btcpayStoreId: store.btcpay_store_id,
      source: 'btcpay',
      range,
      items,
      enrichment,
      nextOffset,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    let message = 'Could not load activity. Please try again.';
    if (isApiError && (err.status === 401 || err.status === 403)) {
      message = 'BTCPay rejected the request (permission denied).';
    }
    console.error(
      `[store-activity] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse({ ok: false, error: message }, 502);
  }
});

// ---------------------------------------------------------------------------
// Request-payload utilities (list-specific)
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
