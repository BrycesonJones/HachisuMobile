// Edge Function: delete-account
//
// Permanently deletes the CALLER's account. The target user id comes
// exclusively from the verified JWT — the request body is never consulted — so
// this function is structurally incapable of deleting any account other than
// the authenticated caller's.
//
// Lifecycle (order matters):
//
//   1. BTCPay cleanup FIRST. Every BTCPay store provisioned for this user
//      (merchant_stores rows plus the legacy user_profiles default-store
//      summary) is permanently deleted via Greenfield
//      DELETE /api/v1/stores/{storeId}. This removes the store together with
//      its apps (POS), pay button, and wallet CONFIGURATION (the public
//      derivation scheme), and makes creating any NEW invoice/checkout
//      impossible. Live-observed on BTCPay 2.4.3 (2026-08-29): BTCPay retains
//      HISTORICAL invoice records — already-issued /i/{id} checkout pages stay
//      viewable, and an invoice still inside its validity window stays payable
//      (to the merchant's own wallet) until it expires. Deletion cannot and
//      does not touch private keys, seed phrases, wallet funds, or the Bitcoin
//      blockchain — Hachisu never holds any of those. Deleting the stores
//      first also cuts off further payment activity mid-deletion.
//
//   2. Supabase deletion SECOND. Only after every BTCPay store is confirmed
//      gone is the auth user hard-deleted (Admin API). Every Hachisu
//      account-owned table cascades from auth.users via ON DELETE CASCADE
//      (user_profiles, merchant_stores, merchant_pos_apps, merchant_invoices,
//      merchant_payment_requests, user_legal_acceptances,
//      user_address_balances, btcpay_store_provisioning_events,
//      onchain_wallet_replacement_previews/_ops), so the single admin
//      deleteUser call removes all of the user's Supabase data.
//
// Partial-failure strategy: if ANY BTCPay store deletion fails, the whole
// request fails BEFORE the Supabase account is touched. The account, its
// session, and the merchant_stores ↔ BTCPay mapping all remain intact, so the
// user sees an actionable error and can simply retry — orphaned BTCPay
// infrastructure with no identifiable owner can never be created by this
// function. The reverse ordering would risk exactly that. Retries are
// idempotent: an already-deleted BTCPay store answers 404 — or, live-observed
// on 2.4.3, 403 (BTCPay hides deleted stores as "no access"). A 403 is treated
// as already-deleted ONLY after the server key's store list loads (proving the
// key works) and the id is absent from it; any ambiguity fails the request.
//
// Required secrets when the user has stores: BTCPAY_SERVER_URL,
// BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';

import {
  collectBtcpayStoreIds,
  confirmAccountDeleted,
  unhandledBtcpayStoreIds,
} from '../_shared/account-deletion.ts';
import {
  BtcpayApiError,
  BtcpayTimeoutError,
  BtcpayConfigError,
  deleteStore,
  getBtcpayConfig,
  listServerStoreIds,
} from '../_shared/btcpay-client.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

// Bound on the enumerate -> delete -> re-enumerate loop. A merchant closing an
// account is not creating stores in a tight loop; more than a couple of passes
// means something is actively racing the deletion, and refusing is the safe
// answer (the account and its mapping survive, so a retry is clean).
const MAX_CLEANUP_PASSES = 3;

const RETRYABLE_CLEANUP_ERROR =
  'Could not remove your payment-processing stores. Your account was NOT deleted — please try again.';

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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Enumerate the user's BTCPay stores while the ownership mapping still
  //    exists. Read failures abort: deleting the account with unknown store
  //    state could orphan BTCPay infrastructure.
  const { data: storeRows, error: storesError } = await admin
    .from('merchant_stores')
    .select('btcpay_store_id')
    .eq('user_id', user.id);
  if (storesError) {
    console.error(`[delete-account] user=${user.id} store lookup failed: ${storesError.message}`);
    return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 500);
  }

  const { data: profileRow, error: profileError } = await admin
    .from('user_profiles')
    .select('btcpay_store_id')
    .eq('id', user.id)
    .maybeSingle<{ btcpay_store_id: string | null }>();
  if (profileError) {
    console.error(`[delete-account] user=${user.id} profile lookup failed: ${profileError.message}`);
    return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 500);
  }

  // user_profiles is client-writable, so its summary id is only admitted when a
  // server-written provisioning event proves the store was provisioned for THIS
  // user. btcpay_store_provisioning_events has a select-own policy and no client
  // write path, so the attestation set cannot be forged.
  const { data: attestedRows, error: attestedError } = await admin
    .from('btcpay_store_provisioning_events')
    .select('btcpay_store_id')
    .eq('user_id', user.id)
    .not('btcpay_store_id', 'is', null);
  if (attestedError) {
    console.error(
      `[delete-account] user=${user.id} attestation lookup failed: ${attestedError.message}`,
    );
    return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 500);
  }
  const attestedStoreIds = ((attestedRows ?? []) as { btcpay_store_id: string | null }[])
    .map((row) => row.btcpay_store_id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

  const storeIds = collectBtcpayStoreIds(
    (storeRows ?? []) as { btcpay_store_id: string | null }[],
    profileRow?.btcpay_store_id,
    attestedStoreIds,
  );

  // 2. Permanently delete each BTCPay store (idempotent: 404 = already gone).
  //    Any failure aborts BEFORE the Supabase account is touched.
  //
  //    Re-enumerated between passes: a store created concurrently (the same
  //    account calling create-btcpay-store from another device) would otherwise
  //    land after this step and be cascaded out of Supabase while staying alive
  //    at BTCPay — an orphan with no owner record. We loop until a fresh read
  //    adds nothing, and refuse to proceed if it never settles.
  let config: ReturnType<typeof getBtcpayConfig> | null = null;
  const handledStoreIds: string[] = [];
  let pending = storeIds;

  for (let pass = 0; pending.length > 0; pass++) {
    if (pass >= MAX_CLEANUP_PASSES) {
      console.error(
        `[delete-account] user=${user.id} store set never settled after ${MAX_CLEANUP_PASSES} passes`,
      );
      return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 409);
    }

    if (!config) {
      try {
        config = getBtcpayConfig();
      } catch (err) {
        const message =
          err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
        console.error(`[delete-account] user=${user.id} ${message}`);
        return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 500);
      }
    }

    for (const storeId of pending) {
      try {
        await deleteStore(config, storeId);
      } catch (err) {
        // BTCPay hides a DELETED store as 403 rather than 404, so a retry
        // after successful cleanup (e.g. the Supabase step failed last time)
        // would otherwise wedge here forever. Confirm via the server key's
        // store list: if the list loads (key works) and the id is absent, the
        // store is already gone — success. Any other outcome fails safe.
        if (err instanceof BtcpayApiError && err.status === 403) {
          try {
            const visibleIds = await listServerStoreIds(config);
            if (!visibleIds.includes(storeId)) {
              console.log(`[delete-account] user=${user.id} store=${storeId} already deleted (403 + absent from store list)`);
              handledStoreIds.push(storeId);
              continue;
            }
          } catch (listErr) {
            // A09 (CWE-532): a normalized description, not the error object.
            // Passing the object serializes its own properties, which for a
            // BtcpayApiError includes the upstream response body.
            console.error(
              `[delete-account] user=${user.id} store=${storeId} 403 disambiguation failed: ` +
                describeBtcpayError(listErr),
            );
          }
        }
        if (err instanceof BtcpayApiError) {
          // A09 (CWE-532): status only — the body is upstream-controlled text.
          console.error(
            `[delete-account] user=${user.id} store=${storeId} ` +
              `BTCPay delete failed btcpayStatus=${err.status}`,
          );
        } else {
          // A09 (CWE-532): normalized description, never the raw error object.
          console.error(
            `[delete-account] user=${user.id} store=${storeId} delete failed: ` +
              describeBtcpayError(err),
          );
        }
        return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 502);
      }
      handledStoreIds.push(storeId);
    }

    // Fresh read: did anything appear while we were deleting?
    const { data: recheckRows, error: recheckError } = await admin
      .from('merchant_stores')
      .select('btcpay_store_id')
      .eq('user_id', user.id);
    if (recheckError) {
      console.error(
        `[delete-account] user=${user.id} store re-check failed: ${recheckError.message}`,
      );
      return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 500);
    }
    pending = unhandledBtcpayStoreIds(
      handledStoreIds,
      ((recheckRows ?? []) as { btcpay_store_id: string | null }[])
        .map((row) => row.btcpay_store_id)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    );
    if (pending.length > 0) {
      console.warn(
        `[delete-account] user=${user.id} ${pending.length} store(s) appeared during cleanup — another pass`,
      );
    }
  }

  // 3. Hard-delete the Supabase auth user; all app tables cascade.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    // A concurrent duplicate submission can win the race between getUser and
    // deleteUser. The account is gone either way, which is this call's goal.
    const alreadyGone = deleteError.code === 'user_not_found' || deleteError.status === 404;
    if (!alreadyGone) {
      console.error(`[delete-account] user=${user.id} delete failed: ${deleteError.message}`);
      return jsonResponse(
        { ok: false, error: 'Could not close your account. Please try again.' },
        500,
      );
    }
  }

  // Read back before claiming success: the client only discards its session and
  // local data on ok=true, so a deletion must never be reported that did not
  // actually happen. A10 (CWE-252/CWE-636): the read-back's OWN error is
  // checked — a verification that cannot run has not verified anything, and
  // must not be read as a clean result. See confirmAccountDeleted().
  const readback = confirmAccountDeleted(await admin.auth.admin.getUserById(user.id));
  if (!readback.confirmed) {
    console.error(`[delete-account] user=${user.id} deletion unconfirmed: ${readback.reason}`);
    return jsonResponse(
      { ok: false, error: 'Could not close your account. Please try again.' },
      500,
    );
  }

  return jsonResponse({ ok: true });
});

/** Non-sensitive one-line description of a BTCPay failure for the log. Never
 * includes the Greenfield key or a response body that could carry upstream text.
 * Mirrors the helper in the other BTCPay-facing functions. */
function describeBtcpayError(err: unknown): string {
  if (err instanceof BtcpayTimeoutError) return 'btcpay=timeout';
  if (err instanceof BtcpayApiError) return `btcpayStatus=${err.status}`;
  return `btcpay=unexpected(${err instanceof Error ? err.name : typeof err})`;
}
