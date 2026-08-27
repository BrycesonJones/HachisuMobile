// Edge Function: get-btcpay-onchain-send-fees
//
// Returns real fee-rate estimates for the send flow's three network-speed
// options (Fast ~10 min / Standard ~1 hour / Economy ~6-24 hours), mapped to
// confirmation block targets and priced by BTCPay's own fee source
// (GET .../wallet/feerate?blockTarget=N). Nothing is hardcoded — if BTCPay
// cannot estimate, the client shows "fee estimate unavailable" rather than a
// made-up number.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getOnChainFeeRate,
} from '../_shared/btcpay-client.ts';
import { SEND_SPEEDS, type SendSpeed } from '../_shared/onchain-send.ts';

type SendFeesErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'STORE_ACCESS_DENIED'
  | 'WALLET_NOT_CONNECTED'
  | 'WALLET_DISABLED'
  | 'FEE_ESTIMATE_UNAVAILABLE'
  | 'SERVER_NOT_CONFIGURED';

function errorResponse(code: SendFeesErrorCode, error: string, status: number): Response {
  return jsonResponse({ ok: false, code, error }, status);
}

interface StoreRow {
  id: string;
  user_id: string;
  btcpay_store_id: string | null;
  onchain_status: string | null;
  onchain_enabled: boolean | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('BAD_REQUEST', 'Method not allowed', 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return errorResponse('SERVER_NOT_CONFIGURED', 'Server is not configured.', 500);
  }

  // 1. Authenticate the Supabase user (JWT in the Authorization header).
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid Authorization header.', 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return errorResponse('UNAUTHORIZED', 'Not authenticated.', 401);
  }

  // 2. Accept ONLY the internal merchant store id (never a BTCPay store id).
  let body: { merchantStoreId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body.', 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return errorResponse('BAD_REQUEST', 'merchantStoreId is required.', 400);
  }

  // 3. Load the store with the service role, confirm ownership + wallet state.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, onchain_status, onchain_enabled')
    .eq('id', merchantStoreId)
    .maybeSingle<StoreRow>();

  if (storeError) {
    console.error(`[send-fees] store lookup failed: ${storeError.message}`);
    return errorResponse('STORE_ACCESS_DENIED', 'Could not load the store.', 500);
  }
  // Report a non-owned or missing store identically so existence isn't leaked.
  if (!store || store.user_id !== user.id) {
    return errorResponse('STORE_ACCESS_DENIED', 'Store not found.', 404);
  }
  if (!store.btcpay_store_id || store.onchain_status !== 'connected') {
    return errorResponse(
      'WALLET_NOT_CONNECTED',
      'No Bitcoin wallet is connected for this store.',
      409,
    );
  }
  if (store.onchain_enabled === false) {
    return errorResponse('WALLET_DISABLED', 'The Bitcoin wallet is disabled for this store.', 409);
  }

  // 4. Read all three fee rates from BTCPay in parallel. All-or-nothing: a
  // partially priced list would let the user pick a speed we can't honor.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_NOT_CONFIGURED', message, 500);
  }

  const speeds = Object.keys(SEND_SPEEDS) as SendSpeed[];
  let rates: number[];
  try {
    rates = await Promise.all(
      speeds.map((speed) =>
        getOnChainFeeRate(config, store.btcpay_store_id!, SEND_SPEEDS[speed].blockTarget),
      ),
    );
  } catch (err) {
    const detail = err instanceof BtcpayApiError ? `HTTP ${err.status}` : String(err);
    console.error(
      `[send-fees] store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `fee estimate failed: ${detail}`,
    );
    return errorResponse(
      'FEE_ESTIMATE_UNAVAILABLE',
      'Network fee estimates are unavailable right now. Please try again.',
      502,
    );
  }

  console.log(
    `[send-fees] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
      speeds.map((s, i) => `${s}=${rates[i]}`).join(' '),
  );

  return jsonResponse({
    ok: true,
    code: 'OK',
    merchantStoreId: store.id,
    options: speeds.map((speed, i) => ({
      speed,
      blockTarget: SEND_SPEEDS[speed].blockTarget,
      feeRateSatPerVb: rates[i],
    })),
  });
});
