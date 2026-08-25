// Client wrapper for merchant payment request creation + durable detail.
//
// The mobile app NEVER talks to BTCPay directly. It calls the
// create-btcpay-payment-request / get-btcpay-payment-request Edge Functions,
// which own the Greenfield calls, resolve the store's BTCPay id server-side,
// and return a normalized model. The app sends only Hachisu's internal
// merchantStoreId — never a btcpay_store_id, an API key, or payment state.
//
// Follows the same conventions as lib/btcpay/invoices.ts: supabase.functions
// .invoke, server-error extraction off error.context, a dev-bypass simulation,
// and a normalized result the screen renders directly.

import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive } from '@/lib/auth/dev-session';
import { getDevStores } from '@/lib/btcpay/dev-stores';
import { supabase } from '@/lib/supabase';

/** UI options for requesting customer data on the BTCPay checkout form. */
export type CustomerDataOption = 'none' | 'email' | 'shipping';

/** Normalized backend result codes. Kept in sync with the Edge Functions. */
export type PaymentRequestErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_ACCESS_DENIED'
  | 'STORE_NOT_PROVISIONED'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INVALID_BUYER_EMAIL'
  | 'INVALID_EXPIRATION'
  | 'INVALID_CUSTOMER_DATA_OPTION'
  | 'NO_PAYMENT_METHOD_AVAILABLE'
  | 'PAYMENT_METHOD_LOOKUP_FAILED'
  | 'BTCPAY_PAYMENT_REQUEST_CREATE_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'PAYMENT_REQUEST_CREATED_SYNC_FAILED'
  | 'PAYMENT_REQUEST_CREATE_IN_PROGRESS'
  | 'PAYMENT_REQUEST_NOT_FOUND'
  | 'BTCPAY_DETAIL_FETCH_FAILED'
  | 'BTCPAY_DETAIL_TIMEOUT'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

/** The normalized payment request the app renders. Never raw BTCPay JSON.
 * `status` is BTCPay's authoritative value: Pending | Processing | Completed |
 * Expired (never derived locally). */
export interface HachisuPaymentRequest {
  merchantStoreId: string;
  btcpayPaymentRequestId: string;
  status: string | null;
  /** True once the request has been archived in BTCPay. */
  archived: boolean;
  amount: string;
  currency: string;
  title: string;
  memo: string | null;
  referenceId: string | null;
  /** Metadata attached to payments of this request. Hachisu sends no email. */
  recipientEmail: string | null;
  /** Customers may choose the amount / partially pay against the requested amount. */
  allowCustomAmounts: boolean;
  customerDataOption: CustomerDataOption;
  createdAt: string;
  /** null = the request never expires. */
  expiresAt: string | null;
  /** The public BTCPay payment page. Built SERVER-side from the configured
   * BTCPay origin — never constructed on the client. */
  requestUrl: string | null;
}

export interface CreatePaymentRequestInput {
  merchantStoreId: string;
  /** One per user submission attempt. Reused verbatim on retry of that attempt. */
  idempotencyKey: string;
  title: string;
  /** Decimal string exactly as typed — never a JS number. */
  amount: string;
  currency: string;
  allowCustomAmounts: boolean;
  memo?: string | null;
  referenceId?: string | null;
  recipientEmail?: string | null;
  /** Whole hours until expiry, or null for a request that never expires. */
  expiresInHours?: number | null;
  customerDataOption: CustomerDataOption;
}

export type CreatePaymentRequestResult =
  | { ok: true; reused: boolean; paymentRequest: HachisuPaymentRequest }
  | {
      ok: false;
      code: PaymentRequestErrorCode;
      message: string;
      /** Present ONLY for PAYMENT_REQUEST_CREATED_SYNC_FAILED: the request DOES
       * exist in BTCPay, so the app must not invite the merchant to create
       * another. */
      paymentRequest?: HachisuPaymentRequest;
    };

export type GetPaymentRequestResult =
  | { ok: true; paymentRequest: HachisuPaymentRequest }
  | { ok: false; code: PaymentRequestErrorCode; message: string };

interface ResponseBody {
  ok?: boolean;
  reused?: boolean;
  code?: PaymentRequestErrorCode;
  error?: string;
  paymentRequest?: Partial<HachisuPaymentRequest> | null;
}

/** Generates one idempotency key per user submission attempt. */
export function newPaymentRequestIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  const rand = Math.random().toString(36).slice(2);
  return `pr-${Date.now().toString(36)}-${rand}${Math.random().toString(36).slice(2)}`;
}

/**
 * supabase-js throws FunctionsHttpError on any non-2xx and exposes only a
 * generic message. The real JSON body lives on error.context — pull it out so
 * the normalized code and the recovery payment request survive.
 */
async function readFunctionErrorBody(error: unknown): Promise<ResponseBody | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      return (await (ctx as Response).clone().json()) as ResponseBody;
    } catch {
      // Body wasn't JSON or was already consumed.
    }
  }
  return null;
}

function toPaymentRequest(
  raw: Partial<HachisuPaymentRequest> | null | undefined,
): HachisuPaymentRequest | null {
  if (!raw || typeof raw.btcpayPaymentRequestId !== 'string' || !raw.btcpayPaymentRequestId) {
    return null;
  }
  return {
    merchantStoreId: raw.merchantStoreId ?? '',
    btcpayPaymentRequestId: raw.btcpayPaymentRequestId,
    status: raw.status ?? null,
    archived: raw.archived === true,
    amount: raw.amount ?? '0',
    currency: raw.currency ?? '',
    title: raw.title ?? '',
    memo: raw.memo ?? null,
    referenceId: raw.referenceId ?? null,
    recipientEmail: raw.recipientEmail ?? null,
    allowCustomAmounts: raw.allowCustomAmounts === true,
    customerDataOption:
      raw.customerDataOption === 'email' || raw.customerDataOption === 'shipping'
        ? raw.customerDataOption
        : 'none',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    expiresAt: raw.expiresAt ?? null,
    requestUrl: raw.requestUrl ?? null,
  };
}

/**
 * Creates a real BTCPay payment request for the given store. Resolves only after
 * the backend has confirmed BTCPay created it — the app never optimistically
 * renders a request and never fabricates a status, an id, or a URL.
 */
export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
): Promise<CreatePaymentRequestResult> {
  const storeId = input.merchantStoreId.trim();
  if (!storeId) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'No active store selected.' };
  }

  if (isDevAuthActive()) {
    return simulateCreatePaymentRequest(input, storeId);
  }

  const { data, error } = await supabase.functions.invoke<ResponseBody>(
    'create-btcpay-payment-request',
    {
      method: 'POST',
      body: {
        merchantStoreId: storeId,
        idempotencyKey: input.idempotencyKey,
        title: input.title,
        amount: input.amount,
        currency: input.currency,
        allowCustomAmounts: input.allowCustomAmounts,
        memo: input.memo ?? null,
        referenceId: input.referenceId ?? null,
        recipientEmail: input.recipientEmail ?? null,
        expiresInHours: input.expiresInHours ?? null,
        customerDataOption: input.customerDataOption,
      },
    },
  );

  if (error) {
    const body = await readFunctionErrorBody(error);
    const code = body?.code ?? 'NETWORK_ERROR';
    const message = body?.error ?? messageForCode(code);
    if (isProfileDebugEnabled) console.log('[btcpay] create payment request error', code, message);
    const recovery = toPaymentRequest(body?.paymentRequest);
    return { ok: false, code, message, ...(recovery ? { paymentRequest: recovery } : {}) };
  }

  // A 207 (created-but-unsynced) resolves as a non-error response with ok:false.
  if (!data?.ok) {
    const code = data?.code ?? 'SERVER_ERROR';
    const recovery = toPaymentRequest(data?.paymentRequest);
    return {
      ok: false,
      code,
      message: data?.error ?? messageForCode(code),
      ...(recovery ? { paymentRequest: recovery } : {}),
    };
  }

  const paymentRequest = toPaymentRequest(data.paymentRequest);
  if (!paymentRequest) {
    return {
      ok: false,
      code: 'INVALID_BTCPAY_RESPONSE',
      message: 'The payment request response was incomplete. Check BTCPay before trying again.',
    };
  }
  return { ok: true, reused: data.reused === true, paymentRequest };
}

/**
 * Fetches ONE payment request by its durable ids. This is the recovery path the
 * detail screen relies on after a cold start, deep link, or cache loss.
 */
export async function getPaymentRequest(
  merchantStoreId: string,
  paymentRequestId: string,
): Promise<GetPaymentRequestResult> {
  const storeId = merchantStoreId.trim();
  const requestId = paymentRequestId.trim();
  if (!storeId || !requestId) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'This payment request link is incomplete.' };
  }

  if (isDevAuthActive()) {
    return { ok: false, code: 'PAYMENT_REQUEST_NOT_FOUND', message: 'Not available in dev mode.' };
  }

  const { data, error } = await supabase.functions.invoke<ResponseBody>(
    'get-btcpay-payment-request',
    {
      method: 'POST',
      body: { merchantStoreId: storeId, paymentRequestId: requestId },
    },
  );

  if (error) {
    const body = await readFunctionErrorBody(error);
    const code = body?.code ?? 'NETWORK_ERROR';
    return { ok: false, code, message: body?.error ?? messageForCode(code) };
  }
  if (!data?.ok) {
    const code = data?.code ?? 'SERVER_ERROR';
    return { ok: false, code, message: data?.error ?? messageForCode(code) };
  }
  const paymentRequest = toPaymentRequest(data.paymentRequest);
  if (!paymentRequest) {
    return {
      ok: false,
      code: 'INVALID_BTCPAY_RESPONSE',
      message: 'The payment request could not be loaded.',
    };
  }
  return { ok: true, paymentRequest };
}

/** Merchant-facing fallback copy when the backend sent no message. */
function messageForCode(code: PaymentRequestErrorCode): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Sign in again to continue.';
    case 'STORE_NOT_FOUND':
      return 'That store could not be found.';
    case 'STORE_ACCESS_DENIED':
      return 'You do not have access to this payment request.';
    case 'STORE_NOT_PROVISIONED':
      return 'This store is not connected to BTCPay yet.';
    case 'INVALID_AMOUNT':
      return 'Enter an amount greater than zero.';
    case 'INVALID_CURRENCY':
      return 'That currency is not supported.';
    case 'INVALID_BUYER_EMAIL':
      return 'Enter a valid recipient email.';
    case 'INVALID_EXPIRATION':
      return 'Select a valid expiration.';
    case 'NO_PAYMENT_METHOD_AVAILABLE':
      return 'Set up a Bitcoin payment method before creating a payment request.';
    case 'PAYMENT_METHOD_LOOKUP_FAILED':
    case 'BTCPAY_PAYMENT_REQUEST_CREATE_FAILED':
      return 'Payment request could not be created right now. Try again.';
    case 'PAYMENT_REQUEST_CREATE_IN_PROGRESS':
      return 'This payment request is already being created.';
    case 'PAYMENT_REQUEST_CREATED_SYNC_FAILED':
      return (
        'The payment request was created, but Hachisu could not finish syncing it. ' +
        'Do not create another payment request yet.'
      );
    case 'PAYMENT_REQUEST_NOT_FOUND':
      return 'This payment request could not be found.';
    case 'BTCPAY_DETAIL_TIMEOUT':
      return 'BTCPay took too long to respond. Try again.';
    case 'BTCPAY_DETAIL_FETCH_FAILED':
      return 'Could not load the payment request. Try again.';
    case 'NETWORK_ERROR':
      return 'Could not reach Hachisu. Check your connection and try again.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/**
 * Dev-bypass simulation. There is no BTCPay in dev-bypass mode, so this returns
 * a plausible pending payment request for UI work. It mirrors the real
 * validation ordering and never reports a paid status or fabricates a real URL.
 */
function simulateCreatePaymentRequest(
  input: CreatePaymentRequestInput,
  storeId: string,
): CreatePaymentRequestResult {
  const store = getDevStores().find((s) => s.id === storeId) ?? null;
  if (!store) return { ok: false, code: 'STORE_NOT_FOUND', message: 'Store not found.' };

  if (!input.title.trim()) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Title is required.' };
  }
  const amount = input.amount.trim();
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Enter an amount greater than zero.' };
  }

  const now = new Date();
  return {
    ok: true,
    reused: false,
    paymentRequest: {
      merchantStoreId: storeId,
      btcpayPaymentRequestId: `dev-${input.idempotencyKey.slice(0, 12)}`,
      status: 'Pending',
      archived: false,
      amount,
      currency: input.currency || store.default_currency || 'USD',
      title: input.title.trim(),
      memo: input.memo?.trim() || null,
      referenceId: input.referenceId?.trim() || null,
      recipientEmail: input.recipientEmail?.trim() || null,
      allowCustomAmounts: input.allowCustomAmounts,
      customerDataOption: input.customerDataOption,
      createdAt: now.toISOString(),
      expiresAt:
        input.expiresInHours != null
          ? new Date(now.getTime() + input.expiresInHours * 3_600_000).toISOString()
          : null,
      requestUrl: null,
    },
  };
}
