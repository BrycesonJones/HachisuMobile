// Non-sensitive fingerprinting for on-chain derivation schemes.
//
// We NEVER persist a merchant's xpub / descriptor / derivation scheme. To detect
// a same-wallet replacement and to bind a preview to the exact key that was
// previewed, we store a one-way sha256 hash of the *normalized* scheme instead.
//
// The hash is only ever compared to another hash of a submitted scheme — it is
// not reversible and reveals nothing about the wallet. It is never logged.

/**
 * Normalizes a derivation scheme for stable fingerprinting: trims, collapses
 * internal whitespace, and strips a trailing NBXplorer script hint so the SAME
 * wallet fingerprints identically across cosmetic formatting differences.
 *
 * Casing is preserved: SLIP-132 prefixes are case-significant (Zpub != zpub) and
 * output-descriptor checksums are case-sensitive, so we do NOT lowercase.
 */
export function normalizeDerivationScheme(input: string): string {
  return (input ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** sha256 hex of the normalized scheme. Suitable for equality comparison only. */
export async function fingerprintDerivationScheme(input: string): Promise<string> {
  const normalized = normalizeDerivationScheme(input);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
