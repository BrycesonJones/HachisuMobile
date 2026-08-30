// Edge Function: get-btcpay-onchain-wallet-balance
//
// Returns the ACTIVE merchant store's on-chain (BTC) wallet balance for the
// dashboard. The mobile client sends only an internal `merchantStoreId`; this
// function verifies ownership, resolves the real `btcpay_store_id` server-side,
// reads the balance from BTCPay, and (best-effort) the store's BTC->fiat rate.
//
// The client never talks to BTCPay and never receives the Greenfield API key,
// a derivation scheme, or any sensitive wallet configuration.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  getBtcpayConfig,
  getOnChainWalletBalance,
  getStoreRate,
  satsToBtcDecimalString,
} from '../_shared/btcpay-client.ts';
import { logAuthorizationDenied } from '../_shared/security-log.ts';

/** Normalized backend error codes the client can branch on. */
type BalanceErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_ACCESS_DENIED'
  | 'WALLET_NOT_CONNECTED'
  | 'WALLET_DISABLED'
  | 'BTCPAY_BALANCE_FETCH_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'SERVER_NOT_CONFIGURED';

function errorResponse(code: BalanceErrorCode, error: string, status: number): Response {
  return jsonResponse({ ok: false, code, error }, status);
}

interface StoreRow {
  id: string;
  user_id: string;
  btcpay_store_id: string | null;
  name: string;
  default_currency: string | null;
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

  // 3-5. Load the store with the service role, confirm ownership, and read the
  // authoritative btcpay_store_id + wallet state server-side.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name, default_currency, onchain_status, onchain_enabled')
    .eq('id', merchantStoreId)
    .maybeSingle<StoreRow>();

  if (storeError) {
    console.error(`[onchain-balance] store lookup failed: ${storeError.message}`);
    return errorResponse('STORE_NOT_FOUND', 'Could not load the store.', 500);
  }
  // Report a non-owned or missing store identically so existence isn't leaked.
  if (!store || store.user_id !== user.id) {
    logAuthorizationDenied({
      action: 'get-btcpay-onchain-wallet-balance',
      userId: user.id,
      resourceType: 'merchant_store',
      resourceId: merchantStoreId,
      reason: store ? 'not_owner' : 'not_found',
    });
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

  // 6. Call BTCPay for the on-chain wallet balance.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return errorResponse('SERVER_NOT_CONFIGURED', message, 500);
  }

  const currency = (store.default_currency || 'USD').toUpperCase();

  let balance;
  try {
    balance = await getOnChainWalletBalance(config, store.btcpay_store_id);
  } catch (err) {
    if (err instanceof BtcpayApiError) {
      // A 404 means BTCPay has no on-chain wallet for the store (drift vs our
      // cached onchain_status) — surface it as not-connected, not a hard error.
      if (err.status === 404) {
        console.error(
          `[onchain-balance] store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
            `wallet 404 (BTCPay has no on-chain wallet)`,
        );
        return errorResponse(
          'WALLET_NOT_CONNECTED',
          'No Bitcoin wallet is connected for this store.',
          409,
        );
      }
      console.error(
        `[onchain-balance] store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
          `balance fetch failed: HTTP ${err.status}`,
      );
      const code: BalanceErrorCode =
        err.status === 200 ? 'INVALID_BTCPAY_RESPONSE' : 'BTCPAY_BALANCE_FETCH_FAILED';
      return errorResponse(code, 'Could not load the wallet balance. Please try again.', 502);
    }
    console.error(`[onchain-balance] store=${store.id} balance fetch error: ${String(err)}`);
    return errorResponse(
      'BTCPAY_BALANCE_FETCH_FAILED',
      'Could not load the wallet balance. Please try again.',
      502,
    );
  }

  // 7. Best-effort fiat rate. A rate failure must NOT fail the balance — the real
  // BTC balance is still returned with rate=null so the client shows fiat as "—".
  let rate: string | null = null;
  let rateError: 'RATE_FETCH_FAILED' | null = null;
  if (currency === 'BTC') {
    // Store is denominated in BTC; there is no fiat conversion to make.
    rate = null;
  } else {
    try {
      const pair = `BTC_${currency}`;
      const result = await getStoreRate(config, store.btcpay_store_id, pair);
      rate = result.rate;
    } catch (err) {
      rateError = 'RATE_FETCH_FAILED';
      const detail = err instanceof BtcpayApiError ? `HTTP ${err.status}` : String(err);
      console.error(
        `[onchain-balance] store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
          `rate fetch failed for BTC_${currency}: ${detail}`,
      );
    }
  }

  const confirmedSats = Number(balance.confirmedSats);
  const unconfirmedSats = Number(balance.unconfirmedSats);
  const totalSats = Number(balance.totalSats);

  console.log(
    `[onchain-balance] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
      `confirmedSats=${confirmedSats} unconfirmedSats=${unconfirmedSats} ` +
      `currency=${currency} rate=${rate ?? 'none'}`,
  );

  // 8. Normalized, stable response. Sats are exact integers; BTC strings are
  // derived from the same integer sats so they never disagree.
  return jsonResponse({
    ok: true,
    success: true,
    code: 'OK',
    merchantStoreId: store.id,
    btcpayStoreId: store.btcpay_store_id,
    asset: 'BTC',
    confirmedSats,
    unconfirmedSats,
    totalSats,
    confirmedBtc: satsToBtcDecimalString(balance.confirmedSats),
    unconfirmedBtc: satsToBtcDecimalString(balance.unconfirmedSats),
    totalBtc: satsToBtcDecimalString(balance.totalSats),
    currency,
    rate,
    rateError,
  });
});
