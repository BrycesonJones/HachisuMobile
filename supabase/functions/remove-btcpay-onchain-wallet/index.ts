// Edge Function: remove-btcpay-onchain-wallet
//
// Removes a store's on-chain (BTC) wallet/payment method at BTCPay and resets
// the on-chain fields on THAT store only. Lightning fields and other stores are
// never touched. wallet_status is recomputed from the remaining Lightning state.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getOnChainWallet,
  removeOnChainWallet,
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

  async function logEvent(input: {
    eventType: string;
    status: string;
    message?: string;
    btcpayStoreId?: string | null;
  }) {
    const { error } = await admin.from('btcpay_store_provisioning_events').insert({
      user_id: user!.id,
      business_id: user!.id,
      event_type: input.eventType,
      status: input.status,
      message: input.message ?? null,
      btcpay_store_id: input.btcpayStoreId ?? null,
    });
    if (error) console.error('[remove-onchain] event log failed:', error.message);
  }

  // Fetch the store + its Lightning status (needed to recompute wallet_status).
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

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  // Remove at BTCPay (idempotent), then confirm it's gone before touching state.
  try {
    await removeOnChainWallet(config, store.btcpay_store_id);
    const after = await getOnChainWallet(config, store.btcpay_store_id);
    if (after.configured) {
      return jsonResponse(
        { ok: false, error: 'BTCPay still reports a wallet configured. Please try again.' },
        502,
      );
    }
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[remove-onchain] store=${store.id} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    await logEvent({
      eventType: 'onchain_wallet_remove_failed',
      status: 'error',
      message: isApiError ? `HTTP ${err.status}` : 'Unexpected error removing wallet.',
      btcpayStoreId: store.btcpay_store_id,
    });
    return jsonResponse(
      { ok: false, error: 'Could not remove the wallet. Please try again.' },
      502,
    );
  }

  // Reset on-chain fields on THIS store only. Lightning fields are untouched;
  // wallet_status reflects whatever Lightning destination remains.
  const walletStatus =
    store.lightning_status === 'connected' ? 'payment_destination_connected' : 'store_created';

  const { error: updateError } = await admin
    .from('merchant_stores')
    .update({
      onchain_status: 'not_connected',
      onchain_provider: null,
      onchain_address_type: null,
      onchain_wallet_configured_at: null,
      onchain_enabled: false,
      onchain_label: null,
      wallet_status: walletStatus,
    })
    .eq('id', store.id);
  if (updateError) {
    return jsonResponse(
      { ok: false, error: 'Wallet removed at BTCPay but could not update the store.' },
      500,
    );
  }

  try {
    await syncUserStoreSummary(admin, user.id);
  } catch (err) {
    console.error('[remove-onchain] summary sync failed:', String(err));
  }

  await logEvent({
    eventType: 'onchain_wallet_removed',
    status: 'ok',
    message: `On-chain wallet removed for store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  return jsonResponse({ ok: true, status: 'not_connected' });
});
