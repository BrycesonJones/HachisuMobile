// Edge Function: update-btcpay-pos-mode
//
// Auto-saves ONLY the POS mode (Products & Cart <-> Quick Charge). The client
// sends the Hachisu-level mode; raw BTCPay views are never accepted.
//
// Greenfield's PUT /api/v1/apps/pos/{appId} is a FULL REPLACE (verified
// against v2.4.3: omitted Template/Description are wiped to null), so this
// function rebuilds the complete BTCPay payload from the LAST-SAVED Supabase
// row — title, currency, description, product template — with only the
// defaultView changed. That is also what guarantees a mode auto-save can never
// commit the editor's unrelated unsaved local edits: the payload comes from
// the saved row, never from the client form.
//
// Consistency is strict (unlike the best-effort full save): BTCPay is updated
// first; if the Supabase pos_style write then fails, the BTCPay view is
// reverted best-effort and an error is returned — the UI never shows a mode
// that BTCPay does not have.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  updatePosApp,
} from '../_shared/btcpay-client.ts';
import { buildTemplate, PosProductError } from '../_shared/pos-template.ts';
import { logAuthorizationDenied } from '../_shared/security-log.ts';

type ResultCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'POS_APP_NOT_FOUND'
  | 'BTCPAY_REQUEST_FAILED'
  | 'POS_UPDATE_FAILED'
  | 'SERVER_ERROR';

// Hachisu mode -> BTCPay defaultView + persisted pos_style. Same mapping as
// update-btcpay-pos-app; Static/Print are never accepted or emitted.
const MODE_CONFIG = {
  products: { defaultView: 'Cart', posStyle: 'product-list-cart' },
  'quick-charge': { defaultView: 'Light', posStyle: 'quick-charge' },
} as const;
type PosMode = keyof typeof MODE_CONFIG;

interface PosAppRow {
  id: string;
  user_id: string;
  merchant_store_id: string;
  btcpay_app_id: string;
  pos_style: string;
  display_title: string;
  currency: string;
  description: string | null;
  products: unknown;
  status: string;
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
  let body: { merchantStoreId?: unknown; posAppId?: unknown; posMode?: unknown };
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
  if (body.posMode !== 'products' && body.posMode !== 'quick-charge') {
    return errorResponse('INVALID_REQUEST', 'posMode must be products or quick-charge.', 400);
  }
  const posMode: PosMode = body.posMode;
  const { defaultView, posStyle } = MODE_CONFIG[posMode];

  // --- 3. Resolve the POS app + verify ownership ---------------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: app, error: appError } = await admin
    .from('merchant_pos_apps')
    .select(
      'id, user_id, merchant_store_id, btcpay_app_id, pos_style, display_title, currency, description, products, status',
    )
    .eq('id', posAppId)
    .maybeSingle<PosAppRow>();
  if (appError) {
    console.error(`[pos-mode] user=${user.id} app lookup failed:`, appError.message);
    return errorResponse('SERVER_ERROR', 'Could not load the POS app.', 500);
  }
  // Not-found, not-yours, wrong-store, and inactive are indistinguishable.
  if (
    !app ||
    app.user_id !== user.id ||
    app.merchant_store_id !== merchantStoreId ||
    app.status !== 'active'
  ) {
    logAuthorizationDenied({
      action: 'update-btcpay-pos-mode',
      userId: user.id,
      resourceType: 'pos_app',
      resourceId: posAppId,
      storeId: merchantStoreId,
      reason:
        !app
        ? 'not_found'
        : app.user_id !== user.id
        ? 'not_owner'
        : app.merchant_store_id !== merchantStoreId
        ? 'wrong_store'
        : 'inactive',
    });
    return errorResponse('POS_APP_NOT_FOUND', 'POS app not found.', 404);
  }

  const logPrefix = `[pos-mode] user=${user.id} app=${app.id} mode=${posMode}`;

  // Already saved with this mode — nothing to do (a duplicate/retried tap).
  if (app.pos_style === posStyle) {
    console.log(`${logPrefix} result=NOOP`);
    return jsonResponse({ ok: true, posMode });
  }

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_ERROR', message, 500);
  }

  // Full BTCPay payload from the SAVED row (PUT is a full replace — see header).
  const savedProducts = Array.isArray(app.products) ? app.products : [];
  let template: string;
  try {
    template = buildTemplate(savedProducts);
  } catch (err) {
    if (err instanceof PosProductError) {
      return errorResponse('POS_UPDATE_FAILED', err.message, 400);
    }
    throw err;
  }
  const previousView =
    app.pos_style === 'quick-charge' ? ('Light' as const) : ('Cart' as const);
  const btcpayPayload = {
    title: app.display_title,
    currency: app.currency,
    description: app.description ?? '',
    template,
  };

  // --- 4. Update BTCPay first ----------------------------------------------
  try {
    await updatePosApp(config, app.btcpay_app_id, { ...btcpayPayload, defaultView });
  } catch (err) {
    if (err instanceof BtcpayApiError) {
      console.error(`${logPrefix} result=BTCPAY_REQUEST_FAILED status=${err.status}`);
    } else {
      console.error(`${logPrefix} result=BTCPAY_REQUEST_FAILED`, String(err));
    }
    return errorResponse('BTCPAY_REQUEST_FAILED', 'Unable to change POS mode. Try again.', 502);
  }

  // --- 5. Persist pos_style (only) to Supabase -----------------------------
  const { error: updateError } = await admin
    .from('merchant_pos_apps')
    .update({ pos_style: posStyle })
    .eq('id', app.id);
  if (updateError) {
    // Keep BTCPay and Supabase consistent: put the previous view back.
    console.error(`${logPrefix} result=POS_UPDATE_FAILED dbError=${updateError.message}`);
    try {
      await updatePosApp(config, app.btcpay_app_id, {
        ...btcpayPayload,
        defaultView: previousView,
      });
    } catch (revertErr) {
      console.error(`${logPrefix} btcpay revert failed:`, String(revertErr));
    }
    return errorResponse('POS_UPDATE_FAILED', 'Unable to change POS mode. Try again.', 500);
  }

  console.log(`${logPrefix} result=OK view=${defaultView}`);
  return jsonResponse({ ok: true, posMode });
});
