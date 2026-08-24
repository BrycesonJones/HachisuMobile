// Client wrapper for merchant invoice creation.
//
// The mobile app NEVER talks to BTCPay directly. It calls the
// create-btcpay-invoice Edge Function, which owns the Greenfield call, resolves
// the store's BTCPay id server-side, and returns a normalized invoice. The app
// sends only Hachisu's internal merchantStoreId — never a btcpay_store_id, an
// API key, a wallet descriptor, or an invoice status.
//
// Follows the same conventions as lib/btcpay/pay-button.ts: supabase.functions
// .invoke, server-error extraction off error.context, a dev-bypass simulation,
// and a normalized result the screen renders directly.

import { isProfileDebugEnabled } from '@/lib/auth/config';
import { isDevAuthActive } from '@/lib/auth/dev-session';
import { getDevStores } from '@/lib/btcpay/dev-stores';
import { supabase } from '@/lib/supabase';

/** Rails the merchant can select on the Create Invoice screen. */
export type InvoicePaymentRail = 'onchain' | 'lightning';

/** Normalized backend result codes. Kept in sync with the Edge Function. */
export type CreateInvoiceErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_NOT_PROVISIONED'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INVALID_BUYER_EMAIL'
  | 'INVALID_EXPIRATION'
  | 'NO_PAYMENT_METHOD_AVAILABLE'
  | 'PAYMENT_METHOD_LOOKUP_FAILED'
  | 'BTCPAY_INVOICE_CREATE_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'INVOICE_CREATED_SYNC_FAILED'
  | 'INVOICE_CREATE_IN_PROGRESS'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

/** The normalized invoice the app renders. Never raw BTCPay JSON. */
export interface CreatedInvoice {
  merchantStoreId: string;
  btcpayInvoiceId: string;
  /** BTCPay's authoritative status (e.g. "New"). Never derived locally. */
  status: string | null;
  amount: string;
  currency: string;
  description: string | null;
  orderId: string | null;
  createdAt: string;
  expiresAt: string | null;
  /** BTCPay's authoritative checkout URL — origin-checked server-side. Never
   * constructed on the client from a hostname + invoice id. */
  checkoutUrl: string | null;
  paymentMethodsAvailable: InvoicePaymentRail[];
}

export interface CreateInvoiceInput {
  merchantStoreId: string;
  /** One per user submission attempt. Reused verbatim on retry of that attempt. */
  idempotencyKey: string;
  /** Decimal string exactly as typed — never a JS number. */
  amount: string;
  currency: string;
  description?: string | null;
  orderId?: string | null;
  buyerEmail?: string | null;
  paymentRails: InvoicePaymentRail[];
  /** Optional; the Create Invoice screen has no expiration control today, so it
   * is omitted and BTCPay's store default governs. */
  expirationMinutes?: number | null;
}

export type CreateInvoiceResult =
  | { ok: true; reused: boolean; invoice: CreatedInvoice }
  | {
      ok: false;
      code: CreateInvoiceErrorCode;
      message: string;
      /** Present ONLY for INVOICE_CREATED_SYNC_FAILED: the invoice DOES exist in
       * BTCPay, so the app must not invite the merchant to create another. */
      invoice?: CreatedInvoice;
    };

interface CreateInvoiceResponseBody {
  ok?: boolean;
  reused?: boolean;
  code?: CreateInvoiceErrorCode;
  error?: string;
  invoice?: Partial<CreatedInvoice> | null;
}

/** Generates one idempotency key per user submission attempt. */
export function newInvoiceIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  // Fallback for runtimes without randomUUID: still unique enough to scope one
  // attempt, and the server's unique index is the real guarantee either way.
  const rand = Math.random().toString(36).slice(2);
  return `inv-${Date.now().toString(36)}-${rand}${Math.random().toString(36).slice(2)}`;
}

/**
 * supabase-js throws FunctionsHttpError on any non-2xx and exposes only a generic
 * message. The real JSON body ({ code, error, invoice }) lives on error.context —
 * pull it out so the normalized code and the recovery invoice survive.
 */
async function readFunctionErrorBody(
  error: unknown,
): Promise<CreateInvoiceResponseBody | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      return (await (ctx as Response).clone().json()) as CreateInvoiceResponseBody;
    } catch {
      // Body wasn't JSON or was already consumed.
    }
  }
  return null;
}

function toInvoice(raw: Partial<CreatedInvoice> | null | undefined): CreatedInvoice | null {
  if (!raw || typeof raw.btcpayInvoiceId !== 'string' || !raw.btcpayInvoiceId) return null;
  return {
    merchantStoreId: raw.merchantStoreId ?? '',
    btcpayInvoiceId: raw.btcpayInvoiceId,
    status: raw.status ?? null,
    amount: raw.amount ?? '0',
    currency: raw.currency ?? '',
    description: raw.description ?? null,
    orderId: raw.orderId ?? null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    expiresAt: raw.expiresAt ?? null,
    checkoutUrl: raw.checkoutUrl ?? null,
    paymentMethodsAvailable: Array.isArray(raw.paymentMethodsAvailable)
      ? raw.paymentMethodsAvailable.filter(
          (r): r is InvoicePaymentRail => r === 'onchain' || r === 'lightning',
        )
      : [],
  };
}

/**
 * Creates a real BTCPay invoice for the given store. Resolves only after the
 * backend has confirmed BTCPay created it — the app never optimistically renders
 * an invoice, and never fabricates a status or an invoice id.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const storeId = input.merchantStoreId.trim();
  if (!storeId) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'No active store selected.' };
  }
  if (input.paymentRails.length === 0) {
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Select at least one transaction currency.',
    };
  }

  if (isDevAuthActive()) {
    return simulateCreateInvoice(input, storeId);
  }

  const { data, error } = await supabase.functions.invoke<CreateInvoiceResponseBody>(
    'create-btcpay-invoice',
    {
      method: 'POST',
      body: {
        merchantStoreId: storeId,
        idempotencyKey: input.idempotencyKey,
        amount: input.amount,
        currency: input.currency,
        description: input.description ?? null,
        orderId: input.orderId ?? null,
        buyerEmail: input.buyerEmail ?? null,
        paymentRails: input.paymentRails,
        expirationMinutes: input.expirationMinutes ?? null,
      },
    },
  );

  if (error) {
    const body = await readFunctionErrorBody(error);
    const code = body?.code ?? 'NETWORK_ERROR';
    const message = body?.error ?? messageForCode(code);
    if (isProfileDebugEnabled) console.log('[btcpay] create invoice error', code, message);
    const recovery = toInvoice(body?.invoice);
    return { ok: false, code, message, ...(recovery ? { invoice: recovery } : {}) };
  }

  // A 207 (created-but-unsynced) resolves as a non-error response with ok:false.
  if (!data?.ok) {
    const code = data?.code ?? 'SERVER_ERROR';
    const recovery = toInvoice(data?.invoice);
    return {
      ok: false,
      code,
      message: data?.error ?? messageForCode(code),
      ...(recovery ? { invoice: recovery } : {}),
    };
  }

  const invoice = toInvoice(data.invoice);
  if (!invoice) {
    return {
      ok: false,
      code: 'INVALID_BTCPAY_RESPONSE',
      message: 'The invoice response was incomplete. Check Activity before trying again.',
    };
  }
  return { ok: true, reused: data.reused === true, invoice };
}

/** Merchant-facing fallback copy when the backend sent no message. */
function messageForCode(code: CreateInvoiceErrorCode): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Sign in again to create an invoice.';
    case 'STORE_NOT_FOUND':
      return 'That store could not be found.';
    case 'STORE_NOT_PROVISIONED':
      return 'This store is not connected to BTCPay yet.';
    case 'INVALID_AMOUNT':
      return 'Enter an amount greater than zero.';
    case 'INVALID_CURRENCY':
      return 'That currency is not supported.';
    case 'INVALID_BUYER_EMAIL':
      return 'Enter a valid buyer email.';
    case 'NO_PAYMENT_METHOD_AVAILABLE':
      return 'Set up a Bitcoin payment method before creating an invoice.';
    case 'PAYMENT_METHOD_LOOKUP_FAILED':
    case 'BTCPAY_INVOICE_CREATE_FAILED':
      return 'Invoice could not be created right now. Try again.';
    case 'INVOICE_CREATE_IN_PROGRESS':
      return 'This invoice is already being created.';
    case 'INVOICE_CREATED_SYNC_FAILED':
      return (
        'The invoice was created, but Hachisu could not finish syncing it. ' +
        'Do not create another invoice yet.'
      );
    case 'NETWORK_ERROR':
      return 'Could not reach Hachisu. Check your connection and try again.';
    default:
      return 'Invoice could not be created right now. Try again.';
  }
}

/**
 * Dev-bypass simulation. There is no BTCPay in dev-bypass mode, so this returns a
 * plausible unpaid invoice for UI work. It deliberately mirrors the real
 * validation ordering so the screen's error handling is testable, and it never
 * reports a paid status.
 */
function simulateCreateInvoice(
  input: CreateInvoiceInput,
  storeId: string,
): CreateInvoiceResult {
  const store = getDevStores().find((s) => s.id === storeId) ?? null;
  if (!store) return { ok: false, code: 'STORE_NOT_FOUND', message: 'Store not found.' };

  const amount = input.amount.trim();
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Enter an amount greater than zero.' };
  }

  const now = new Date();
  return {
    ok: true,
    reused: false,
    invoice: {
      merchantStoreId: storeId,
      btcpayInvoiceId: `dev-${input.idempotencyKey.slice(0, 12)}`,
      status: 'New',
      amount,
      currency: input.currency || store.default_currency || 'USD',
      description: input.description?.trim() || null,
      orderId: input.orderId?.trim() || null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      checkoutUrl: null,
      paymentMethodsAvailable: input.paymentRails,
    },
  };
}
