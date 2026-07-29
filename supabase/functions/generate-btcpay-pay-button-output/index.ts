// Edge Function: generate-btcpay-pay-button-output
//
// Produces the Pay Button output (HTML snippet, shareable Link, optional LNURL,
// QR payload) for the mobile Pay Button screen.
//
// SOURCE OF TRUTH: BTCPay exposes NO Greenfield (or any HTTP) endpoint that
// returns Pay Button generated output — BTCPay builds it in the browser
// (wwwroot/paybutton/paybutton.js) inside the store admin page. So there is
// nothing to fetch; we DERIVE the output server-side from BTCPay-confirmed data:
//   - btcpay_store_id resolved from the authenticated user's owned store row
//   - BTCPay base URL from server env (BTCPAY_SERVER_URL)
//   - only after confirming the store's anyoneCanCreateInvoice=true
//   - Lightning/LNURL only when BTCPay reports BTC-LN enabled for the store
// The response `source` is therefore always "server-derived-from-btcpay".
//
// The mobile client sends display/config options only; it never sends a BTCPay
// store id and never talks to BTCPay directly.
//
// Required secrets: BTCPAY_SERVER_URL, BTCPAY_GREENFIELD_API_KEY.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  BtcpayApiError,
  BtcpayConfigError,
  buildPayButtonOutput,
  getBtcpayConfig,
  getStoreLightningPaymentMethod,
  getStorePayButton,
} from '../_shared/btcpay-client.ts';

type ButtonType = 'fixed' | 'custom' | 'slider';
type OutputType = 'code' | 'link' | 'lnurl';

const MAX_TEXT = 200;

/** A positive numeric string like "1" or "1.50" (no sign, no exponent). */
function isPositiveAmount(v: string): boolean {
  return /^\d+(\.\d+)?$/.test(v) && parseFloat(v) > 0;
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

  let body: {
    merchantStoreId?: unknown;
    price?: unknown;
    min?: unknown;
    max?: unknown;
    step?: unknown;
    currency?: unknown;
    checkoutDescription?: unknown;
    orderId?: unknown;
    buttonType?: unknown;
    outputType?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const merchantStoreId =
    typeof body.merchantStoreId === 'string' ? body.merchantStoreId.trim() : '';
  if (!merchantStoreId) {
    return jsonResponse({ ok: false, error: 'merchantStoreId is required.' }, 400);
  }

  const buttonType = (typeof body.buttonType === 'string' ? body.buttonType : '') as ButtonType;
  if (!['fixed', 'custom', 'slider'].includes(buttonType)) {
    return jsonResponse(
      { ok: false, error: 'buttonType must be one of: fixed, custom, slider.' },
      400,
    );
  }

  const outputType = (typeof body.outputType === 'string' ? body.outputType : 'link') as OutputType;
  const normalizedOutputType: OutputType = ['code', 'link', 'lnurl'].includes(outputType)
    ? outputType
    : 'link';

  const usesRange = buttonType === 'custom' || buttonType === 'slider';
  const readField = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();

  // Amount validation is per button type:
  //   fixed  -> a positive Price is required (min/max/step ignored)
  //   custom -> Min/Max/Step required; Min>0, Max>Min, Step>0 (price ignored)
  //   slider -> same as custom
  const rawPrice = readField(body.price);
  if (buttonType === 'fixed') {
    if (!rawPrice) {
      return jsonResponse({ ok: false, error: 'Price is required for fixed amount.' }, 400);
    }
    if (!isPositiveAmount(rawPrice)) {
      return jsonResponse({ ok: false, error: 'Price must be greater than 0.' }, 400);
    }
  }
  const price: string | null = buttonType === 'fixed' ? rawPrice : null;

  let minN: number | null = null;
  let maxN: number | null = null;
  let stepN: number | null = null;
  if (usesRange) {
    const minRaw = readField(body.min);
    const maxRaw = readField(body.max);
    const stepRaw = readField(body.step);
    if (!minRaw) return jsonResponse({ ok: false, error: 'Min is required.' }, 400);
    if (!maxRaw) return jsonResponse({ ok: false, error: 'Max is required.' }, 400);
    if (!stepRaw) return jsonResponse({ ok: false, error: 'Step is required.' }, 400);
    minN = Number(minRaw);
    maxN = Number(maxRaw);
    stepN = Number(stepRaw);
    if (!(Number.isFinite(minN) && minN > 0)) {
      return jsonResponse({ ok: false, error: 'Min must be greater than 0.' }, 400);
    }
    if (!(Number.isFinite(maxN) && maxN > minN)) {
      return jsonResponse({ ok: false, error: 'Max must be greater than Min.' }, 400);
    }
    if (!(Number.isFinite(stepN) && stepN > 0)) {
      return jsonResponse({ ok: false, error: 'Step must be greater than 0.' }, 400);
    }
  }

  const checkoutDesc =
    typeof body.checkoutDescription === 'string'
      ? body.checkoutDescription.trim().slice(0, MAX_TEXT) || null
      : null;
  const orderId =
    typeof body.orderId === 'string' ? body.orderId.trim().slice(0, MAX_TEXT) || null : null;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: store, error: storeError } = await admin
    .from('merchant_stores')
    .select('id, user_id, btcpay_store_id, name, default_currency')
    .eq('id', merchantStoreId)
    .maybeSingle<{
      id: string;
      user_id: string;
      btcpay_store_id: string;
      name: string;
      default_currency: string;
    }>();
  if (storeError) {
    return jsonResponse({ ok: false, error: 'Could not load the store.' }, 500);
  }
  if (!store || store.user_id !== user.id) {
    return jsonResponse({ ok: false, error: 'Store not found.' }, 404);
  }
  if (!store.btcpay_store_id) {
    return jsonResponse(
      { ok: false, error: 'This store is not connected to BTCPay yet.' },
      409,
    );
  }

  // Currency: default to the store's default; validate as a plain code.
  const rawCurrency =
    typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim()
      : store.default_currency || 'USD';
  const currency = rawCurrency.toUpperCase();
  if (!/^[A-Z]{2,10}$/.test(currency)) {
    return jsonResponse({ ok: false, error: 'Unsupported currency.' }, 400);
  }

  let config;
  try {
    config = getBtcpayConfig();
  } catch (err) {
    const message =
      err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';
    return jsonResponse({ ok: false, error: message }, 500);
  }

  try {
    // 1. Confirm the Pay Button is actually enabled at BTCPay (source of truth).
    const { enabled } = await getStorePayButton(config, store.btcpay_store_id);
    if (!enabled) {
      return jsonResponse(
        { ok: false, error: 'Pay Button is not enabled for this store.', code: 'NOT_ENABLED' },
        409,
      );
    }

    // 2. Lightning availability — only produce an LNURL when BTCPay reports the
    //    store's BTC-LN payment method enabled. Best-effort: never fail the whole
    //    generation over a Lightning read (Code + Link must still work).
    let lightningAvailable = false;
    try {
      const ln = await getStoreLightningPaymentMethod(config, store.btcpay_store_id);
      lightningAvailable = ln?.enabled === true;
    } catch {
      lightningAvailable = false;
    }

    // 3. Derive the output server-side from BTCPay-confirmed data. Custom/slider
    //    use the merchant's validated min/max/step (no default fallback).
    const output = buildPayButtonOutput(config, {
      btcpayStoreId: store.btcpay_store_id,
      currency,
      price,
      min: minN,
      max: maxN,
      step: stepN,
      checkoutDesc,
      orderId,
      buttonType,
      lightningAvailable,
    });

    // QR payload: LNURL when requested and available, otherwise the Link.
    const qrPayload =
      normalizedOutputType === 'lnurl' && output.lnurl ? output.lnurl : output.linkUrl;

    console.log(
      `[pay-button:generate] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `buttonType=${buttonType} currency=${currency} outputType=${normalizedOutputType} ` +
        `source=server-derived-from-btcpay enabled=${enabled} lightningAvailable=${lightningAvailable} ` +
        `limitations=${output.limitations.length}`,
    );

    return jsonResponse({
      ok: true,
      source: 'server-derived-from-btcpay',
      merchantStoreId: store.id,
      btcpayStoreId: store.btcpay_store_id,
      enabled: true,
      currency,
      buttonType,
      price,
      min: minN != null ? String(minN) : null,
      max: maxN != null ? String(maxN) : null,
      step: stepN != null ? String(stepN) : null,
      checkoutDescription: checkoutDesc,
      orderId,
      htmlCode: output.htmlCode,
      linkUrl: output.linkUrl,
      lnurl: output.lnurl,
      lightningAvailable,
      qrPayload,
      limitations: output.limitations,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const isApiError = err instanceof BtcpayApiError;
    console.error(
      `[pay-button:generate] user=${user.id} store=${store.id} btcpayStore=${store.btcpay_store_id} ` +
        `buttonType=${buttonType} failed: ${isApiError ? `HTTP ${err.status}` : String(err)}`,
    );
    return jsonResponse(
      { ok: false, error: 'Could not generate Pay Button output. Please try again.' },
      502,
    );
  }
});
