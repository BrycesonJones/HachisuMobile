// A08 (Software or Data Integrity Failures / CWE-345 Insufficient Verification
// of Data Authenticity) regression tests for the BTCPay MUTATION responses that
// mint Hachisu's authoritative merchant-resource mappings.
//
// Run from supabase/functions:
//   deno test --allow-read --allow-env _shared/btcpay-response-integrity.test.ts
//
// Why these matter
// ----------------
// TLS proves Hachisu is talking to the configured BTCPay Server. It proves
// nothing about whether a particular JSON body is a valid answer to the request
// Hachisu just made. Four calls take a BTCPay success response and persist parts
// of it as FACTS that later requests are then routed by:
//
//   createStore              -> merchant_stores.btcpay_store_id
//   createPosApp             -> merchant_pos_apps.btcpay_app_id
//   createStoreInvoice       -> merchant_invoices.btcpay_invoice_id
//   createStorePaymentRequest-> merchant_payment_requests.btcpay_payment_request_id
//
// Two properties must hold before any of that is believed:
//
//   1. The id is structurally usable. A blank id is not an identifier; persisted,
//      it becomes a permanent dangling mapping that no later call can resolve.
//   2. The resource BTCPay describes belongs to the store the request addressed.
//      Greenfield echoes `storeId` on the POS app, invoice and payment-request
//      payloads. Hachisu already re-checks that echo on two READ paths
//      (get-btcpay-payment-request, get-btcpay-pos-runtime); the mutation paths
//      that create the durable mapping must not be laxer than the reads that
//      consume it, or a mismatched echo is written to the database as truth and
//      every subsequent update (updatePosApp is a FULL REPLACE) is aimed at
//      whatever that id points to.
//
// These are deterministic local fixtures. No BTCPay server is contacted.

import { assertRejects } from 'jsr:@std/assert@1.0.19';

import {
  BtcpayApiError,
  createPosApp,
  createStore,
  createStoreInvoice,
  createStorePaymentRequest,
  type BtcpayConfig,
} from './btcpay-client.ts';

const CONFIG: BtcpayConfig = {
  serverUrl: 'https://btcpay.test',
  apiKey: 'test-key',
};

const OUR_STORE = 'OUR-STORE-ID';
const OTHER_STORE = 'SOMEONE-ELSES-STORE-ID';

/** Replaces global fetch with one that always answers 200 + `body`. */
async function withStubbedResponse<T>(body: unknown, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

// ---------------------------------------------------------------------------
// 1. A blank id is not an identifier.
// ---------------------------------------------------------------------------

Deno.test('createStore rejects a success payload with a blank store id', async () => {
  await withStubbedResponse({ id: '', name: 'My Store' }, () =>
    assertRejects(() => createStore(CONFIG, { name: 'My Store' }), BtcpayApiError),
  );
});

Deno.test('createStore rejects a whitespace-only store id', async () => {
  await withStubbedResponse({ id: '   ', name: 'My Store' }, () =>
    assertRejects(() => createStore(CONFIG, { name: 'My Store' }), BtcpayApiError),
  );
});

Deno.test('createPosApp rejects a success payload with a blank app id', async () => {
  await withStubbedResponse({ id: '', storeId: OUR_STORE }, () =>
    assertRejects(
      () => createPosApp(CONFIG, OUR_STORE, { appName: 'Till' }),
      BtcpayApiError,
    ),
  );
});

// ---------------------------------------------------------------------------
// 2. The echoed storeId must be the store the request addressed.
// ---------------------------------------------------------------------------

Deno.test('createPosApp rejects an app that BTCPay reports under another store', async () => {
  await withStubbedResponse({ id: 'APP-1', storeId: OTHER_STORE }, () =>
    assertRejects(
      () => createPosApp(CONFIG, OUR_STORE, { appName: 'Till' }),
      BtcpayApiError,
    ),
  );
});

Deno.test('createStoreInvoice rejects an invoice echoed under another store', async () => {
  await withStubbedResponse(
    { id: 'INV-1', storeId: OTHER_STORE, amount: '10.00', currency: 'USD', status: 'New' },
    () =>
      assertRejects(
        () =>
          createStoreInvoice(CONFIG, OUR_STORE, { amount: '10.00', currency: 'USD' }),
        BtcpayApiError,
      ),
  );
});

Deno.test('createStorePaymentRequest rejects a request echoed under another store', async () => {
  await withStubbedResponse(
    { id: 'PR-1', storeId: OTHER_STORE, amount: 10, currency: 'USD', title: 'Deposit' },
    () =>
      assertRejects(
        () =>
          createStorePaymentRequest(CONFIG, OUR_STORE, {
            amount: '10.00',
            title: 'Deposit',
            currency: 'USD',
          }),
        BtcpayApiError,
      ),
  );
});

// ---------------------------------------------------------------------------
// 3. Ordinary, well-formed responses must keep working unchanged.
// ---------------------------------------------------------------------------

Deno.test('a well-formed store response is still accepted', async () => {
  const store = await withStubbedResponse({ id: 'STORE-1', name: 'My Store' }, () =>
    createStore(CONFIG, { name: 'My Store' }),
  );
  if (store.id !== 'STORE-1') throw new Error(`unexpected store id: ${store.id}`);
});

Deno.test('a well-formed POS app response for OUR store is still accepted', async () => {
  const app = await withStubbedResponse({ id: 'APP-1', storeId: OUR_STORE }, () =>
    createPosApp(CONFIG, OUR_STORE, { appName: 'Till' }),
  );
  if (app.id !== 'APP-1') throw new Error(`unexpected app id: ${app.id}`);
});

Deno.test('a payload that omits storeId entirely is still accepted', async () => {
  // Greenfield echoes storeId today, but an omitted optional field is not
  // evidence of a mismatch — only a PRESENT, DIFFERENT value is.
  const invoice = await withStubbedResponse({ id: 'INV-1', amount: '10.00' }, () =>
    createStoreInvoice(CONFIG, OUR_STORE, { amount: '10.00', currency: 'USD' }),
  );
  if (invoice.id !== 'INV-1') throw new Error(`unexpected invoice id: ${invoice.id}`);
});

Deno.test('a well-formed invoice and payment request for OUR store are accepted', async () => {
  const invoice = await withStubbedResponse(
    { id: 'INV-2', storeId: OUR_STORE, amount: '10.00', currency: 'USD' },
    () => createStoreInvoice(CONFIG, OUR_STORE, { amount: '10.00', currency: 'USD' }),
  );
  if (invoice.id !== 'INV-2') throw new Error(`unexpected invoice id: ${invoice.id}`);

  const pr = await withStubbedResponse(
    { id: 'PR-2', storeId: OUR_STORE, amount: 10, currency: 'USD', title: 'Deposit' },
    () =>
      createStorePaymentRequest(CONFIG, OUR_STORE, {
        amount: '10.00',
        title: 'Deposit',
        currency: 'USD',
      }),
  );
  if (pr.id !== 'PR-2') throw new Error(`unexpected payment request id: ${pr.id}`);
});
