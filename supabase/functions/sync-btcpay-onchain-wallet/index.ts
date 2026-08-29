// Edge Function: sync-btcpay-onchain-wallet
//
// Retry-state-sync recovery action. When a replacement reached a reconcile-
// required state (BTCPay changed but the app couldn't verify/save cleanly), the
// client offers "re-check wallet status" instead of another Replace. This reads
// the AUTHORITATIVE BTCPay payment-method state and writes merchant_stores to
// match, and clears any stuck operation lock. It never itself changes the wallet.
//
// SECURITY: BTCPay key is function-local; store id resolved server-side; the xpub
// is never persisted (only a sha256 fingerprint) and never returned/logged.
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
} from '../_shared/btcpay-client.ts';
import { fingerprintDerivationScheme } from '../_shared/onchain-fingerprint.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';

function fail(code: string, message: string, status: number) {
  return jsonResponse({ ok: false, code, error: message }, status);
}

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
    return fail('UNAUTHORIZED', 'Missing or invalid Authorization header.', 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return fail('UNAUTHORIZED', 'Not authenticated.', 401);
  }

  let body: { merchantStoreId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) return fail('STORE_NOT_FOUND', 'merchantStoreId is required.', 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

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
  if (!store) return fail('STORE_NOT_FOUND', 'Store not found.', 404);
  if (store.user_id !== user.id) {
    return fail('STORE_ACCESS_DENIED', 'You do not have access to this store.', 403);
  }

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    const state = await getOnChainWallet(config, store.btcpay_store_id);

    if (state.configured) {
      const { provider, addressType } = state.derivationScheme
        ? classifyDerivation(state.derivationScheme)
        : { provider: null as string | null, addressType: null as string | null };
      const fingerprint = state.derivationScheme
        ? await fingerprintDerivationScheme(state.derivationScheme)
        : null;
      const { error: updateError } = await admin
        .from('merchant_stores')
        .update({
          onchain_status: 'connected',
          onchain_provider: provider,
          onchain_address_type: addressType,
          onchain_enabled: state.enabled,
          onchain_label: state.label,
          onchain_scheme_fingerprint: fingerprint,
          wallet_status: 'payment_destination_connected',
          onchain_operation: 'none',
          onchain_operation_started_at: null,
          onchain_operation_token: null,
        })
        .eq('id', store.id);
      if (updateError) {
        return jsonResponse({ ok: false, error: 'Could not save the wallet status.' }, 500);
      }
    } else {
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
          onchain_scheme_fingerprint: null,
          wallet_status: walletStatus,
          onchain_operation: 'none',
          onchain_operation_started_at: null,
          onchain_operation_token: null,
        })
        .eq('id', store.id);
      if (updateError) {
        return jsonResponse({ ok: false, error: 'Could not save the wallet status.' }, 500);
      }
    }

    try {
      await syncUserStoreSummary(admin, user.id);
    } catch (err) {
      console.error('[sync-onchain] summary sync failed:', String(err));
    }

    const status = !state.configured ? 'not_connected' : state.enabled ? 'connected' : 'disabled';
    return jsonResponse({ ok: true, status, enabled: state.enabled, label: state.label });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[sync-onchain] store=${store.id} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse({ ok: false, error: 'Could not re-check the wallet status.' }, 502);
  }
});
