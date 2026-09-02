// Regression tests for the walletless-payment UX gate (routing + rendering
// decisions). The four payment screens (POS, Invoices, Payment Requests, Pay
// Button) and the shared WalletRequiredCard all derive their behaviour from this
// one module, so testing it here covers all four without brittle per-screen
// render assertions.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bitcoinWalletConnectionTarget,
  BITCOIN_WALLET_CONNECTION_ROUTE,
  isOnchainReadyForPayments,
  navigateToBitcoinWalletConnection,
  walletRequiredMessage,
  WALLET_REQUIRED_CTA,
  WALLET_REQUIRED_TITLE,
  type BitcoinWalletConnectionTarget,
  type PaymentFeature,
} from './wallet-gate.ts';

const STORE = { id: 'store-1', name: 'Atlanta LLC' };

// The screen that must NOT be used as a walletless CTA destination — it blocks
// on an async wallet-state load and strands a walletless merchant on a spinner.
const SETTINGS_ROUTE = '/account/btc-wallet-settings';

// ---------------------------------------------------------------------------
// 1–4. Wallet-required copy is present, consistent, and feature-appropriate.
// ---------------------------------------------------------------------------

test('every payment feature has consistent wallet-required copy', () => {
  assert.equal(WALLET_REQUIRED_TITLE, 'Connect your Bitcoin wallet');
  assert.equal(WALLET_REQUIRED_CTA, 'Connect wallet');

  const expected: Record<PaymentFeature, string> = {
    pos: 'Connect your Bitcoin wallet to accept payments before creating a point of sale.',
    invoices: 'Connect your Bitcoin wallet to accept payments before creating invoices.',
    requests:
      'Connect your Bitcoin wallet to accept payments before creating payment requests.',
    'pay-button':
      'Connect your Bitcoin wallet to accept payments before enabling the Pay Button.',
  };
  for (const feature of Object.keys(expected) as PaymentFeature[]) {
    assert.equal(walletRequiredMessage(feature), expected[feature]);
    // Every message shares the same lead-in, so the four features read as one system.
    assert.ok(walletRequiredMessage(feature).startsWith('Connect your Bitcoin wallet to accept payments'));
  }
});

// ---------------------------------------------------------------------------
// 5. The single canonical connection target — store-scoped "Let's get started".
// ---------------------------------------------------------------------------

test('canonical target is the connect-onchain-wallet flow, store-scoped', () => {
  const target = bitcoinWalletConnectionTarget(STORE);
  assert.equal(target.pathname, '/account/connect-onchain-wallet');
  assert.equal(BITCOIN_WALLET_CONNECTION_ROUTE, '/account/connect-onchain-wallet');
  assert.deepEqual(target.params, { storeId: 'store-1', storeName: 'Atlanta LLC' });
});

// ---------------------------------------------------------------------------
// 6. The CTA must NEVER route to the intermediate BTC Wallet Settings screen.
// ---------------------------------------------------------------------------

test('canonical target is never the BTC Wallet Settings screen', () => {
  assert.notEqual(bitcoinWalletConnectionTarget(STORE).pathname, SETTINGS_ROUTE);
  assert.notEqual(BITCOIN_WALLET_CONNECTION_ROUTE, SETTINGS_ROUTE);
});

test('navigateToBitcoinWalletConnection pushes the canonical target, not settings', () => {
  const pushes: BitcoinWalletConnectionTarget[] = [];
  const router = { push: (t: BitcoinWalletConnectionTarget) => pushes.push(t) };

  const navigated = navigateToBitcoinWalletConnection(router, STORE);

  assert.equal(navigated, true);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].pathname, '/account/connect-onchain-wallet');
  assert.notEqual(pushes[0].pathname, SETTINGS_ROUTE);
  assert.deepEqual(pushes[0].params, { storeId: 'store-1', storeName: 'Atlanta LLC' });
});

test('navigateToBitcoinWalletConnection no-ops without an active store', () => {
  const pushes: BitcoinWalletConnectionTarget[] = [];
  const router = { push: (t: BitcoinWalletConnectionTarget) => pushes.push(t) };

  assert.equal(navigateToBitcoinWalletConnection(router, null), false);
  assert.equal(navigateToBitcoinWalletConnection(router, undefined), false);
  assert.equal(pushes.length, 0);
});

// ---------------------------------------------------------------------------
// 7–10. The gate decision: walletless → gated (Connect Wallet), connected →
// normal UI restored.
// ---------------------------------------------------------------------------

test('walletless states gate the payment UI', () => {
  assert.equal(isOnchainReadyForPayments(null), false);
  assert.equal(isOnchainReadyForPayments(undefined), false);
  assert.equal(isOnchainReadyForPayments({ onchain_status: 'not_connected', onchain_enabled: false }), false);
  assert.equal(isOnchainReadyForPayments({ onchain_status: 'error', onchain_enabled: true }), false);
  // Configured but DISABLED cannot derive a payable address → still gated.
  assert.equal(isOnchainReadyForPayments({ onchain_status: 'connected', onchain_enabled: false }), false);
});

test('a connected + enabled wallet restores the normal payment UI', () => {
  assert.equal(isOnchainReadyForPayments({ onchain_status: 'connected', onchain_enabled: true }), true);
  // enabled defaults to "not disabled" when the flag is null/absent.
  assert.equal(isOnchainReadyForPayments({ onchain_status: 'connected', onchain_enabled: null }), true);
});

// ---------------------------------------------------------------------------
// 11–12. Personal / business parity: the gate depends ONLY on the store's
// on-chain wallet state, never the account type.
// ---------------------------------------------------------------------------

test('gating is identical for personal and business accounts', () => {
  const walletless = { onchain_status: 'not_connected', onchain_enabled: false };
  const ready = { onchain_status: 'connected', onchain_enabled: true };

  // Extra account-type fields must not change the decision (structural: ignored).
  const personalWalletless = { ...walletless, account_type: 'personal' };
  const businessWalletless = { ...walletless, account_type: 'business' };
  const personalReady = { ...ready, account_type: 'personal' };
  const businessReady = { ...ready, account_type: 'business' };

  assert.equal(isOnchainReadyForPayments(personalWalletless), false);
  assert.equal(isOnchainReadyForPayments(businessWalletless), false);
  assert.equal(
    isOnchainReadyForPayments(personalWalletless),
    isOnchainReadyForPayments(businessWalletless),
  );

  assert.equal(isOnchainReadyForPayments(personalReady), true);
  assert.equal(isOnchainReadyForPayments(businessReady), true);
  assert.equal(
    isOnchainReadyForPayments(personalReady),
    isOnchainReadyForPayments(businessReady),
  );
});
