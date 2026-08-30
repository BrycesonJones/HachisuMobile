// Edge Function: preview-btcpay-onchain-wallet
//
// Step 1 of the per-store on-chain wallet connection flow. The merchant submits
// an extended public key / output descriptor for a SPECIFIC store; we verify
// they own that store, then ask BTCPay (NBXplorer) to derive the first receive
// addresses so the merchant can confirm their wallet produces the same ones.
//
// This is a read-only preview: nothing is saved to BTCPay or Supabase here.
//
// SECURITY:
//   - The BTCPay Greenfield key lives ONLY in this function's environment.
//   - The mobile app never calls BTCPay directly.
//   - The full extended public key is NEVER logged (masked via maskExtendedKey).
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
  previewOnChainWallet,
} from '../_shared/btcpay-client.ts';
import { logAuthorizationDenied } from '../_shared/security-log.ts';
import { readJsonObjectBody } from '../_shared/request-body.ts';

// Minimal sanity check so we don't bother BTCPay with obvious junk; BTCPay is
// the real validator and accepts far more than plain xpub. Matches an output
// descriptor "(" anywhere, OR any extended-key token — single-sig & multisig,
// mainnet & testnet (x/y/z/t/u/v-pub, incl. capital Ypub/Zpub/Upub/Vpub),
// including suffixed (xpub-[p2sh]), multisig (N-of-...) and key-origin forms.
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
  if (!extendedPublicKey) {
    return jsonResponse({ ok: false, error: 'An extended public key is required.' }, 400);
  }
  if (extendedPublicKey.length > MAX_KEY_LENGTH || !LOOKS_LIKE_KEY.test(extendedPublicKey)) {
    return jsonResponse(
      { ok: false, error: 'That does not look like a valid extended public key or descriptor.' },
      400,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 3. Verify the user owns this store + fetch its BTCPay store id.
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
      action: 'preview-btcpay-onchain-wallet',
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

  // 4b. REPLACEMENT-GUARD: this is the CONNECT preview. A store that already has
  //     a configured wallet must not be able to mint a connect-mode preview (which
  //     could otherwise feed the connect endpoint and bypass replacement rules).
  //     Existence is decided by the AUTHORITATIVE BTCPay state; a lookup failure
  //     is a hard error, never "no wallet". Disabled-but-configured counts as
  //     configured. The existing wallet is not touched.
  try {
    const existing = await getOnChainWallet(config, store.btcpay_store_id);
    if (existing.configured) {
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
      `[preview-onchain] store=${store.id} existence check failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse(
      { ok: false, error: 'Could not verify the store wallet state. Please try again.' },
      502,
    );
  }

  // 5. Ask BTCPay to preview the derived addresses (0/0 … 0/9).
  const { addressType } = classifyDerivation(extendedPublicKey);
  try {
    const addresses = await previewOnChainWallet(config, store.btcpay_store_id, extendedPublicKey, {
      offset: 0,
      count: 10,
    });
    return jsonResponse({ ok: true, addressType, addresses });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    // Log BTCPay's status + body for support; mask the key, never log it in full.
    let bodyText = '';
    if (isApiError) {
      try {
        bodyText = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
      } catch {
        bodyText = '';
      }
      bodyText = (bodyText || '')
        .replaceAll(extendedPublicKey, maskExtendedKey(extendedPublicKey))
        .slice(0, 400);
    }
    console.error(
      `[preview-onchain] store=${store.id} key=${maskExtendedKey(extendedPublicKey)} ` +
        `failed: ${isApiError ? `HTTP ${err.status} ${bodyText}` : String(err)}`,
    );
    const message = isApiError
      ? `BTCPay could not read that key (HTTP ${err.status}). Check the format and try again.`
      : 'Could not preview the wallet. Please try again.';
    return jsonResponse({ ok: false, error: message }, 502);
  }
});
