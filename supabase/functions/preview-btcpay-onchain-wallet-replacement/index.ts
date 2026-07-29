// Edge Function: preview-btcpay-onchain-wallet-replacement
//
// Step 1 of the STAGED on-chain wallet REPLACEMENT flow. Read-only with respect
// to the wallet: it derives the receive addresses BTCPay would use for the
// proposed replacement key so the merchant can confirm them, and it issues a
// short-lived, single-use, server-verifiable preview-verification record bound to
// (user, store, scheme fingerprint, mode='replace'). The replace endpoint later
// REQUIRES a valid record, so a replacement can never be committed without a
// fresh, matching, same-store, same-user preview.
//
// The currently connected wallet is left fully intact here — no BTCPay write, no
// merchant_stores mutation. The merchant keeps receiving payments to the existing
// wallet throughout preview.
//
// SECURITY:
//   - BTCPay Greenfield key lives ONLY in this function's environment.
//   - The BTCPay store id is resolved server-side from merchant_stores; the client
//     never supplies it.
//   - The xpub / descriptor is NEVER persisted (only a sha256 fingerprint) and
//     NEVER logged (masked).
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
  getOnChainWallet,
  maskExtendedKey,
  previewOnChainWallet,
} from '../_shared/btcpay-client.ts';
import { fingerprintDerivationScheme } from '../_shared/onchain-fingerprint.ts';

const LOOKS_LIKE_KEY = /(\(|[xyztuv]pub[1-9A-HJ-NP-Za-km-z]{20,})/i;
const MAX_KEY_LENGTH = 2000;
// A preview must be confirmed reasonably promptly. 15 minutes is enough time to
// compare addresses against a hardware wallet without leaving a stale token.
const PREVIEW_TTL_MS = 15 * 60 * 1000;

// Typed error helper so the client can branch on machine-readable codes.
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

  // 1. Authenticate.
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

  // 2. Parse + validate input.
  let body: { merchantStoreId?: unknown; extendedPublicKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return fail('STORE_NOT_FOUND', 'merchantStoreId is required.', 400);
  }
  const extendedPublicKey =
    typeof body.extendedPublicKey === 'string' ? body.extendedPublicKey.trim() : '';
  if (
    !extendedPublicKey ||
    extendedPublicKey.length > MAX_KEY_LENGTH ||
    !LOOKS_LIKE_KEY.test(extendedPublicKey)
  ) {
    return fail('INVALID_DERIVATION_SCHEME', 'A valid extended public key is required.', 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 3. Resolve the store + verify ownership. BTCPay store id is server-resolved.
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name, onchain_status')
    .eq('id', merchantStoreId)
    .maybeSingle<{
      id: string;
      user_id: string;
      btcpay_store_id: string;
      name: string;
      onchain_status: string;
    }>();
  if (storeError) {
    return jsonResponse({ ok: false, error: 'Could not load the store.' }, 500);
  }
  if (!store) {
    return fail('STORE_NOT_FOUND', 'Store not found.', 404);
  }
  if (store.user_id !== user.id) {
    return fail('STORE_ACCESS_DENIED', 'You do not have access to this store.', 403);
  }

  // 4. Replace mode requires an already-connected wallet (the backend is the
  //    authority on this, not the client-supplied mode).
  if (store.onchain_status !== 'connected') {
    return fail(
      'WALLET_NOT_CONNECTED',
      'This store has no connected Bitcoin wallet to replace.',
      409,
    );
  }

  // 5. BTCPay config.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    // Confirm BTCPay agrees a wallet is currently configured (authoritative).
    const current = await getOnChainWallet(config, store.btcpay_store_id);
    if (!current.configured) {
      return fail(
        'WALLET_NOT_CONNECTED',
        'This store has no connected Bitcoin wallet to replace.',
        409,
      );
    }

    // 6. Derive the proposed replacement's receive addresses (read-only).
    const addresses = await previewOnChainWallet(
      config,
      store.btcpay_store_id,
      extendedPublicKey,
      { offset: 0, count: 10 },
    );

    // 7. Same-wallet detection, server-side and format-independent: compare the
    //    first derived address of the proposed key against the first derived
    //    address of the wallet BTCPay currently has. Never exposes either scheme.
    if (current.derivationScheme && addresses[0]?.address) {
      const currentPreview = await previewOnChainWallet(
        config,
        store.btcpay_store_id,
        current.derivationScheme,
        { offset: 0, count: 1 },
      );
      if (currentPreview[0]?.address && currentPreview[0].address === addresses[0].address) {
        return fail(
          'WALLET_ALREADY_CONNECTED',
          'That wallet is already connected to this store. No replacement is needed.',
          409,
        );
      }
    }

    // 8. Issue the bound, single-use preview-verification record.
    const { provider, addressType } = classifyDerivation(extendedPublicKey);
    const schemeFingerprint = await fingerprintDerivationScheme(extendedPublicKey);
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();

    const { data: preview, error: previewInsertError } = await admin
      .from('onchain_wallet_replacement_previews')
      .insert({
        user_id: user.id,
        merchant_store_id: store.id,
        btcpay_store_id: store.btcpay_store_id,
        mode: 'replace',
        scheme_fingerprint: schemeFingerprint,
        address_type: addressType,
        provider,
        status: 'active',
        expires_at: expiresAt,
      })
      .select('id')
      .single<{ id: string }>();
    if (previewInsertError || !preview) {
      console.error(
        `[preview-onchain-replace] store=${store.id} preview record insert failed: ${previewInsertError?.message}`,
      );
      return jsonResponse(
        { ok: false, error: 'Could not start the replacement. Please try again.' },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      previewVerificationId: preview.id,
      addressType,
      addresses,
      expiresAt,
      storeName: store.name,
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[preview-onchain-replace] store=${store.id} key=${maskExtendedKey(extendedPublicKey)} ` +
        `failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return fail(
      'INVALID_DERIVATION_SCHEME',
      isApiError
        ? `BTCPay could not read that key (HTTP ${err.status}). Please check it and try again.`
        : 'Could not read that key. Please try again.',
      502,
    );
  }
});
