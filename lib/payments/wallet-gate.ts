// Shared, framework-free logic for the "walletless payment feature" UX gate.
//
// One place decides three things for every Bitcoin payment feature (POS,
// Invoices, Payment Requests, Pay Button):
//   1. whether the active store is wallet-ready (cached, UX only);
//   2. the wallet-required copy to show;
//   3. the ONE canonical navigation target for the "Connect wallet" CTA.
//
// This module imports nothing from the app (no '@/' aliases, no React, no
// expo-router), so it is unit-testable under `node --test` and cannot drift from
// the screens that consume it. The server-side BTCPay guard remains the
// authoritative boundary — see supabase/functions/_shared/wallet-guard.ts. This
// is strictly presentation/navigation.

/** The four Bitcoin payment features that must gate identically when walletless. */
export type PaymentFeature = 'pos' | 'invoices' | 'requests' | 'pay-button';

/** Just the fields the readiness decision reads. A full MerchantStore satisfies
 * this structurally, so callers pass their store row directly. Deliberately does
 * NOT include account_type or any personal-vs-business signal: wallet readiness
 * belongs to the selected store, never to the account kind. */
export interface OnchainReadinessStore {
  onchain_status: string | null;
  onchain_enabled: boolean | null;
}

/**
 * Cached, UX-only readiness of a store's Bitcoin on-chain wallet for accepting
 * payments: connected AND not explicitly disabled. Mirrors the server guard
 * (assertStoreHasOnchainWallet) closely enough to drive responsive gating, but
 * is never the security boundary — the value can be stale or forged, so the
 * server re-checks BTCPay authoritatively on every payment mutation.
 */
export function isOnchainReadyForPayments(
  store: OnchainReadinessStore | null | undefined,
): boolean {
  if (!store) return false;
  return store.onchain_status === 'connected' && store.onchain_enabled !== false;
}

/** Card heading, shared across all four features. */
export const WALLET_REQUIRED_TITLE = 'Connect your Bitcoin wallet';

/** CTA label, shared across all four features. */
export const WALLET_REQUIRED_CTA = 'Connect wallet';

const WALLET_REQUIRED_MESSAGES: Record<PaymentFeature, string> = {
  pos: 'Connect your Bitcoin wallet to accept payments before creating a point of sale.',
  invoices: 'Connect your Bitcoin wallet to accept payments before creating invoices.',
  requests:
    'Connect your Bitcoin wallet to accept payments before creating payment requests.',
  'pay-button':
    'Connect your Bitcoin wallet to accept payments before enabling the Pay Button.',
};

/** Feature-appropriate, consistent supporting copy for the wallet-required card. */
export function walletRequiredMessage(feature: PaymentFeature): string {
  return WALLET_REQUIRED_MESSAGES[feature];
}

/**
 * THE canonical route that renders "Let's get started" → "Connect an existing
 * wallet" (app/account/connect-onchain-wallet.tsx), which threads storeId /
 * storeName through the whole import flow. Payment CTAs must enter here directly
 * — NOT via '/account/btc-wallet-settings', which is the manage-existing-wallet
 * screen and blocks on an async wallet-state load (stranding a walletless
 * merchant on a spinner).
 */
export const BITCOIN_WALLET_CONNECTION_ROUTE = '/account/connect-onchain-wallet' as const;

/** The minimal store identity the wallet-connection flow needs. */
export interface WalletConnectStore {
  id: string;
  name: string;
}

/** Expo Router navigation target for the canonical connection flow. */
export interface BitcoinWalletConnectionTarget {
  pathname: typeof BITCOIN_WALLET_CONNECTION_ROUTE;
  params: { storeId: string; storeName: string };
}

/** Builds the store-scoped navigation target. Store id + name are threaded so
 * the flow stays bound to the selected store across every step. */
export function bitcoinWalletConnectionTarget(
  store: WalletConnectStore,
): BitcoinWalletConnectionTarget {
  return {
    pathname: BITCOIN_WALLET_CONNECTION_ROUTE,
    params: { storeId: store.id, storeName: store.name },
  };
}

/** Minimal router surface used by the shared navigator (so it is testable with a
 * plain object and free of an expo-router import). */
export interface WalletConnectRouter {
  push: (target: BitcoinWalletConnectionTarget) => void;
}

/**
 * The single navigation path every walletless payment CTA uses. Enters the
 * canonical connection flow store-scoped. Returns false (and does nothing) when
 * there is no active store, so a caller never navigates into a store-less flow.
 */
export function navigateToBitcoinWalletConnection(
  router: WalletConnectRouter,
  store: WalletConnectStore | null | undefined,
): boolean {
  if (!store) return false;
  router.push(bitcoinWalletConnectionTarget(store));
  return true;
}
