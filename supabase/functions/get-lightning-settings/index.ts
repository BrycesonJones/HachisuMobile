// Edge Function: get-lightning-settings
//
// Reads a store's Lightning (BTC-LN) settings for the mobile Lightning Settings
// screen: enabled + description template + status. Ownership-checked. Returns
// ONLY safe values — never the connectionString / Boltz macaroon / node internals.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getLightningPaymentMethodConfig,
  getStore,
  getStoreLightningDescriptionTemplate,
} from '../_shared/btcpay-client.ts';
import { logAuthorizationDenied } from '../_shared/security-log.ts';

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

  let body: { merchantStoreId?: unknown };
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name, lightning_status, lightning_enabled, onchain_status')
    .eq('id', merchantStoreId)
    .maybeSingle<{
      id: string;
      user_id: string;
      btcpay_store_id: string;
      name: string;
      lightning_status: string;
      lightning_enabled: boolean;
      onchain_status: string;
    }>();
  if (storeError) {
    return jsonResponse({ ok: false, error: 'Could not load the store.' }, 500);
  }
  if (!store || store.user_id !== user.id) {
    logAuthorizationDenied({
      action: 'get-lightning-settings',
      userId: user.id,
      resourceType: 'merchant_store',
      resourceId: merchantStoreId,
      reason: store ? 'not_owner' : 'not_found',
    });
    return jsonResponse({ ok: false, error: 'Store not found.' }, 404);
  }

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    const pm = await getLightningPaymentMethodConfig(config, store.btcpay_store_id);
    // The description template is a store-level field.
    const btcpayStore = await getStore(config, store.btcpay_store_id);
    const descriptionTemplate = btcpayStore
      ? getStoreLightningDescriptionTemplate(btcpayStore)
      : null;

    const status = !pm.configured ? 'not_connected' : pm.enabled ? 'connected' : 'disabled';

    // Self-heal Supabase if it drifted from BTCPay (e.g. the payment method was
    // removed or toggled directly in BTCPay). Best-effort: never fail the read.
    try {
      if (!pm.configured && store.lightning_status === 'connected') {
        const walletStatus =
          store.onchain_status === 'connected' ? 'payment_destination_connected' : 'store_created';
        await admin
          .from('merchant_stores')
          .update({
            lightning_status: 'not_connected',
            lightning_provider: null,
            lightning_configured_at: null,
            lightning_error: null,
            lightning_enabled: false,
            lightning_label: null,
            lightning_description_template: null,
            wallet_status: walletStatus,
          })
          .eq('id', store.id);
      } else if (pm.configured && store.lightning_enabled !== pm.enabled) {
        // Keep the cached enabled flag in sync so the dashboard glow is accurate.
        await admin
          .from('merchant_stores')
          .update({ lightning_enabled: pm.enabled })
          .eq('id', store.id);
      }
    } catch (reconcileErr) {
      console.error('[get-lightning-settings] reconcile failed:', String(reconcileErr));
    }

    return jsonResponse({
      ok: true,
      status,
      enabled: pm.enabled,
      // No node label exposed to the merchant (never node internals). Reserved.
      label: null,
      descriptionTemplate,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[get-lightning-settings] store=${store.id} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse(
      { ok: false, error: 'Could not load Lightning settings. Please try again.' },
      502,
    );
  }
});
