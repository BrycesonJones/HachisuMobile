// Regression tests for the cryptographic correctness of Hachisu's OAuth sign-in.
//
// OWASP A04:2025 — Cryptographic Failures (CWE-325 missing required
// cryptographic step, CWE-523 unprotected transport of credentials).
//
// Hachisu signs users in with Google through a system browser that redirects
// back to the app's custom scheme (hachisumobile://). RFC 8252 §8.1 requires
// PKCE for exactly this shape of client: a custom-scheme redirect is claimable
// by any other app installed on the device, so an authorization response that
// carries credentials — or an authorization code with nothing bound to it — is
// interceptable. Without PKCE, supabase-js uses the implicit flow and the
// redirect delivers the ACCESS AND REFRESH TOKENS themselves in the URL
// fragment; whoever receives that deep link owns the merchant's account.
//
// These tests assert the property that makes interception useless: the
// authorization request must commit to a secret the interceptor does not have,
// hashed with SHA-256 (S256), never sent in the clear (`plain`).
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { createHash, webcrypto as nodeWebCrypto } from 'node:crypto';
import { test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { installWebCrypto } from '../crypto/web-crypto.ts';
import { supabaseAuthOptions } from './supabase-auth-options.ts';

const PROJECT_URL = 'https://example-project.supabase.co';
// Not a credential: a structurally valid but fictitious key. No network call is
// made — signInWithOAuth builds the authorization URL locally.
const ANON_KEY = 'test-anon-key';
const REDIRECT_TO = 'hachisumobile://';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => Promise.resolve(map.get(key) ?? null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

/** Builds the Google authorization URL exactly as lib/auth/auth-service.ts does. */
async function googleAuthorizationUrl() {
  const storage = memoryStorage();
  const client = createClient(PROJECT_URL, ANON_KEY, {
    auth: { ...supabaseAuthOptions, storage },
  });
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
    });
    assert.equal(error, null);
    assert.ok(data?.url, 'signInWithOAuth returned no authorization URL');
    return { url: new URL(data.url), storage };
  } finally {
    await client.auth.stopAutoRefresh();
  }
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('the Google authorization request carries a PKCE challenge', async () => {
  const { url } = await googleAuthorizationUrl();

  assert.ok(
    url.searchParams.get('code_challenge'),
    'no code_challenge — the authorization code (or, on the implicit flow, the ' +
      'access and refresh tokens) can be replayed by anything that claims the ' +
      'hachisumobile:// redirect',
  );
});

test('the PKCE challenge uses S256, never the plaintext `plain` method', async () => {
  const { url } = await googleAuthorizationUrl();

  assert.equal(
    url.searchParams.get('code_challenge_method')?.toLowerCase(),
    's256',
    'the challenge method must be S256 — `plain` sends the verifier itself in ' +
      'the authorization request, so an attacker who can read that request can ' +
      'complete the exchange',
  );
});

test('the challenge is the SHA-256 of the stored verifier, and the verifier is unpredictable', async () => {
  const { url, storage } = await googleAuthorizationUrl();

  const verifierEntry = [...storage.map.entries()].find(([key]) =>
    key.endsWith('-code-verifier'),
  );
  assert.ok(verifierEntry, 'no PKCE code verifier was persisted for the exchange');
  // supabase-js persists storage values JSON-encoded; the slot holds
  // "<verifier>" or "<verifier>/<redirectType>".
  const verifier = String(JSON.parse(verifierEntry[1])).split('/')[0];

  // RFC 7636 §4.1: the verifier is 43–128 unreserved characters.
  assert.ok(
    verifier.length >= 43 && verifier.length <= 128,
    `verifier length ${verifier.length} is outside the RFC 7636 range`,
  );
  assert.match(verifier, /^[A-Za-z0-9\-._~]+$/);

  // The challenge must actually be bound to that verifier by SHA-256 — proving
  // S256 was applied rather than merely advertised.
  assert.equal(
    url.searchParams.get('code_challenge'),
    base64url(createHash('sha256').update(verifier).digest()),
    'code_challenge is not the SHA-256 of the persisted verifier',
  );

  // Two flows must not share a verifier.
  const second = await googleAuthorizationUrl();
  const secondEntry = [...second.storage.map.entries()].find(([key]) =>
    key.endsWith('-code-verifier'),
  );
  assert.ok(secondEntry, 'the second sign-in attempt persisted no verifier');
  const secondVerifier = String(JSON.parse(secondEntry[1])).split('/')[0];
  assert.notEqual(verifier, secondVerifier, 'two sign-in attempts reused one verifier');
});

// ---------------------------------------------------------------------------
// The runtime Hachisu actually ships on
// ---------------------------------------------------------------------------
//
// PKCE is only worth anything if the verifier is unpredictable and the challenge
// is a real SHA-256 of it. supabase-js checks for WebCrypto at call time and
// silently degrades when it is missing: generatePKCEVerifier() falls back to a
// Math.random() loop, and generatePKCEChallenge() logs a warning and returns the
// verifier ITSELF as the challenge (`plain`).
//
// Hermes provides no `crypto` global, and neither React Native 0.81 nor Expo
// SDK 54's WinterCG runtime installs one (expo/src/winter/runtime.native.ts
// installs TextDecoder, TextEncoderStream, URL, URLSearchParams and
// structuredClone — and no crypto). So this is not a hypothetical runtime: it is
// the app's. Nothing is stubbed here beyond removing the globals Hermes lacks.

const HERMES_MISSING_GLOBALS = ['crypto', 'btoa', 'atob'] as const;

/** Runs `fn` with the globals Hermes does not provide removed. */
async function inHermesLikeRuntime<T>(fn: () => Promise<T>): Promise<T> {
  const saved = HERMES_MISSING_GLOBALS.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name] of saved) delete (globalThis as Record<string, unknown>)[name];
  try {
    return await fn();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    }
  }
}

/**
 * The platform backend lib/crypto/polyfill.ts supplies from expo-crypto. Node's
 * own CSPRNG and SHA-2 stand in for the native ones here; what is under test is
 * that the installer wires them into the shape auth-js looks for.
 */
const nodePlatformBackend = {
  getRandomValues: <T extends ArrayBufferView>(values: T): T =>
    nodeWebCrypto.getRandomValues(values as never) as T,
  randomUUID: () => nodeWebCrypto.randomUUID(),
  digest: (algorithm: string, data: Uint8Array<ArrayBuffer>) =>
    Promise.resolve(
      createHash(algorithm.toLowerCase().replace('-', '')).update(data).digest().buffer as ArrayBuffer,
    ),
};

test('PKCE stays S256 in the runtime the app ships on (Hermes: no WebCrypto)', async () => {
  const { url, storage } = await inHermesLikeRuntime(async () => {
    // Exactly what app/_layout.tsx and lib/supabase.ts do at bootstrap.
    installWebCrypto(nodePlatformBackend);
    return googleAuthorizationUrl();
  });

  const verifierEntry = [...storage.map.entries()].find(([key]) =>
    key.endsWith('-code-verifier'),
  );
  assert.ok(verifierEntry, 'no PKCE code verifier was persisted for the exchange');
  const verifier = String(JSON.parse(verifierEntry[1])).split('/')[0];

  assert.equal(
    url.searchParams.get('code_challenge_method')?.toLowerCase(),
    's256',
    'PKCE degraded to `plain` because the runtime has no WebCrypto',
  );
  assert.notEqual(
    url.searchParams.get('code_challenge'),
    verifier,
    'the challenge IS the verifier — no hashing happened, so the authorization ' +
      'request carries the secret it is supposed to hide',
  );
  assert.equal(
    url.searchParams.get('code_challenge'),
    base64url(createHash('sha256').update(verifier).digest()),
    'code_challenge is not the SHA-256 of the persisted verifier',
  );
});
