// Wallet-integrity regression tests (defense in depth).
//
// Run from supabase/functions:
//   deno test --allow-read --allow-env _shared/wallet-guard.test.ts
//
// INVARIANT UNDER TEST
// --------------------
// A Hachisu merchant with no valid, ENABLED BTCPay on-chain wallet must not be
// able to create, enable, retrieve, or expose any Bitcoin payment surface. The
// single authoritative gate is assertStoreHasOnchainWallet(), which reads the
// live BTCPay payment-method state — never a cached Supabase boolean — and fails
// CLOSED when that state cannot be determined.
//
// These are deterministic local fixtures. No BTCPay server is contacted: global
// fetch is stubbed to return the payment-method payload the test needs.

import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

import { assertStoreHasOnchainWallet } from './wallet-guard.ts';
import type { BtcpayConfig } from './btcpay-client.ts';

const CONFIG: BtcpayConfig = { serverUrl: 'https://btcpay.test', apiKey: 'test-key' };
const STORE = 'STORE-UNDER-TEST';

type StubReply = { status: number; body: unknown };

/** Replaces global fetch with one that returns `reply` for every request, and
 * records the URLs it was asked for so a test can assert which store was hit. */
async function withFetch<T>(
  reply: StubReply | ((url: string) => StubReply),
  run: (calls: string[]) => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const r = typeof reply === 'function' ? reply(url) : reply;
    return Promise.resolve(
      new Response(r.body == null ? '' : JSON.stringify(r.body), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

// ---------------------------------------------------------------------------
// RED #1 — a store with NO derivation scheme (BTCPay 404 on every on-chain
// payment-method id) is rejected as WALLET_NOT_CONNECTED (409).
// ---------------------------------------------------------------------------

Deno.test('walletless store -> WALLET_NOT_CONNECTED (409)', async () => {
  await withFetch({ status: 404, body: null }, async () => {
    const result = await assertStoreHasOnchainWallet(CONFIG, STORE);
    assert(!result.ok);
    assertEquals(result.code, 'WALLET_NOT_CONNECTED');
    assertEquals(result.status, 409);
  });
});

// ---------------------------------------------------------------------------
// RED #2 — a wallet that is CONFIGURED but DISABLED is still rejected. A
// disabled derivation scheme cannot derive a payable address, so it must not
// unlock any payment surface.
// ---------------------------------------------------------------------------

Deno.test('configured-but-disabled wallet -> WALLET_NOT_CONNECTED (409)', async () => {
  await withFetch(
    { status: 200, body: { enabled: false, config: { accountDerivation: 'zpub-disabled' } } },
    async () => {
      const result = await assertStoreHasOnchainWallet(CONFIG, STORE);
      assert(!result.ok);
      assertEquals(result.code, 'WALLET_NOT_CONNECTED');
      assertEquals(result.status, 409);
    },
  );
});

// ---------------------------------------------------------------------------
// RED #3 — BTCPay lookup FAILURE (non-404) must FAIL CLOSED, never fall through
// to "no wallet == allowed" and never to a false success.
// ---------------------------------------------------------------------------

Deno.test('BTCPay lookup failure -> WALLET_STATE_UNKNOWN (502), fail closed', async () => {
  await withFetch({ status: 500, body: { error: 'boom' } }, async () => {
    const result = await assertStoreHasOnchainWallet(CONFIG, STORE);
    assert(!result.ok);
    assertEquals(result.code, 'WALLET_STATE_UNKNOWN');
    assertEquals(result.status, 502);
  });
});

Deno.test('BTCPay network error -> WALLET_STATE_UNKNOWN (502), fail closed', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new TypeError('network down'));
  try {
    const result = await assertStoreHasOnchainWallet(CONFIG, STORE);
    assert(!result.ok);
    assertEquals(result.code, 'WALLET_STATE_UNKNOWN');
    assertEquals(result.status, 502);
  } finally {
    globalThis.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// GREEN — a CONFIGURED + ENABLED wallet is accepted. This is the only state
// that unlocks a payment surface.
// ---------------------------------------------------------------------------

Deno.test('configured + enabled wallet -> ok', async () => {
  await withFetch(
    { status: 200, body: { enabled: true, config: { accountDerivation: 'zpub-live', label: 'Till' } } },
    async () => {
      const result = await assertStoreHasOnchainWallet(CONFIG, STORE);
      assert(result.ok);
    },
  );
});

// ---------------------------------------------------------------------------
// STORE ISOLATION — the guard verifies the exact BTCPay store id it is handed
// (which callers derive from the owned merchant_stores row), never a different
// store. Proven by asserting the outgoing request targets that store id.
// ---------------------------------------------------------------------------

Deno.test('guard queries the exact store id it was given', async () => {
  await withFetch(
    { status: 200, body: { enabled: true, config: { accountDerivation: 'zpub-live' } } },
    async (calls) => {
      await assertStoreHasOnchainWallet(CONFIG, 'STORE-A');
      assert(
        calls.every((u) => u.includes('/stores/STORE-A/')),
        `expected every request to target STORE-A, saw: ${calls.join(', ')}`,
      );
      assert(
        !calls.some((u) => u.includes('STORE-B')),
        'guard must never query a different store',
      );
    },
  );
});
