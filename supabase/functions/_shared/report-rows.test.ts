// Unit tests for the shared report/activity derivation.
//
// Run from supabase/functions with a deno.json containing
// {"nodeModulesDir":"auto"}:  deno test --allow-read _shared/report-rows.test.ts
//
// These pin the accounting behaviour: which columns are derived and how, how
// abnormal payment states are represented, and that the CSV is RFC-4180 safe.

import { assertEquals } from 'jsr:@std/assert@1.0.19';

import {
  buildReportRows,
  collectMetadataColumns,
  currencyDivisibility,
  multiplyDecimalStrings,
  REPORT_BASE_COLUMNS,
  reportRowsToCsv,
  subtractDecimalStrings,
  toActivityEvents,
  type ReportRow,
} from './report-rows.ts';
import type { BtcpayInvoice } from './btcpay-client.ts';

/** Column index helper so tests read by name, not by magic number. */
const COL = Object.fromEntries(
  REPORT_BASE_COLUMNS.map((name, index) => [name, index]),
) as Record<(typeof REPORT_BASE_COLUMNS)[number], number>;

interface PaymentSeed {
  id: string;
  value: string;
  status?: string;
  fee?: string;
  receivedDate?: number;
  destination?: string;
}

function invoice(overrides: Partial<BtcpayInvoice> & { id: string }): BtcpayInvoice {
  return {
    currency: 'USD',
    amount: '10.00',
    status: 'Settled',
    additionalStatus: 'None',
    createdTime: 1787790000,
    expirationTime: 1787790900,
    metadata: { orderId: 'ORDER-1' },
    ...overrides,
  } as BtcpayInvoice;
}

function withPayments(
  base: BtcpayInvoice,
  payments: PaymentSeed[],
  method: { paymentMethodId?: string; currency?: string; rate?: string } = {},
): BtcpayInvoice {
  return {
    ...base,
    paymentMethods: [
      {
        paymentMethodId: method.paymentMethodId ?? 'BTC-CHAIN',
        currency: method.currency ?? 'BTC',
        rate: method.rate ?? '100000',
        payments: payments.map((p) => ({
          id: p.id,
          value: p.value,
          fee: p.fee ?? '0',
          status: p.status ?? 'Settled',
          receivedDate: p.receivedDate ?? 1787790100,
          destination: p.destination ?? 'bc1qtest',
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Derived field: InvoiceDue = InvoicePrice - paidAmount
// ---------------------------------------------------------------------------

Deno.test('InvoiceDue: fully paid invoice is zero', () => {
  const rows = buildReportRows(
    withPayments(invoice({ id: 'A', amount: '10.00', paidAmount: '10.00' }), [
      { id: 'p1', value: '0.0001' },
    ]),
  );
  assertEquals(rows[0].base[COL.InvoiceDue], '0.00');
});

Deno.test('InvoiceDue: partial payment leaves the remainder outstanding', () => {
  const rows = buildReportRows(
    withPayments(
      invoice({
        id: 'B',
        amount: '10.00',
        paidAmount: '4.00',
        status: 'New',
        additionalStatus: 'PaidPartial',
      }),
      [{ id: 'p1', value: '0.00004' }],
    ),
  );
  assertEquals(rows[0].base[COL.InvoiceDue], '6.00');
});

Deno.test('InvoiceDue: overpayment is negative, never clamped to zero', () => {
  const rows = buildReportRows(
    withPayments(
      invoice({ id: 'C', amount: '10.00', paidAmount: '12.50', additionalStatus: 'PaidOver' }),
      [{ id: 'p1', value: '0.000125' }],
    ),
  );
  assertEquals(rows[0].base[COL.InvoiceDue], '-2.50');
});

Deno.test('InvoiceDue: absent paidAmount means the whole price is due', () => {
  const rows = buildReportRows(
    withPayments(invoice({ id: 'D', amount: '7.25', paidAmount: undefined }), [
      { id: 'p1', value: '0.00007' },
    ]),
  );
  assertEquals(rows[0].base[COL.InvoiceDue], '7.25');
});

Deno.test('InvoiceDue: differing decimal scales subtract exactly', () => {
  assertEquals(subtractDecimalStrings('10', '2.50'), '7.50');
  assertEquals(subtractDecimalStrings('0.00000001', '0.00000002'), '-0.00000001');
  assertEquals(subtractDecimalStrings('abc', '1'), null);
});

// ---------------------------------------------------------------------------
// Derived field: PaymentInvoiceAmount = PaymentAmount x PaymentRate
// ---------------------------------------------------------------------------

Deno.test('PaymentInvoiceAmount: value x rate at currency divisibility', () => {
  const rows = buildReportRows(
    withPayments(invoice({ id: 'E', currency: 'USD', paidAmount: '8.00' }), [
      { id: 'p1', value: '0.00010147' },
    ], { rate: '78847.7' }),
  );
  // 0.00010147 x 78847.7 = 8.0000... -> 8.00 at 2dp
  assertEquals(rows[0].base[COL.PaymentInvoiceAmount], '8.00');
});

Deno.test('PaymentInvoiceAmount: rounds HALF-EVEN (banker’s), not half-up', () => {
  assertEquals(multiplyDecimalStrings('0.00000125', '100000', 2), '0.12');
  assertEquals(multiplyDecimalStrings('0.00000135', '100000', 2), '0.14');
  assertEquals(multiplyDecimalStrings('0.00000145', '100000', 2), '0.14');
  assertEquals(multiplyDecimalStrings('0.00000155', '100000', 2), '0.16');
});

Deno.test('PaymentInvoiceAmount: EMPTY when the method carries no rate', () => {
  const inv = withPayments(invoice({ id: 'F', paidAmount: '10.00' }), [
    { id: 'p1', value: '0.0001' },
  ]);
  // Strip the rate the way BTCPay does when none was recorded.
  delete (inv.paymentMethods ?? [])[0].rate;
  const rows = buildReportRows(inv);
  assertEquals(rows[0].base[COL.PaymentInvoiceAmount], null);
  assertEquals(rows[0].base[COL.PaymentRate], null);
});

Deno.test('PaymentInvoiceAmount: zero-decimal and 8-decimal currencies', () => {
  assertEquals(currencyDivisibility('JPY'), 0);
  assertEquals(currencyDivisibility('BTC'), 8);
  assertEquals(currencyDivisibility('KWD'), 3);
  assertEquals(currencyDivisibility('usd'), 2);
  assertEquals(multiplyDecimalStrings('0.001', '100000', 0), '100');
});

Deno.test('decimal maths never uses floating point', () => {
  // 0.1 * 0.2 is 0.020000000000000004 in IEEE-754.
  assertEquals(multiplyDecimalStrings('0.1', '0.2', 2), '0.02');
  assertEquals(multiplyDecimalStrings('21000000', '100000', 2), '2100000000000.00');
  assertEquals(multiplyDecimalStrings('0.001', 'not-a-rate', 2), null);
});

// ---------------------------------------------------------------------------
// Row emission rules
// ---------------------------------------------------------------------------

Deno.test('multiple payments: one row each, invoice fields only on the first', () => {
  const rows = buildReportRows(
    withPayments(invoice({ id: 'G', amount: '10.00', paidAmount: '10.00' }), [
      { id: 'p1', value: '0.00005', receivedDate: 1787790100 },
      { id: 'p2', value: '0.00005', receivedDate: 1787790200 },
    ]),
  );
  assertEquals(rows.length, 2);
  assertEquals(rows[0].base[COL.InvoiceCurrency], 'USD');
  assertEquals(rows[0].base[COL.InvoicePrice], '10.00');
  // Second row must not duplicate invoice-level values.
  assertEquals(rows[1].base[COL.InvoiceCurrency], null);
  assertEquals(rows[1].base[COL.InvoicePrice], null);
  assertEquals(rows[1].base[COL.InvoiceDue], null);
  // But payment-level values are present on both.
  assertEquals(rows[0].base[COL.PaymentId], 'p1');
  assertEquals(rows[1].base[COL.PaymentId], 'p2');
  assertEquals(rows[1].base[COL.InvoiceId], 'G');
});

Deno.test('unpaid New and Expired invoices are excluded entirely', () => {
  assertEquals(buildReportRows(invoice({ id: 'H', status: 'New' })).length, 0);
  assertEquals(buildReportRows(invoice({ id: 'I', status: 'Expired' })).length, 0);
});

Deno.test('payment-less invoice in an EXCEPTIONAL state still emits one row', () => {
  const rows = buildReportRows(
    invoice({ id: 'J', status: 'Settled', additionalStatus: 'Marked', paidAmount: '0' }),
  );
  assertEquals(rows.length, 1);
  assertEquals(rows[0].base[COL.InvoiceFullStatus], 'Settled (Marked)');
  assertEquals(rows[0].base[COL.InvoiceExceptionStatus], 'Marked');
  assertEquals(rows[0].base[COL.PaymentId], null);
  // A payment-less row still has a cell for every column.
  assertEquals(rows[0].base.length, REPORT_BASE_COLUMNS.length);
});

Deno.test('InvoiceFullStatus omits the parenthetical when there is no exception', () => {
  const rows = buildReportRows(
    withPayments(invoice({ id: 'K', paidAmount: '10.00' }), [{ id: 'p1', value: '0.0001' }]),
  );
  assertEquals(rows[0].base[COL.InvoiceFullStatus], 'Settled');
  assertEquals(rows[0].base[COL.InvoiceExceptionStatus], '');
});

Deno.test('direct columns are copied verbatim from BTCPay', () => {
  const rows = buildReportRows(
    withPayments(
      invoice({ id: 'L', currency: 'USD', amount: '8.00', paidAmount: '8.00' }),
      [{ id: 'tx-0', value: '0.00010147', fee: '0.00000001', destination: 'bc1qabc' }],
      { paymentMethodId: 'BTC-CHAIN', currency: 'BTC', rate: '78847.7' },
    ),
  );
  const r = rows[0].base;
  assertEquals(r[COL.InvoiceId], 'L');
  assertEquals(r[COL.InvoicePrice], '8.00');
  assertEquals(r[COL.InvoiceStatus], 'Settled');
  assertEquals(r[COL.PaymentId], 'tx-0');
  assertEquals(r[COL.PaymentAmount], '0.00010147');
  assertEquals(r[COL.PaymentMethodFee], '0.00000001');
  assertEquals(r[COL.PaymentAddress], 'bc1qabc');
  assertEquals(r[COL.PaymentMethodId], 'BTC-CHAIN');
  assertEquals(r[COL.PaymentCurrency], 'BTC');
  assertEquals(r[COL.PaymentRate], '78847.7');
  assertEquals(r[COL.InvoiceCreatedDate], '2026-08-27T00:20:00.000Z');
  assertEquals(r[COL.PaymentReceivedDate], '2026-08-27T00:21:40.000Z');
});

// ---------------------------------------------------------------------------
// Export completeness across pages
// ---------------------------------------------------------------------------

Deno.test('every qualifying row appears exactly once across many pages', () => {
  // Simulate what the export does with a multi-page scan result: 3 pages of 4
  // invoices, a mix of reportable and excluded states.
  const pages: BtcpayInvoice[][] = [];
  for (let page = 0; page < 3; page++) {
    const batch: BtcpayInvoice[] = [];
    for (let i = 0; i < 4; i++) {
      const n = page * 4 + i;
      batch.push(
        n % 2 === 0
          ? withPayments(invoice({ id: `paid-${n}`, paidAmount: '10.00' }), [
              { id: `pay-${n}`, value: '0.0001' },
            ])
          : invoice({ id: `expired-${n}`, status: 'Expired' }),
      );
    }
    pages.push(batch);
  }

  const rows: ReportRow[] = [];
  for (const page of pages) for (const inv of page) rows.push(...buildReportRows(inv));

  // 6 paid invoices x 1 payment each; the 6 expired unpaid ones are excluded.
  assertEquals(rows.length, 6);
  const ids = rows.map((r) => r.base[COL.InvoiceId]);
  assertEquals(new Set(ids).size, 6);
  assertEquals(ids.every((id) => String(id).startsWith('paid-')), true);
});

// ---------------------------------------------------------------------------
// CSV serialization
// ---------------------------------------------------------------------------

Deno.test('CSV header is deterministic: base columns then metadata columns', () => {
  const rows = buildReportRows(
    withPayments(invoice({ id: 'M', paidAmount: '10.00' }), [{ id: 'p1', value: '0.0001' }]),
  );
  const csv = reportRowsToCsv(rows, collectMetadataColumns(rows));
  const header = csv.split('\r\n')[0].split(',');
  assertEquals(header.slice(0, REPORT_BASE_COLUMNS.length), [...REPORT_BASE_COLUMNS]);
  assertEquals(header[REPORT_BASE_COLUMNS.length], 'orderId');
});

Deno.test('CSV quotes commas, quotes and newlines per RFC 4180', () => {
  const rows = buildReportRows(
    withPayments(
      invoice({
        id: 'N',
        paidAmount: '10.00',
        metadata: {
          orderId: 'A,B',
          note: 'has "quotes"',
          multiline: 'line1\nline2',
          plain: 'simple',
        },
      }),
      [{ id: 'p1', value: '0.0001' }],
    ),
  );
  const csv = reportRowsToCsv(rows, collectMetadataColumns(rows));
  assertEquals(csv.includes('"A,B"'), true);
  assertEquals(csv.includes('"has ""quotes"""'), true);
  assertEquals(csv.includes('"line1\nline2"'), true);
  // A value needing no quoting is left bare.
  assertEquals(csv.includes(',simple'), true);
  assertEquals(csv.endsWith('\r\n'), true);
});

Deno.test('CSV renders missing values as empty cells, not "null"', () => {
  const rows = buildReportRows(
    invoice({ id: 'O', status: 'Invalid', additionalStatus: 'Marked', paidAmount: '0' }),
  );
  const csv = reportRowsToCsv(rows, collectMetadataColumns(rows));
  assertEquals(csv.includes('null'), false);
  assertEquals(csv.includes('undefined'), false);
  const dataRow = csv.split('\r\n')[1].split(',');
  // PaymentId is absent on a payment-less row.
  assertEquals(dataRow[COL.PaymentId], '');
});

Deno.test('metadata columns: union across rows, stable order, absent = empty', () => {
  const withNote = withPayments(
    invoice({ id: 'P', paidAmount: '10.00', metadata: { orderId: 'o1', note: 'n1' } }),
    [{ id: 'p1', value: '0.0001' }],
  );
  const withoutNote = withPayments(
    invoice({ id: 'Q', paidAmount: '10.00', metadata: { orderId: 'o2' } }),
    [{ id: 'p2', value: '0.0001' }],
  );
  const rows = [...buildReportRows(withNote), ...buildReportRows(withoutNote)];
  const cols = collectMetadataColumns(rows);
  assertEquals(cols, ['orderId', 'note']); // first-seen order
  const lines = reportRowsToCsv(rows, cols).split('\r\n');
  assertEquals(lines[1].endsWith(',o1,n1'), true);
  assertEquals(lines[2].endsWith(',o2,'), true); // absent metadata -> empty cell
});

Deno.test('metadata flattening skips noise and prefixes cart items', () => {
  const rows = buildReportRows(
    withPayments(
      invoice({
        id: 'R',
        paidAmount: '8.00',
        metadata: {
          orderId: 'o',
          itemDesc: 'skip me',
          receiptData: { Total: 'skip me' },
          buyerEmail: 'b@example.com',
          posData: {
            tax: 999,
            total: 8,
            cart: [{ id: 'tea', count: 1, price: 4, title: 'Tea', image: null }],
          },
        },
      }),
      [{ id: 'p1', value: '0.0001' }],
    ),
  );
  const cols = collectMetadataColumns(rows);
  assertEquals(cols.includes('itemDesc'), false);
  assertEquals(cols.includes('Total'), false);
  assertEquals(cols.includes('tax'), false);
  assertEquals(cols.includes('buyerEmail'), true);
  assertEquals(cols.includes('tea-count'), true);
  assertEquals(cols.includes('tea-price'), true);
  assertEquals(cols.includes('tea-title'), false);
  // Cart price is formatted to the invoice currency's divisibility.
  assertEquals(rows[0].metadata['tea-price'], '4.00');
});

// ---------------------------------------------------------------------------
// Activity events (must reconcile with the report rows above)
// ---------------------------------------------------------------------------

Deno.test('activity: one event per payment, keyed by invoice AND payment id', () => {
  const events = toActivityEvents(
    withPayments(invoice({ id: 'S', paidAmount: '10.00' }), [
      { id: 'p1', value: '0.00005' },
      { id: 'p2', value: '0.00005' },
    ]),
  );
  assertEquals(events.length, 2);
  assertEquals(events.map((e) => e.id), ['S:p1', 'S:p2']);
});

Deno.test('activity: unpaid invoices produce no events at all', () => {
  assertEquals(toActivityEvents(invoice({ id: 'T', status: 'New' })).length, 0);
  assertEquals(toActivityEvents(invoice({ id: 'U', status: 'Expired' })).length, 0);
});

Deno.test('activity: a partial payment on a New invoice is still real activity', () => {
  const events = toActivityEvents(
    withPayments(
      invoice({ id: 'V', status: 'New', additionalStatus: 'PaidPartial', paidAmount: '4.00' }),
      [{ id: 'p1', value: '0.00004' }],
    ),
  );
  assertEquals(events.length, 1);
  assertEquals(events[0].invoiceExceptionStatus, 'paidPartial');
  assertEquals(events[0].fiatAmount, '4.00');
  assertEquals(events[0].invoiceAmount, '10.00');
});

Deno.test('activity: an invalid payment is not presented as money received', () => {
  const events = toActivityEvents(
    withPayments(invoice({ id: 'W', status: 'Invalid' }), [
      { id: 'p1', value: '0.0001', status: 'Invalid' },
    ]),
  );
  assertEquals(events[0].status, 'invalid');
  assertEquals(events[0].displayStatus, 'Failed');
});

Deno.test('activity: rails are distinguished, never collapsed', () => {
  const multi: BtcpayInvoice = {
    ...invoice({ id: 'X', paidAmount: '10.00' }),
    paymentMethods: [
      {
        paymentMethodId: 'BTC-CHAIN',
        currency: 'BTC',
        rate: '100000',
        payments: [{ id: 'c1', value: '0.00006', status: 'Settled', receivedDate: 1787790100 }],
      },
      {
        paymentMethodId: 'BTC-LN',
        currency: 'BTC',
        rate: '100000',
        payments: [{ id: 'l1', value: '0.00004', status: 'Settled', receivedDate: 1787790200 }],
      },
    ],
  };
  const events = toActivityEvents(multi);
  assertEquals(events.map((e) => e.paymentRail), ['onchain', 'lightning']);
  assertEquals(events.map((e) => e.paymentMethodLabel), [
    'Bitcoin · On-chain',
    'Bitcoin · Lightning',
  ]);
});

Deno.test('activity: no fiat amount is invented when the rate is missing', () => {
  const inv = withPayments(invoice({ id: 'Y', paidAmount: '10.00' }), [
    { id: 'p1', value: '0.0001' },
  ]);
  delete (inv.paymentMethods ?? [])[0].rate;
  const events = toActivityEvents(inv);
  assertEquals(events[0].fiatAmount, null);
  assertEquals(events[0].cryptoAmount, '0.0001');
});
