// Side-effect module: gives the app a real WebCrypto before anything can reach
// for a Math.random() fallback. Import it FIRST — ahead of the Supabase client
// and anything else that generates security values.
//
// See lib/crypto/web-crypto.ts for why this is necessary and what it deliberately
// does not do. This file is only the wiring: every primitive comes from
// expo-crypto, which bridges to the platform CSPRNG and SHA-2 implementation.

import * as ExpoCrypto from 'expo-crypto';

import { installWebCrypto, type PlatformCryptoBackend } from '@/lib/crypto/web-crypto';

/** Maps a SubtleCrypto algorithm name onto expo-crypto's digest algorithms. */
function toExpoDigestAlgorithm(algorithm: string): ExpoCrypto.CryptoDigestAlgorithm {
  switch (algorithm.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
    case 'SHA1':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA1;
    case 'SHA256':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA256;
    case 'SHA384':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA384;
    case 'SHA512':
      return ExpoCrypto.CryptoDigestAlgorithm.SHA512;
    default:
      throw new TypeError(`crypto.subtle.digest: unsupported algorithm "${algorithm}".`);
  }
}

const backend: PlatformCryptoBackend = {
  getRandomValues: (values) => ExpoCrypto.getRandomValues(values as never) as never,
  randomUUID: () => ExpoCrypto.randomUUID(),
  digest: (algorithm, data) => ExpoCrypto.digest(toExpoDigestAlgorithm(algorithm), data),
};

export const webCryptoInstallReport = installWebCrypto(backend);
