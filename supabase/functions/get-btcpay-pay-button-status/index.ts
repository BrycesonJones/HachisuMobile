// Edge Function: get-btcpay-pay-button-status
//
// Reads a store's Pay Button state from BTCPay (the store setting
// `anyoneCanCreateInvoice`) for the mobile Pay Button screen. BTCPay is the
// source of truth; on a successful read we refresh the cached mirror on
// merchant_stores. Ownership-checked. Returns a normalized status.
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

  // Read the store with the service role, then verify ownership ourselves. We
  // never trust a client-supplied BTCPay store id — it is derived from our row.
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
    const { enabled } = await getStorePayButton(config, store.btcpay_store_id);
    const status = enabled ? 'enabled' : 'disabled';

    // Refresh the cached mirror from BTCPay's authoritative state (best-effort;
    // a mirror write failure must not fail the read).
    const { error: mirrorError } = await admin
      .from('merchant_stores')
      .update({
        pay_button_enabled: enabled,
        pay_button_status: status,
        pay_button_last_synced_at: new Date().toISOString(),
        pay_button_error: null,
      })
      .eq('id', store.id);
    if (mirrorError) {
      console.error(`[pay-button:get] store=${store.id} mirror write failed:`, mirrorError.message);
    }

    console.log(
      `[pay-button:get] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `action=status enabled=${enabled} status=${status}`,
    );

    return jsonResponse({
      ok: true,
      merchant_store_id: store.id,
      btcpay_store_id: store.btcpay_store_id,
      pay_button_enabled: enabled,
      status,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[pay-button:get] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `action=status failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse(
      { ok: false, error: 'Could not load Pay Button status. Please try again.' },
      502,
    );
  }
});
