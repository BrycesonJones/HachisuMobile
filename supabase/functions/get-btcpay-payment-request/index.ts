// Edge Function: get-btcpay-payment-request
//
// Durable, single-record retrieval for the Payment Request DETAIL screen. The
// mobile app routes by durable identifiers (merchantStoreId + paymentRequestId)
// and this function resolves the authoritative record, so a payment request
// detail survives an app restart, a deep link, or a cleared in-memory cache.
//
// Mirrors get-btcpay-activity-detail's security shape: authenticate, verify
// store ownership BEFORE any BTCPay call, resolve btcpay_store_id server-side,
// then fetch the ONE record bound to that store. On top of the store-scoped
// route (live-verified store-bound), the echoed storeId is re-checked — the
// deployed API also exposes an UNscoped payment-request route, so belt and
// braces here costs nothing and guards against future routing changes.
//
// Payload: { merchantStoreId, paymentRequestId }
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  BtcpayTimeoutError,
  buildPaymentRequestUrl,
  getBtcpayConfig,
  getStorePaymentRequest,
  htmlToPlainText,
} from '../_shared/btcpay-client.ts';
import { customerDataOptionForFormId } from '../_shared/payment-request-input.ts';

const DETAIL_TIMEOUT_MS = 8_000;

type DetailErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_ACCESS_DENIED'
  | 'STORE_NOT_PROVISIONED'
  | 'PAYMENT_REQUEST_NOT_FOUND'
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
    return errorResponse('INVALID_REQUEST', 'Method not allowed', 405);
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
  let body: { merchantStoreId?: unknown; paymentRequestId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON body.', 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  const paymentRequestId =
    typeof body.paymentRequestId === 'string' ? body.paymentRequestId.trim() : '';
  if (!merchantStoreId) {
    return errorResponse('INVALID_REQUEST', 'merchantStoreId is required.', 400);
  }
  if (!paymentRequestId) {
    return errorResponse('INVALID_REQUEST', 'paymentRequestId is required.', 400);
  }

  // 3. Verify ownership + resolve btcpay_store_id server-side.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id')
    .eq('id', merchantStoreId)
    .maybeSingle<{ id: string; user_id: string; btcpay_store_id: string | null }>();
  if (storeError) {
    console.error(`[payment-request:detail] store-lookup-failed store=${merchantStoreId}`);
    return errorResponse('BTCPAY_DETAIL_FETCH_FAILED', 'Could not load the store.', 500);
  }
  if (!store) {
    return errorResponse('STORE_NOT_FOUND', 'Store not found.', 404);
  }
  if (store.user_id !== user.id) {
    // Ownership is checked BEFORE any BTCPay call — no cross-store probing.
    console.warn(
      `[payment-request:detail] access-denied user=${user.id} store=${store.id} request=${paymentRequestId}`,
    );
    return errorResponse('STORE_ACCESS_DENIED', 'You do not have access to this payment request.', 403);
  }
  if (!store.btcpay_store_id) {
    return errorResponse('STORE_NOT_PROVISIONED', 'This store is not connected to BTCPay yet.', 409);
  }
  const btcpayStoreId = store.btcpay_store_id;

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_MISCONFIGURED', message, 500);
  }

  // 4. Fetch the ONE payment request, bound to the resolved store.
  let pr;
  try {
    pr = await getStorePaymentRequest(config, btcpayStoreId, paymentRequestId, {
      timeoutMs: DETAIL_TIMEOUT_MS,
    });
  } catch (err) {
    if (err instanceof BtcpayTimeoutError) {
      return errorResponse('BTCPAY_DETAIL_TIMEOUT', 'BTCPay took too long to respond. Try again.', 504);
    }
    if (err instanceof BtcpayApiError) {
      // The scoped route resolves the request FIRST and permission-checks it
      // against its store, so a missing request — or one belonging to another
      // store — comes back 403 missing-permission, not 404 (live-verified).
      // Ownership of merchantStoreId was already proven above, so both statuses
      // mean the same thing to this caller: no such request in their store.
      if (err.status === 404 || err.status === 403) {
        return errorResponse('PAYMENT_REQUEST_NOT_FOUND', 'Payment request not found.', 404);
      }
      if (err.status === 200) {
        return errorResponse('INVALID_BTCPAY_RESPONSE', 'BTCPay returned an unexpected payload.', 502);
      }
    }
    console.error(
      `[payment-request:detail] fetch-failed store=${store.id} request=${paymentRequestId} ` +
        describeBtcpayError(err),
    );
    return errorResponse('BTCPAY_DETAIL_FETCH_FAILED', 'Could not load the payment request.', 502);
  }

  // The route is store-bound, but the echoed storeId is re-checked anyway — the
  // deployed API also has an unscoped route, so this invariant is cheap insurance.
  if (typeof pr.storeId === 'string' && pr.storeId !== btcpayStoreId) {
    console.warn(
      `[payment-request:detail] store-mismatch store=${store.id} request=${paymentRequestId}`,
    );
    return errorResponse('PAYMENT_REQUEST_NOT_FOUND', 'Payment request not found.', 404);
  }

  // 5. Normalize. BTCPay echoes amount as a JSON number — stringify for the
  // client, which renders it and never does arithmetic on it.
  const rawStatus = typeof pr.status === 'string' ? pr.status : 'Unknown';
  return jsonResponse({
    ok: true,
    paymentRequest: {
      merchantStoreId: store.id,
      btcpayPaymentRequestId: pr.id,
      status: rawStatus,
      archived: pr.archived === true,
      amount:
        typeof pr.amount === 'string'
          ? pr.amount
          : typeof pr.amount === 'number' && Number.isFinite(pr.amount)
            ? String(pr.amount)
            : '0',
      currency: typeof pr.currency === 'string' ? pr.currency : '',
      title: typeof pr.title === 'string' ? pr.title : '',
      memo:
        typeof pr.description === 'string' && pr.description.trim()
          ? htmlToPlainText(pr.description)
          : null,
      referenceId: typeof pr.referenceId === 'string' && pr.referenceId ? pr.referenceId : null,
      recipientEmail: typeof pr.email === 'string' && pr.email ? pr.email : null,
      allowCustomAmounts: pr.allowCustomPaymentAmounts === true,
      customerDataOption: customerDataOptionForFormId(pr.formId),
      createdAt: unixToIso(pr.createdTime) ?? new Date(0).toISOString(),
      expiresAt: unixToIso(pr.expiryDate),
      requestUrl: buildPaymentRequestUrl(config.serverUrl, pr.id),
    },
  });
});

function unixToIso(seconds: unknown): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function describeBtcpayError(err: unknown): string {
  if (err instanceof BtcpayTimeoutError) return 'btcpay=timeout';
  if (err instanceof BtcpayApiError) return `btcpayStatus=${err.status}`;
  return `btcpay=unexpected(${err instanceof Error ? err.name : typeof err})`;
}
