// Edge Function: prepare-btcpay-boltz-lightning
//
// Phase 1 of the per-store Lightning connection flow. Hachisu abstracts BTCPay's
// "connect a Lightning node" choice away from merchants: every store uses the
// Boltz plugin (submarine swaps to Liquid / L-BTC). This function does NOT ask
// the merchant for node connection details and never exposes internal/custom
// node options.
//
// What it does, for the ACTIVE merchant store only:
//   1. Authenticates the caller (Supabase JWT) and verifies store ownership.
//   2. Confirms the backing BTCPay store still exists.
//   3. Detects whether the Boltz plugin is available for that store (probe, not
//      a browser-UI automation — plugin install is an instance-admin operation).
//   4. On success, marks the store transitional: pending_lbtc_wallet + boltz.
//
// Fully ENABLING Boltz requires an L-BTC wallet to exist first (POST
// .../boltz/setup { walletName }); that happens in the descriptor-import phase
// (connect-btcpay-lbtc-wallet). Here we only confirm readiness.
//
// SECURITY:
//   - The BTCPay Greenfield key lives ONLY in this function's environment.
//   - No wallet seeds, private keys, or descriptors are involved or logged.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  ensureBoltzStoreReady,
  getBtcpayConfig,
  getStore,
  getStoreBoltzSetup,
} from '../_shared/btcpay-client.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';

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

  // 2. Parse + validate input.
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

  async function logEvent(input: {
    eventType: string;
    status: string;
    message?: string;
    btcpayStoreId?: string | null;
    rawError?: unknown;
  }) {
    const { error } = await admin.from('btcpay_store_provisioning_events').insert({
      user_id: user!.id,
      business_id: user!.id,
      event_type: input.eventType,
      status: input.status,
      message: input.message ?? null,
      btcpay_store_id: input.btcpayStoreId ?? null,
      raw_error: input.rawError == null ? null : input.rawError,
    });
    if (error) console.error('[prepare-boltz] event log failed:', error.message);
  }

  // 3. Verify ownership + fetch the BTCPay store id.
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name, lightning_status')
    .eq('id', merchantStoreId)
    .maybeSingle<{
      id: string;
      user_id: string;
      btcpay_store_id: string;
      name: string;
      lightning_status: string;
    }>();
  if (storeError) {
    return jsonResponse({ ok: false, error: 'Could not load the store.' }, 500);
  }
  if (!store || store.user_id !== user.id) {
    return jsonResponse({ ok: false, error: 'Store not found.' }, 404);
  }

  // NOTE: "prepare" is READINESS ONLY (Layer 1 — can the server support Lightning
  // setup for this store). It must NEVER report or persist a connected state.
  // Connection (Layer 2) happens only in connect-btcpay-lbtc-wallet once BTC-LN is
  // confirmed. So we do NOT short-circuit on lightning_status here.

  // 4. Validate BTCPay config.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  await logEvent({
    eventType: 'lightning_boltz_prepare_started',
    status: 'started',
    message: `Preparing Boltz Lightning for store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  // 5. Confirm the BTCPay store exists (so a 404 on the Boltz route below means
  //    the plugin is absent, not the store).
  try {
    const btcpayStore = await getStore(config, store.btcpay_store_id);
    if (!btcpayStore) {
      await logEvent({
        eventType: 'lightning_boltz_prepare_failed',
        status: 'error',
        message: 'Backing BTCPay store no longer exists.',
        btcpayStoreId: store.btcpay_store_id,
      });
      return jsonResponse(
        { ok: false, error: 'This store could not be found on the payment server.' },
        404,
      );
    }
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(`[prepare-boltz] store=${store.id} store-check failed:`,
      isApiError ? err.message : String(err));
    await logEvent({
      eventType: 'lightning_boltz_prepare_failed',
      status: 'error',
      message: isApiError ? err.message : 'Could not reach the payment server.',
      btcpayStoreId: store.btcpay_store_id,
      rawError: isApiError ? { status: err.status } : null,
    });
    return jsonResponse(
      { ok: false, error: 'Could not reach the payment server. Please try again.' },
      502,
    );
  }

  // 6. Detect the Boltz plugin for this store (no UI automation — a Greenfield
  //    probe of the plugin's own API route).
  let boltz;
  try {
    boltz = await getStoreBoltzSetup(config, store.btcpay_store_id);
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    await logEvent({
      eventType: 'lightning_boltz_prepare_failed',
      status: 'error',
      message: isApiError ? err.message : 'Could not reach the payment server.',
      btcpayStoreId: store.btcpay_store_id,
      rawError: isApiError ? { status: err.status } : null,
    });
    return jsonResponse(
      { ok: false, error: 'Could not reach the payment server. Please try again.' },
      502,
    );
  }

  if (!boltz.available) {
    // These are expected, actionable outcomes — return 200 with a stable code so
    // the client can branch without parsing a non-2xx body. The store row is
    // left untouched (not flipped to error) for not_installed/unsupported.
    if (boltz.reason === 'forbidden') {
      await logEvent({
        eventType: 'lightning_boltz_prepare_failed',
        status: 'error',
        message: `Greenfield key lacks Boltz permissions (HTTP ${boltz.status}).`,
        btcpayStoreId: store.btcpay_store_id,
      });
      return jsonResponse(
        { ok: false, error: 'The payment server rejected the request. Please contact support.' },
        500,
      );
    }

    const isMissing = boltz.reason === 'not_installed';
    await logEvent({
      eventType: 'lightning_boltz_unavailable',
      status: 'error',
      message: isMissing
        ? 'Boltz plugin is not installed/available on this BTCPay instance.'
        : `Boltz route returned an unsupported response (HTTP ${boltz.status}).`,
      btcpayStoreId: store.btcpay_store_id,
    });
    return jsonResponse(
      isMissing
        ? {
            ok: false,
            code: 'BOLTZ_PLUGIN_NOT_AVAILABLE',
            error:
              'Boltz is not installed or is not available on this BTCPay Server instance.',
          }
        : {
            ok: false,
            code: 'BOLTZ_API_UNSUPPORTED',
            error:
              'Boltz plugin is installed, but no supported API endpoint was found for automated configuration.',
          },
    );
  }

  // 6b. Ensure the store can accept a wallet import RIGHT NOW (readiness +
  //     on-demand provisioning). This is Layer 1 ONLY — it does NOT connect a
  //     wallet. GET /boltz/setup can report an enabled standalone wallet left
  //     over from a prior connect even after BTC-LN was removed, so we must NOT
  //     treat it as connected. If not ready, block so the merchant never enters
  //     the descriptor screen — a server/admin readiness issue, not their fault.
  let readiness;
  try {
    readiness = await ensureBoltzStoreReady(config, store.btcpay_store_id);
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    await logEvent({
      eventType: 'lightning_boltz_prepare_failed',
      status: 'error',
      message: isApiError ? err.message : 'Could not reach the payment server.',
      btcpayStoreId: store.btcpay_store_id,
      rawError: isApiError ? { status: err.status } : null,
    });
    return jsonResponse(
      { ok: false, error: 'Could not reach the payment server. Please try again.' },
      502,
    );
  }

  if (!readiness.ready) {
    await logEvent({
      eventType: 'lightning_boltz_daemon_unavailable',
      status: 'error',
      message: `Boltz not ready (reason=${readiness.reason}, code=${readiness.code ?? 'none'}, HTTP ${readiness.status}).`,
      btcpayStoreId: store.btcpay_store_id,
      rawError: { reason: readiness.reason, status: readiness.status, code: readiness.code },
    });
    // 200 + stable code so the client can show a blocked state cleanly.
    return jsonResponse(
      {
        ok: false,
        code: 'BOLTZ_DAEMON_UNAVAILABLE',
        error: 'Lightning isn’t ready on the payment server yet. Please try again later.',
      },
      200,
    );
  }

  // 7. Readiness confirmed. Persist a TRANSITIONAL state only — NEVER 'connected',
  //    and NO configured_at timestamp (that's a connection fact). The store only
  //    becomes 'connected' in connect-btcpay-lbtc-wallet after BTC-LN is confirmed.
  //    Don't downgrade an already-connected store (e.g. a 'Change connection'
  //    replace in progress) — leave it connected until the new import succeeds.
  if (store.lightning_status !== 'connected') {
    const { error: updateError } = await admin
      .from('merchant_stores')
      .update({
        lightning_status: 'pending_lbtc_wallet',
        lightning_provider: 'boltz',
        lightning_error: null,
      })
      .eq('id', store.id);
    if (updateError) {
      await logEvent({
        eventType: 'lightning_boltz_prepare_failed',
        status: 'error',
        message: `Boltz ready at BTCPay but DB update failed: ${updateError.message}`,
        btcpayStoreId: store.btcpay_store_id,
      });
      return jsonResponse(
        { ok: false, error: 'Lightning prepared but could not be saved. Please try again.' },
        500,
      );
    }

    try {
      await syncUserStoreSummary(admin, user.id);
    } catch (err) {
      console.error('[prepare-boltz] summary sync failed:', String(err));
    }
  }

  await logEvent({
    eventType: 'lightning_boltz_ready',
    status: 'ok',
    message: `Boltz Lightning ready (pending L-BTC wallet import) for store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  // status is a READINESS signal — never 'connected'. The client routes to the
  // Set L-BTC Wallet flow; connection is confirmed only by the descriptor import.
  return jsonResponse({
    ok: true,
    provider: 'boltz',
    status: 'pending_lbtc_wallet',
    nextStep: 'setup_lbtc_wallet',
  });
});
