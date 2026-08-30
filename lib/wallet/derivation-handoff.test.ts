// Unit tests for the wallet derivation handoff (OWASP A06:2025 — CWE-598,
// CWE-525, CWE-1125).
//
// Run: npm run test:app
//
// An extended public key derives every receive address a merchant will ever be
// paid to, so it is a durable financial-privacy secret even though it can spend
// nothing. It used to travel between the two screens of the connect/replace
// flow as an Expo Router param — which is the URL on the web target (address
// bar, history, back/forward cache) and is additionally serialized into
// restorable navigation state on every platform.
//
// These tests pin the replacement's security-relevant behaviour: the navigation
// carries an opaque handle, the key never leaves process memory, and every way
// the flow can be re-entered without the previous screen fails closed.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearDerivationScheme,
  readDerivationScheme,
  stashDerivationScheme,
} from './derivation-handoff.ts';

// Deliberately synthetic. It has the right SHAPE (a zpub token in the base58
// alphabet, so the "handle must not look like a key" assertions are meaningful)
// and obviously fabricated contents, so no plausible-looking wallet key ever
// lands in the repository.
const XPUB =
  'zpub6FIXTUREnotARea1Wa11etKeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

test('the handle is not the key: navigating carries an opaque token only', () => {
  const handle = stashDerivationScheme(XPUB);
  assert.notEqual(handle, XPUB);
  assert.ok(!handle.includes(XPUB), 'handle must not embed the key');
  // Nothing key-shaped: no xpub/zpub token and no descriptor parentheses.
  assert.ok(!/[xyztuv]pub[1-9A-HJ-NP-Za-km-z]{20,}/i.test(handle));
  assert.ok(!handle.includes('('));
  assert.equal(readDerivationScheme(handle), XPUB);
  clearDerivationScheme(handle);
});

test('handles are unguessable and never repeat', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(stashDerivationScheme(XPUB));
  assert.equal(seen.size, 200, 'every stash must mint a distinct handle');
  for (const h of seen) assert.ok(h.length >= 16, 'handle must not be trivially short');
});

test('an unknown handle fails closed', () => {
  stashDerivationScheme(XPUB);
  assert.equal(readDerivationScheme('not-a-real-handle'), null);
  assert.equal(readDerivationScheme(''), null);
  assert.equal(readDerivationScheme(undefined), null);
  assert.equal(readDerivationScheme(null), null);
});

test('a deep link or restored navigation state cannot resurrect a key', () => {
  // The attacker/OS supplies a handle the process never minted — e.g. a route
  // restored from a previous launch. There is nothing behind it.
  assert.equal(readDerivationScheme('00000000-0000-0000-0000-000000000000'), null);
});

test('only one handle is ever outstanding: a new stash invalidates the old one', () => {
  const first = stashDerivationScheme(XPUB);
  const second = stashDerivationScheme('wpkh([89abcdef/84h/0h/0h]xpub6FIXTURE2/**)');
  assert.notEqual(first, second);
  assert.equal(readDerivationScheme(first), null, 'the abandoned flow must be dropped');
  assert.ok(readDerivationScheme(second));
  clearDerivationScheme(second);
});

test('clearing consumes the entry, so a flow exit leaves nothing behind', () => {
  const handle = stashDerivationScheme(XPUB);
  assert.equal(readDerivationScheme(handle), XPUB);
  clearDerivationScheme(handle);
  assert.equal(readDerivationScheme(handle), null);
  // Idempotent: the flow clears on several exit paths and may run twice.
  clearDerivationScheme(handle);
  assert.equal(readDerivationScheme(handle), null);
});

test('an abandoned flow expires rather than holding the key for the session', async (t) => {
  const realNow = Date.now;
  t.after(() => {
    Date.now = realNow;
  });

  const handle = stashDerivationScheme(XPUB);
  assert.equal(readDerivationScheme(handle), XPUB);

  // 15 minutes + 1s later — the same clock the server-issued preview expires on.
  Date.now = () => realNow() + 15 * 60 * 1000 + 1000;
  assert.equal(readDerivationScheme(handle), null, 'expired handle must fail closed');
});

test('reads are non-destructive within a screen, so a re-render cannot lose the key', () => {
  const handle = stashDerivationScheme(XPUB);
  assert.equal(readDerivationScheme(handle), XPUB);
  assert.equal(readDerivationScheme(handle), XPUB);
  assert.equal(readDerivationScheme(handle), XPUB);
  clearDerivationScheme(handle);
});

test('the key is held only in module memory — nothing is serialized', () => {
  const handle = stashDerivationScheme(XPUB);
  // The module exports no snapshot/serializer, and the handle carries no state:
  // JSON-encoding everything the navigation layer can see reveals no key.
  const whatNavigationSees = JSON.stringify({ keyHandle: handle, mode: 'replace' });
  assert.ok(!whatNavigationSees.includes(XPUB));
  assert.ok(!whatNavigationSees.includes(XPUB.slice(0, 20)));
  clearDerivationScheme(handle);
});
