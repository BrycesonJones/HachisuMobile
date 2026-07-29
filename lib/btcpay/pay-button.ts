// Client wrapper for the per-store Pay Button feature.
//
// The mobile app NEVER talks to BTCPay directly. It calls Supabase Edge
// Functions that own the BTCPay call:
//   - get-btcpay-pay-button-status      — read the authoritative BTCPay state
//   - set-btcpay-pay-button             — enable/disable, re-read, confirm
//   - generate-btcpay-pay-button-output — derive the HTML/Link/LNURL from BTCPay
//
// The "enabled" state the UI renders always comes from BTCPay (via these
// functions), never from an optimistic local flip. The generated output is
// produced server-side from BTCPay-confirmed data — never hand-built in RN.
// Dev-bypass mode simulates the calls against the in-memory dev store registry.

import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive } from '@/lib/auth/dev-session';
import { getDevStores, updateDevStore } from '@/lib/btcpay/dev-stores';
import { supabase } from '@/lib/supabase';

export type PayButtonStatus = 'enabled' | 'disabled' | 'error';

export interface PayButtonState {
  ok: boolean;
  error: string | null;
  status: PayButtonStatus;
  enabled: boolean;
}

/**
 * supabase-js throws FunctionsHttpError on any non-2xx response and exposes only
 * a generic message. The real JSON body our function returned ({ error }) lives
 * on error.context (the raw Response). Pull it out so the true reason surfaces.
 */
async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // Body wasn't JSON or already consumed — fall through.
    }
  }
  const message = (error as { message?: string })?.message;
  return message || fallback;
}

/** Reads the active store's authoritative Pay Button status from BTCPay. */
export async function getPayButtonStatus(merchantStoreId: string): Promise<PayButtonState> {
  const id = merchantStoreId.trim();
  if (!id) {
    return { ok: false, error: 'No active store selected.', status: 'disabled', enabled: false };
  }

  if (isDevAuthActive()) {
    const store = getDevStores().find((s) => s.id === id) ?? null;
    const enabled = store?.pay_button_enabled === true;
    return { ok: true, error: null, status: enabled ? 'enabled' : 'disabled', enabled };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    pay_button_enabled?: boolean;
    status?: PayButtonStatus;
  }>('get-btcpay-pay-button-status', {
    method: 'POST',
    body: { merchantStoreId: id },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not load Pay Button status.');
    if (isProfileDebugEnabled) console.log('[btcpay] pay-button status error', message);
    return { ok: false, error: message, status: 'disabled', enabled: false };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not load Pay Button status.',
      status: 'disabled',
      enabled: false,
    };
  }
  const enabled = data.pay_button_enabled === true;
  return {
    ok: true,
    error: null,
    status: data.status ?? (enabled ? 'enabled' : 'disabled'),
    enabled,
  };
}

/**
 * Enables/disables the active store's Pay Button. Resolves only after the edge
 * function confirms BTCPay's authoritative state — the caller should re-render
 * from the returned `enabled`/`status` (or re-fetch), never assume success.
 */
export async function setPayButton(
  merchantStoreId: string,
  enabled: boolean,
): Promise<PayButtonState> {
  const id = merchantStoreId.trim();
  if (!id) {
    return { ok: false, error: 'No active store selected.', status: 'disabled', enabled: false };
  }

  if (isDevAuthActive()) {
    updateDevStore(id, {
      pay_button_enabled: enabled,
      pay_button_status: enabled ? 'enabled' : 'disabled',
      pay_button_last_synced_at: new Date().toISOString(),
      pay_button_error: null,
    });
    return { ok: true, error: null, status: enabled ? 'enabled' : 'disabled', enabled };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    pay_button_enabled?: boolean;
    status?: PayButtonStatus;
  }>('set-btcpay-pay-button', {
    method: 'POST',
    body: { merchantStoreId: id, enabled },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not update the Pay Button.');
    if (isProfileDebugEnabled) console.log('[btcpay] pay-button set error', message);
    return { ok: false, error: message, status: 'disabled', enabled: false };
  }
  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error ?? 'Could not update the Pay Button.',
      status: 'disabled',
      enabled: false,
    };
  }
  const confirmed = data.pay_button_enabled === true;
  return {
    ok: true,
    error: null,
    status: data.status ?? (confirmed ? 'enabled' : 'disabled'),
    enabled: confirmed,
  };
}

// ---------------------------------------------------------------------------
// Pay Button output generation
// ---------------------------------------------------------------------------

export type PayButtonGenType = 'fixed' | 'custom' | 'slider';
export type PayButtonOutputType = 'code' | 'link' | 'lnurl';

export interface GeneratePayButtonInput {
  merchantStoreId: string;
  buttonType: PayButtonGenType;
  /** Fixed amount only. */
  price?: string | null;
  /** Custom/slider only. */
  min?: string | null;
  max?: string | null;
  step?: string | null;
  currency?: string;
  checkoutDescription?: string | null;
  orderId?: string | null;
  outputType?: PayButtonOutputType;
}

export interface PayButtonOutput {
  ok: boolean;
  error: string | null;
  source: string | null;
  currency: string;
  price: string | null;
  min: string | null;
  max: string | null;
  step: string | null;
  checkoutDescription: string | null;
  orderId: string | null;
  buttonType: PayButtonGenType;
  htmlCode: string;
  linkUrl: string;
  lnurl: string | null;
  lightningAvailable: boolean;
  qrPayload: string;
  /** Honest notes about what the returned output can't reproduce (e.g. link mode
   * can't carry custom/slider min/max/step). Shown as a non-blocking note. */
  limitations: string[];
  generatedAt: string | null;
}

function emptyOutput(
  error: string,
  buttonType: PayButtonGenType,
  currency: string,
): PayButtonOutput {
  return {
    ok: false,
    error,
    source: null,
    currency,
    price: null,
    min: null,
    max: null,
    step: null,
    checkoutDescription: null,
    orderId: null,
    buttonType,
    htmlCode: '',
    linkUrl: '',
    lnurl: null,
    lightningAvailable: false,
    qrPayload: '',
    limitations: [],
    generatedAt: null,
  };
}

/**
 * Asks the backend to generate the Pay Button output (HTML snippet, Link, LNURL,
 * QR payload) for the active store. The output is derived server-side from
 * BTCPay-confirmed data — the client renders/copies/shares exactly what's
 * returned and never hand-builds payment output.
 */
export async function generatePayButtonOutput(
  input: GeneratePayButtonInput,
): Promise<PayButtonOutput> {
  const id = input.merchantStoreId.trim();
  const currency = (input.currency ?? '').trim().toUpperCase();
  if (!id) return emptyOutput('No active store selected.', input.buttonType, currency);

  if (isDevAuthActive()) {
    // Simulate a plausible BTCPay-derived output against the in-memory store.
    const store = getDevStores().find((s) => s.id === id) ?? null;
    if (!store) return emptyOutput('Store not found.', input.buttonType, currency);
    if (store.pay_button_enabled !== true) {
      return emptyOutput('Pay Button is not enabled for this store.', input.buttonType, currency);
    }
    const cur = currency || store.default_currency || 'USD';
    const bt = input.buttonType;

    // Validate per type (mirrors the edge function).
    let price: string | null = null;
    let minS: string | null = null;
    let maxS: string | null = null;
    let stepS: string | null = null;
    if (bt === 'fixed') {
      price = input.price?.trim() || null;
      if (!price) return emptyOutput('Price is required for fixed amount.', bt, cur);
      if (!/^\d+(\.\d+)?$/.test(price) || Number(price) <= 0) {
        return emptyOutput('Price must be greater than 0.', bt, cur);
      }
    } else {
      const mn = input.min?.trim() || '';
      const mx = input.max?.trim() || '';
      const st = input.step?.trim() || '';
      if (!mn) return emptyOutput('Min is required.', bt, cur);
      if (!mx) return emptyOutput('Max is required.', bt, cur);
      if (!st) return emptyOutput('Step is required.', bt, cur);
      const mnN = Number(mn);
      const mxN = Number(mx);
      const stN = Number(st);
      if (!(Number.isFinite(mnN) && mnN > 0)) return emptyOutput('Min must be greater than 0.', bt, cur);
      if (!(Number.isFinite(mxN) && mxN > mnN)) return emptyOutput('Max must be greater than Min.', bt, cur);
      if (!(Number.isFinite(stN) && stN > 0)) return emptyOutput('Step must be greater than 0.', bt, cur);
      minS = String(mnN);
      maxS = String(mxN);
      stepS = String(stN);
    }

    const root = 'https://btcpay.example.com';
    const sid = store.btcpay_store_id;
    const params = new URLSearchParams({ storeId: sid, currency: cur });
    if (price) params.set('price', price);
    if (input.orderId?.trim()) params.set('orderId', input.orderId.trim());
    const linkUrl = `${root}/api/v1/invoices?${params.toString()}`;
    const limitations: string[] =
      bt === 'fixed'
        ? []
        : [
            `BTCPay's public payment link can't carry ${
              bt === 'slider' ? 'slider' : 'custom amount'
            } min/max/step, so the Link and QR open an amount-selectable checkout. The generated HTML code includes the full ${
              bt === 'slider' ? 'slider' : 'custom amount'
            } behavior.`,
          ];
    // Simulated (non-real) HTML that varies by button type so the UI is testable.
    const amountMarkup =
      bt === 'fixed'
        ? (price ? `  <input type="hidden" name="price" value="${price}" />\n` : '') +
          `  <input type="hidden" name="currency" value="${cur}" />\n`
        : bt === 'custom'
          ? `  <input class="btcpay-input-price" type="number" name="price" min="${minS}" max="${maxS}" step="${stepS}" value="${minS}" />\n` +
            `  <select name="currency"><option>${cur}</option></select>\n`
          : `  <input class="btcpay-input-price" type="number" name="price" min="${minS}" max="${maxS}" step="${stepS}" value="${minS}" />\n` +
            `  <select name="currency"><option>${cur}</option></select>\n` +
            `  <input type="range" class="btcpay-input-range" min="${minS}" max="${maxS}" step="${stepS}" value="${minS}" />\n`;
    const html =
      `<form method="POST" action="${root}/api/v1/invoices" class="btcpay-form btcpay-form--block">\n` +
      `  <input type="hidden" name="storeId" value="${sid}" />\n` +
      amountMarkup +
      `  <input type="image" class="submit" name="submit" src="${root}/img/paybutton/pay.svg" style="width:209px" alt="Pay with Hachisu">\n` +
      `</form>`;
    return {
      ok: true,
      error: null,
      source: 'server-derived-from-btcpay',
      currency: cur,
      price,
      min: minS,
      max: maxS,
      step: stepS,
      checkoutDescription: input.checkoutDescription?.trim() || null,
      orderId: input.orderId?.trim() || null,
      buttonType: bt,
      htmlCode: html,
      linkUrl,
      lnurl: null,
      lightningAvailable: false,
      qrPayload: linkUrl,
      limitations,
      generatedAt: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    source?: string;
    currency?: string;
    price?: string | null;
    min?: string | null;
    max?: string | null;
    step?: string | null;
    checkoutDescription?: string | null;
    orderId?: string | null;
    buttonType?: PayButtonGenType;
    htmlCode?: string;
    linkUrl?: string;
    lnurl?: string | null;
    lightningAvailable?: boolean;
    qrPayload?: string;
    limitations?: string[];
    generatedAt?: string;
  }>('generate-btcpay-pay-button-output', {
    method: 'POST',
    body: {
      merchantStoreId: id,
      buttonType: input.buttonType,
      // Fixed sends price; custom/slider send min/max/step. Sending the others as
      // null is harmless — the server only reads the fields for the chosen type.
      price: input.price ?? null,
      min: input.min ?? null,
      max: input.max ?? null,
      step: input.step ?? null,
      currency: input.currency,
      checkoutDescription: input.checkoutDescription ?? null,
      orderId: input.orderId ?? null,
      outputType: input.outputType ?? 'link',
    },
  });

  if (error) {
    const message = await extractFunctionError(error, 'Could not generate Pay Button output.');
    if (isProfileDebugEnabled) console.log('[btcpay] pay-button generate error', message);
    return emptyOutput(message, input.buttonType, currency);
  }
  if (!data?.ok) {
    return emptyOutput(
      data?.error ?? 'Could not generate Pay Button output.',
      input.buttonType,
      currency,
    );
  }

  return {
    ok: true,
    error: null,
    source: data.source ?? 'server-derived-from-btcpay',
    currency: data.currency ?? currency,
    price: data.price ?? null,
    min: data.min ?? null,
    max: data.max ?? null,
    step: data.step ?? null,
    checkoutDescription: data.checkoutDescription ?? null,
    orderId: data.orderId ?? null,
    buttonType: data.buttonType ?? input.buttonType,
    htmlCode: data.htmlCode ?? '',
    linkUrl: data.linkUrl ?? '',
    lnurl: data.lnurl ?? null,
    lightningAvailable: data.lightningAvailable === true,
    qrPayload: data.qrPayload ?? data.linkUrl ?? '',
    limitations: Array.isArray(data.limitations) ? data.limitations : [],
    generatedAt: data.generatedAt ?? null,
  };
}
