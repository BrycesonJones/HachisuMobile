// Edge Function: connect-btcpay-onchain-wallet
//
// Step 2 (finalize) of the per-store on-chain wallet connection flow. After the
// merchant confirms the previewed addresses, we save the derivation scheme to
// their BTCPay store and, only once BTCPay reports the wallet enabled, mark the
// Supabase merchant_stores row connected.
//
// Connection is PER STORE: a brand-new store always starts not_connected and
// must connect its own wallet, even if it reuses the same xpub as another store.
//
// SECURITY:
//   - The BTCPay Greenfield key lives ONLY in this function's environment.
//   - We never store private keys or seed phrases. We do NOT persist the xpub
//     itself in Supabase — only non-sensitive metadata (address type, timestamp).
//   - The full extended public key is NEVER logged (masked) and never written to
//     an audit event.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  classifyDerivation,
  getBtcpayConfig,
  maskExtendedKey,
  setOnChainWallet,
} from '../_shared/btcpay-client.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';

// Accepts an output descriptor "(" anywhere, OR any extended-key token (single-
// sig & multisig, mainnet & testnet, incl. suffixed / N-of- / key-origin forms).
const LOOKS_LIKE_KEY = /(\(|[xyztuv]pub[1-9A-HJ-NP-Za-km-z]{20,})/i;
const MAX_KEY_LENGTH = 2000;

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
  let body: {
    merchantStoreId?: unknown;
    extendedPublicKey?: unknown;
    confirmedAddresses?: unknown;
  };
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

  const extendedPublicKey =
    typeof body.extendedPublicKey === 'string' ? body.extendedPublicKey.trim() : '';
  if (
    !extendedPublicKey ||
    extendedPublicKey.length > MAX_KEY_LENGTH ||
    !LOOKS_LIKE_KEY.test(extendedPublicKey)
  ) {
    return jsonResponse({ ok: false, error: 'A valid extended public key is required.' }, 400);
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
    if (error) console.error('[connect-onchain] event log failed:', error.message);
  }

  // 3. Verify ownership + fetch the BTCPay store id.
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

  // 4. Validate BTCPay config.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  const { provider, addressType } = classifyDerivation(extendedPublicKey);

  await logEvent({
    eventType: 'onchain_wallet_connect_started',
    status: 'started',
    message: `Connecting on-chain wallet (${provider}, ${addressType}) to store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  // 5. Save the derivation scheme to BTCPay. Only proceed if BTCPay reports the
  //    wallet enabled.
  let configured;
  try {
    configured = await setOnChainWallet(config, store.btcpay_store_id, extendedPublicKey);
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[connect-onchain] store=${store.id} key=${maskExtendedKey(extendedPublicKey)} ` +
        `failed: ${isApiError ? err.message : String(err)}`,
    );
    await logEvent({
      eventType: 'onchain_wallet_connect_failed',
      status: 'error',
      message: isApiError ? err.message : 'Unexpected error configuring wallet.',
      btcpayStoreId: store.btcpay_store_id,
      rawError: isApiError ? { status: err.status } : null,
    });
    // Reflect the failure on the store row.
    await admin
      .from('merchant_stores')
      .update({ onchain_status: 'error' })
      .eq('id', store.id);
    const message = isApiError
      ? 'BTCPay rejected that wallet configuration. Please check the key and try again.'
      : 'Could not connect the wallet. Please try again.';
    return jsonResponse({ ok: false, error: message }, 502);
  }

  if (configured.enabled !== true) {
    await logEvent({
      eventType: 'onchain_wallet_connect_failed',
      status: 'error',
      message: 'BTCPay did not report the on-chain wallet as enabled.',
      btcpayStoreId: store.btcpay_store_id,
    });
    return jsonResponse(
      { ok: false, error: 'BTCPay did not confirm the wallet as connected.' },
      502,
    );
  }

  // 6. BTCPay confirmed -> persist connected state on THIS store only. We store
  //    no key material, only non-sensitive metadata.
  const { error: updateError } = await admin
    .from('merchant_stores')
    .update({
      onchain_status: 'connected',
      onchain_provider: provider,
      onchain_address_type: addressType,
      onchain_wallet_configured_at: new Date().toISOString(),
      wallet_status: 'payment_destination_connected',
    })
    .eq('id', store.id);
  if (updateError) {
    await logEvent({
      eventType: 'onchain_wallet_connect_failed',
      status: 'error',
      message: `Wallet configured at BTCPay but DB update failed: ${updateError.message}`,
      btcpayStoreId: store.btcpay_store_id,
    });
    return jsonResponse(
      { ok: false, error: 'Wallet connected but could not be saved. Please contact support.' },
      500,
    );
  }

  // 7. Recompute the user_profiles default-store summary.
  try {
    await syncUserStoreSummary(admin, user.id);
  } catch (err) {
    console.error('[connect-onchain] summary sync failed:', String(err));
  }

  await logEvent({
    eventType: 'onchain_wallet_connected',
    status: 'ok',
    message: `On-chain wallet connected (${provider}, ${addressType}) for store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  return jsonResponse({ ok: true, status: 'connected' });
});
