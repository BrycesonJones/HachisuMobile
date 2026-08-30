// A05 (Injection / CWE-20) regression tests for the POS template serializer.
//
// Run from supabase/functions:
//   deno test --allow-read --allow-env _shared/pos-template.test.ts
//
// buildTemplate is a TRUST BOUNDARY, not a formatter. The product array arrives
// verbatim from the mobile client (update-btcpay-pos-app does
// `Array.isArray(body.products) ? body.products : []` and passes it straight in),
// and the client is untrusted. Each product's strings are then forwarded to two
// downstream consumers that expect bounded identifiers/labels:
//
//   * BTCPay's POS app template (AppItem id/title/description/categories), which
//     BTCPay renders on the store's PUBLIC point-of-sale page, and
//   * the CSV export — a cart item's `id` becomes a report COLUMN NAME via
//     report-rows.ts (`${itemId}-${field}`).
//
// So every free-form product field needs a server-side bound. These tests pin
// that; price validation is already covered by the PosProductError path.

import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1.0.19';

import { buildTemplate, PosProductError } from './pos-template.ts';

interface ProductSeed {
  productId?: unknown;
  name?: unknown;
  price?: unknown;
  priceType?: unknown;
  description?: unknown;
  category?: unknown;
  enabled?: unknown;
  inventory?: unknown;
}

function product(overrides: ProductSeed = {}): ProductSeed {
  return {
    productId: 'prod-1',
    name: 'Coffee',
    price: '3.50',
    priceType: 'fixed',
    ...overrides,
  };
}

const parse = (json: string): Record<string, unknown>[] => JSON.parse(json);

// ---------------------------------------------------------------------------
// Bounds on every free-form field forwarded downstream.
// ---------------------------------------------------------------------------

Deno.test('an unbounded product title is rejected, never forwarded to BTCPay', () => {
  assertThrows(
    () => buildTemplate([product({ name: 'A'.repeat(100_000) })]),
    PosProductError,
  );
});

Deno.test('an unbounded product description is rejected', () => {
  assertThrows(
    () => buildTemplate([product({ description: 'D'.repeat(100_000) })]),
    PosProductError,
  );
});

Deno.test('an unbounded product category is rejected', () => {
  assertThrows(
    () => buildTemplate([product({ category: 'C'.repeat(100_000) })]),
    PosProductError,
  );
});

Deno.test('an unbounded product id is rejected — it becomes a CSV column name', () => {
  assertThrows(
    () => buildTemplate([product({ productId: 'X'.repeat(100_000) })]),
    PosProductError,
  );
});

Deno.test('a client sending 100k products cannot force an unbounded payload', () => {
  const many = Array.from({ length: 100_000 }, (_, i) =>
    product({ productId: `p-${i}`, name: `Item ${i}` }),
  );
  const items = parse(buildTemplate(many));
  assert(items.length <= 250, `expected the product cap to hold, got ${items.length}`);
});

// ---------------------------------------------------------------------------
// Ordinary menus must keep working exactly as before.
// ---------------------------------------------------------------------------

Deno.test('a normal product menu serializes unchanged', () => {
  const items = parse(
    buildTemplate([
      product({ description: 'Fresh roast', category: 'Drinks', inventory: '12' }),
      product({ productId: 'prod-2', name: 'Tip', priceType: 'any' }),
      product({ productId: 'prod-3', name: 'Sample', priceType: 'free' }),
    ]),
  );
  assertEquals(items.length, 3);
  assertEquals(items[0], {
    id: 'prod-1',
    title: 'Coffee',
    priceType: 'Fixed',
    disabled: false,
    price: 3.5,
    description: 'Fresh roast',
    categories: ['Drinks'],
    inventory: 12,
  });
  assertEquals(items[1].priceType, 'Topup');
  assertEquals(items[1].price, undefined);
  assertEquals(items[2].priceType, 'Fixed');
  assertEquals(items[2].price, 0);
});

Deno.test('text at the documented limits is still accepted', () => {
  const items = parse(
    buildTemplate([
      product({
        productId: 'p'.repeat(100),
        name: 'N'.repeat(200),
        description: 'D'.repeat(300),
        category: 'C'.repeat(100),
      }),
    ]),
  );
  assertEquals(items.length, 1);
  assertEquals((items[0].title as string).length, 200);
  assertEquals((items[0].description as string).length, 300);
});

Deno.test('a product with a malformed price is still rejected', () => {
  assertThrows(() => buildTemplate([product({ price: '0' })]), PosProductError);
  assertThrows(() => buildTemplate([product({ price: '1e5' })]), PosProductError);
  assertThrows(() => buildTemplate([product({ price: '-1' })]), PosProductError);
});

// ---------------------------------------------------------------------------
// A08 (Software or Data Integrity Failures / CWE-915) — the priceType allow-list
// must be an OWN-property lookup.
//
// `priceType` arrives verbatim from the untrusted client. The mapping table is
// an object literal, so it inherits Object.prototype: an `in` test answers TRUE
// for `toString`, `constructor`, `valueOf`, `hasOwnProperty` and `__proto__`,
// which walks the fallback-to-'fixed' branch straight past the allow-list. The
// item then reaches BTCPay with the merchant's price type AND price silently
// missing — on a page customers pay from — and the poisoned product is persisted
// to merchant_pos_apps, so every later mode switch re-serializes it.
//
// An unrecognized value must always land on 'fixed' with the price intact.
// ---------------------------------------------------------------------------

const PROTOTYPE_KEYS = [
  'toString',
  'constructor',
  'valueOf',
  'hasOwnProperty',
  '__proto__',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
];

Deno.test('a prototype-named priceType cannot bypass the allow-list fallback', () => {
  for (const key of PROTOTYPE_KEYS) {
    const items = parse(buildTemplate([product({ priceType: key })]));
    assertEquals(
      items[0].priceType,
      'Fixed',
      `priceType="${key}" must fall back to Fixed like any other unknown value`,
    );
    assertEquals(
      items[0].price,
      3.5,
      `priceType="${key}" must keep the merchant's price`,
    );
  }
});

Deno.test('a prototype-named priceType never emits a non-string priceType', () => {
  for (const key of PROTOTYPE_KEYS) {
    const items = parse(buildTemplate([product({ priceType: key })]));
    assertEquals(
      typeof items[0].priceType,
      'string',
      `priceType="${key}" must serialize as a BTCPay enum string`,
    );
  }
});

Deno.test('an ordinary unknown priceType still falls back to Fixed', () => {
  const items = parse(buildTemplate([product({ priceType: 'not-a-real-type' })]));
  assertEquals(items[0].priceType, 'Fixed');
  assertEquals(items[0].price, 3.5);
});
