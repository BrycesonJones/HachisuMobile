// Edge Function: set-btcpay-pay-button
//
// Enables/disables a store's Pay Button by setting the BTCPay store setting
// `anyoneCanCreateInvoice` (the exact toggle behind BTCPay's Pay Button page).
// The mobile app sends only { merchantStoreId, enabled } — the BTCPay store id is
// derived server-side from the owned row. After the PUT we RE-READ the store from
// BTCPay and only report success (and update the cached mirror) if BTCPay confirms
// the requested state. BTCPay is the source of truth; we never fake enabled state.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getStorePayButton,
  setStorePayButtonEnabled,
} from '../_shared/btcpay-client.ts';

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

  let body: { merchantStoreId?: unknown; enabled?: unknown };
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
  if (typeof body.enabled !== 'boolean') {
    return jsonResponse({ ok: false, error: 'enabled (boolean) is required.' }, 400);
  }
  const enabled = body.enabled;

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

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    // Fetch the current store (full object, so the PUT can echo it back), flip
    // the flag, then RE-READ to confirm BTCPay's authoritative state.
    const { store: currentStore } = await getStorePayButton(config, store.btcpay_store_id);
    await setStorePayButtonEnabled(config, store.btcpay_store_id, currentStore, enabled);
    const { enabled: confirmed } = await getStorePayButton(config, store.btcpay_store_id);

    if (confirmed !== enabled) {
      // BTCPay did not apply the change (e.g. still disabled after an enable).
      // Record the drift on the mirror and surface a clear error — never fake it.
      await admin
        .from('merchant_stores')
        .update({
          pay_button_enabled: confirmed,
          pay_button_status: 'error',
          pay_button_last_synced_at: new Date().toISOString(),
          pay_button_error: `BTCPay did not ${enabled ? 'enable' : 'disable'} the Pay Button.`,
        })
        .eq('id', store.id);
      console.error(
        `[pay-button:set] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
          `action=set requested=${enabled} confirmed=${confirmed} -> unconfirmed`,
      );
      return jsonResponse(
        {
          ok: false,
          error: `BTCPay did not ${enabled ? 'enable' : 'disable'} the Pay Button. Please try again.`,
        },
        502,
      );
    }

    const status = confirmed ? 'enabled' : 'disabled';

    const { error: mirrorError } = await admin
      .from('merchant_stores')
      .update({
        pay_button_enabled: confirmed,
        pay_button_status: status,
        pay_button_last_synced_at: new Date().toISOString(),
        pay_button_error: null,
      })
      .eq('id', store.id);
    if (mirrorError) {
      // BTCPay applied the change; the cache write failed. Report success (BTCPay
      // is the source of truth) but log the mirror failure.
      console.error(`[pay-button:set] store=${store.id} mirror write failed:`, mirrorError.message);
    }

    console.log(
      `[pay-button:set] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `action=set requested=${enabled} confirmed=${confirmed} status=${status}`,
    );

    return jsonResponse({
      ok: true,
      merchant_store_id: store.id,
      btcpay_store_id: store.btcpay_store_id,
      pay_button_enabled: confirmed,
      status,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    // Map BTCPay auth failures to a clearer message; keep it generic otherwise.
    let message = 'Could not update the Pay Button. Please try again.';
    if (isApiError && (err.status === 401 || err.status === 403)) {
      message = 'BTCPay rejected the request (permission denied).';
    }
    console.error(
      `[pay-button:set] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `action=set requested=${enabled} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse({ ok: false, error: message }, 502);
  }
});
