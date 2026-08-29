// Storage adapter for the Supabase auth session.
//
// OWASP A04:2025 — Cryptographic Failures (CWE-320 key/credential management,
// CWE-312 cleartext storage of sensitive information).
//
// The persisted session is a bearer credential. The refresh token inside it is
// the durable half — it outlives access-token expiry and can be redeemed for new
// access tokens until it is revoked — so whatever can read it can act as the
// merchant. AsyncStorage is unencrypted app-private storage (an SQLite database
// on Android, a plain file on iOS, both captured by device backups by default),
// which is the right home for a remembered store selection and the wrong home
// for a credential. This adapter puts the session behind the platform secure
// store (iOS Keychain / Android Keystore) instead, and migrates any session an
// earlier build already wrote in the clear.
//
// Two constraints shape the implementation:
//
//   1. expo-secure-store caps a value at 2048 bytes. A real session — access
//      JWT, refresh token, and the user object with its identities — routinely
//      exceeds that, so values are split across numbered entries with the base
//      key holding a manifest. Splitting is by UTF-8 byte budget on code-point
//      boundaries, so a name with an emoji in it cannot be torn in half.
//   2. There is no platform secure store on web. There, and during a static web
//      prerender, the adapter degrades to the previous behaviour explicitly
//      rather than silently.
//
// Deliberately free of React Native imports so it can be exercised directly in a
// Node unit test — see lib/auth/session-storage.test.ts.
// lib/auth/secure-session-storage.ts supplies the real backends.

export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** The shape @supabase/supabase-js expects for `auth.storage`, plus a purge. */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /**
   * Removes everything this adapter has ever written to the secure store — the
   * session and any PKCE verifier slot, chunks included. The platform secure
   * store cannot be enumerated, so the adapter keeps an index of the KEY NAMES
   * it has written (names only, never values) in ordinary storage. Used by
   * account deletion, where nothing belonging to the deleted account may
   * survive on the device.
   */
  purgeAll(): Promise<void>;
}

export interface SessionStorageDeps {
  /**
   * Platform-backed storage (iOS Keychain / Android Keystore). `null` on web,
   * where no such store exists and AsyncStorage is the only option.
   */
  secureStore: KeyValueBackend | null;
  /** Unencrypted device storage. Only ever holds a session mid-migration. */
  asyncStorage: KeyValueBackend;
  /**
   * True during a static web prerender, where there is no device storage at all.
   * Every operation becomes a no-op rather than throwing.
   */
  isPrerendering(): boolean;
  /**
   * Byte budget for one secure-store entry. Defaults comfortably below
   * expo-secure-store's documented 2048-byte ceiling.
   */
  maxSecureValueBytes?: number;
}

const DEFAULT_MAX_SECURE_VALUE_BYTES = 1536;

/** Marks the base key as a manifest so a chunk set is never mistaken for a value. */
const MANIFEST_PREFIX = 'hachisu.session.v1:';

/**
 * Upper bound on the chunk indices a purge will look at. Far above any real
 * session; it only bounds the loop.
 */
const MAX_SWEEP_CHUNKS = 64;

/**
 * Index of the base keys written to the secure store. Holds key NAMES only — no
 * token material — because the platform secure store offers no enumeration and
 * account deletion has to be able to clear what it cannot list.
 */
const SECURE_KEY_INDEX = 'hachisu.secure-session-keys.v1';

function chunkKey(key: string, index: number): string {
  // expo-secure-store keys allow [A-Za-z0-9_.-], which this stays inside.
  return `${key}.${index}`;
}

/** UTF-8 length of a single code point. */
function utf8Size(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Splits `value` into pieces of at most `maxBytes` UTF-8 bytes, never cutting a
 * code point (so surrogate pairs — emoji, and anything outside the BMP — survive
 * the round trip). Always returns at least one piece.
 */
export function splitByUtf8Bytes(value: string, maxBytes: number): string[] {
  const budget = Math.max(4, maxBytes);
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of value) {
    const size = utf8Size(character);
    if (currentBytes + size > budget) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += size;
  }
  if (current !== '' || chunks.length === 0) chunks.push(current);

  return chunks;
}

function parseManifest(raw: string | null): number | null {
  if (raw === null || !raw.startsWith(MANIFEST_PREFIX)) return null;
  const count = Number(raw.slice(MANIFEST_PREFIX.length));
  if (!Number.isInteger(count) || count < 1 || count > MAX_SWEEP_CHUNKS) return null;
  return count;
}

export function createSessionStorage(deps: SessionStorageDeps): SessionStorage {
  const maxBytes = deps.maxSecureValueBytes ?? DEFAULT_MAX_SECURE_VALUE_BYTES;

  async function readKeyIndex(): Promise<string[]> {
    try {
      const raw = await deps.asyncStorage.getItem(SECURE_KEY_INDEX);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    } catch {
      return [];
    }
  }

  async function writeKeyIndex(keys: string[]): Promise<void> {
    try {
      if (keys.length === 0) await deps.asyncStorage.removeItem(SECURE_KEY_INDEX);
      else await deps.asyncStorage.setItem(SECURE_KEY_INDEX, JSON.stringify(keys));
    } catch {
      // Best effort. A missing index only costs completeness on a later purge,
      // never correctness of the session itself.
    }
  }

  /**
   * Deletes the manifest and every chunk index that could belong to `key`.
   *
   * The whole bounded range is swept rather than just the count the manifest
   * records: a crash between writing chunks and committing the manifest leaves
   * entries the manifest does not mention, and a credential must not survive
   * sign-out because a heuristic stopped early. This runs only on sign-out and
   * account deletion, so the fixed number of lookups is not on any hot path.
   */
  async function purgeSecure(key: string, secure: KeyValueBackend): Promise<void> {
    await secure.removeItem(key);
    for (let index = 0; index < MAX_SWEEP_CHUNKS; index += 1) {
      await secure.removeItem(chunkKey(key, index));
    }
  }

  async function writeSecure(
    key: string,
    value: string,
    secure: KeyValueBackend,
  ): Promise<void> {
    const previousCount = parseManifest(await secure.getItem(key).catch(() => null));
    const chunks = splitByUtf8Bytes(value, maxBytes);

    for (const [index, chunk] of chunks.entries()) {
      await secure.setItem(chunkKey(key, index), chunk);
    }
    // The manifest is written last: it is the commit point, so a partial write
    // can never be read back as a whole session.
    await secure.setItem(key, `${MANIFEST_PREFIX}${chunks.length}`);

    if (previousCount !== null) {
      for (let index = chunks.length; index < previousCount; index += 1) {
        await secure.removeItem(chunkKey(key, index));
      }
    }
  }

  async function readSecure(key: string, secure: KeyValueBackend): Promise<string | null> {
    const count = parseManifest(await secure.getItem(key));
    if (count === null) return null;

    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = await secure.getItem(chunkKey(key, index));
      // A missing chunk means the stored session is incomplete. Report nothing
      // rather than a truncated credential, and clear the remains.
      if (chunk === null) {
        await purgeSecure(key, secure);
        return null;
      }
      parts.push(chunk);
    }
    return parts.join('');
  }

  return {
    async getItem(key) {
      if (deps.isPrerendering()) return null;
      if (!deps.secureStore) return deps.asyncStorage.getItem(key);

      const secure = await readSecure(key, deps.secureStore);
      if (secure !== null) return secure;

      // Migration: a session an earlier build persisted in the clear. Move it
      // behind the platform store and delete the plaintext copy.
      const legacy = await deps.asyncStorage.getItem(key);
      if (legacy === null) return null;
      try {
        await writeSecure(key, legacy, deps.secureStore);
        const index = await readKeyIndex();
        if (!index.includes(key)) await writeKeyIndex([...index, key]);
        await deps.asyncStorage.removeItem(key);
      } catch {
        // The secure store is unavailable on this device. Keep the merchant
        // signed in with the copy that already exists rather than locking them
        // out of their payments app; the plaintext copy is the pre-existing
        // state, not a new exposure, and the next successful setItem clears it.
        // Steady-state writes still fail closed — see setItem below.
      }
      return legacy;
    },

    async setItem(key, value) {
      if (deps.isPrerendering()) return;
      if (!deps.secureStore) return deps.asyncStorage.setItem(key, value);

      // No catch: if the session cannot be stored securely it must not be
      // stored at all. Falling back to AsyncStorage here would quietly reinstate
      // the plaintext credential this adapter exists to remove.
      await writeSecure(key, value, deps.secureStore);
      const index = await readKeyIndex();
      if (!index.includes(key)) await writeKeyIndex([...index, key]);
      // Best effort: drop any plaintext copy a previous build left behind.
      await deps.asyncStorage.removeItem(key).catch(() => {});
    },

    async removeItem(key) {
      if (deps.isPrerendering()) return;
      if (deps.secureStore) await purgeSecure(key, deps.secureStore);
      await deps.asyncStorage.removeItem(key);
      const index = await readKeyIndex();
      if (index.includes(key)) await writeKeyIndex(index.filter((entry) => entry !== key));
    },

    async purgeAll() {
      if (deps.isPrerendering()) return;
      const index = await readKeyIndex();
      for (const key of index) {
        if (deps.secureStore) await purgeSecure(key, deps.secureStore);
        await deps.asyncStorage.removeItem(key).catch(() => {});
      }
      await writeKeyIndex([]);
    },
  };
}
