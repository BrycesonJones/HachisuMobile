// Request-body shape regression (OWASP A10:2025 — Mishandling of Exceptional
// Conditions; CWE-234, CWE-235, CWE-248, CWE-476, CWE-754).
//
// Run from supabase/functions:
//   deno test _shared/request-body.test.ts
//
// The defect these lock down: `try { body = await req.json() } catch { 400 }`
// checks SYNTAX only. `null`, `[]`, `"x"` and `7` parse successfully, so the
// handler walked straight into `body.merchantStoreId` on a non-object and threw
// a TypeError no one caught. The bug is not that a bad request failed — it is
// that a bad request failed as a SERVER error, on a path the handler believed it
// had already validated.
//
// The first block is the exceptional input the old idiom mishandled; the second
// proves the ordinary cases still behave exactly as before, including that an
// unexpected extra key is passed through inert rather than rejected.

import { assertEquals } from 'jsr:@std/assert@1.0.19';

import { readJsonObjectBody } from './request-body.ts';

/** A POST carrying `raw` verbatim as its body (no JSON.stringify). */
function request(raw: string | null): Request {
  return new Request('https://functions.test/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(raw === null ? {} : { body: raw }),
  });
}

// ---------------------------------------------------------------------------
// Valid JSON that is not an object — the case that used to throw.
// ---------------------------------------------------------------------------

Deno.test('a JSON `null` body is refused, not dereferenced', async () => {
  assertEquals(await readJsonObjectBody(request('null')), null);
});

Deno.test('a JSON array body is refused', async () => {
  // An array HAS properties, so `body.merchantStoreId` would not throw — it
  // would quietly read undefined and fall through to whatever default the
  // handler used. Refusing it keeps missing-parameter handling explicit.
  assertEquals(await readJsonObjectBody(request('[{"merchantStoreId":"s1"}]')), null);
});

Deno.test('a bare JSON string body is refused', async () => {
  assertEquals(await readJsonObjectBody(request('"merchantStoreId"')), null);
});

Deno.test('a bare JSON number body is refused', async () => {
  assertEquals(await readJsonObjectBody(request('7')), null);
});

Deno.test('a bare JSON boolean body is refused', async () => {
  assertEquals(await readJsonObjectBody(request('true')), null);
});

// ---------------------------------------------------------------------------
// The cases the old idiom already handled must keep behaving identically.
// ---------------------------------------------------------------------------

Deno.test('an absent body is refused', async () => {
  assertEquals(await readJsonObjectBody(request(null)), null);
});

Deno.test('an empty body is refused', async () => {
  assertEquals(await readJsonObjectBody(request('')), null);
});

Deno.test('a truncated body is refused', async () => {
  assertEquals(await readJsonObjectBody(request('{"merchantStoreId":')), null);
});

Deno.test('a body that is not JSON at all is refused', async () => {
  assertEquals(await readJsonObjectBody(request('merchantStoreId=s1')), null);
});

// ---------------------------------------------------------------------------
// Ordinary bodies pass through unchanged.
// ---------------------------------------------------------------------------

Deno.test('an object body is returned as-is', async () => {
  const body = await readJsonObjectBody(request('{"merchantStoreId":"s1","count":3}'));
  assertEquals(body, { merchantStoreId: 's1', count: 3 });
});

Deno.test('an empty object is a valid body (every field simply missing)', async () => {
  // Distinct from `null`: `{}` is a well-formed request whose required fields
  // are absent, which each handler answers with its own field-level 400.
  assertEquals(await readJsonObjectBody(request('{}')), {});
});

Deno.test('a null-valued field is preserved for the handler to reject', async () => {
  const body = await readJsonObjectBody(request('{"merchantStoreId":null}'));
  assertEquals(body, { merchantStoreId: null });
});

Deno.test('an unexpected extra key is passed through inert, not rejected', async () => {
  // CWE-235: handlers project the fields they name and never spread the record
  // into a write, so an extra key cannot override trusted state. Rejecting it
  // would break older app builds for no security gain.
  const body = await readJsonObjectBody(
    request('{"merchantStoreId":"s1","userId":"attacker","btcpayStoreId":"other-store"}'),
  );
  assertEquals(body?.merchantStoreId, 's1');
  assertEquals(body?.userId, 'attacker');
});

Deno.test('a nested object is not flattened or coerced', async () => {
  const body = await readJsonObjectBody(request('{"products":[{"price":"1.00"}]}'));
  assertEquals(body, { products: [{ price: '1.00' }] });
});

Deno.test('a __proto__ key does not pollute the returned record', async () => {
  // JSON.parse never installs __proto__ as a prototype, but the handlers read
  // this record with `typeof body.x === 'string'` guards, so pin it.
  const body = await readJsonObjectBody(request('{"__proto__":{"admin":true}}'));
  assertEquals((body as Record<string, unknown>).admin, undefined);
  assertEquals(({} as Record<string, unknown>).admin, undefined);
});
