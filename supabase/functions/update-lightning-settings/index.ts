// Edge Function: update-lightning-settings
//
// Updates a store's Lightning enabled flag + invoice description template WITHOUT
// touching the connection. The enabled flag is set on the BTC-LN payment method
// (its config — the Boltz connectionString — is fetched and re-sent server-side,
// so the client never sends and we never log it). The description template is a
// store-level field, updated via a GET-then-PUT of the store object.
//
// A configured-but-disabled connection stays lightning_status='connected'.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getLightningPaymentMethodConfig,
  getStore,
  setLightningEnabled,
  setStoreLightningDescriptionTemplate,
} from '../_shared/btcpay-client.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';

const MAX_TEMPLATE_LENGTH = 500;

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

  let body: { merchantStoreId?: unknown; enabled?: unknown; descriptionTemplate?: unknown };
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
  // descriptionTemplate is optional; null/undefined means "leave as-is not sent" —
  // but the screen always sends the current value, so treat a string as the value.
  const descriptionTemplate =
    typeof body.descriptionTemplate === 'string'
      ? body.descriptionTemplate.slice(0, MAX_TEMPLATE_LENGTH)
      : null;

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

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    // 1. Confirm a Lightning connection exists (don't create one here).
    const current = await getLightningPaymentMethodConfig(config, store.btcpay_store_id);
    if (!current.configured) {
      return jsonResponse(
        { ok: false, error: 'No Lightning connection is set up for this store yet.' },
        409,
      );
    }

    // 2. Set enabled, preserving the existing connection config.
    const updated = await setLightningEnabled(
      config,
      store.btcpay_store_id,
      enabled,
      current.config,
    );
    if (typeof updated.enabled !== 'boolean') {
      return jsonResponse({ ok: false, error: 'BTCPay did not confirm the update.' }, 502);
    }

    // 3. Update the store-level description template (GET-then-PUT full store).
    if (descriptionTemplate !== null) {
      const btcpayStore = await getStore(config, store.btcpay_store_id);
      if (btcpayStore) {
        await setStoreLightningDescriptionTemplate(
          config,
          store.btcpay_store_id,
          btcpayStore,
          descriptionTemplate,
        );
      }
    }

    // 4. Persist cached settings on THIS store only. The connection stays
    //    configured (lightning_status='connected') whether enabled or disabled.
    const { error: updateError } = await admin
      .from('merchant_stores')
      .update({
        lightning_enabled: updated.enabled,
        lightning_description_template: descriptionTemplate,
      })
      .eq('id', store.id);
    if (updateError) {
      return jsonResponse(
        { ok: false, error: 'Settings updated at BTCPay but could not be saved.' },
        500,
      );
    }

    try {
      await syncUserStoreSummary(admin, user.id);
    } catch (err) {
      console.error('[update-lightning-settings] summary sync failed:', String(err));
    }

    return jsonResponse({
      ok: true,
      status: updated.enabled ? 'connected' : 'disabled',
      enabled: updated.enabled,
      descriptionTemplate,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[update-lightning-settings] store=${store.id} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse(
      { ok: false, error: 'Could not save Lightning settings. Please try again.' },
      502,
    );
  }
});
