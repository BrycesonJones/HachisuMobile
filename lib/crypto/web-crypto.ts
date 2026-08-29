// Installs the Web Crypto primitives the JS runtime is missing, backed by a
// platform CSPRNG/digest supplied by the caller.
//
// OWASP A04:2025 — Cryptographic Failures (CWE-338 weak PRNG, CWE-757 algorithm
// downgrade, CWE-325 missing cryptographic step).
//
// WHY THIS EXISTS. Hermes has no `crypto` global, and neither React Native 0.81
// nor Expo SDK 54's WinterCG runtime installs one (expo/src/winter/
// runtime.native.ts installs TextDecoder, TextEncoderStream, URL,
// URLSearchParams and structuredClone — and no crypto). Libraries that need
// randomness therefore take their fallback path, and those fallbacks are
// routinely Math.random(). @supabase/auth-js is exactly this case: without
// WebCrypto it generates the PKCE code verifier from Math.random() and, because
// it cannot hash, sends the verifier itself as the challenge
// (code_challenge_method=plain). Both defeat PKCE.
//
// Hermes' Math.random() is a fast non-cryptographic PRNG whose internal state is
// recoverable from a handful of outputs. Hachisu itself emits Math.random()
// -derived strings to the server (invoice order ids, idempotency keys), so a
// security value drawn from the same generator must be treated as observable,
// not merely "random enough".
//
// WHAT THIS IS NOT. No cryptography is implemented here. getRandomValues,
// randomUUID and the SHA-2 digest are all delegated to the platform (see
// lib/crypto/polyfill.ts, which supplies expo-crypto). The only algorithm in
// this file is base64 — an encoding, not a cipher — provided because
// auth-js's S256 path calls btoa() and Hermes may not define it.
//
// RULES. Nothing already present is ever replaced, and there is deliberately no
// Math.random() or "best effort" fallback: if the platform backend is missing,
// the caller gets an error rather than silently weak crypto.
//
// Regression coverage: lib/crypto/web-crypto.test.ts and the Hermes-runtime case
// in lib/auth/oauth-pkce.test.ts.

/** The platform primitives this module needs. Supplied by expo-crypto in the app. */
export interface PlatformCryptoBackend {
  /** Fills `values` in place with cryptographically secure random bytes. */
  getRandomValues<T extends ArrayBufferView>(values: T): T;
  /** RFC 4122 v4 UUID drawn from the platform CSPRNG. */
  randomUUID(): string;
  /** SHA-2 digest. Mirrors SubtleCrypto.digest's contract. */
  digest(algorithm: string, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>;
}

export type InstallOutcome = 'installed' | 'already-present';

export interface InstallWebCryptoReport {
  getRandomValues: InstallOutcome;
  randomUUID: InstallOutcome;
  subtleDigest: InstallOutcome;
  btoa: InstallOutcome;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Standard base64 over a binary (Latin-1) string, matching the HTML `btoa`
 * contract including its Latin-1 range check.
 */
export function encodeBase64(binary: string): string {
  let out = '';
  for (let i = 0; i < binary.length; i += 3) {
    const b0 = binary.charCodeAt(i);
    const has1 = i + 1 < binary.length;
    const has2 = i + 2 < binary.length;
    const b1 = has1 ? binary.charCodeAt(i + 1) : 0;
    const b2 = has2 ? binary.charCodeAt(i + 2) : 0;
    if (b0 > 0xff || b1 > 0xff || b2 > 0xff) {
      throw new Error('btoa: the string contains characters outside of the Latin1 range.');
    }
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    out += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    out += has1 ? BASE64_ALPHABET[(triple >> 6) & 0x3f] : '=';
    out += has2 ? BASE64_ALPHABET[triple & 0x3f] : '=';
  }
  return out;
}

/** Normalizes the algorithm names SubtleCrypto.digest accepts to a plain string. */
function digestAlgorithmName(algorithm: unknown): string {
  if (typeof algorithm === 'string') return algorithm;
  if (algorithm && typeof (algorithm as { name?: unknown }).name === 'string') {
    return (algorithm as { name: string }).name;
  }
  throw new TypeError('crypto.subtle.digest: unsupported algorithm identifier.');
}

function toBytes(data: BufferSource): Uint8Array<ArrayBuffer> {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data as ArrayBuffer);
}

/**
 * Installs `crypto.getRandomValues`, `crypto.randomUUID`, `crypto.subtle.digest`
 * and `btoa` on `target` — each only if the runtime does not already provide it.
 * Returns what was installed versus what was already there.
 */
export function installWebCrypto(
  backend: PlatformCryptoBackend,
  target: Record<string, any> = globalThis as unknown as Record<string, any>,
): InstallWebCryptoReport {
  if (!target.crypto || typeof target.crypto !== 'object') {
    // Not writable/configurable on every engine; define rather than assign.
    Object.defineProperty(target, 'crypto', {
      value: {},
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  const cryptoObject = target.crypto as Record<string, any>;

  const report: InstallWebCryptoReport = {
    getRandomValues: 'already-present',
    randomUUID: 'already-present',
    subtleDigest: 'already-present',
    btoa: 'already-present',
  };

  if (typeof cryptoObject.getRandomValues !== 'function') {
    cryptoObject.getRandomValues = <T extends ArrayBufferView>(values: T): T =>
      backend.getRandomValues(values);
    report.getRandomValues = 'installed';
  }

  if (typeof cryptoObject.randomUUID !== 'function') {
    cryptoObject.randomUUID = (): string => backend.randomUUID();
    report.randomUUID = 'installed';
  }

  // Only `digest` is provided. Anything else on SubtleCrypto stays absent on
  // purpose: an absent method throws, which is the honest outcome, whereas a
  // stub would be a wrong one.
  if (!cryptoObject.subtle || typeof cryptoObject.subtle !== 'object') {
    cryptoObject.subtle = {};
  }
  const subtle = cryptoObject.subtle as Record<string, any>;
  if (typeof subtle.digest !== 'function') {
    // `async` on purpose: SubtleCrypto.digest reports every failure — including a
    // bad algorithm identifier — as a rejected promise, never a synchronous throw.
    subtle.digest = async (algorithm: unknown, data: BufferSource): Promise<ArrayBuffer> =>
      backend.digest(digestAlgorithmName(algorithm), toBytes(data));
    report.subtleDigest = 'installed';
  }

  if (typeof target.btoa !== 'function') {
    target.btoa = encodeBase64;
    report.btoa = 'installed';
  }

  return report;
}
