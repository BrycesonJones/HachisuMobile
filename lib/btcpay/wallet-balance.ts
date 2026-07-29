// Client wrapper for the store-scoped on-chain (Bitcoin) wallet balance.
//
// The mobile app NEVER talks to BTCPay directly and never sends a
// btcpay_store_id — it calls the get-btcpay-onchain-wallet-balance Edge
// Function with the internal merchantStoreId; the server resolves ownership and
// the real BTCPay store id. Dev-bypass mode simulates a small balance for the
// in-memory dev store registry.

import { isDevAuthActive } from '@/lib/auth/dev-session';
import { getDevStores } from '@/lib/btcpay/dev-stores';
import { supabase } from '@/lib/supabase';

/** Error codes the backend returns; the UI branches on these. */
export type BalanceErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'STORE_NOT_FOUND'
  | 'STORE_ACCESS_DENIED'
  | 'WALLET_NOT_CONNECTED'
  | 'WALLET_DISABLED'
  | 'BTCPAY_BALANCE_FETCH_FAILED'
  | 'INVALID_BTCPAY_RESPONSE'
  | 'RATE_FETCH_FAILED'
  | 'SERVER_NOT_CONFIGURED'
  | 'UNKNOWN';

export interface OnchainWalletBalance {
  /** Confirmed spendable balance in integer satoshis (the primary balance). */
  confirmedSats: number;
  /** Unconfirmed (mempool) balance in integer satoshis. */
  unconfirmedSats: number;
  /** Total = confirmed + unconfirmed, in integer satoshis. */
  totalSats: number;
  confirmedBtc: string;
  unconfirmedBtc: string;
  totalBtc: string;
  /** The store's configured currency, e.g. "USD". */
  currency: string;
  /** BTC->currency rate as a decimal string, or null when it couldn't be fetched. */
  rate: string | null;
  /** Set when the balance succeeded but the fiat rate did not. */
  rateError: 'RATE_FETCH_FAILED' | null;
}

export interface FetchBalanceResult {
  ok: boolean;
  code: BalanceErrorCode | 'OK';
  error: string | null;
  balance: OnchainWalletBalance | null;
}

interface RawBalanceResponse {
  ok?: boolean;
  code?: string;
  error?: string;
  confirmedSats?: number;
  unconfirmedSats?: number;
  totalSats?: number;
  confirmedBtc?: string;
  unconfirmedBtc?: string;
  totalBtc?: string;
  currency?: string;
  rate?: string | null;
  rateError?: 'RATE_FETCH_FAILED' | null;
}

/**
 * supabase-js throws on any non-2xx and hides the JSON body behind a generic
 * message. Our function returns { ok:false, code, error } with a meaningful HTTP
 * status, so pull the real code/error off error.context (the raw Response).
 */
async function extractFunctionError(
  error: unknown,
): Promise<{ code: BalanceErrorCode; message: string }> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).clone === 'function') {
    try {
      const bodyText = await (ctx as Response).clone().text();
      const body = bodyText ? (JSON.parse(bodyText) as RawBalanceResponse) : null;
      if (body) {
        return {
          code: (body.code as BalanceErrorCode) ?? 'UNKNOWN',
          message: body.error || 'Could not load the balance.',
        };
      }
    } catch {
      // Body wasn't JSON or already consumed — fall through.
    }
  }
  const message = (error as { message?: string })?.message;
  return { code: 'UNKNOWN', message: message || 'Could not load the balance.' };
}

function toBalance(data: RawBalanceResponse): OnchainWalletBalance {
  return {
    confirmedSats: data.confirmedSats ?? 0,
    unconfirmedSats: data.unconfirmedSats ?? 0,
    totalSats: data.totalSats ?? (data.confirmedSats ?? 0) + (data.unconfirmedSats ?? 0),
    confirmedBtc: data.confirmedBtc ?? '0.00000000',
    unconfirmedBtc: data.unconfirmedBtc ?? '0.00000000',
    totalBtc: data.totalBtc ?? '0.00000000',
    currency: data.currency ?? 'USD',
    rate: data.rate ?? null,
    rateError: data.rateError ?? null,
  };
}

/**
 * Fetches the active store's on-chain wallet balance. Callers should only invoke
 * this when the store's wallet is connected AND enabled — the backend enforces
 * the same gate and returns WALLET_NOT_CONNECTED / WALLET_DISABLED otherwise.
 */
export async function fetchOnchainWalletBalance(
  merchantStoreId: string,
): Promise<FetchBalanceResult> {
  const id = merchantStoreId.trim();

  if (isDevAuthActive()) {
    // Simulate a small confirmed balance for a connected+enabled dev store so the
    // dashboard shows realistic values without a BTCPay backend.
    const store = getDevStores().find((s) => s.id === id) ?? null;
    const connected = store?.onchain_status === 'connected';
    const enabled = connected ? store?.onchain_enabled !== false : false;
    if (!store) {
      return { ok: false, code: 'STORE_NOT_FOUND', error: 'Store not found.', balance: null };
    }
    if (!connected) {
      return {
        ok: false,
        code: 'WALLET_NOT_CONNECTED',
        error: 'No Bitcoin wallet is connected for this store.',
        balance: null,
      };
    }
    if (!enabled) {
      return {
        ok: false,
        code: 'WALLET_DISABLED',
        error: 'The Bitcoin wallet is disabled for this store.',
        balance: null,
      };
    }
    const confirmedSats = 125_000; // 0.00125 BTC
    return {
      ok: true,
      code: 'OK',
      error: null,
      balance: {
        confirmedSats,
        unconfirmedSats: 0,
        totalSats: confirmedSats,
        confirmedBtc: '0.00125000',
        unconfirmedBtc: '0.00000000',
        totalBtc: '0.00125000',
        currency: store.default_currency || 'USD',
        rate: '65000.00',
        rateError: null,
      },
    };
  }

  const { data, error } = await supabase.functions.invoke<RawBalanceResponse>(
    'get-btcpay-onchain-wallet-balance',
    { method: 'POST', body: { merchantStoreId: id } },
  );

  if (error) {
    const { code, message } = await extractFunctionError(error);
    return { ok: false, code, error: message, balance: null };
  }
  if (!data?.ok) {
    return {
      ok: false,
      code: (data?.code as BalanceErrorCode) ?? 'UNKNOWN',
      error: data?.error ?? 'Could not load the balance.',
      balance: null,
    };
  }

  return { ok: true, code: 'OK', error: null, balance: toBalance(data) };
}
