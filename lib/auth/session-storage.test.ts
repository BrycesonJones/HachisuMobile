// Regression tests for where Hachisu keeps the Supabase auth session.
//
// OWASP A04:2025 — Cryptographic Failures (CWE-320 key/credential management;
// CWE-312 cleartext storage of sensitive information).
//
// The persisted session is a bearer credential, and the refresh token inside it
// is the durable half: it survives access-token expiry and can be redeemed for
// new access tokens until it is revoked. Anything that can read it can act as
// the merchant — list stores, read invoices and payouts, replace the on-chain
// wallet, close the account.
//
// AsyncStorage is unencrypted app-private storage: an SQLite database on Android
// and a plain file on iOS, both included in device backups by default. It is the
// right place for a remembered store selection; it is the wrong place for a
// credential. expo-secure-store puts the value behind the iOS Keychain and
// Android Keystore instead, which is the storage the platform provides for
// exactly this.
//
// These tests assert the property, not the plumbing: no part of the session may
// be legible in AsyncStorage, and what does get written must fit inside the
// platform secure store's documented limits.
//
// Run: npm run test:app

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSessionStorage, type KeyValueBackend } from './session-storage.ts';

// The key @supabase/auth-js derives from the project ref.
const SESSION_KEY = 'sb-alicjprjjephyvbpbimw-auth-token';

// expo-secure-store documents a 2048-byte ceiling per value on Android.
const SECURE_STORE_VALUE_LIMIT_BYTES = 2048;

const REFRESH_TOKEN = 'gq7x2v9nq4hp5c8zttrg';
const ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  Buffer.from(
    JSON.stringify({ sub: '00000000-0000-4000-8000-000000000001', exp: 4102444800 }),
  ).toString('base64url') +
  '.c2lnbmF0dXJl';

/** The shape supabase-js persists under its storage key. */
function persistedSession(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: ACCESS_TOKEN,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    refresh_token: REFRESH_TOKEN,
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'merchant@example.com',
      app_metadata: { provider: 'google', providers: ['google', 'email'] },
      user_metadata: { full_name: 'Test Merchant' },
      ...extra,
    },
  });
}

function memoryBackend() {
  const map = new Map<string, string>();
  const backend: KeyValueBackend & { map: Map<string, string>; failWrites?: boolean } = {
    map,
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    setItem: (key, value) => {
      if (backend.failWrites) return Promise.reject(new Error('keychain unavailable'));
      map.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
  return backend;
}

/** A backend that enforces the real expo-secure-store constraints. */
function secureStoreBackend() {
  const backend = memoryBackend();
  const innerSet = backend.setItem;
  backend.setItem = (key, value) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) {
      return Promise.reject(new Error(`SecureStore rejects the key "${key}"`));
    }
    if (Buffer.byteLength(value, 'utf8') > SECURE_STORE_VALUE_LIMIT_BYTES) {
      return Promise.reject(new Error(`SecureStore value exceeds ${SECURE_STORE_VALUE_LIMIT_BYTES} bytes`));
    }
    return innerSet(key, value);
  };
  return backend;
}

function build(overrides: {
  secureStore?: ReturnType<typeof memoryBackend> | null;
  asyncStorage?: ReturnType<typeof memoryBackend>;
  isPrerendering?: () => boolean;
} = {}) {
  const secureStore = overrides.secureStore === undefined ? secureStoreBackend() : overrides.secureStore;
  const asyncStorage = overrides.asyncStorage ?? memoryBackend();
  const storage = createSessionStorage({
    secureStore,
    asyncStorage,
    isPrerendering: overrides.isPrerendering ?? (() => false),
  });
  return { storage, secureStore, asyncStorage };
}

/** Everything currently legible in a backend, as one string. */
function contents(backend: ReturnType<typeof memoryBackend>): string {
  return [...backend.map.entries()].map(([k, v]) => `${k}=${v}`).join('\n');
}

test('the refresh token never reaches unencrypted AsyncStorage', async () => {
  const { storage, asyncStorage } = build();

  await storage.setItem(SESSION_KEY, persistedSession());

  assert.ok(
    !contents(asyncStorage).includes(REFRESH_TOKEN),
    'the refresh token is sitting in plaintext AsyncStorage — anything with ' +
      'access to app storage or a device backup can redeem it for live sessions',
  );
  assert.ok(!contents(asyncStorage).includes(ACCESS_TOKEN), 'the access token is in AsyncStorage');
});

test('the session is stored in the platform secure store and round-trips', async () => {
  const { storage, secureStore } = build();
  const session = persistedSession();

  await storage.setItem(SESSION_KEY, session);

  assert.ok(secureStore, 'no secure store was configured');
  assert.ok(
    contents(secureStore).includes(REFRESH_TOKEN),
    'the session was not written to the secure store at all',
  );
  assert.equal(await storage.getItem(SESSION_KEY), session);
});

test('an oversized session is chunked to stay inside the secure store limit', async () => {
  const { storage, secureStore } = build();
  // A real session with a rich identity payload comfortably exceeds 2048 bytes.
  const session = persistedSession({ identities: [{ note: 'x'.repeat(6000) }] });
  assert.ok(Buffer.byteLength(session, 'utf8') > SECURE_STORE_VALUE_LIMIT_BYTES);

  await storage.setItem(SESSION_KEY, session);

  assert.ok(secureStore);
  assert.ok(
    contents(secureStore).includes(REFRESH_TOKEN),
    'the oversized session was not written to the secure store',
  );
  for (const [key, value] of secureStore.map) {
    assert.ok(
      Buffer.byteLength(value, 'utf8') <= SECURE_STORE_VALUE_LIMIT_BYTES,
      `secure store entry ${key} is ${Buffer.byteLength(value, 'utf8')} bytes`,
    );
  }
  assert.equal(await storage.getItem(SESSION_KEY), session);
});

test('chunking never splits a multi-byte character', async () => {
  const { storage, secureStore, asyncStorage } = build();
  // Emoji are surrogate pairs and four UTF-8 bytes; a naive split corrupts them.
  const session = persistedSession({ user_metadata: { full_name: '\u{1F600}'.repeat(2000) } });

  await storage.setItem(SESSION_KEY, session);

  assert.equal(await storage.getItem(SESSION_KEY), session);
  assert.ok(secureStore);
  assert.ok(contents(secureStore).includes(REFRESH_TOKEN));
  assert.ok(!contents(asyncStorage).includes(REFRESH_TOKEN));
});

test('an existing AsyncStorage session is migrated, not stranded and not left behind', async () => {
  const asyncStorage = memoryBackend();
  // A session written by the previous build of the app.
  const legacySession = persistedSession();
  await asyncStorage.setItem(SESSION_KEY, legacySession);
  const { storage, secureStore } = build({ asyncStorage });

  // The user must stay signed in across the upgrade.
  assert.equal(await storage.getItem(SESSION_KEY), legacySession);

  assert.ok(secureStore);
  assert.ok(
    contents(secureStore).includes(REFRESH_TOKEN),
    'the legacy session was read but never moved into the secure store',
  );
  assert.equal(
    await asyncStorage.getItem(SESSION_KEY),
    null,
    'the plaintext copy survived the migration',
  );
});

test('sign-out clears every chunk and any legacy plaintext copy', async () => {
  const asyncStorage = memoryBackend();
  await asyncStorage.setItem(SESSION_KEY, persistedSession());
  const { storage, secureStore } = build({ asyncStorage });
  await storage.setItem(SESSION_KEY, persistedSession({ identities: [{ note: 'y'.repeat(6000) }] }));
  assert.ok(secureStore);
  assert.ok(contents(secureStore).includes(REFRESH_TOKEN), 'nothing was stored securely to clear');

  await storage.removeItem(SESSION_KEY);

  assert.equal(await storage.getItem(SESSION_KEY), null);
  assert.ok(secureStore);
  assert.equal(secureStore.map.size, 0, `secure store still holds ${[...secureStore.map.keys()]}`);
  assert.equal(asyncStorage.map.size, 0, `AsyncStorage still holds ${[...asyncStorage.map.keys()]}`);
});

test('a shrinking session does not leave stale chunks behind', async () => {
  const { storage, secureStore } = build();
  await storage.setItem(SESSION_KEY, persistedSession({ identities: [{ note: 'z'.repeat(9000) }] }));

  const short = persistedSession();
  await storage.setItem(SESSION_KEY, short);

  assert.equal(await storage.getItem(SESSION_KEY), short);
  assert.ok(secureStore);
  assert.ok(contents(secureStore).includes(REFRESH_TOKEN), 'nothing was stored securely');
  assert.ok(
    !contents(secureStore).includes('zzzz'),
    'chunks from the larger previous session are still readable',
  );
});

test('a secure store failure never silently downgrades to plaintext', async () => {
  const secureStore = secureStoreBackend();
  secureStore.failWrites = true;
  const { storage, asyncStorage } = build({ secureStore });

  await assert.rejects(
    () => storage.setItem(SESSION_KEY, persistedSession()),
    'the write was reported as successful even though nothing was stored securely',
  );
  assert.ok(
    !contents(asyncStorage).includes(REFRESH_TOKEN),
    'the session fell back to plaintext AsyncStorage when the keychain failed',
  );
});

test('web, where there is no platform secure store, still works', async () => {
  const { storage, asyncStorage } = build({ secureStore: null });
  const session = persistedSession();

  await storage.setItem(SESSION_KEY, session);

  assert.equal(await storage.getItem(SESSION_KEY), session);
  await storage.removeItem(SESSION_KEY);
  assert.equal(asyncStorage.map.size, 0);
});

test('a static web prerender touches no storage at all', async () => {
  const { storage, asyncStorage, secureStore } = build({ isPrerendering: () => true });

  assert.equal(await storage.getItem(SESSION_KEY), null);
  await storage.setItem(SESSION_KEY, persistedSession());
  assert.equal(asyncStorage.map.size, 0);
  assert.ok(secureStore);
  assert.equal(secureStore.map.size, 0);
});

test('account deletion can purge the secure store, which cannot be enumerated', async () => {
  const { storage, secureStore, asyncStorage } = build();
  await storage.setItem(SESSION_KEY, persistedSession({ identities: [{ note: 'q'.repeat(6000) }] }));
  // The PKCE verifier slots auth-js writes alongside the session.
  await storage.setItem(`${SESSION_KEY}-flow-abc123def456-code-verifier`, 'verifier-value');
  await storage.setItem(`${SESSION_KEY}-flows-code-verifier`, '["abc123def456"]');
  assert.ok(secureStore);
  assert.ok(secureStore.map.size > 0);

  await storage.purgeAll();

  assert.equal(
    secureStore.map.size,
    0,
    `secure store still holds ${[...secureStore.map.keys()]} after account deletion`,
  );
  assert.equal(await storage.getItem(SESSION_KEY), null);
  assert.equal(asyncStorage.map.size, 0, `AsyncStorage still holds ${[...asyncStorage.map.keys()]}`);
});

test('the key index records key names only, never token material', async () => {
  const { storage, asyncStorage } = build();

  await storage.setItem(SESSION_KEY, persistedSession());

  const index = contents(asyncStorage);
  assert.ok(index.includes(SESSION_KEY), 'the written key was not indexed for later purging');
  assert.ok(!index.includes(REFRESH_TOKEN));
  assert.ok(!index.includes(ACCESS_TOKEN));
});

test('a purge also removes chunks a crashed write left past the manifest', async () => {
  const { storage, secureStore } = build();
  await storage.setItem(SESSION_KEY, persistedSession());
  assert.ok(secureStore);
  // Simulate an interrupted larger write: chunks committed, manifest never updated.
  await secureStore.setItem(`${SESSION_KEY}.7`, 'orphaned-chunk');
  await secureStore.setItem(`${SESSION_KEY}.8`, 'orphaned-chunk');

  await storage.removeItem(SESSION_KEY);

  assert.equal(
    secureStore.map.size,
    0,
    `orphaned entries survived the purge: ${[...secureStore.map.keys()]}`,
  );
});
