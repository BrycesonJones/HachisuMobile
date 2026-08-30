// Edge Function: update-btcpay-onchain-wallet-settings
//
// Updates a store's on-chain (BTC) payment-method enabled flag + label WITHOUT
// touching the configured wallet. The current derivation scheme is fetched and
// re-sent server-side, so the client never sends (and we never log) the xpub.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getOnChainWallet,
  updateOnChainWalletSettings,
} from '../_shared/btcpay-client.ts';
import {
  acquireOnchainLock,
  onchainLockBusyResponse,
  releaseOnchainLock,
} from '../_shared/onchain-lock.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';
import { logAuthorizationDenied } from '../_shared/security-log.ts';
import { readJsonObjectBody } from '../_shared/request-body.ts';

const MAX_LABEL_LENGTH = 100;

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

  const body:
    | {
        merchantStoreId?: unknown;
        enabled?: unknown;
        label?: unknown;
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
  if (typeof body.enabled !== 'boolean') {
    return jsonResponse({ ok: false, error: 'enabled (boolean) is required.' }, 400);
  }
  const enabled = body.enabled;
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, MAX_LABEL_LENGTH) : '';

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
    logAuthorizationDenied({
      action: 'update-btcpay-onchain-wallet-settings',
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

  // This endpoint does a GET-then-PUT of the payment method, echoing back the
  // derivation scheme it just read. Interleaved with a replacement it would
  // re-write the OLD scheme over the new one at BTCPay while the replacement
  // recorded the new wallet in the DB — payments to the old wallet, dashboard
  // showing the new one. The shared lock makes the read-modify-write exclusive.
  const lock = await acquireOnchainLock(admin, store.id, 'connecting');
  if (!lock.ok) {
    if (lock.reason === 'error') {
      return jsonResponse({ ok: false, error: 'Could not save wallet settings.' }, 500);
    }
    return onchainLockBusyResponse();
  }
  const lockToken = lock.token;

  try {
    const current = await getOnChainWallet(config, store.btcpay_store_id);
    if (!current.configured) {
      await releaseOnchainLock(admin, store.id, lockToken);
      return jsonResponse(
        { ok: false, error: 'No Bitcoin wallet is connected to this store yet.' },
        409,
      );
    }

    const updated = await updateOnChainWalletSettings(config, store.btcpay_store_id, current, {
      enabled,
      label: label || null,
    });
    if (typeof updated.enabled !== 'boolean') {
      await releaseOnchainLock(admin, store.id, lockToken);
      return jsonResponse({ ok: false, error: 'BTCPay did not confirm the update.' }, 502);
    }

    // Persist the cached settings on this store only. The wallet stays
    // configured (onchain_status='connected') whether enabled or disabled.
    // Commit + release in one write, conditional on still owning the lock.
    const { data: committed, error: updateError } = await admin
      .from('merchant_stores')
      .update({
        onchain_enabled: updated.enabled,
        onchain_label: label || null,
        onchain_operation: 'none',
        onchain_operation_started_at: null,
        onchain_operation_token: null,
      })
      .eq('id', store.id)
      .eq('onchain_operation_token', lockToken)
      .select('id');
    if (updateError) {
      await releaseOnchainLock(admin, store.id, lockToken);
      return jsonResponse(
        { ok: false, error: 'Settings updated at BTCPay but could not be saved.' },
        500,
      );
    }
    if (!committed || committed.length === 0) {
      console.error(`[update-onchain-settings] store=${store.id} superseded before commit`);
      return jsonResponse(
        {
          ok: false,
          code: 'WALLET_OPERATION_IN_PROGRESS',
          error: 'Another wallet operation superseded this change. Please re-check your wallet.',
        },
        409,
      );
    }

    try {
      await syncUserStoreSummary(admin, user.id);
    } catch (err) {
      console.error('[update-onchain-settings] summary sync failed:', String(err));
    }

    return jsonResponse({
      ok: true,
      status: updated.enabled ? 'connected' : 'disabled',
      enabled: updated.enabled,
      label,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[update-onchain-settings] store=${store.id} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    await releaseOnchainLock(admin, store.id, lockToken);
    return jsonResponse(
      { ok: false, error: 'Could not save wallet settings. Please try again.' },
      502,
    );
  }
});
