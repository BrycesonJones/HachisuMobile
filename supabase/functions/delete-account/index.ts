// Edge Function: delete-account
//
// Permanently deletes the CALLER's Supabase Auth account (hard delete via the
// Admin API). The target user id comes exclusively from the verified JWT — the
// request body is never consulted — so this function is structurally incapable
// of deleting any account other than the authenticated caller's.
//
// Every Hachisu account-owned table cascades from auth.users via
// ON DELETE CASCADE (user_profiles, merchant_stores, merchant_pos_apps,
// merchant_invoices, merchant_payment_requests, user_address_balances,
// btcpay_store_provisioning_events, onchain_wallet_replacement_previews/_ops),
// so the single admin deleteUser call removes all of the user's Supabase data.
//
// BTCPay-side resources (stores, wallets, invoices) are intentionally NOT
// touched: BTCPay is the authoritative payment-record system and there is no
// established account-lifecycle cleanup for it, so destroying those records
// from a mobile-initiated call would be speculative and irreversible.
//
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

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
