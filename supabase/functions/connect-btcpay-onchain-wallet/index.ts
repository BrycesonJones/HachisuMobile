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

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  classifyDerivation,
  getBtcpayConfig,
  getOnChainWallet,
  maskExtendedKey,
  setOnChainWallet,
} from '../_shared/btcpay-client.ts';
import {
  acquireOnchainLock,
  onchainLockBusyResponse,
  releaseOnchainLock,
} from '../_shared/onchain-lock.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';
import { logAuthorizationDenied } from '../_shared/security-log.ts';
import { readJsonObjectBody } from '../_shared/request-body.ts';

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
  const body:
    | {
        merchantStoreId?: unknown;
        extendedPublicKey?: unknown;
        confirmedAddresses?: unknown;
      }
    | null = await readJsonObjectBody(req);
  if (!body) {
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
    logAuthorizationDenied({
      action: 'connect-btcpay-onchain-wallet',
      userId: user.id,
      resourceType: 'merchant_store',
      resourceId: merchantStoreId,
      reason: store ? 'not_owner' : 'not_found',
    });
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

  // 4a. Mutual exclusion with replace / remove / sync for this store. The
  //     BTCPay existence check below is a read; without the lock another
  //     operation could change the payment method between that read and our
  //     write, and the "no wallet exists" conclusion would be stale. Taken
  //     BEFORE the check so the whole check-then-write sequence is exclusive.
  const lock = await acquireOnchainLock(admin, store.id, 'connecting');
  if (!lock.ok) {
    if (lock.reason === 'error') {
      return jsonResponse({ ok: false, error: 'Could not start the connection.' }, 500);
    }
    return onchainLockBusyResponse();
  }
  const lockToken = lock.token;

  // 4b. REPLACEMENT-GUARD: connect may ONLY configure a store that has no
  //     on-chain wallet yet. If a wallet already exists, connect would overwrite
  //     it while bypassing every replacement safeguard (preview proof, same-
  //     wallet detection, idempotency, concurrency lock, reconciliation), so we
  //     refuse and direct the merchant to the staged replacement flow.
  //
  //     Existence is decided by the AUTHORITATIVE BTCPay payment-method state,
  //     not the client-supplied/cached onchain_status. A BTCPay lookup FAILURE is
  //     a hard error — it must never be read as "no wallet exists" (which would
  //     re-open the overwrite path). A disabled-but-configured wallet counts as
  //     configured. We do not touch the existing wallet when rejecting.
  try {
    const existing = await getOnChainWallet(config, store.btcpay_store_id);
    if (existing.configured) {
      await logEvent({
        eventType: 'onchain_wallet_connect_rejected',
        status: 'rejected',
        message: 'Connect rejected: store already has a configured on-chain wallet. Use replace.',
        btcpayStoreId: store.btcpay_store_id,
      });
      await releaseOnchainLock(admin, store.id, lockToken);
      return jsonResponse(
        {
          ok: false,
          code: 'WALLET_ALREADY_CONNECTED',
          error:
            'This store already has a Bitcoin wallet connected. Use Replace wallet to change it.',
        },
        409,
      );
    }
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[connect-onchain] store=${store.id} existence check failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    // Do NOT proceed on an inconclusive lookup — refusing is the safe default.
    await releaseOnchainLock(admin, store.id, lockToken);
    return jsonResponse(
      { ok: false, error: 'Could not verify the store wallet state. Please try again.' },
      502,
    );
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
    // Reflect the failure on the store row (only if we still hold the lock).
    await admin
      .from('merchant_stores')
      .update({ onchain_status: 'error' })
      .eq('id', store.id)
      .eq('onchain_operation_token', lockToken);
    await releaseOnchainLock(admin, store.id, lockToken);
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
    await releaseOnchainLock(admin, store.id, lockToken);
    return jsonResponse(
      { ok: false, error: 'BTCPay did not confirm the wallet as connected.' },
      502,
    );
  }

  // 6. BTCPay confirmed -> persist connected state on THIS store only. We store
  //    no key material, only non-sensitive metadata.
  // Commit + release in one write, conditional on STILL owning the lock.
  const { data: committed, error: updateError } = await admin
    .from('merchant_stores')
    .update({
      onchain_status: 'connected',
      onchain_provider: provider,
      onchain_address_type: addressType,
      onchain_wallet_configured_at: new Date().toISOString(),
      // A freshly connected wallet is active by default. Must be set explicitly
      // so a prior remove (which sets enabled=false) doesn't leave it disabled.
      onchain_enabled: true,
      wallet_status: 'payment_destination_connected',
      onchain_operation: 'none',
      onchain_operation_started_at: null,
      onchain_operation_token: null,
    })
    .eq('id', store.id)
    .eq('onchain_operation_token', lockToken)
    .select('id');
  if (!updateError && (!committed || committed.length === 0)) {
    console.error(`[connect-onchain] store=${store.id} superseded before commit`);
    return jsonResponse(
      {
        ok: false,
        code: 'WALLET_OPERATION_IN_PROGRESS',
        error: 'Another wallet operation superseded this one. Please re-check your wallet.',
      },
      409,
    );
  }
  if (updateError) {
    await releaseOnchainLock(admin, store.id, lockToken);
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
