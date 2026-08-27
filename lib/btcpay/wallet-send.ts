// Client wrapper for the on-chain Bitcoin SEND flow.
//
// The mobile app NEVER talks to BTCPay directly and never holds keys or
// credentials — it calls three edge functions with the internal
// merchantStoreId; the server re-verifies ownership + wallet state on every
// call:
//   * get-btcpay-onchain-send-fees   -> real sat/vB for Fast/Standard/Economy
//   * create-btcpay-onchain-send     -> BTCPay builds an UNSIGNED PSBT and
//                                       returns the authoritative fee/totals
//   * broadcast-btcpay-onchain-send  -> submits the merchant-SIGNED payload;
//                                       success comes only from BTCPay
//
// Signing happens in the merchant's own external wallet between the last two
// calls — Hachisu is non-custodial and never sees a private key.

import { isDevAuthActive } from '@/lib/auth/dev-session';
import { getDevStores } from '@/lib/btcpay/dev-stores';
import { supabase } from '@/lib/supabase';

export type SendSpeed = 'fast' | 'standard' | 'economy';

export type WalletSendErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'STORE_ACCESS_DENIED'
  | 'WALLET_NOT_CONNECTED'
  | 'WALLET_DISABLED'
  | 'INVALID_DESTINATION'
  | 'INVALID_AMOUNT'
  | 'FEE_ESTIMATE_UNAVAILABLE'
  | 'INSUFFICIENT_FUNDS'
  | 'PSBT_CREATE_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'SEND_RECORD_FAILED'
  | 'WALLET_BUSY'
  | 'SEND_NOT_FOUND'
  | 'SEND_NOT_READY'
  | 'SEND_PREPARE_IN_PROGRESS'
  | 'SEND_IN_PROGRESS'
  | 'SEND_ALREADY_FAILED'
  | 'SEND_RECONCILE_REQUIRED'
  | 'INVALID_SIGNED_TRANSACTION'
  | 'SIGNED_TRANSACTION_MISMATCH'
  | 'BROADCAST_FAILED'
  | 'SERVER_NOT_CONFIGURED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface SendFeeOption {
  speed: SendSpeed;
  blockTarget: number;
  feeRateSatPerVb: number;
}

export interface PreparedSend {
  sendId: string;
  status: string;
  destination: string;
  /** What the destination receives, integer sats (post-fee for a MAX send). */
  amountSats: number;
  feeSats: number;
  /** Total wallet debit = amount + fee, integer sats. */
  totalSats: number;
  speed: SendSpeed;
  feeRateSatPerVb: number;
  subtractFee: boolean;
  /**
   * The UNSIGNED PSBT (base64) the merchant signs in their own wallet.
   * Non-null only on the response that actually built it — the backend never
   * persists the PSBT, so an idempotent replay returns null and the caller
   * must start a fresh attempt (a lost PSBT is inert; nothing was reserved).
   */
  psbt: string | null;
}

export interface BroadcastedSend {
  sendId: string;
  txid: string | null;
  destination: string;
  amountSats: number;
  feeSats: number;
  totalSats: number;
  /** Broadcast succeeded but Hachisu's record didn't sync; still SENT. */
  syncWarning: boolean;
}

export type WalletSendResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: WalletSendErrorCode; error: string };

/** Generates one idempotency key per prepare attempt. */
export function newSendIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  const rand = Math.random().toString(36).slice(2);
  return `send-${Date.now().toString(36)}-${rand}${Math.random().toString(36).slice(2)}`;
}

/**
 * supabase-js throws on any non-2xx and hides the JSON body behind a generic
 * message. Our functions return { ok:false, code, error } — pull the real
 * code/error off error.context (the raw Response).
 */
async function extractFunctionError(
  error: unknown,
  fallback: string,
): Promise<{ code: WalletSendErrorCode; message: string }> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).clone === 'function') {
    try {
      const bodyText = await (ctx as Response).clone().text();
      const body = bodyText
        ? (JSON.parse(bodyText) as { code?: string; error?: string })
        : null;
      if (body) {
        return {
          code: (body.code as WalletSendErrorCode) ?? 'UNKNOWN',
          message: body.error || fallback,
        };
      }
    } catch {
      // Body wasn't JSON or already consumed — fall through.
    }
  }
  const message = (error as { message?: string })?.message;
  return { code: 'NETWORK_ERROR', message: message || fallback };
}

function devStoreGate(merchantStoreId: string): { code: WalletSendErrorCode; error: string } | null {
  const store = getDevStores().find((s) => s.id === merchantStoreId) ?? null;
  if (!store) return { code: 'STORE_ACCESS_DENIED', error: 'Store not found.' };
  if (store.onchain_status !== 'connected') {
    return { code: 'WALLET_NOT_CONNECTED', error: 'No Bitcoin wallet is connected for this store.' };
  }
  if (store.onchain_enabled === false) {
    return { code: 'WALLET_DISABLED', error: 'The Bitcoin wallet is disabled for this store.' };
  }
  return null;
}

/** Fetches real fee-rate options for the three network speeds. */
export async function fetchSendFeeOptions(
  merchantStoreId: string,
): Promise<WalletSendResult<SendFeeOption[]>> {
  const id = merchantStoreId.trim();

  if (isDevAuthActive()) {
    const gate = devStoreGate(id);
    if (gate) return { ok: false, ...gate };
    // Dev fixture, mirrors the server's speed->blockTarget mapping.
    return {
      ok: true,
      value: [
        { speed: 'fast', blockTarget: 1, feeRateSatPerVb: 3.2 },
        { speed: 'standard', blockTarget: 6, feeRateSatPerVb: 2.1 },
        { speed: 'economy', blockTarget: 72, feeRateSatPerVb: 1.1 },
      ],
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    code?: string;
    error?: string;
    options?: SendFeeOption[];
  }>('get-btcpay-onchain-send-fees', {
    method: 'POST',
    body: { merchantStoreId: id },
  });

  const fallback = 'Network fee estimates are unavailable right now.';
  if (error) {
    const { code, message } = await extractFunctionError(error, fallback);
    return { ok: false, code, error: message };
  }
  if (!data?.ok || !Array.isArray(data.options) || data.options.length === 0) {
    return {
      ok: false,
      code: (data?.code as WalletSendErrorCode) ?? 'UNKNOWN',
      error: data?.error ?? fallback,
    };
  }
  return { ok: true, value: data.options };
}

export interface CreateSendInput {
  merchantStoreId: string;
  idempotencyKey: string;
  destination: string;
  amountSats: number;
  speed: SendSpeed;
  /** 'exact' sends amountSats; 'max' empties the wallet (fee comes out of it). */
  mode: 'exact' | 'max';
}

/** Asks the backend to build the unsigned PSBT + authoritative fee/totals. */
export async function createOnchainSend(
  input: CreateSendInput,
): Promise<WalletSendResult<PreparedSend>> {
  if (isDevAuthActive()) {
    const gate = devStoreGate(input.merchantStoreId.trim());
    if (gate) return { ok: false, ...gate };
    // Dev fixture: a plausible fee; the PSBT is a clearly-fake marker so the
    // signing screen is exercisable without a backend. Broadcast in dev mode
    // NEVER reports success (see broadcastOnchainSend).
    const feeSats = 350;
    const amountSats =
      input.mode === 'max' ? input.amountSats - feeSats : input.amountSats;
    return {
      ok: true,
      value: {
        sendId: `dev-send-${input.idempotencyKey.slice(0, 8)}`,
        status: 'awaiting_signature',
        destination: input.destination,
        amountSats,
        feeSats,
        totalSats: amountSats + feeSats,
        speed: input.speed,
        feeRateSatPerVb: 2.1,
        subtractFee: input.mode === 'max',
        psbt: 'cHNidP8BADev-fixture-not-a-real-psbt',
      },
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    code?: string;
    error?: string;
    send?: PreparedSend;
  }>('create-btcpay-onchain-send', {
    method: 'POST',
    body: {
      merchantStoreId: input.merchantStoreId.trim(),
      idempotencyKey: input.idempotencyKey,
      destination: input.destination,
      amountSats: input.amountSats,
      speed: input.speed,
      mode: input.mode,
    },
  });

  const fallback = 'The transaction could not be prepared right now.';
  if (error) {
    const { code, message } = await extractFunctionError(error, fallback);
    return { ok: false, code, error: message };
  }
  if (!data?.ok || !data.send) {
    return {
      ok: false,
      code: (data?.code as WalletSendErrorCode) ?? 'UNKNOWN',
      error: data?.error ?? fallback,
    };
  }
  return { ok: true, value: data.send };
}

export interface BroadcastSendInput {
  merchantStoreId: string;
  sendId: string;
  /** Signed PSBT (base64) or raw signed transaction hex from the wallet. */
  signedTransaction: string;
}

/** Submits the merchant-signed transaction for verification + broadcast. */
export async function broadcastOnchainSend(
  input: BroadcastSendInput,
): Promise<WalletSendResult<BroadcastedSend>> {
  if (isDevAuthActive()) {
    // A dev-bypass session has no BTCPay and no network: a send can never
    // actually happen, so it must never be reported as sent.
    return {
      ok: false,
      code: 'BROADCAST_FAILED',
      error: 'Broadcasting is not available in dev mode — no transaction was sent.',
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    code?: string;
    error?: string;
    sendId?: string;
    txid?: string | null;
    destination?: string;
    amountSats?: number;
    feeSats?: number;
    totalSats?: number;
    syncWarning?: boolean;
  }>('broadcast-btcpay-onchain-send', {
    method: 'POST',
    body: {
      merchantStoreId: input.merchantStoreId.trim(),
      sendId: input.sendId,
      signedTransaction: input.signedTransaction,
    },
  });

  const fallback = 'The network broadcast failed. Nothing was sent.';
  if (error) {
    const { code, message } = await extractFunctionError(error, fallback);
    return { ok: false, code, error: message };
  }
  if (!data?.ok) {
    return {
      ok: false,
      code: (data?.code as WalletSendErrorCode) ?? 'UNKNOWN',
      error: data?.error ?? fallback,
    };
  }
  return {
    ok: true,
    value: {
      sendId: data.sendId ?? input.sendId,
      txid: data.txid ?? null,
      destination: data.destination ?? '',
      amountSats: data.amountSats ?? 0,
      feeSats: data.feeSats ?? 0,
      totalSats: data.totalSats ?? 0,
      syncWarning: data.syncWarning === true,
    },
  };
}
