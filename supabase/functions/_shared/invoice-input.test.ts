// A05 (Injection) boundary coverage for the shared server-side validators.
//
// Run from supabase/functions:
//   deno test --allow-read --allow-env _shared/invoice-input.test.ts
//
// These validators are the trust boundary for every merchant-supplied value that
// is forwarded to BTCPay or persisted. They are shared by create-btcpay-invoice,
// create-btcpay-payment-request and (as of the A05 review) update-btcpay-pos-app,
// so the contract is pinned here once rather than per-function.
//
// The point is not "does a good value pass" but: can a value that is NOT a
// currency / amount / email / opaque token get through and reach a downstream
// interpreter as something other than data?

import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

import {
  MAX_DESCRIPTION_LENGTH,
  validateAmount,
  validateCurrency,
  validateExpirationMinutes,
  validateIdempotencyKey,
  validateOptionalEmail,
  validateOptionalText,
} from './invoice-input.ts';

// ---------------------------------------------------------------------------
// Currency — an allow-list, not a shape check.
// ---------------------------------------------------------------------------

Deno.test('currency: the A05 corpus is rejected, never forwarded downstream', () => {
  const corpus = [
    "' OR 1=1 --",
    '") OR true --',
    "=CMD|'/C CALC'!A0",
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    '${7*7}',
    '{{7*7}}',
    '../../etc/passwd',
    'USD\r\nX-Injected: 1',
    'USD,EUR',
    'usd.eq.anything',
    'U'.repeat(50_000),
    'US', // well-formed shape, not a real code
    'XXX', // three letters, not on the allow-list
  ];
  for (const raw of corpus) {
    const result = validateCurrency(raw, 'USD');
    assert(!result.ok, `currency accepted: ${JSON.stringify(raw.slice(0, 40))}`);
  }
});

Deno.test('currency: type confusion is rejected', () => {
  for (const raw of [['USD'], { code: 'USD' }, 123, true, () => 'USD']) {
    assert(!validateCurrency(raw, 'USD').ok, `currency accepted: ${typeof raw}`);
  }
});

Deno.test('currency: legitimate codes still resolve', () => {
  assertEquals(validateCurrency('USD', 'USD'), { ok: true, value: 'USD' });
  assertEquals(validateCurrency('  eur ', 'USD'), { ok: true, value: 'EUR' });
  // Absent falls back to the SERVER-side store currency, never a hardcoded one.
  assertEquals(validateCurrency(undefined, 'GBP'), { ok: true, value: 'GBP' });
  assertEquals(validateCurrency('', 'GBP'), { ok: true, value: 'GBP' });
});

// ---------------------------------------------------------------------------
// Amount — money is a decimal string, never a float.
// ---------------------------------------------------------------------------

Deno.test('amount: numeric edge cases cannot produce a nonsense invoice', () => {
  const corpus: unknown[] = [
    'NaN',
    'Infinity',
    '-Infinity',
    '1e5',
    '1E5',
    '1e-30',
    '0x10',
    '-1',
    '0',
    '0.0',
    '',
    '   ',
    '1.2.3',
    '+1',
    '1_000',
    '0.0000000000000000001',
    NaN,
    Infinity,
    -1,
    0,
    12.5,
    ['1'],
    { amount: '1' },
    null,
    undefined,
    true,
  ];
  for (const raw of corpus) {
    assert(!validateAmount(raw).ok, `amount accepted: ${JSON.stringify(raw)}`);
  }
});

Deno.test('amount: legitimate decimal strings normalize', () => {
  assertEquals(validateAmount('12.50'), { ok: true, value: '12.5' });
  assertEquals(validateAmount('007.100'), { ok: true, value: '7.1' });
  assertEquals(validateAmount('1'), { ok: true, value: '1' });
  assert(!validateAmount('1'.repeat(13)).ok, 'an absurd magnitude must be rejected');
  assert(!validateAmount('1.123456789').ok, 'over-precision must be rejected');
});

// ---------------------------------------------------------------------------
// Free text — bounded, and type-confusion safe.
// ---------------------------------------------------------------------------

Deno.test('optional text: bounded and type-checked', () => {
  assert(
    !validateOptionalText('x'.repeat(MAX_DESCRIPTION_LENGTH + 1), MAX_DESCRIPTION_LENGTH, 'D').ok,
  );
  assert(!validateOptionalText(['x'], MAX_DESCRIPTION_LENGTH, 'D').ok);
  assert(!validateOptionalText({ t: 'x' }, MAX_DESCRIPTION_LENGTH, 'D').ok);
  assert(!validateOptionalText(42, MAX_DESCRIPTION_LENGTH, 'D').ok);
  // Empty/whitespace becomes null so BTCPay metadata stays absent, not blank.
  assertEquals(validateOptionalText('   ', MAX_DESCRIPTION_LENGTH, 'D'), {
    ok: true,
    value: null,
  });
  assertEquals(validateOptionalText(null, MAX_DESCRIPTION_LENGTH, 'D'), {
    ok: true,
    value: null,
  });
});

Deno.test('optional text: markup is PRESERVED, not silently stripped', () => {
  // Correct behaviour: this validator bounds and types the value; encoding is
  // the job of whichever sink renders it (escapeHtmlText for BTCPay's html
  // payment-request description, csvCell for the export). Stripping punctuation
  // here would corrupt legitimate merchant text without protecting any sink.
  const text = '2 x <coffee> & "tea"';
  assertEquals(validateOptionalText(text, MAX_DESCRIPTION_LENGTH, 'D'), {
    ok: true,
    value: text,
  });
});

// ---------------------------------------------------------------------------
// Email / expiration / idempotency key.
// ---------------------------------------------------------------------------

Deno.test('email: malformed and overlong values are rejected', () => {
  for (const raw of [
    'not-an-email',
    'a@b',
    'a@b.c',
    'a b@c.com',
    `${'a'.repeat(250)}@example.com`,
    'a@b.com\r\nBcc: victim@example.com',
    ['a@b.com'],
    42,
  ]) {
    assert(
      !validateOptionalEmail(raw, 'buyer email').ok,
      `email accepted: ${JSON.stringify(raw)}`,
    );
  }
  assertEquals(validateOptionalEmail(' buyer@example.com ', 'buyer email'), {
    ok: true,
    value: 'buyer@example.com',
  });
});

Deno.test('expiration: only whole in-range minutes are accepted', () => {
  for (const raw of [0, -1, 1.5, NaN, Infinity, 43_201, '15', ['15'], true]) {
    assert(
      !validateExpirationMinutes(raw).ok,
      `expiration accepted: ${JSON.stringify(raw)}`,
    );
  }
  assertEquals(validateExpirationMinutes(15), { ok: true, value: 15 });
  assertEquals(validateExpirationMinutes(null), { ok: true, value: null });
});

Deno.test('idempotency key: only an opaque bounded token is accepted', () => {
  for (const raw of [
    '',
    'short',
    'x'.repeat(101),
    'has space',
    'has/slash',
    'has.dot',
    "key' OR 1=1 --",
    'key\r\nX: 1',
    ['key12345'],
    42,
    null,
  ]) {
    assert(!validateIdempotencyKey(raw).ok, `key accepted: ${JSON.stringify(raw)}`);
  }
  assertEquals(validateIdempotencyKey(' 6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8 '), {
    ok: true,
    value: '6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
  });
});
