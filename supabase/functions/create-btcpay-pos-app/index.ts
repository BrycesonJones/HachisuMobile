// Edge Function: create-btcpay-pos-app
//
// Creates a store-scoped Point of Sale app: validates that the active merchant
// store belongs to the caller, creates the POS app in BTCPay via Greenfield,
// and persists it to public.merchant_pos_apps. The mobile app NEVER calls
// BTCPay directly — the Greenfield key lives only in this function's env.
//
// Minimal create (mirrors BTCPay): only an App Name is required. The customer-
// facing title, POS style, currency and description default sensibly and are
// edited afterwards on the Update POS page.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  createPosApp,
  getBtcpayConfig,
  type PosDefaultView,
} from '../_shared/btcpay-client.ts';

const MAX_NAME_LENGTH = 50;

// Mobile POS styles -> BTCPay defaultView. MVP exposes only the first two.
const POS_STYLE_TO_VIEW: Record<string, PosDefaultView> = {
  'product-list': 'Static',
  'product-list-cart': 'Cart',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server is not configured.' }, 500);
  }

  // 1. Authenticate the user from their JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing or invalid Authorization header.' }, 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Not authenticated.' }, 401);
  }

  // 2. Parse + validate the request body.
  let body: { merchantStoreId?: unknown; appName?: unknown; posStyle?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return jsonResponse({ error: 'A store is required.' }, 400);
  }

  const appName = typeof body.appName === 'string' ? body.appName.trim() : '';
  if (!appName) {
    return jsonResponse({ error: 'App name is required.' }, 400);
  }
  if (appName.length > MAX_NAME_LENGTH) {
    return jsonResponse(
      { error: `App name must be ${MAX_NAME_LENGTH} characters or fewer.` },
      400,
    );
  }

  const posStyle =
    typeof body.posStyle === 'string' && body.posStyle in POS_STYLE_TO_VIEW
      ? body.posStyle
      : 'product-list';
  const defaultView = POS_STYLE_TO_VIEW[posStyle];

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 3. Load the store and verify ownership.
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, default_currency')
    .eq('id', merchantStoreId)
    .maybeSingle<{
      id: string;
      user_id: string;
      btcpay_store_id: string;
      default_currency: string;
    }>();
  if (storeError) {
    return jsonResponse({ error: 'Could not load the store.' }, 500);
  }
  if (!store || store.user_id !== user.id) {
    return jsonResponse({ error: 'Store not found.' }, 404);
  }
  if (!store.btcpay_store_id) {
    return jsonResponse({ error: 'This store is not connected to BTCPay yet.' }, 409);
  }

  const currency = store.default_currency || 'USD';

  // 4. Validate BTCPay config.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ error: message }, 500);
  }

  // 5. Create the POS app in BTCPay. Title defaults to the app name; both are
  //    editable on the Update POS page afterwards.
  let app;
  try {
    app = await createPosApp(config, store.btcpay_store_id, {
      appName,
      title: appName,
      currency,
      defaultView,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    if (isApiError) {
      console.error('[create-pos-app] BTCPay error', err.status, JSON.stringify(err.body));
    }
    return jsonResponse(
      { error: isApiError ? err.message : 'Could not create the POS app.' },
      502,
    );
  }

  // 6. Persist to merchant_pos_apps.
  const { data: inserted, error: insertError } = await admin
    .from('merchant_pos_apps')
    .insert({
      user_id: user.id,
      merchant_store_id: store.id,
      btcpay_store_id: store.btcpay_store_id,
      btcpay_app_id: app.id,
      app_name: appName,
      display_title: appName,
      pos_style: posStyle,
      currency,
      description: null,
      status: 'active',
      metadata: {},
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    // The app exists at BTCPay but we couldn't persist it. Surface clearly.
    console.error('[create-pos-app] DB insert failed:', insertError?.message, app.id);
    return jsonResponse(
      { error: 'POS app created but could not be saved. Please contact support.' },
      500,
    );
  }

  // 7. Return the raw row so the mobile app can route straight to it.
  return jsonResponse({ posApp: inserted });
});
