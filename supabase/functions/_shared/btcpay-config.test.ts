// Configuration-security regression for the BTCPay server endpoint
// (OWASP A02:2025 — Security Misconfiguration; CWE-5, CWE-16).
//
// Run from supabase/functions:
//   deno test --allow-env _shared/btcpay-config.test.ts
//
// Why this exists
// ---------------
// getBtcpayConfig() reads BTCPAY_SERVER_URL from the function environment and
// every Greenfield request is sent as:
//
//     fetch(`${config.serverUrl}/api/v1/...`,
//           { headers: { Authorization: `token ${config.apiKey}` } })
//
// The API key is the privileged, store-modifying Greenfield credential. If the
// configured server URL is ever plaintext http:// — an operator typo, a copied
// staging value, a self-hosted BTCPay behind a reverse proxy that was set up
// over http — then that credential is transmitted in cleartext on every call,
// and any network observer can capture it. Nothing downstream re-checks the
// scheme, so the misconfiguration fails OPEN.
//
// The same value is also the origin allowlist for sanitizeCheckoutLink(), so an
// http:// server URL additionally mints http:// checkout links that get
// persisted and handed to paying customers.
//
// Configuration must fail CLOSED: a non-HTTPS BTCPay endpoint is a startup
// error, not a runtime downgrade.

import { assertEquals, assertThrows } from 'jsr:@std/assert@1.0.19';

import { BtcpayConfigError, getBtcpayConfig } from './btcpay-client.ts';

const KEY = 'BTCPAY_GREENFIELD_API_KEY';
const URL_VAR = 'BTCPAY_SERVER_URL';

/** Runs `fn` with the BTCPay env vars set, restoring the prior values after. */
function withEnv(serverUrl: string | undefined, fn: () => void): void {
  const prevUrl = Deno.env.get(URL_VAR);
  const prevKey = Deno.env.get(KEY);
  try {
    if (serverUrl === undefined) Deno.env.delete(URL_VAR);
    else Deno.env.set(URL_VAR, serverUrl);
    Deno.env.set(KEY, 'test-greenfield-key-not-a-real-secret');
    fn();
  } finally {
    if (prevUrl === undefined) Deno.env.delete(URL_VAR);
    else Deno.env.set(URL_VAR, prevUrl);
    if (prevKey === undefined) Deno.env.delete(KEY);
    else Deno.env.set(KEY, prevKey);
  }
}

// ---------------------------------------------------------------------------
// The defect: insecure transport must be rejected, not accepted.
// ---------------------------------------------------------------------------

Deno.test('a plaintext http:// BTCPay URL is rejected (privileged key would go in cleartext)', () => {
  withEnv('http://btcpay.hachisu.io', () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
});

Deno.test('http:// is rejected even for a loopback/dev-looking host', () => {
  withEnv('http://localhost:23000', () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
});

Deno.test('a non-http(s) scheme is rejected', () => {
  withEnv('file:///etc/passwd', () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
  withEnv('javascript:alert(1)', () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
});

Deno.test('a malformed URL is rejected rather than string-concatenated into requests', () => {
  withEnv('btcpay.hachisu.io', () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
  withEnv('   ', () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
});

Deno.test('embedded credentials in the server URL are rejected', () => {
  withEnv('https://user:pass@btcpay.hachisu.io', () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
});

// ---------------------------------------------------------------------------
// The valid configuration must keep working unchanged.
// ---------------------------------------------------------------------------

Deno.test('a valid https:// BTCPay URL is accepted', () => {
  withEnv('https://btcpay.hachisu.io', () => {
    assertEquals(getBtcpayConfig().serverUrl, 'https://btcpay.hachisu.io');
  });
});

Deno.test('trailing slashes are still normalized away', () => {
  withEnv('https://btcpay.hachisu.io///', () => {
    assertEquals(getBtcpayConfig().serverUrl, 'https://btcpay.hachisu.io');
  });
});

Deno.test('a missing server URL is still a configuration error', () => {
  withEnv(undefined, () => {
    assertThrows(getBtcpayConfig, BtcpayConfigError);
  });
});

Deno.test('the configuration error never contains the API key', () => {
  withEnv('http://btcpay.hachisu.io', () => {
    try {
      getBtcpayConfig();
      throw new Error('expected getBtcpayConfig to throw');
    } catch (err) {
      const text = `${(err as Error).name}: ${(err as Error).message}`;
      assertEquals(text.includes('test-greenfield-key-not-a-real-secret'), false);
    }
  });
});
