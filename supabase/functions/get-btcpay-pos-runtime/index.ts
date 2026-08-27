// Edge Function: get-btcpay-pos-runtime
//
// Read-only resolver for the authoritative BTCPay POS runtime URL. The mobile
// client sends only Hachisu's internal ids (merchantStoreId + posAppId) and
// receives back the public POS URL plus the normalized mode — it never learns
// the BTCPay origin any other way, never constructs the URL itself, and never
// sends a BTCPay store/app id.
//
// One URL serves both modes (verified against the deployed v2.4.3 source): the
// public GET /apps/{appId}/pos renders the app's saved defaultView — Cart for
// Products & Cart, Light for Quick Charge — and Greenfield never sets the
// legacy EnableShoppingCart override, so no mode parameter is needed.
//
// Before returning the URL, the app is confirmed live in BTCPay (Greenfield
// GET /api/v1/apps/pos/{appId}): it must exist, not be archived, and still
// belong to the expected BTCPay store — a stale or externally deleted app
// returns a clean error instead of a dead link. This function never mutates
// POS state.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  BtcpayTimeoutError,
  getBtcpayConfig,
  getPosApp,
  sanitizeCheckoutLink,
} from '../_shared/btcpay-client.ts';

type ResultCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'POS_APP_NOT_FOUND'
  | 'BTCPAY_APP_NOT_FOUND'
  | 'BTCPAY_REQUEST_FAILED'
  | 'INVALID_RUNTIME_URL'
  | 'SERVER_ERROR';

interface PosAppRow {
  id: string;
  user_id: string;
  merchant_store_id: string;
  btcpay_store_id: string;
  btcpay_app_id: string;
  pos_style: string;
  display_title: string;
  currency: string;
  status: string;
}

/** BTCPay defaultView -> Hachisu mode. Light is the only quick-charge view;
 * Cart, legacy Static, and the unexposed Print all resolve to products —
 * never guessed toward quick-charge, which would change how the POS charges. */
function modeFromDefaultView(view: string | undefined, storedStyle: string): 'products' | 'quick-charge' {
  if (typeof view === 'string') {
    return view.toLowerCase() === 'light' ? 'quick-charge' : 'products';
  }
  return storedStyle === 'quick-charge' ? 'quick-charge' : 'products';
}

function errorResponse(code: ResultCode, error: string, status: number) {
  return jsonResponse({ ok: false, code, error }, status);
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
    return errorResponse('SERVER_ERROR', 'Server is not configured.', 500);
  }

  // --- 1. Authenticate -----------------------------------------------------
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

  // --- 2. Parse + validate the body ---------------------------------------
  let body: { merchantStoreId?: unknown; posAppId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON body.', 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  const posAppId = typeof body.posAppId === 'string' ? body.posAppId.trim() : '';
  if (!merchantStoreId || !posAppId) {
    return errorResponse('INVALID_REQUEST', 'merchantStoreId and posAppId are required.', 400);
  }

  // --- 3. Resolve the POS app + verify ownership ---------------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: app, error: appError } = await admin
    .from('merchant_pos_apps')
    .select(
      'id, user_id, merchant_store_id, btcpay_store_id, btcpay_app_id, pos_style, display_title, currency, status',
    )
    .eq('id', posAppId)
    .maybeSingle<PosAppRow>();
  if (appError) {
    console.error(`[pos-runtime] user=${user.id} app lookup failed:`, appError.message);
    return errorResponse('SERVER_ERROR', 'Could not load the POS app.', 500);
  }
  // Not-found, not-yours, wrong-store, and inactive are deliberately
  // indistinguishable — this endpoint cannot probe other merchants' POS apps.
  if (
    !app ||
    app.user_id !== user.id ||
    app.merchant_store_id !== merchantStoreId ||
    app.status !== 'active'
  ) {
    return errorResponse('POS_APP_NOT_FOUND', 'POS app not found.', 404);
  }

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_ERROR', message, 500);
  }

  const logPrefix = `[pos-runtime] user=${user.id} app=${app.id} btcpayApp=${app.btcpay_app_id}`;

  // --- 4. Confirm the app is live in BTCPay (authoritative, read-only) -----
  let btcpayApp;
  try {
    btcpayApp = await getPosApp(config, app.btcpay_app_id, { timeoutMs: 10_000 });
  } catch (err) {
    if (err instanceof BtcpayApiError && err.status === 404) {
      console.log(`${logPrefix} result=BTCPAY_APP_NOT_FOUND`);
      return errorResponse(
        'BTCPAY_APP_NOT_FOUND',
        'This point of sale is no longer available in BTCPay.',
        410,
      );
    }
    console.error(`${logPrefix} result=BTCPAY_REQUEST_FAILED ${describeBtcpayError(err)}`);
    return errorResponse(
      'BTCPAY_REQUEST_FAILED',
      'Unable to open this point of sale right now. Try again.',
      502,
    );
  }
  // An app that moved stores or was archived is treated exactly like a deleted
  // one — never open a runtime that no longer matches the owned record.
  if (
    (typeof btcpayApp.storeId === 'string' && btcpayApp.storeId !== app.btcpay_store_id) ||
    btcpayApp.archived === true
  ) {
    console.log(
      `${logPrefix} result=BTCPAY_APP_NOT_FOUND reason=${btcpayApp.archived ? 'archived' : 'store_mismatch'}`,
    );
    return errorResponse(
      'BTCPAY_APP_NOT_FOUND',
      'This point of sale is no longer available in BTCPay.',
      410,
    );
  }

  // --- 5. Construct + origin-check the runtime URL -------------------------
  const rawUrl =
    `${config.serverUrl.replace(/\/+$/, '')}/apps/${encodeURIComponent(app.btcpay_app_id)}/pos`;
  const runtimeUrl = sanitizeCheckoutLink(rawUrl, config.serverUrl);
  if (!runtimeUrl) {
    // Fail closed: never return a URL that does not provably belong to the
    // configured BTCPay origin.
    console.error(`${logPrefix} result=INVALID_RUNTIME_URL`);
    return errorResponse('INVALID_RUNTIME_URL', 'Unable to open this point of sale.', 500);
  }

  const mode = modeFromDefaultView(
    typeof btcpayApp.defaultView === 'string' ? btcpayApp.defaultView : undefined,
    app.pos_style,
  );

  console.log(`${logPrefix} result=OK mode=${mode} view=${btcpayApp.defaultView ?? 'unset'}`);
  return jsonResponse({
    ok: true,
    posAppId: app.id,
    merchantStoreId: app.merchant_store_id,
    mode,
    runtimeUrl,
    displayTitle: app.display_title,
    currency: app.currency,
  });
});

function describeBtcpayError(err: unknown): string {
  if (err instanceof BtcpayTimeoutError) return 'btcpay=timeout';
  if (err instanceof BtcpayApiError) return `btcpayStatus=${err.status}`;
  return `btcpay=unexpected(${err instanceof Error ? err.name : typeof err})`;
}
