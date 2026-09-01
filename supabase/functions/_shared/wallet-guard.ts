// Authoritative wallet-integrity guard (shared, server-side).
//
// THE INVARIANT
// -------------
// A Hachisu merchant with no valid, ENABLED BTCPay on-chain wallet must not be
// able to create, enable, retrieve, or expose ANY Bitcoin payment surface —
// invoices, payment requests, POS apps and their runtime URL, or the Pay Button
// and its generated output. This module is the single place that decides "does
// this store have a payable on-chain wallet?", so every one of those surfaces
// enforces the SAME rule instead of re-deriving a weaker one.
//
// SOURCE OF TRUTH
// ---------------
// The answer is read from BTCPay's live payment-method state via
// getOnChainWallet() — NOT from user_profiles.wallet_connected,
// merchant_stores.onchain_status, or any other cached Supabase field. Those
// cached fields exist for responsive UX only and can be stale or forged; they
// are never the security boundary. A wallet counts only when BTCPay reports a
// derivation scheme that is BOTH configured AND enabled — a disabled scheme
// cannot derive a payable address.
//
// FAIL CLOSED
// -----------
// If BTCPay is unreachable or answers in a way that leaves wallet state
// undeterminable, the guard returns WALLET_STATE_UNKNOWN (502) and the caller
// must refuse. "Could not tell" is never treated as "wallet present" and never
// as a silent success — see getOnChainWallet(), which maps only a genuine 404
// (no scheme on any on-chain payment-method id) to not-configured and rethrows
// every other failure to this catch.

import { getOnChainWallet, type BtcpayConfig } from './btcpay-client.ts';

/** Merchant-facing copy for the normal "no wallet yet" state. Deliberately does
 * not leak any BTCPay internals. */
export const WALLET_NOT_CONNECTED_MESSAGE = 'Connect your Bitcoin wallet to accept payments.';

/** Message when wallet state cannot be determined (BTCPay unavailable / bad
 * response). Distinct from the unconfigured state so the client can offer retry
 * rather than "go connect a wallet". */
export const WALLET_STATE_UNKNOWN_MESSAGE =
  'Could not verify this store’s Bitcoin wallet right now. Please try again.';

export type WalletGuardResult =
  | { ok: true }
  | {
      ok: false;
      /** WALLET_NOT_CONNECTED = authoritative "no usable on-chain wallet".
       *  WALLET_STATE_UNKNOWN = could not determine (fail closed). */
      code: 'WALLET_NOT_CONNECTED' | 'WALLET_STATE_UNKNOWN';
      /** HTTP status the caller should return: 409 (not connected) / 502 (unknown). */
      status: 409 | 502;
      /** Why the store failed the check (for logs; not necessarily shown to users). */
      reason: 'not_configured' | 'disabled' | 'lookup_failed';
      /** Merchant-facing message. */
      error: string;
    };

/**
 * Verifies that `btcpayStoreId` (which the caller MUST have resolved from the
 * authenticated user's owned merchant_stores row — never a client-supplied id)
 * has a configured AND enabled BTCPay on-chain wallet.
 *
 * Returns { ok: true } only when BTCPay authoritatively reports both. Any other
 * outcome is a typed failure the caller returns verbatim; a lookup failure fails
 * closed. This function never mutates BTCPay or Supabase state.
 */
export async function assertStoreHasOnchainWallet(
  config: BtcpayConfig,
  btcpayStoreId: string,
): Promise<WalletGuardResult> {
  let state;
  try {
    state = await getOnChainWallet(config, btcpayStoreId);
  } catch (_err) {
    // FAIL CLOSED. getOnChainWallet already resolves a genuine "no wallet" (404
    // on every on-chain payment-method id) to { configured: false } WITHOUT
    // throwing, so reaching here means BTCPay was unreachable or answered
    // unexpectedly — state is unknown, and unknown must never unlock a surface.
    return {
      ok: false,
      code: 'WALLET_STATE_UNKNOWN',
      status: 502,
      reason: 'lookup_failed',
      error: WALLET_STATE_UNKNOWN_MESSAGE,
    };
  }

  if (!state.configured) {
    return {
      ok: false,
      code: 'WALLET_NOT_CONNECTED',
      status: 409,
      reason: 'not_configured',
      error: WALLET_NOT_CONNECTED_MESSAGE,
    };
  }
  if (!state.enabled) {
    // A configured-but-disabled scheme cannot derive a payable address, so it is
    // treated exactly like no wallet for the purpose of exposing a surface.
    return {
      ok: false,
      code: 'WALLET_NOT_CONNECTED',
      status: 409,
      reason: 'disabled',
      error: WALLET_NOT_CONNECTED_MESSAGE,
    };
  }

  return { ok: true };
}
