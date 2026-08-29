// Unit tests for the WebCrypto installer (OWASP A04:2025 — CWE-338, CWE-757).
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { createHash, webcrypto as nodeWebCrypto } from 'node:crypto';
import { test } from 'node:test';

import { encodeBase64, installWebCrypto, type PlatformCryptoBackend } from './web-crypto.ts';

function platformBackend(): PlatformCryptoBackend & { digestCalls: string[] } {
  const digestCalls: string[] = [];
  return {
    digestCalls,
    getRandomValues: <T extends ArrayBufferView>(values: T): T =>
      nodeWebCrypto.getRandomValues(values as never) as T,
    randomUUID: () => nodeWebCrypto.randomUUID(),
    digest: (algorithm: string, data: Uint8Array<ArrayBuffer>) => {
      digestCalls.push(algorithm);
      return Promise.resolve(
        createHash(algorithm.toLowerCase().replace('-', '')).update(data).digest()
          .buffer as ArrayBuffer,
      );
    },
  };
}

test('installs the primitives a bare Hermes-like global is missing', async () => {
  const target: Record<string, any> = {};
  const backend = platformBackend();

  const report = installWebCrypto(backend, target);

  assert.deepEqual(report, {
    getRandomValues: 'installed',
    randomUUID: 'installed',
    subtleDigest: 'installed',
    btoa: 'installed',
  });

  const bytes = target.crypto.getRandomValues(new Uint8Array(32));
  assert.equal(bytes.length, 32);
  assert.ok(
    bytes.some((b: number) => b !== 0),
    'getRandomValues returned all zeroes',
  );

  assert.match(
    target.crypto.randomUUID(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  const digest = await target.crypto.subtle.digest('SHA-256', new TextEncoder().encode('hachisu'));
  assert.equal(
    Buffer.from(digest).toString('hex'),
    createHash('sha256').update('hachisu').digest('hex'),
  );
  assert.deepEqual(backend.digestCalls, ['SHA-256']);
});

test('never replaces a primitive the runtime already provides', () => {
  const existingGetRandomValues = () => new Uint8Array(1);
  const existingDigest = () => Promise.resolve(new ArrayBuffer(0));
  const existingBtoa = () => 'untouched';
  const target: Record<string, any> = {
    crypto: { getRandomValues: existingGetRandomValues, subtle: { digest: existingDigest } },
    btoa: existingBtoa,
  };

  const report = installWebCrypto(platformBackend(), target);

  assert.equal(report.getRandomValues, 'already-present');
  assert.equal(report.subtleDigest, 'already-present');
  assert.equal(report.btoa, 'already-present');
  // randomUUID was genuinely absent, so it is the one thing filled in.
  assert.equal(report.randomUUID, 'installed');
  assert.equal(target.crypto.getRandomValues, existingGetRandomValues);
  assert.equal(target.crypto.subtle.digest, existingDigest);
  assert.equal(target.btoa, existingBtoa);
});

test('a missing platform backend surfaces as an error, never as weak randomness', () => {
  const target: Record<string, any> = {};
  installWebCrypto(
    {
      getRandomValues: () => {
        throw new Error('expo-crypto native module unavailable');
      },
      randomUUID: () => {
        throw new Error('expo-crypto native module unavailable');
      },
      digest: () => Promise.reject(new Error('expo-crypto native module unavailable')),
    },
    target,
  );

  assert.throws(() => target.crypto.getRandomValues(new Uint8Array(8)), /unavailable/);
});

test('the SubtleCrypto shim exposes digest and nothing it cannot honestly do', async () => {
  const target: Record<string, any> = {};
  installWebCrypto(platformBackend(), target);

  assert.equal(typeof target.crypto.subtle.digest, 'function');
  for (const method of ['encrypt', 'decrypt', 'sign', 'verify', 'deriveKey', 'importKey']) {
    assert.equal(
      target.crypto.subtle[method],
      undefined,
      `subtle.${method} must stay absent rather than be stubbed`,
    );
  }

  // Accepts both the string and { name } algorithm identifiers, and rejects the rest.
  await target.crypto.subtle.digest({ name: 'SHA-256' }, new Uint8Array([1]));
  await assert.rejects(() => target.crypto.subtle.digest(42, new Uint8Array([1])), TypeError);
});

test('base64 matches the platform btoa, including its Latin-1 range check', () => {
  const highLatin1 = String.fromCharCode(32, 255);
  const beyondLatin1 = String.fromCharCode(960);
  for (const input of ['', 'a', 'ab', 'abc', 'abcd', 'hachisu', highLatin1, 'M'.repeat(61)]) {
    assert.equal(encodeBase64(input), Buffer.from(input, 'latin1').toString('base64'), input);
  }
  assert.throws(() => encodeBase64(beyondLatin1), /Latin1/);
});

test('digest accepts the ArrayBuffer views auth-js passes it', async () => {
  const target: Record<string, any> = {};
  installWebCrypto(platformBackend(), target);
  const expected = createHash('sha256').update('abc').digest('hex');

  const encoded = new TextEncoder().encode('abc');
  const fromView = await target.crypto.subtle.digest('SHA-256', encoded);
  const fromBuffer = await target.crypto.subtle.digest('SHA-256', encoded.buffer);
  // A view with a non-zero byteOffset must hash its own window, not the backing buffer.
  const padded = new Uint8Array([9, ...encoded]);
  const fromOffsetView = await target.crypto.subtle.digest('SHA-256', padded.subarray(1));

  assert.equal(Buffer.from(fromView).toString('hex'), expected);
  assert.equal(Buffer.from(fromBuffer).toString('hex'), expected);
  assert.equal(Buffer.from(fromOffsetView).toString('hex'), expected);
});
