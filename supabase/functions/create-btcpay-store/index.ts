// Edge Function: create-btcpay-store
//
// Phase 1.5: configurable, multi-store creation. The merchant supplies a store
// name + default currency; we create a BTCPay store via Greenfield, persist it
// to public.merchant_stores, and (for the user's first store) mirror it into the
// user_profiles "default store summary" columns for backward compatibility.
//
// BTCPay auto-selects the recommended price source (Kraken) from the default
// currency — there is no Greenfield field for it — so we only send name +
// defaultCurrency and record preferred_price_source='kraken' as our metadata.
//
// The mobile app NEVER calls BTCPay directly. The Greenfield key lives only in
// this function's environment (BTCPAY_GREENFIELD_API_KEY).
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  createStore,
  getBtcpayConfig,
} from '../_shared/btcpay-client.ts';

// Supported default currencies. UI currently offers USD only; this list is the
// backend allow-list and is intentionally easy to extend as the UI grows.
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'BRL',
  'MXN', 'NGN', 'ZAR', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN',
]);
const PREFERRED_PRICE_SOURCE = 'kraken';
const MAX_NAME_LENGTH = 50;

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

  // 1. Authenticate the user from their JWT.
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

  // 2. Parse + validate the request body.
  let body: { name?: unknown; defaultCurrency?: unknown; preferredPriceSource?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return jsonResponse({ error: 'Store name is required.' }, 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    return jsonResponse(
      { error: `Store name must be ${MAX_NAME_LENGTH} characters or fewer.` },
      400,
    );
  }

  const defaultCurrency =
    typeof body.defaultCurrency === 'string' ? body.defaultCurrency.trim().toUpperCase() : '';
  if (!defaultCurrency) {
    return jsonResponse({ error: 'Default currency is required.' }, 400);
  }
  if (!SUPPORTED_CURRENCIES.has(defaultCurrency)) {
    return jsonResponse({ error: `Unsupported currency: ${defaultCurrency}.` }, 400);
  }

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
    const { error } = await admin.from('btcpay_store_provisioning_events').insert({
      user_id: user!.id,
      business_id: user!.id, // user_profiles.id === auth user id in this schema
      event_type: input.eventType,
      status: input.status,
      message: input.message ?? null,
      btcpay_store_id: input.btcpayStoreId ?? null,
      raw_error: input.rawError == null ? null : input.rawError,
    });
    if (error) console.error('[create-store] event log failed:', error.message);
  }

  // 3. Ensure the business profile exists.
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle<{ id: string }>();
  if (profileError) {
    return jsonResponse({ error: 'Could not load business profile.' }, 500);
  }
  if (!profile) {
    return jsonResponse(
      { error: 'No business profile found. Complete onboarding first.' },
      404,
    );
  }

  // 4. Validate BTCPay config.
  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    await logEvent({ eventType: 'store_provisioning_failed', status: 'error', message });
    return jsonResponse({ error: message }, 500);
  }

  // 5. Is this the user's first store? First store becomes the default.
  const { count: existingCount, error: countError } = await admin
    .from('merchant_stores')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (countError) {
    return jsonResponse({ error: 'Could not check existing stores.' }, 500);
  }
  const isDefault = (existingCount ?? 0) === 0;

  await logEvent({
    eventType: 'store_provisioning_started',
    status: 'started',
    message: `Creating store "${name}" (${defaultCurrency}).`,
  });

  // 6. Create the BTCPay store. Recommended (Kraken) price source is BTCPay's
  // automatic default based on defaultCurrency — no extra call needed.
  let store;
  try {
    store = await createStore(config, { name, defaultCurrency });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    await logEvent({
      eventType: 'store_provisioning_failed',
      status: 'error',
      message: isApiError ? err.message : 'Unexpected error creating store.',
      rawError: isApiError ? { status: err.status, body: err.body } : null,
    });
    return jsonResponse(
      { error: isApiError ? err.message : 'Could not create BTCPay store.' },
      502,
    );
  }

  // 7. Persist to merchant_stores.
  const { data: inserted, error: insertError } = await admin
    .from('merchant_stores')
    .insert({
      user_id: user.id,
      profile_id: user.id,
      name,
      display_name: name,
      default_currency: defaultCurrency,
      preferred_price_source: PREFERRED_PRICE_SOURCE,
      btcpay_store_id: store.id,
      btcpay_store_name: store.name ?? name,
      store_provisioning_status: 'active',
      wallet_status: 'store_created',
      lightning_status: 'not_connected',
      onchain_status: 'not_connected',
      is_default: isDefault,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    // Store exists at BTCPay but we couldn't persist it. Surface clearly.
    await logEvent({
      eventType: 'store_provisioning_failed',
      status: 'error',
      message: `Store created at BTCPay but DB insert failed: ${insertError?.message}`,
      btcpayStoreId: store.id,
    });
    return jsonResponse(
      { error: 'Store created but could not be saved. Please contact support.' },
      500,
    );
  }

  // 8. First store mirrors into user_profiles summary (backward compatibility).
  if (isDefault) {
    await admin
      .from('user_profiles')
      .update({
        btcpay_store_id: store.id,
        btcpay_store_name: store.name ?? name,
        store_provisioning_status: 'active',
        wallet_status: 'store_created',
        lightning_status: 'not_connected',
        onchain_status: 'not_connected',
      })
      .eq('id', user.id);
  }

  await logEvent({
    eventType: 'store_created',
    status: 'ok',
    message: `Created store "${inserted.name}" (${defaultCurrency})${isDefault ? ' [default]' : ''}.`,
    btcpayStoreId: store.id,
  });

  // 9. Normalized result.
  return jsonResponse({
    store: {
      id: inserted.id,
      name: inserted.name,
      defaultCurrency: inserted.default_currency,
      preferredPriceSource: PREFERRED_PRICE_SOURCE,
      btcpayStoreId: inserted.btcpay_store_id,
      storeProvisioningStatus: inserted.store_provisioning_status,
      walletStatus: inserted.wallet_status,
      lightningStatus: inserted.lightning_status,
      onchainStatus: inserted.onchain_status,
      isDefault: inserted.is_default,
    },
  });
});
