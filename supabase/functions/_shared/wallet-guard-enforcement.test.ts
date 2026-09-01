// Enforcement (wiring) regression tests for the wallet-integrity invariant.
//
// Run from supabase/functions:
//   deno test --allow-read _shared/wallet-guard-enforcement.test.ts
//
// wallet-guard.test.ts proves assertStoreHasOnchainWallet() fails closed for a
// walletless / disabled / undeterminable store. These tests prove every payment
// CREATION and EXPOSURE endpoint actually delegates to that one authoritative
// guard, on the SERVER-RESOLVED BTCPay store id — so the invariant cannot be
// satisfied by manually invoking one endpoint, and no endpoint invents its own
// weaker check. This is the source-level counterpart of the audit's finding that
// POS + Pay Button paths were ungated.
//
// A source-level assertion (rather than a full handler spin-up) is deliberate:
// the handlers require Supabase auth + service role + BTCPay, so a unit test
// cannot exercise them end to end. The guard's BEHAVIOR is covered by fixtures
// in wallet-guard.test.ts; these tests cover the WIRING that every endpoint uses
// it.

import { assert } from 'jsr:@std/assert@1.0.19';

const GUARDED = [
  'create-btcpay-invoice',
  'create-btcpay-payment-request',
  'create-btcpay-pos-app',
  'get-btcpay-pos-runtime',
  'set-btcpay-pay-button',
  'generate-btcpay-pay-button-output',
] as const;

async function sourceOf(fn: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
}

for (const fn of GUARDED) {
  Deno.test(`${fn} imports the shared wallet guard`, async () => {
    const src = await sourceOf(fn);
    assert(
      /from ['"]\.\.\/_shared\/wallet-guard\.ts['"]/.test(src),
      `${fn} must import from ../_shared/wallet-guard.ts`,
    );
    assert(
      src.includes('assertStoreHasOnchainWallet('),
      `${fn} must call assertStoreHasOnchainWallet()`,
    );
  });

  Deno.test(`${fn} guards on a server-resolved BTCPay store id`, async () => {
    const src = await sourceOf(fn);
    // The guard must be handed the store id resolved from the OWNED row
    // (store.btcpay_store_id / app.btcpay_store_id), never a client-supplied one.
    assert(
      /assertStoreHasOnchainWallet\(\s*config\s*,\s*(store|app)\.btcpay_store_id/.test(src),
      `${fn} must call the guard with the server-resolved btcpay_store_id`,
    );
  });
}

// Pay Button DISABLE must not require a wallet — only ENABLE and output do. The
// guard in set-btcpay-pay-button therefore lives inside the enable branch.
Deno.test('set-btcpay-pay-button gates ENABLE only (disable stays allowed)', async () => {
  const src = await sourceOf('set-btcpay-pay-button');
  const enableIdx = src.search(/if \(enabled\)/);
  const guardIdx = src.indexOf('assertStoreHasOnchainWallet(');
  assert(enableIdx !== -1, 'set-btcpay-pay-button must branch on `if (enabled)`');
  assert(guardIdx !== -1, 'set-btcpay-pay-button must call the guard');
  assert(
    guardIdx > enableIdx,
    'the wallet guard must be inside the enable branch, so disabling never requires a wallet',
  );
});
