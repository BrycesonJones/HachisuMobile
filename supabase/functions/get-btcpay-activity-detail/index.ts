// Edge Function: get-btcpay-activity-detail
//
// Durable, single-record retrieval for the Activity DETAIL screen. The mobile app
// routes by durable identifiers (merchantStoreId + invoiceId) and this function
// resolves the authoritative record so a payment detail is recoverable after an
// app restart, a bundle reload, a deep link, or a cleared in-memory cache — the
// detail screen never depends on the Activity LIST having been visited first.
//
// BTCPay Server is the source of truth; this function is the ONLY path the app
// uses to read a single invoice. The app never calls BTCPay directly, never sends
// a btcpay_store_id, and never sees the Greenfield key or wallet configuration.
//
// Flow:
//   1. Authenticate the caller (JWT -> getUser).                    UNAUTHORIZED
//   2. Validate merchantStoreId + invoiceId.                        INVALID_REQUEST
//   3. Look up merchant_stores; confirm ownership.        STORE_NOT_FOUND / _ACCESS_DENIED
//   4. Resolve btcpay_store_id server-side (never trust client).
//   5. Fetch the ONE invoice, bound to the resolved store.  INVOICE_NOT_FOUND / FETCH_FAILED
//   6. Best-effort, failure-isolated enrichment (payment detail).
//   7. Normalize with the SHARED core and return the item. Partial enrichment is
//      surfaced (enrichmentStatus) — never turned into a full-screen failure and
//      never allowed to overwrite the authoritative invoice status.
//
// Payload: { merchantStoreId, invoiceId, source? }  (source is display-only; the
// backend derives the authoritative record type).
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  BtcpayTimeoutError,
  getBtcpayConfig,
  getStoreInvoice,
  type BtcpayConfig,
  type BtcpayInvoice,
} from '../_shared/btcpay-client.ts';
import {
  enrichOne,
  normalizeInvoice,
  normalizeStatus,
  rawStatusOf,
  requiresEnrichment,
  type EnrichmentOutcome,
} from '../_shared/activity-normalize.ts';

const DETAIL_TIMEOUT_MS = 8_000;

/** Non-sensitive error codes the client maps to explicit screen states. */
type DetailErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_ACCESS_DENIED'
  | 'INVOICE_NOT_FOUND'
  | 'BTCPAY_DETAIL_FETCH_FAILED'
  | 'BTCPAY_DETAIL_TIMEOUT'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'SERVER_MISCONFIGURED';

function errorResponse(code: DetailErrorCode, message: string, status: number): Response {
  return jsonResponse({ ok: false, code, error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'INVALID_REQUEST', error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return errorResponse('SERVER_MISCONFIGURED', 'Server is not configured.', 500);
  }

  // 1. Authenticate.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid Authorization header.', 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return errorResponse('UNAUTHORIZED', 'Not authenticated.', 401);
  }

  // 2. Parse + validate the payload.
  let body: { merchantStoreId?: unknown; invoiceId?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON body.', 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : '';
  if (!merchantStoreId) {
    return errorResponse('INVALID_REQUEST', 'merchantStoreId is required.', 400);
  }
  if (!invoiceId) {
    return errorResponse('INVALID_REQUEST', 'invoiceId is required.', 400);
  }

  // 3. Verify ownership + 4. resolve btcpay_store_id server-side.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name')
    .eq('id', merchantStoreId)
    .maybeSingle<{ id: string; user_id: string; btcpay_store_id: string; name: string }>();
  if (storeError) {
    console.error(`[activity-detail] store-lookup-failed store=${merchantStoreId}`);
    return errorResponse('BTCPAY_DETAIL_FETCH_FAILED', 'Could not load the store.', 500);
  }
  if (!store) {
    return errorResponse('STORE_NOT_FOUND', 'Store not found.', 404);
  }
  if (store.user_id !== user.id) {
    // Ownership is checked BEFORE any BTCPay call, so a caller can never probe an
    // invoice inside a store they do not own (no cross-store existence leak).
    console.warn(
      `[activity-detail] access-denied user=${user.id} store=${store.id} invoice=${invoiceId}`,
    );
    return errorResponse('STORE_ACCESS_DENIED', 'You do not have access to this payment.', 403);
  }
  if (!store.btcpay_store_id) {
    return errorResponse('INVOICE_NOT_FOUND', 'This store is not connected to BTCPay yet.', 404);
  }

  let config: BtcpayConfig;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_MISCONFIGURED', message, 500);
  }

  const startedAt = Date.now();

  // 5. Fetch the ONE invoice, bound to the resolved store. BTCPay scopes the
  // lookup to btcpay_store_id, so an invoice from another store is a 404 here.
  let invoice: BtcpayInvoice;
  try {
    invoice = await getStoreInvoice(config, store.btcpay_store_id, invoiceId, {
      timeoutMs: DETAIL_TIMEOUT_MS,
    });
  } catch (err) {
    return handleFetchError(err, {
      userId: user.id,
      storeId: store.id,
      btcpayStoreId: store.btcpay_store_id,
      invoiceId,
      startedAt,
    });
  }

  // 6. Failure-isolated enrichment. Only invoices whose base status implies a
  // payment exists are enriched; a failure is CAPTURED (not thrown) so the base
  // record still renders with an explicit degraded (partial) enrichment status.
  const baseStatus = normalizeStatus(rawStatusOf(invoice));
  let outcome: EnrichmentOutcome | undefined;
  if (invoice.id && requiresEnrichment(baseStatus)) {
    outcome = await enrichOne(config, store.btcpay_store_id, invoice);
    if (!outcome.ok) {
      console.error(
        `[activity-detail] enrich-fail store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
          `invoice=${invoiceId} code=${outcome.code} retryable=${outcome.retryable} ` +
          `http=${outcome.httpStatus ?? 'n/a'}`,
      );
    }
  }

  // 7. Normalize with the SHARED core (identical shape to the feed items).
  const item = normalizeInvoice(invoice, outcome, { serverUrl: config.serverUrl });

  console.log(
    `[activity-detail] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
      `invoice=${invoiceId} status=${item.status} enrichment=${item.enrichmentStatus} ` +
      `durationMs=${Date.now() - startedAt}`,
  );

  return jsonResponse({
    ok: true,
    merchantStoreId: store.id,
    btcpayStoreId: store.btcpay_store_id,
    source: 'btcpay',
    item,
  });
});

interface FetchLogContext {
  userId: string;
  storeId: string;
  btcpayStoreId: string;
  invoiceId: string;
  startedAt: number;
}

/** Maps a base-fetch failure to a distinct client state. Not-found, timeout,
 * bad-payload, and transient failures are kept SEPARATE (never collapsed). */
function handleFetchError(err: unknown, ctx: FetchLogContext): Response {
  const durationMs = Date.now() - ctx.startedAt;
  const httpStatus = err instanceof BtcpayApiError ? err.status : 'n/a';
  console.error(
    `[activity-detail] fetch-fail user=${ctx.userId} store=${ctx.storeId} ` +
      `btcpayStore=${ctx.btcpayStoreId} invoice=${ctx.invoiceId} ` +
      `http=${httpStatus} durationMs=${durationMs} err=${err instanceof Error ? err.name : 'unknown'}`,
  );

  if (err instanceof BtcpayTimeoutError) {
    return errorResponse('BTCPAY_DETAIL_TIMEOUT', 'Payment details timed out.', 504);
  }
  if (err instanceof BtcpayApiError) {
    if (err.status === 404) {
      return errorResponse('INVOICE_NOT_FOUND', 'Payment not found.', 404);
    }
    // A 200 with a malformed body is a schema problem on our side.
    if (err.status === 200) {
      return errorResponse('INVALID_BTCPAY_RESPONSE', 'Payment details were malformed.', 502);
    }
    // 401/403 (BTCPay-side permission) and 5xx are surfaced generically — never
    // reveal BTCPay credential/permission state to the client.
    return errorResponse('BTCPAY_DETAIL_FETCH_FAILED', 'Payment details could not be loaded.', 502);
  }
  return errorResponse('BTCPAY_DETAIL_FETCH_FAILED', 'Payment details could not be loaded.', 502);
}
