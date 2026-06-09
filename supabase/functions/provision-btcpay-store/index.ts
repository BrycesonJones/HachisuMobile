// Edge Function: provision-btcpay-store
//
// Provisions a BTCPay Server store for the authenticated business user, persists
// the store metadata on public.user_profiles, and logs the attempt to
// public.btcpay_store_provisioning_events.
//
// Architecture: the mobile app NEVER calls BTCPay directly. It invokes this
// function with the user's Supabase JWT; the privileged Greenfield API key lives
// only in this function's environment (BTCPAY_GREENFIELD_API_KEY) and is never
// returned to the client or written to the database.
//
// Phase 1 = store provisioning only. No invoices / POS / payment destinations.
//
// Required function secrets (set via `supabase secrets set ...`):
//   BTCPAY_SERVER_URL
//   BTCPAY_GREENFIELD_API_KEY
// Auto-provided by the platform: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  createStore,
  getBtcpayConfig,
} from '../_shared/btcpay-client.ts';

interface NormalizedStatus {
  storeProvisioningStatus: 'not_started' | 'provisioning' | 'active' | 'failed';
  walletStatus:
    | 'not_connected'
    | 'store_created'
    | 'payment_destination_connected'
    | 'error';
  lightningStatus: 'not_connected' | 'connected' | 'error';
  onchainStatus: 'not_connected' | 'connected' | 'error';
  btcpayStoreId: string | null;
  btcpayStoreName: string | null;
}

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  business_name: string | null;
  btcpay_store_id: string | null;
  btcpay_store_name: string | null;
  store_provisioning_status: NormalizedStatus['storeProvisioningStatus'];
  wallet_status: NormalizedStatus['walletStatus'];
  lightning_status: NormalizedStatus['lightningStatus'];
  onchain_status: NormalizedStatus['onchainStatus'];
};

function normalize(p: Partial<ProfileRow>): NormalizedStatus {
  return {
    storeProvisioningStatus: p.store_provisioning_status ?? 'not_started',
    walletStatus: p.wallet_status ?? 'not_connected',
    lightningStatus: p.lightning_status ?? 'not_connected',
    onchainStatus: p.onchain_status ?? 'not_connected',
    btcpayStoreId: p.btcpay_store_id ?? null,
    btcpayStoreName: p.btcpay_store_name ?? null,
  };
}

/** "{display or legal name} - Hachisu", falling back to a short-user-id label. */
function buildStoreName(profile: ProfileRow, userId: string): string {
  const base =
    profile.display_name?.trim() ||
    profile.business_name?.trim() ||
    '';
  if (base) return `${base} - Hachisu`;
  return `Hachisu Merchant ${userId.slice(0, 8)}`;
}

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

  // 1. Resolve the authenticated user from their JWT.
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

  // Service-role client: bypasses RLS for profile updates + event logging.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  async function logEvent(input: {
    eventType: string;
    status: string;
    message?: string;
    btcpayStoreId?: string | null;
    rawError?: unknown;
  }) {
    // Best-effort audit; never block the response on a logging failure.
    const { error } = await admin
      .from('btcpay_store_provisioning_events')
      .insert({
        user_id: user!.id,
        business_id: user!.id, // user_profiles.id === auth user id in this schema
        event_type: input.eventType,
        status: input.status,
        message: input.message ?? null,
        btcpay_store_id: input.btcpayStoreId ?? null,
        raw_error: input.rawError == null ? null : input.rawError,
      });
    if (error) console.error('[provision] event log failed:', error.message);
  }

  // 2. Look up the business profile.
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select(
      'id, email, display_name, business_name, btcpay_store_id, btcpay_store_name, ' +
        'store_provisioning_status, wallet_status, lightning_status, onchain_status',
    )
    .eq('id', user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    return jsonResponse({ error: 'Could not load business profile.' }, 500);
  }
  if (!profile) {
    return jsonResponse(
      { error: 'No business profile found. Complete onboarding first.' },
      404,
    );
  }

  // 3. Idempotency: never create a second store.
  if (profile.btcpay_store_id) {
    await logEvent({
      eventType: 'store_already_exists',
      status: 'ok',
      message: 'Store already provisioned; returning existing status.',
      btcpayStoreId: profile.btcpay_store_id,
    });
    return jsonResponse({ status: normalize(profile), alreadyProvisioned: true });
  }

  // 4. Validate BTCPay config before flipping into the provisioning state.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    await logEvent({
      eventType: 'store_provisioning_failed',
      status: 'error',
      message,
    });
    return jsonResponse({ error: message }, 500);
  }

  // Mark provisioning (so the UI can show "Creating store...").
  await admin
    .from('user_profiles')
    .update({ store_provisioning_status: 'provisioning' })
    .eq('id', user.id);
  await logEvent({ eventType: 'store_provisioning_started', status: 'started' });

  // 5. Create the store via Greenfield.
  const storeName = buildStoreName(profile, user.id);
  try {
    const store = await createStore(config, { name: storeName });

    const { data: updated, error: updateError } = await admin
      .from('user_profiles')
      .update({
        btcpay_store_id: store.id,
        btcpay_store_name: store.name ?? storeName,
        store_provisioning_status: 'active',
        wallet_status: 'store_created',
        lightning_status: 'not_connected',
        onchain_status: 'not_connected',
      })
      .eq('id', user.id)
      .select(
        'id, btcpay_store_id, btcpay_store_name, store_provisioning_status, ' +
          'wallet_status, lightning_status, onchain_status',
      )
      .single<ProfileRow>();

    if (updateError) {
      // Store was created at BTCPay but we failed to persist it. Surface clearly.
      await logEvent({
        eventType: 'store_provisioning_failed',
        status: 'error',
        message: `Store created but DB write failed: ${updateError.message}`,
        btcpayStoreId: store.id,
      });
      return jsonResponse(
        { error: 'Store created but could not be saved. Please retry.' },
        500,
      );
    }

    await logEvent({
      eventType: 'store_created',
      status: 'ok',
      message: `Created store "${store.name ?? storeName}".`,
      btcpayStoreId: store.id,
    });

    return jsonResponse({ status: normalize(updated), alreadyProvisioned: false });
  } catch (err) {
    // Roll the status back to failed so the UI shows "Setup failed".
    await admin
      .from('user_profiles')
      .update({ store_provisioning_status: 'failed', wallet_status: 'error' })
      .eq('id', user.id);

    const isApiError = err instanceof BtcpayApiError;
    await logEvent({
      eventType: 'store_provisioning_failed',
      status: 'error',
      message: isApiError ? err.message : 'Unexpected error creating store.',
      // raw_error must never contain the API key — BtcpayApiError.body is the
      // BTCPay response body, which does not echo the auth header.
      rawError: isApiError ? { status: err.status, body: err.body } : null,
    });

    return jsonResponse(
      { error: isApiError ? err.message : 'Could not create BTCPay store.' },
      502,
    );
  }
});
