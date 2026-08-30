// POS menu save — exceptional-condition regression
// (OWASP A10:2025 — Mishandling of Exceptional Conditions; CWE-390 detection of
// an error condition without action, CWE-636 not failing securely, CWE-703).
//
// Run from supabase/functions:
//   deno test --allow-env --allow-net update-btcpay-pos-app/index.test.ts
//
// The defect
// ----------
// Two systems hold the merchant's POS menu, and they are not interchangeable:
//
//   * merchant_pos_apps (Supabase) is what the MERCHANT's screen renders.
//   * the BTCPay POS app is what actually CHARGES the customer — the POS the
//     buyer taps is served by BTCPay, from BTCPay's own template.
//
// The save pushed to BTCPay, caught any failure into a `btcpayWarning` string,
// and then wrote the menu to Supabase anyway. The client never read that field
// (nothing in the app referenced `btcpayWarning`), so a merchant who edited a
// price while BTCPay was unreachable, misconfigured, or rejecting the payload
// got a clean success, saw the new price on every screen, and kept charging the
// old one. A detected error the code walked past is not error handling.
//
// Its sibling update-btcpay-pos-mode already refuses on this exact boundary and
// even reverts BTCPay when the Supabase write fails. This pins the same contract
// here: nothing is persisted that BTCPay did not accept.
//
// The harness
// -----------
// The handler is captured by stubbing Deno.serve at import time, and every
// outbound call — GoTrue, PostgREST and BTCPay alike — is served by a stubbed
// fetch. Nothing here touches a real project, a real BTCPay server, or a real
// POS app.

import { assertEquals } from 'jsr:@std/assert@1.0.19';

const SUPABASE_URL = 'https://project.supabase.test';
const BTCPAY_URL = 'https://btcpay.test';
const APP_ID = '11111111-1111-4111-8111-111111111111';
const BTCPAY_APP_ID = 'btcpay-pos-app-1';
const USER_ID = '22222222-2222-4222-8222-222222222222';

Deno.env.set('SUPABASE_URL', SUPABASE_URL);
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-not-a-real-secret');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key-not-a-real-secret');
Deno.env.set('BTCPAY_SERVER_URL', BTCPAY_URL);
Deno.env.set('BTCPAY_GREENFIELD_API_KEY', 'greenfield-key-not-a-real-secret');

// --- capture the handler ------------------------------------------------------

type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler;

const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: Handler) => {
  handler = h;
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} };
};
await import('./index.ts');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

// --- stubbed dependencies -----------------------------------------------------

interface Call {
  method: string;
  url: string;
}

/** What the deployed row looks like before the save. */
const STORED_APP = {
  id: APP_ID,
  user_id: USER_ID,
  btcpay_app_id: BTCPAY_APP_ID,
  pos_style: 'product-list-cart',
};

const realFetch = globalThis.fetch;

/**
 * Serves GoTrue, PostgREST and BTCPay from memory. `btcpayStatus` decides what
 * BTCPay answers the POS-app PUT with; every call made is recorded so the test
 * can assert on what the handler did — in particular whether it wrote to
 * Supabase after BTCPay refused.
 */
function installFetch(btcpayStatus: number | 'network-failure'): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET');
    calls.push({ method, url });

    // GoTrue: the caller's JWT resolves to our test user.
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      return Promise.resolve(
        new Response(JSON.stringify({ id: USER_ID, aud: 'authenticated', role: 'authenticated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    // BTCPay: the POS app update.
    if (url.startsWith(`${BTCPAY_URL}/api/v1/apps/pos/`)) {
      if (btcpayStatus === 'network-failure') {
        return Promise.reject(new TypeError('error sending request'));
      }
      return Promise.resolve(
        new Response(btcpayStatus === 200 ? '{}' : '{"message":"nope"}', {
          status: btcpayStatus,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    // PostgREST: the ownership read, then the save.
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/merchant_pos_apps`)) {
      const payload = method === 'PATCH' ? { ...STORED_APP, display_title: 'Saved' } : STORED_APP;
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    throw new Error(`unexpected fetch in test: ${method} ${url}`);
  }) as typeof fetch;
  return calls;
}

function save(): Request {
  return new Request('https://functions.test/update-btcpay-pos-app', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-jwt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      posAppId: APP_ID,
      displayTitle: 'Coffee bar',
      posMode: 'products',
      currency: 'USD',
      description: null,
      // The price that must never diverge between the two systems.
      products: [{ id: 'p1', title: 'Espresso', priceType: 'fixed', price: '2.50' }],
    }),
  });
}

/** True when the handler issued the merchant_pos_apps write. */
function persisted(calls: Call[]): boolean {
  return calls.some(
    (c) => c.method === 'PATCH' && c.url.startsWith(`${SUPABASE_URL}/rest/v1/merchant_pos_apps`),
  );
}

async function run(
  btcpayStatus: number | 'network-failure',
): Promise<{ status: number; body: Record<string, unknown>; calls: Call[] }> {
  const calls = installFetch(btcpayStatus);
  try {
    const response = await handler(save());
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------
// The defect: a menu BTCPay refused must not be saved as the merchant's.
// ---------------------------------------------------------------------------

Deno.test('a BTCPay rejection does not persist the menu to Supabase', async () => {
  const { status, body, calls } = await run(422);

  assertEquals(
    persisted(calls),
    false,
    'the menu was written to Supabase after BTCPay refused it — the merchant now sees a ' +
      'price BTCPay will not charge',
  );
  assertEquals(status >= 400, true, `expected a failure status, got ${status}`);
  assertEquals(body.posApp, undefined, 'a refused save must not return a saved POS app');
});

Deno.test('a BTCPay 5xx does not persist the menu to Supabase', async () => {
  const { status, calls } = await run(502);
  assertEquals(persisted(calls), false);
  assertEquals(status >= 400, true);
});

Deno.test('an unreachable BTCPay does not persist the menu to Supabase', async () => {
  // The case a merchant actually hits: BTCPay is down, the app is not.
  const { status, calls } = await run('network-failure');
  assertEquals(persisted(calls), false);
  assertEquals(status >= 400, true);
});

Deno.test('the refusal says nothing about the upstream failure', async () => {
  // CWE-209: BTCPay's own body and status are the operator's, not the caller's.
  const { body } = await run(422);
  const text = JSON.stringify(body);
  assertEquals(text.includes('nope'), false, `upstream body leaked: ${text}`);
  assertEquals(text.includes('422'), false, `upstream status leaked: ${text}`);
});

// ---------------------------------------------------------------------------
// The working path must keep working.
// ---------------------------------------------------------------------------

Deno.test('a BTCPay-accepted menu is persisted and returned', async () => {
  const { status, body, calls } = await run(200);
  assertEquals(status, 200);
  assertEquals(persisted(calls), true, 'an accepted menu must still reach Supabase');
  assertEquals((body.posApp as Record<string, unknown>)?.id, APP_ID);
});

Deno.test('BTCPay is called before Supabase is written', async () => {
  const { calls } = await run(200);
  const btcpayAt = calls.findIndex((c) => c.url.startsWith(`${BTCPAY_URL}/api/v1/apps/pos/`));
  const writeAt = calls.findIndex(
    (c) => c.method === 'PATCH' && c.url.startsWith(`${SUPABASE_URL}/rest/v1/merchant_pos_apps`),
  );
  assertEquals(btcpayAt >= 0 && writeAt >= 0, true);
  assertEquals(btcpayAt < writeAt, true, 'the BTCPay push must precede the Supabase write');
});
