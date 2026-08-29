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

import { collectBtcpayStoreIds } from '../_shared/account-deletion.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  deleteStore,
  getBtcpayConfig,
  listServerStoreIds,
} from '../_shared/btcpay-client.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

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

  const storeIds = collectBtcpayStoreIds(
    (storeRows ?? []) as { btcpay_store_id: string | null }[],
    profileRow?.btcpay_store_id,
  );

  // 2. Permanently delete each BTCPay store (idempotent: 404 = already gone).
  //    Any failure aborts BEFORE the Supabase account is touched.
  if (storeIds.length > 0) {
    let config;
    try {
      config = getBtcpayConfig();
    } catch (err) {
      const message =
        err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
      console.error(`[delete-account] user=${user.id} ${message}`);
      return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 500);
    }

    for (const storeId of storeIds) {
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
              continue;
            }
          } catch (listErr) {
            console.error(`[delete-account] user=${user.id} store=${storeId} 403 disambiguation failed:`, listErr);
          }
        }
        if (err instanceof BtcpayApiError) {
          console.error(
            `[delete-account] user=${user.id} store=${storeId} BTCPay delete failed`,
            err.status,
            JSON.stringify(err.body),
          );
        } else {
          console.error(`[delete-account] user=${user.id} store=${storeId} delete threw:`, err);
        }
        return jsonResponse({ ok: false, error: RETRYABLE_CLEANUP_ERROR }, 502);
      }
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
  // actually happen.
  const { data: after } = await admin.auth.admin.getUserById(user.id);
  if (after?.user) {
    console.error(`[delete-account] user=${user.id} still exists after delete`);
    return jsonResponse(
      { ok: false, error: 'Could not close your account. Please try again.' },
      500,
    );
  }

  return jsonResponse({ ok: true });
});
