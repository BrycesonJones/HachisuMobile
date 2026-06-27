// Edge Function: delete-btcpay-pos-app
//
// Deletes a store-scoped POS app: verifies the row belongs to the caller,
// deletes the app in BTCPay (Greenfield DELETE /apps/{appId}), then removes the
// merchant_pos_apps row. The mobile app never calls BTCPay directly.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  deleteApp,
  getBtcpayConfig,
} from '../_shared/btcpay-client.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server is not configured.' }, 500);
  }

  // 1. Authenticate the user.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing or invalid Authorization header.' }, 401);
  }
  const userScoped = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userScoped.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Not authenticated.' }, 401);
  }

  // 2. Parse + validate input.
  let body: { posAppId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }
  const posAppId = typeof body.posAppId === 'string' ? body.posAppId.trim() : '';
  if (!posAppId) {
    return jsonResponse({ error: 'A POS app id is required.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 3. Load the POS app and verify ownership.
  const { data: app, error: appError } = await admin
    .from('merchant_pos_apps')
    .select('id, user_id, btcpay_app_id')
    .eq('id', posAppId)
    .maybeSingle<{ id: string; user_id: string; btcpay_app_id: string }>();
  if (appError) {
    return jsonResponse({ error: 'Could not load the POS app.' }, 500);
  }
  if (!app || app.user_id !== user.id) {
    return jsonResponse({ error: 'POS app not found.' }, 404);
  }

  // 4. Delete in BTCPay (idempotent: a 404 there is treated as success).
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ error: message }, 500);
  }

  try {
    await deleteApp(config, app.btcpay_app_id);
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    if (isApiError) {
      console.error('[delete-pos-app] BTCPay error', err.status, JSON.stringify(err.body));
    }
    return jsonResponse(
      { error: isApiError ? err.message : 'Could not delete the POS app.' },
      502,
    );
  }

  // 5. Remove the Supabase row.
  const { error: deleteError } = await admin
    .from('merchant_pos_apps')
    .delete()
    .eq('id', app.id);
  if (deleteError) {
    console.error('[delete-pos-app] DB delete failed:', deleteError.message, app.id);
    return jsonResponse(
      { error: 'POS app removed from BTCPay but could not be cleared locally.' },
      500,
    );
  }

  return jsonResponse({ success: true });
});
