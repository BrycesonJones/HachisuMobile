/**
 * In-memory handoff for a merchant's extended public key / output descriptor as
 * it moves between the two screens of the wallet connect and replace flows.
 *
 * Why this is not a route param
 * -----------------------------
 * The key is public-key material — it cannot spend anything. But it derives
 * EVERY receive address for the wallet, so anyone holding it can reconstruct
 * the merchant's full on-chain balance and payment history for as long as that
 * wallet is in use. It is a durable financial-privacy secret.
 *
 * Expo Router params are not a private channel. On the web target they are the
 * URL: the key lands in the address bar, in browser history, in the back/forward
 * cache, and in anything that records visited URLs — surviving long after the
 * flow ends and long after the session is signed out. Router state is also
 * serialized for state restoration, which is a second copy the flow never asked
 * for.
 *
 * So the navigation carries an opaque handle and the key stays in module memory:
 * never written to disk, never in a URL, gone when the app process ends.
 *
 * Exactly one handle is ever outstanding: stashing a new scheme drops any
 * previous one, and the flow clears its handle on every exit (confirm, cancel,
 * close, error redirect). Reads are non-destructive so a re-render cannot lose
 * the value mid-screen; the handle is process-local and meaningless to anyone
 * else, so that costs nothing. It also expires on the same 15-minute clock as
 * the server-issued address preview it accompanies, so an abandoned flow cannot
 * leave key material in memory for the rest of the session.
 */

const TTL_MS = 15 * 60 * 1000;

interface Entry {
  value: string;
  expiresAt: number;
}

const entries = new Map<string, Entry>();

/**
 * An opaque, unguessable handle. `lib/crypto/polyfill` installs a real WebCrypto
 * (platform CSPRNG) before anything in the app runs, so randomUUID is available;
 * the fallback only matters for a runtime without it, and a handle is a
 * process-local map key rather than a secret, so uniqueness is what it needs.
 */
function newHandle(): string {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `dh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function sweep(now: number): void {
  for (const [handle, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(handle);
  }
}

/**
 * Stores a derivation scheme and returns the opaque handle to navigate with.
 * Any previously stashed scheme is dropped: one wallet flow runs at a time, and
 * an abandoned one must not leave key material behind.
 */
export function stashDerivationScheme(value: string): string {
  const now = Date.now();
  entries.clear();
  sweep(now);
  const handle = newHandle();
  entries.set(handle, { value, expiresAt: now + TTL_MS });
  return handle;
}

/**
 * Reads a stashed scheme. Returns null when the handle is unknown or expired —
 * which is what a deep link, a restored navigation state, or a resumed app
 * looks like, and the screen must then send the merchant back to re-enter it
 * rather than proceeding with nothing.
 */
export function readDerivationScheme(handle: string | undefined | null): string | null {
  if (!handle) return null;
  const now = Date.now();
  sweep(now);
  return entries.get(handle)?.value ?? null;
}

/** Drops a stashed scheme once the flow is finished with it. */
export function clearDerivationScheme(handle: string | undefined | null): void {
  if (handle) entries.delete(handle);
}
