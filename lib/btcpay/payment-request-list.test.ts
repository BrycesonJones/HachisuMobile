// Regression tests for the Payment Requests LIST (pure mapping + filtering).
//
// Before this module existed, app/payments/requests/index.tsx rendered a
// hard-coded empty array ("Real payment requests are not fetched yet — the list
// stays empty in production"), so a request the merchant had just created was
// unreachable from the list and the search/filter controls acted on nothing.
// These tests pin the row -> list-item mapping and the client-side search
// behaviour the screen now relies on.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  filterPaymentRequestItems,
  nextPaymentRequestCursor,
  PAYMENT_REQUEST_PAGE_SIZE,
  paymentRequestItemFromRow,
  type PaymentRequestListRow,
} from './payment-request-list.ts';

function row(overrides: Partial<PaymentRequestListRow> = {}): PaymentRequestListRow {
  return {
    merchant_store_id: 'store-1',
    btcpay_payment_request_id: 'pr_abc',
    title: 'Website design deposit',
    amount: 125.5,
    currency: 'USD',
    reference_id: 'REF-42',
    allow_custom_amounts: false,
    created_at: '2026-09-01T10:00:00.000Z',
    expires_at: null,
    request_url: 'https://btcpay.example.com/payment-requests/pr_abc',
    ...overrides,
  };
}

test('a persisted row becomes a list item keyed by its durable BTCPay id', () => {
  const item = paymentRequestItemFromRow(row());
  assert.ok(item);
  assert.equal(item.merchantStoreId, 'store-1');
  assert.equal(item.btcpayPaymentRequestId, 'pr_abc');
  assert.equal(item.title, 'Website design deposit');
  assert.equal(item.currency, 'USD');
  assert.equal(item.referenceId, 'REF-42');
  assert.equal(item.createdAt, '2026-09-01T10:00:00.000Z');
  assert.equal(item.expiresAt, null);
});

test('amount is carried as a decimal string, never a JS number', () => {
  assert.equal(paymentRequestItemFromRow(row({ amount: 125.5 }))?.amount, '125.5');
  assert.equal(paymentRequestItemFromRow(row({ amount: '0.00012345' as never }))?.amount, '0.00012345');
});

test('a row with no BTCPay id (creation still in flight) is not listed', () => {
  assert.equal(paymentRequestItemFromRow(row({ btcpay_payment_request_id: null })), null);
  assert.equal(paymentRequestItemFromRow(row({ btcpay_payment_request_id: '' })), null);
});

test('blank fields normalize to null rather than empty strings', () => {
  const item = paymentRequestItemFromRow(row({ reference_id: '', request_url: null }));
  assert.ok(item);
  assert.equal(item.referenceId, null);
  assert.equal(item.requestUrl, null);
});

test('search matches title, reference id and BTCPay id case-insensitively', () => {
  const items = [
    paymentRequestItemFromRow(row({ btcpay_payment_request_id: 'pr_1', title: 'Website design' })),
    paymentRequestItemFromRow(row({ btcpay_payment_request_id: 'pr_2', title: 'Coffee beans', reference_id: 'INV-77' })),
    paymentRequestItemFromRow(row({ btcpay_payment_request_id: 'PR_3', title: 'Consulting', reference_id: null })),
  ].filter((i) => i != null);

  const byTitle = filterPaymentRequestItems(items, { search: 'DESIGN' });
  assert.deepEqual(byTitle.map((i) => i.btcpayPaymentRequestId), ['pr_1']);

  const byReference = filterPaymentRequestItems(items, { search: 'inv-7' });
  assert.deepEqual(byReference.map((i) => i.btcpayPaymentRequestId), ['pr_2']);

  const byId = filterPaymentRequestItems(items, { search: 'pr_3' });
  assert.deepEqual(byId.map((i) => i.btcpayPaymentRequestId), ['PR_3']);

  const none = filterPaymentRequestItems(items, { search: 'zzz' });
  assert.deepEqual(none, []);
});

test('an empty or whitespace search returns every item in order', () => {
  const items = [
    paymentRequestItemFromRow(row({ btcpay_payment_request_id: 'a' })),
    paymentRequestItemFromRow(row({ btcpay_payment_request_id: 'b' })),
  ].filter((i) => i != null);
  assert.deepEqual(filterPaymentRequestItems(items, { search: '' }), items);
  assert.deepEqual(filterPaymentRequestItems(items, { search: '   ' }), items);
});

test('offset paging: a full page yields a next cursor, a short page ends the list', () => {
  assert.equal(nextPaymentRequestCursor(null, PAYMENT_REQUEST_PAGE_SIZE), String(PAYMENT_REQUEST_PAGE_SIZE));
  assert.equal(nextPaymentRequestCursor('50', PAYMENT_REQUEST_PAGE_SIZE), String(50 + PAYMENT_REQUEST_PAGE_SIZE));
  assert.equal(nextPaymentRequestCursor(null, PAYMENT_REQUEST_PAGE_SIZE - 1), null);
  assert.equal(nextPaymentRequestCursor(null, 0), null);
});

test('a malformed cursor is treated as the first page, never as NaN', () => {
  assert.equal(nextPaymentRequestCursor('garbage', PAYMENT_REQUEST_PAGE_SIZE), String(PAYMENT_REQUEST_PAGE_SIZE));
  assert.equal(nextPaymentRequestCursor('-5', PAYMENT_REQUEST_PAGE_SIZE), String(PAYMENT_REQUEST_PAGE_SIZE));
});
