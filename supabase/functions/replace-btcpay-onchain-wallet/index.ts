// Edge Function: replace-btcpay-onchain-wallet
//
// Step 2 (commit) of the STAGED on-chain wallet REPLACEMENT flow. The merchant's
// currently connected wallet stays fully operational until EVERY one of the
// following has succeeded, in order:
//
//   1. Authenticate the user.
//   2. Validate the internal merchant store id.
//   3. Verify the store belongs to the authenticated user.
//   4. Confirm the store currently has a connected on-chain wallet.
//   5. Validate the single-use, store/user/scheme-bound preview record.
//   6. Acquire a DB-backed replacement lock (concurrency guard, separate from
//      onchain_status) + idempotency row (duplicate-submission guard).
//   7. Read + preserve the current wallet metadata (label, enabled) for
//      preservation / reconciliation.
//   8. Write the new derivation scheme to BTCPay.
//   9. Read the payment method back from BTCPay (authoritative).
//  10. Confirm the NEW wallet is configured + enabled (address-level check).
//  11. Preserve the prior enabled state + label at BTCPay.
//  12. Only then update merchant_stores from the authoritative BTCPay result.
//  13. Mark the preview used; record the idempotent result.
//
// We NEVER report success from a bare HTTP PUT — the BTCPay read-back is required.
// On partial failure we do NOT blindly restore stale DB values over a wallet that
// may already have changed at BTCPay; we surface a reconcile-required state.
//
// SECURITY: BTCPay key is function-local; BTCPay store id is server-resolved;
// the xpub is never persisted (only a sha256 fingerprint) and never logged.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.112.4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  classifyDerivation,
  getBtcpayConfig,
  getOnChainWallet,
  maskExtendedKey,
  previewOnChainWallet,
  setOnChainWallet,
  updateOnChainWalletSettings,
} from '../_shared/btcpay-client.ts';
import { fingerprintDerivationScheme } from '../_shared/onchain-fingerprint.ts';
import { syncUserStoreSummary } from '../_shared/store-summary.ts';

const LOOKS_LIKE_KEY = /(\(|[xyztuv]pub[1-9A-HJ-NP-Za-km-z]{20,})/i;
const MAX_KEY_LENGTH = 2000;
// A lock older than this may be superseded so a crashed/abandoned operation never
// permanently wedges a store. This MUST exceed the platform's hard maximum Edge
// Function wall-clock runtime (Supabase terminates a function long before this),
// which GUARANTEES any request still holding a lock this old has already been
// killed and can no longer commit a BTCPay/DB write — so supersession can never
// overlap a live operation. The per-request ownership TOKEN (checked before the
// BTCPay write and enforced on the DB commit) is the second, independent guard.
const LOCK_STALE_MS = 15 * 60 * 1000;

function fail(code: string, message: string, status: number) {
  return jsonResponse({ ok: false, code, error: message }, status);
}

/** Thrown when this request no longer owns the replacement lock (superseded). */
class OwnershipLost extends Error {
  constructor() {
    super('Replacement lock ownership lost.');
    this.name = 'OwnershipLost';
  }
}

interface StoreRow {
  id: string;
  user_id: string;
  btcpay_store_id: string;
  name: string;
  lightning_status: string;
  onchain_status: string;
  onchain_enabled: boolean;
  onchain_label: string | null;
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
  let body: {
    merchantStoreId?: unknown;
    previewVerificationId?: unknown;
    extendedPublicKey?: unknown;
    idempotencyKey?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  const previewVerificationId =
    typeof body.previewVerificationId === 'string' ? body.previewVerificationId.trim() : '';
  const extendedPublicKey =
    typeof body.extendedPublicKey === 'string' ? body.extendedPublicKey.trim() : '';
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';

  if (!merchantStoreId) return fail('STORE_NOT_FOUND', 'merchantStoreId is required.', 400);
  if (!previewVerificationId) {
    return fail('PREVIEW_REQUIRED', 'A confirmed address preview is required.', 400);
  }
  if (!idempotencyKey) {
    return fail('INVALID_DERIVATION_SCHEME', 'idempotencyKey is required.', 400);
  }
  if (
    !extendedPublicKey ||
    extendedPublicKey.length > MAX_KEY_LENGTH ||
    !LOOKS_LIKE_KEY.test(extendedPublicKey)
  ) {
    return fail('INVALID_DERIVATION_SCHEME', 'A valid extended public key is required.', 400);
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
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
    if (error) console.error('[replace-onchain] event log failed:', error.message);
  }

  // 3. Resolve store + verify ownership.
  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select(
      'id, user_id, btcpay_store_id, name, lightning_status, onchain_status, onchain_enabled, onchain_label',
    )
    .eq('id', merchantStoreId)
    .maybeSingle<StoreRow>();
  if (storeError) {
    return jsonResponse({ ok: false, error: 'Could not load the store.' }, 500);
  }
  if (!store) return fail('STORE_NOT_FOUND', 'Store not found.', 404);
  if (store.user_id !== user.id) {
    return fail('STORE_ACCESS_DENIED', 'You do not have access to this store.', 403);
  }

  // 4. Store must currently have a connected wallet to replace.
  if (store.onchain_status !== 'connected') {
    return fail('WALLET_NOT_CONNECTED', 'This store has no connected Bitcoin wallet to replace.', 409);
  }

  // --- Idempotency: return a prior outcome instead of replacing twice. ---------
  const { data: existingOp } = await admin
    .from('onchain_wallet_replacement_ops')
    .select('id, status, result')
    .eq('merchant_store_id', store.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<{ id: string; status: string; result: unknown }>();
  if (existingOp) {
    if (existingOp.status === 'succeeded' && existingOp.result) {
      return jsonResponse(existingOp.result as Record<string, unknown>);
    }
    if (existingOp.status === 'reconcile_required' && existingOp.result) {
      return jsonResponse(existingOp.result as Record<string, unknown>, 500);
    }
    if (existingOp.status === 'in_progress') {
      return fail(
        'WALLET_REPLACEMENT_ALREADY_IN_PROGRESS',
        'This replacement is already being processed.',
        409,
      );
    }
    // A prior 'failed' attempt with this exact key is terminal — a genuine retry
    // uses a fresh preview + idempotency key.
    return fail('BTCPAY_REPLACEMENT_FAILED', 'This replacement attempt already failed.', 409);
  }

  // 5. Validate the preview-verification record (bound + single-use + fresh).
  const { data: preview, error: previewError } = await admin
    .from('onchain_wallet_replacement_previews')
    .select('id, user_id, merchant_store_id, mode, scheme_fingerprint, status, expires_at')
    .eq('id', previewVerificationId)
    .maybeSingle<{
      id: string;
      user_id: string;
      merchant_store_id: string;
      mode: string;
      scheme_fingerprint: string;
      status: string;
      expires_at: string;
    }>();
  if (previewError) {
    return jsonResponse({ ok: false, error: 'Could not validate the preview.' }, 500);
  }
  if (!preview || preview.user_id !== user.id) {
    return fail('PREVIEW_NOT_FOUND', 'Address preview not found. Please preview again.', 404);
  }
  if (preview.merchant_store_id !== store.id) {
    return fail('PREVIEW_STORE_MISMATCH', 'That preview was created for a different store.', 409);
  }
  if (preview.mode !== 'replace') {
    return fail('PREVIEW_WALLET_MISMATCH', 'That preview cannot be used to replace a wallet.', 409);
  }
  if (preview.status === 'used') {
    return fail('PREVIEW_ALREADY_USED', 'That address preview was already used.', 409);
  }
  if (new Date(preview.expires_at).getTime() < Date.now()) {
    return fail('PREVIEW_EXPIRED', 'That address preview expired. Please preview again.', 409);
  }
  const submittedFingerprint = await fingerprintDerivationScheme(extendedPublicKey);
  if (submittedFingerprint !== preview.scheme_fingerprint) {
    return fail(
      'PREVIEW_WALLET_MISMATCH',
      'The submitted wallet does not match the previewed addresses.',
      409,
    );
  }

  // 6. BTCPay config.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message = err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  // --- Concurrency lock: flip onchain_operation none -> replacing atomically and
  // stamp a UNIQUE ownership token for this request. A stale lock (older than the
  // platform's max runtime — see LOCK_STALE_MS) can be superseded so a store never
  // wedges; the token ensures only the current owner can ever commit.
  const lockToken = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  const { data: locked, error: lockError } = await admin
    .from('merchant_stores')
    .update({
      onchain_operation: 'replacing',
      onchain_operation_started_at: new Date().toISOString(),
      onchain_operation_token: lockToken,
    })
    .eq('id', store.id)
    .or(`onchain_operation.eq.none,onchain_operation_started_at.lt.${staleBefore}`)
    .select('id');
  if (lockError) {
    return jsonResponse({ ok: false, error: 'Could not start the replacement.' }, 500);
  }
  if (!locked || locked.length === 0) {
    return fail(
      'WALLET_REPLACEMENT_ALREADY_IN_PROGRESS',
      'Another wallet operation is already in progress for this store.',
      409,
    );
  }

  // Confirms this request still owns the lock (was not superseded by a later
  // operation). Throws OwnershipLost so callers can abort BEFORE any write.
  const assertOwnership = async () => {
    const { data: row } = await admin
      .from('merchant_stores')
      .select('onchain_operation, onchain_operation_token')
      .eq('id', store.id)
      .maybeSingle<{ onchain_operation: string; onchain_operation_token: string | null }>();
    if (!row || row.onchain_operation !== 'replacing' || row.onchain_operation_token !== lockToken) {
      throw new OwnershipLost();
    }
  };

  // Record the in-progress idempotency row. If a concurrent request inserted it
  // first, the unique index makes this fail -> treat as already-in-progress.
  const { error: opInsertError } = await admin.from('onchain_wallet_replacement_ops').insert({
    user_id: user.id,
    merchant_store_id: store.id,
    idempotency_key: idempotencyKey,
    status: 'in_progress',
  });
  if (opInsertError) {
    await releaseLock(admin, store.id, lockToken);
    return fail(
      'WALLET_REPLACEMENT_ALREADY_IN_PROGRESS',
      'This replacement is already being processed.',
      409,
    );
  }

  const { provider, addressType } = classifyDerivation(extendedPublicKey);

  await logEvent({
    eventType: 'onchain_wallet_replace_started',
    status: 'started',
    message: `Replacing on-chain wallet (${provider}, ${addressType}) for store "${store.name}".`,
    btcpayStoreId: store.btcpay_store_id,
  });

  try {
    // 7. Read + preserve the current wallet's authoritative enabled state + label
    //    (used to keep an intentionally-disabled wallet disabled and to keep the
    //    merchant-defined label). This is also the rollback/reconcile baseline.
    const before = await getOnChainWallet(config, store.btcpay_store_id);
    if (!before.configured) {
      // The wallet vanished between preview and now: nothing to replace safely.
      await failOp(admin, store.id, idempotencyKey);
      await releaseLock(admin, store.id, lockToken);
      return fail('WALLET_NOT_CONNECTED', 'No wallet is currently configured at BTCPay.', 409);
    }
    const preservedEnabled = before.enabled;
    const preservedLabel = before.label ?? store.onchain_label ?? null;

    // 8. Write the new derivation scheme (string form -> BTCPay's full parser, so
    //    every descriptor/multisig/SLIP-132 format works). This is the commit
    //    point at BTCPay. If it throws, BTCPay is (almost certainly) unchanged.
    //    Re-assert lock ownership IMMEDIATELY before the write: if a later op
    //    superseded us, we must not touch BTCPay. (Belt-and-suspenders alongside
    //    the stale window, which already exceeds max runtime.)
    await assertOwnership();
    try {
      await setOnChainWallet(config, store.btcpay_store_id, extendedPublicKey);
    } catch (err) {
      const isApiError = err instanceof BtcpayApiError;
      console.error(
        `[replace-onchain] store=${store.id} key=${maskExtendedKey(extendedPublicKey)} ` +
          `PUT failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
      );
      await logEvent({
        eventType: 'onchain_wallet_replace_failed',
        status: 'error',
        message: isApiError ? `BTCPay rejected the new wallet (HTTP ${err.status}).` : 'PUT failed.',
        btcpayStoreId: store.btcpay_store_id,
        rawError: isApiError ? { status: err.status } : null,
      });
      // Existing wallet is untouched at BTCPay and in the DB.
      await failOp(admin, store.id, idempotencyKey);
      await releaseLock(admin, store.id, lockToken);
      return fail(
        'BTCPAY_REPLACEMENT_FAILED',
        'BTCPay rejected the new wallet configuration. Your current wallet is unchanged.',
        502,
      );
    }

    // 9 + 10. Authoritative read-back. Confirm the NEW wallet is the one BTCPay
    //         now holds by comparing the first derived address (format-independent,
    //         proves it's not still the old wallet). Never trust the PUT alone.
    const verifyFailed = async (why: string) => {
      console.error(`[replace-onchain] store=${store.id} verification failed: ${why}`);
      await logEvent({
        eventType: 'onchain_wallet_replace_verify_failed',
        status: 'error',
        message: `WALLET_REPLACEMENT_VERIFICATION_FAILED: ${why}`,
        btcpayStoreId: store.btcpay_store_id,
      });
      // BTCPay may already have changed. Reconcile from whatever BTCPay actually
      // holds now — do NOT restore stale DB values blindly.
      const reconcileState = await reconcileFromBtcpay(admin, config, store);
      await markPreviewUsed(admin, preview.id);
      const responseBody = {
        ok: false,
        code: 'WALLET_REPLACEMENT_VERIFICATION_FAILED',
        error:
          'The wallet may have been updated but could not be verified. Your wallet status is being re-checked — please review it before trying again.',
        reconcile: true,
        status: reconcileState.onchain_status,
        enabled: reconcileState.enabled,
        label: reconcileState.label,
      };
      await recordOp(admin, store.id, idempotencyKey, 'reconcile_required', responseBody);
      await releaseLock(admin, store.id, lockToken);
      return jsonResponse(responseBody, 500);
    };

    let after = await getOnChainWallet(config, store.btcpay_store_id);
    if (!after.configured || !after.derivationScheme) {
      return await verifyFailed('BTCPay reports no wallet configured after write.');
    }
    // Prove the active wallet is the NEW one (addresses match the submitted key).
    const newFirst = await previewOnChainWallet(config, store.btcpay_store_id, extendedPublicKey, {
      offset: 0,
      count: 1,
    });
    const afterFirst = await previewOnChainWallet(
      config,
      store.btcpay_store_id,
      after.derivationScheme,
      { offset: 0, count: 1 },
    );
    if (!newFirst[0]?.address || newFirst[0].address !== afterFirst[0]?.address) {
      return await verifyFailed('Active wallet does not match the replacement key.');
    }

    // 11. Preserve the prior enabled state + label. setOnChainWallet forced
    //     enabled=true and dropped the label; restore both from the authoritative
    //     read-back, echoing BTCPay's own canonical scheme so any format survives.
    if (preservedEnabled !== true || (preservedLabel ?? '') !== (after.label ?? '')) {
      try {
        await updateOnChainWalletSettings(config, store.btcpay_store_id, after, {
          enabled: preservedEnabled,
          label: preservedLabel,
        });
        after = await getOnChainWallet(config, store.btcpay_store_id);
      } catch (err) {
        console.error(`[replace-onchain] store=${store.id} label/enabled restore failed: ${String(err)}`);
        // Non-fatal: the new wallet IS active. We fall through and persist the
        // authoritative state; a residual label/enabled mismatch is cosmetic and
        // fixable from the settings screen.
      }
    }

    // 12. Persist the authoritative new wallet state on THIS store, and release
    //     the lock in the same write. The commit is CONDITIONAL on still owning
    //     the lock token — if a later op superseded us, this matches 0 rows and
    //     we do NOT claim success (a superseding op is authoritative).
    //     No key material is stored — only a hash.
    const { data: committed, error: updateError } = await admin
      .from('merchant_stores')
      .update({
        onchain_status: 'connected',
        onchain_provider: provider,
        onchain_address_type: addressType,
        onchain_wallet_configured_at: new Date().toISOString(),
        onchain_enabled: after.enabled,
        onchain_label: after.label,
        onchain_scheme_fingerprint: submittedFingerprint,
        wallet_status: 'payment_destination_connected',
        onchain_operation: 'none',
        onchain_operation_started_at: null,
        onchain_operation_token: null,
      })
      .eq('id', store.id)
      .eq('onchain_operation_token', lockToken)
      .select('id');
    if (!updateError && (!committed || committed.length === 0)) {
      // Lost ownership between the BTCPay write and the commit. Do not report
      // success; hand off to the reconcile-required path.
      return await verifyFailed('Lock ownership lost before commit.');
    }
    if (updateError) {
      // BTCPay is ahead of the DB. Do NOT tell the user "failed" (that invites an
      // immediate duplicate replace). Surface a reconcile-required sync error.
      console.error(`[replace-onchain] store=${store.id} DB sync failed: ${updateError.message}`);
      await logEvent({
        eventType: 'onchain_wallet_replace_sync_failed',
        status: 'error',
        message: `WALLET_REPLACEMENT_SYNC_FAILED: ${updateError.message}`,
        btcpayStoreId: store.btcpay_store_id,
      });
      await markPreviewUsed(admin, preview.id);
      const responseBody = {
        ok: false,
        code: 'WALLET_REPLACEMENT_SYNC_FAILED',
        error:
          'Your new wallet was activated but the app could not finish saving it. We are re-checking your wallet status — do not replace again.',
        reconcile: true,
        status: 'connected',
        enabled: after.enabled,
        label: after.label,
      };
      await recordOp(admin, store.id, idempotencyKey, 'reconcile_required', responseBody);
      await releaseLock(admin, store.id, lockToken);
      return jsonResponse(responseBody, 500);
    }

    // 13. Mark the preview consumed + summary + audit. The idempotency row caches
    //     the authoritative success for safe replays of a duplicate tap.
    await markPreviewUsed(admin, preview.id);
    try {
      await syncUserStoreSummary(admin, user.id);
    } catch (err) {
      console.error('[replace-onchain] summary sync failed:', String(err));
    }
    await logEvent({
      eventType: 'onchain_wallet_replaced',
      status: 'ok',
      message: `On-chain wallet replaced (${provider}, ${addressType}) for store "${store.name}".`,
      btcpayStoreId: store.btcpay_store_id,
    });

    const successBody = {
      ok: true,
      status: 'connected',
      enabled: after.enabled,
      label: after.label,
      addressType,
    };
    await recordOp(admin, store.id, idempotencyKey, 'succeeded', successBody);
    return jsonResponse(successBody);
  } catch (err) {
    // We were superseded by a later operation (stale lock reclaimed). That op is
    // now authoritative: do NOT touch BTCPay/DB, do NOT release its lock, do NOT
    // reconcile. Bail out without side effects.
    if (err instanceof OwnershipLost) {
      console.error(`[replace-onchain] store=${store.id} superseded — aborting without writes.`);
      return fail(
        'WALLET_REPLACEMENT_ALREADY_IN_PROGRESS',
        'Another wallet operation superseded this one for this store.',
        409,
      );
    }
    // Unexpected failure AFTER we hold the lock. Reconcile from BTCPay so the DB
    // reflects reality, then release the lock.
    console.error(`[replace-onchain] store=${store.id} unexpected: ${String(err)}`);
    try {
      const reconcileState = await reconcileFromBtcpay(admin, config, store);
      const responseBody = {
        ok: false,
        code: 'WALLET_REPLACEMENT_VERIFICATION_FAILED',
        error:
          'The replacement could not be completed cleanly. Your wallet status is being re-checked — please review it before trying again.',
        reconcile: true,
        status: reconcileState.onchain_status,
        enabled: reconcileState.enabled,
        label: reconcileState.label,
      };
      await recordOp(admin, store.id, idempotencyKey, 'reconcile_required', responseBody);
      await releaseLock(admin, store.id, lockToken);
      return jsonResponse(responseBody, 500);
    } catch {
      await releaseLock(admin, store.id, lockToken);
      return fail('BTCPAY_REPLACEMENT_FAILED', 'The replacement could not be completed.', 500);
    }
  }
});

// --- helpers ------------------------------------------------------------------

async function releaseLock(admin: SupabaseClient, storeId: string, token: string) {
  // Only release the lock if we still own it — never clobber a superseding op's.
  const { error } = await admin
    .from('merchant_stores')
    .update({ onchain_operation: 'none', onchain_operation_started_at: null, onchain_operation_token: null })
    .eq('id', storeId)
    .eq('onchain_operation_token', token);
  if (error) console.error('[replace-onchain] lock release failed:', error.message);
}

async function markPreviewUsed(admin: SupabaseClient, previewId: string) {
  const { error } = await admin
    .from('onchain_wallet_replacement_previews')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', previewId);
  if (error) console.error('[replace-onchain] preview mark-used failed:', error.message);
}

async function recordOp(
  admin: SupabaseClient,
  storeId: string,
  idempotencyKey: string,
  status: 'succeeded' | 'failed' | 'reconcile_required',
  result: Record<string, unknown>,
) {
  const { error } = await admin
    .from('onchain_wallet_replacement_ops')
    .update({ status, result })
    .eq('merchant_store_id', storeId)
    .eq('idempotency_key', idempotencyKey);
  if (error) console.error('[replace-onchain] op record failed:', error.message);
}

/**
 * Clears the in-progress idempotency row for a CLEAN failure (BTCPay definitively
 * unchanged, existing wallet safe). Removing the row lets the merchant retry the
 * same confirm screen. Post-change failures instead keep the row as
 * 'reconcile_required' so a retry can never re-apply the replacement.
 */
async function failOp(admin: SupabaseClient, storeId: string, idempotencyKey: string) {
  const { error } = await admin
    .from('onchain_wallet_replacement_ops')
    .delete()
    .eq('merchant_store_id', storeId)
    .eq('idempotency_key', idempotencyKey);
  if (error) console.error('[replace-onchain] op clear failed:', error.message);
}

/**
 * Reconcile the merchant_stores row from whatever BTCPay authoritatively holds
 * right now, clearing the operation lock. Used when a write may have partially
 * applied — we never restore stale DB values over a possibly-changed wallet.
 */
async function reconcileFromBtcpay(
  admin: SupabaseClient,
  config: Parameters<typeof getOnChainWallet>[0],
  store: StoreRow,
): Promise<{ onchain_status: string; enabled: boolean; label: string | null }> {
  const state = await getOnChainWallet(config, store.btcpay_store_id);
  if (state.configured) {
    const { provider, addressType } = state.derivationScheme
      ? classifyDerivation(state.derivationScheme)
      : { provider: null as string | null, addressType: null as string | null };
    const fingerprint = state.derivationScheme
      ? await fingerprintDerivationScheme(state.derivationScheme)
      : null;
    await admin
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
    return { onchain_status: 'connected', enabled: state.enabled, label: state.label };
  }

  const walletStatus =
    store.lightning_status === 'connected' ? 'payment_destination_connected' : 'store_created';
  await admin
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
  return { onchain_status: 'not_connected', enabled: false, label: null };
}
