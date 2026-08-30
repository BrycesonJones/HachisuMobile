// Edge Function: connect-btcpay-lbtc-wallet
//
// Phase 3 of the per-store Lightning flow. Imports the merchant's READ-ONLY
// Liquid (L-BTC) wallet descriptor into the Boltz plugin for their store, selects
// it as the store's Lightning receive wallet, and — only once BTCPay/Boltz
// reports Lightning enabled — marks the Supabase store row connected.
//
// Sequence against the Boltz plugin (Greenfield):
//   1. POST /boltz/wallets { name, currency:"LBTC", coreDescriptor }  (watch-only)
//   2. POST /boltz/setup   { walletName: name }                       (enable LN)
//   3. verify boltz setup enabled + wallet present
//
// Connection is PER STORE. We NEVER ask for or accept a seed/mnemonic and never
// create a hot wallet — read-only descriptor only.
//
// SECURITY:
//   - The BTCPay Greenfield key lives ONLY in this function's environment.
//   - The full descriptor is NEVER logged (masked) and NEVER persisted to
//     Supabase — it is submitted to BTCPay/Boltz and then dropped. Only
//     non-sensitive status + metadata is stored.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { LIGHTNING_ENABLED, lightningDisabledResponse } from '../_shared/feature-gates.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getLightningPaymentMethodConfig,
  getStore,
  getStoreBoltzSetup,
  importBoltzLbtcWallet,
  listBoltzWallets,
  maskDescriptor,
  setupBoltzForStore,
} from '../_shared/btcpay-client.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';

// L-BTC / Liquid core descriptors are script expressions: elwpkh(...), elsh(...),
// elwsh(...), ct(...,elwpkh(...)), or plain wpkh(...). Require a balanced-looking
// call. Cap length generously (confidential/multisig descriptors are long).
const LOOKS_LIKE_DESCRIPTOR = /\(.+\)/s;
const MAX_DESCRIPTOR_LENGTH = 5000;
const MAX_WALLET_NAME_LENGTH = 50;
const DEFAULT_WALLET_NAME = 'lightning';

/** Sanitize a wallet name to a safe, bounded token; fall back to the default. */
function sanitizeWalletName(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  const cleaned = v.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, MAX_WALLET_NAME_LENGTH).trim();
  return cleaned || DEFAULT_WALLET_NAME;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  // Product gate, enforced server-side: Lightning wallet connection must not be
  // reachable while Lightning is switched off for users. The client flag hides
  // the screens; this closes the capability. See _shared/feature-gates.ts.
  if (!LIGHTNING_ENABLED) return lightningDisabledResponse();

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
  let body: { merchantStoreId?: unknown; coreDescriptor?: unknown; walletName?: unknown };
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

  const coreDescriptor =
    typeof body.coreDescriptor === 'string' ? body.coreDescriptor.trim() : '';
  if (
    !coreDescriptor ||
    coreDescriptor.length > MAX_DESCRIPTOR_LENGTH ||
    !LOOKS_LIKE_DESCRIPTOR.test(coreDescriptor)
  ) {
    return jsonResponse(
      { ok: false, error: 'A valid read-only L-BTC core descriptor is required.' },
      400,
    );
  }

  const walletName = sanitizeWalletName(body.walletName);

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
    if (error) console.error('[connect-lbtc] event log failed:', error.message);
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

  // 4. Validate BTCPay config.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  const maskedDescriptor = maskDescriptor(coreDescriptor);

  // Captures BTCPay's real HTTP status + response body for diagnostics, with the
  // descriptor and wallet name masked so nothing sensitive is ever stored/logged.
  function safeBtcpayBody(err: unknown): { status: number; body?: string } | null {
    if (!(err instanceof BtcpayApiError)) return null;
    let s = '';
    try {
      s = typeof err.body === 'string' ? err.body : JSON.stringify(err.body ?? '');
    } catch {
      s = '';
    }
    if (s) {
      s = s.split(coreDescriptor).join(maskedDescriptor);
      if (walletName) s = s.split(walletName).join('<wallet>');
      s = s.slice(0, 800);
    }
    return { status: err.status, body: s || undefined };
  }

  // Extracts the Boltz plugin's structured error code (e.g. "boltz-unavailable"),
  // if the BTCPay error body carries one, so we can report an accurate reason.
  function boltzErrorCode(err: unknown): string | null {
    if (!(err instanceof BtcpayApiError)) return null;
    const b = err.body;
    if (b && typeof b === 'object' && typeof (b as { code?: unknown }).code === 'string') {
      return (b as { code: string }).code;
    }
    if (typeof b === 'string') {
      try {
        const p = JSON.parse(b);
        if (p && typeof p.code === 'string') return p.code;
      } catch {
        // Not JSON — no code.
      }
    }
    return null;
  }

  const DAEMON_UNAVAILABLE_MESSAGE =
    'Lightning isn’t ready on the payment server yet — the Boltz service still needs ' +
    'to be set up. Please try again later or contact support.';

  await logEvent({
    eventType: 'lightning_lbtc_connect_started',
    status: 'started',
    message: `Importing read-only L-BTC wallet "${walletName}" (${maskedDescriptor}) for store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  // Helper to record a failure on the store row + audit log + respond.
  async function fail(
    logMessage: string,
    userMessage: string,
    httpStatus: number,
    rawError?: unknown,
    code?: string,
  ) {
    console.error(`[connect-lbtc] store=${store!.id} desc=${maskedDescriptor}: ${logMessage}`);
    await logEvent({
      eventType: 'lightning_lbtc_connect_failed',
      status: 'error',
      message: userMessage,
      btcpayStoreId: store!.btcpay_store_id,
      rawError,
    });
    // A "Change connection" (replace) starts from an already-connected store. A
    // failed replace must leave the existing connection intact (spec: the old
    // connection remains). Only flip to 'error' when the store wasn't already
    // connected — i.e. a first-time connect attempt.
    if (store!.lightning_status !== 'connected') {
      await admin
        .from('merchant_stores')
        .update({ lightning_status: 'error', lightning_error: userMessage })
        .eq('id', store!.id);
    }
    return jsonResponse(
      { ok: false, ...(code ? { code } : {}), error: userMessage },
      httpStatus,
    );
  }

  // 5. Confirm the BTCPay store exists.
  try {
    const btcpayStore = await getStore(config, store.btcpay_store_id);
    if (!btcpayStore) {
      return await fail(
        'backing BTCPay store missing',
        'This store could not be found on the payment server.',
        404,
      );
    }
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    return await fail(
      isApiError ? err.message : String(err),
      'Could not reach the payment server. Please try again.',
      502,
      safeBtcpayBody(err),
    );
  }

  // 6. Confirm Boltz is available/ready for this store.
  let boltz;
  try {
    boltz = await getStoreBoltzSetup(config, store.btcpay_store_id);
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    return await fail(
      isApiError ? err.message : String(err),
      'Could not reach the payment server. Please try again.',
      502,
      safeBtcpayBody(err),
    );
  }
  if (!boltz.available) {
    const code =
      boltz.reason === 'not_installed' ? 'BOLTZ_PLUGIN_NOT_AVAILABLE' : 'BOLTZ_API_UNSUPPORTED';
    await logEvent({
      eventType: 'lightning_lbtc_connect_failed',
      status: 'error',
      message: `Boltz not available (${boltz.reason}).`,
      btcpayStoreId: store.btcpay_store_id,
    });
    return jsonResponse(
      {
        ok: false,
        code,
        error:
          code === 'BOLTZ_PLUGIN_NOT_AVAILABLE'
            ? 'Boltz is not installed or is not available on this BTCPay Server instance.'
            : 'Boltz is installed, but no supported API endpoint was found for automated configuration.',
      },
      200,
    );
  }

  // 7. Import the read-only wallet (idempotent: reuse an existing wallet with the
  //    same name, e.g. on a retry, instead of failing on a duplicate).
  try {
    const existing = await listBoltzWallets(config, store.btcpay_store_id);
    const alreadyImported = existing.some((w) => w.name === walletName);
    if (!alreadyImported) {
      await importBoltzLbtcWallet(config, store.btcpay_store_id, {
        name: walletName,
        coreDescriptor,
      });
    }
  } catch (err) {
    if (boltzErrorCode(err) === 'boltz-unavailable') {
      return await fail(
        'import failed: boltz daemon unavailable',
        DAEMON_UNAVAILABLE_MESSAGE,
        503,
        safeBtcpayBody(err),
        'BOLTZ_DAEMON_UNAVAILABLE',
      );
    }
    const isApiError = err instanceof BtcpayApiError;
    return await fail(
      isApiError ? `import failed (HTTP ${err.status})` : String(err),
      'BTCPay rejected that L-BTC descriptor. Please check it and try again.',
      502,
      safeBtcpayBody(err),
    );
  }

  // 8. Select the wallet as the store's Lightning receive wallet (wires BTC-LN).
  let setup;
  try {
    setup = await setupBoltzForStore(config, store.btcpay_store_id, walletName);
  } catch (err) {
    if (boltzErrorCode(err) === 'boltz-unavailable') {
      return await fail(
        'setup failed: boltz daemon unavailable',
        DAEMON_UNAVAILABLE_MESSAGE,
        503,
        safeBtcpayBody(err),
        'BOLTZ_DAEMON_UNAVAILABLE',
      );
    }
    const isApiError = err instanceof BtcpayApiError;
    return await fail(
      isApiError ? `setup failed (HTTP ${err.status})` : String(err),
      'Could not enable Lightning with that wallet. Please try again.',
      502,
      safeBtcpayBody(err),
    );
  }

  // 9. Verify Boltz reports Lightning enabled with a wallet attached. Re-read the
  //    setup if the POST response was inconclusive.
  let enabled = setup.enabled === true && !!setup.wallet;
  if (!enabled) {
    try {
      const confirm = await getStoreBoltzSetup(config, store.btcpay_store_id);
      enabled = confirm.available && confirm.setup.enabled === true && !!confirm.setup.wallet;
    } catch {
      // Fall through to the not-enabled failure below.
    }
  }
  if (!enabled) {
    return await fail(
      'boltz setup did not report enabled',
      'BTCPay did not confirm Lightning as connected. Please try again.',
      502,
    );
  }

  // 9b. AUTHORITATIVE check: Boltz's own setup report (step 9) can read "enabled"
  //     from a leftover standalone wallet or the readiness sentinel — it does NOT
  //     prove the store can receive Lightning. The store is only truly connected
  //     once BTCPay reports the BTC-LN payment method exists WITH a real Boltz
  //     connection (connectionString) and is enabled. This is the single fact that
  //     lets us write lightning_status='connected'. The config holds the Boltz
  //     macaroon and is SERVER-ONLY — we read presence/enabled and never return it.
  let paymentMethod;
  try {
    paymentMethod = await getLightningPaymentMethodConfig(config, store.btcpay_store_id);
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    return await fail(
      isApiError ? `BTC-LN verify failed (HTTP ${err.status})` : String(err),
      'BTCPay did not confirm Lightning as connected. Please try again.',
      502,
      safeBtcpayBody(err),
    );
  }
  if (!paymentMethod.configured || !paymentMethod.enabled) {
    return await fail(
      `BTC-LN not configured after setup (configured=${paymentMethod.configured}, enabled=${paymentMethod.enabled})`,
      'BTCPay did not confirm the Lightning (BTC-LN) payment method as connected. Please try again.',
      502,
    );
  }

  // 10. BTCPay confirmed -> persist connected state on THIS store only. No
  //     descriptor or key material is stored.
  const { error: updateError } = await admin
    .from('merchant_stores')
    .update({
      lightning_status: 'connected',
      lightning_provider: 'boltz',
      lightning_configured_at: new Date().toISOString(),
      lightning_error: null,
      // A freshly connected wallet is active by default. Must be set explicitly
      // so a prior remove (which sets enabled=false) doesn't leave it disabled.
      lightning_enabled: true,
    })
    .eq('id', store.id);
  if (updateError) {
    await logEvent({
      eventType: 'lightning_lbtc_connect_failed',
      status: 'error',
      message: `Lightning connected at BTCPay but DB update failed: ${updateError.message}`,
      btcpayStoreId: store.btcpay_store_id,
    });
    return jsonResponse(
      { ok: false, error: 'Lightning connected but could not be saved. Please contact support.' },
      500,
    );
  }

  // 11. Recompute the user_profiles default-store summary.
  try {
    await syncUserStoreSummary(admin, user.id);
  } catch (err) {
    console.error('[connect-lbtc] summary sync failed:', String(err));
  }

  await logEvent({
    eventType: 'lightning_lbtc_connected',
    status: 'ok',
    message: `Lightning connected via Boltz (wallet "${walletName}") for store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  return jsonResponse({ ok: true, provider: 'boltz', status: 'connected' });
});
