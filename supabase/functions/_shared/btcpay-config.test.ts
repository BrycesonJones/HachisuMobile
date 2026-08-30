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

// ---------------------------------------------------------------------------
// OWASP A10:2025 — Mishandling of Exceptional Conditions (CWE-209, CWE-550).
// ---------------------------------------------------------------------------
//
// Thirty Edge Functions answer a configuration failure with
// `err instanceof BtcpayConfigError ? err.message : '...'` in a RESPONSE BODY.
// So whatever getBtcpayConfig() puts in `message` is handed to any authenticated
// caller. It named the server's environment variables and described exactly how
// the deployment was misconfigured — an operator-facing sentence answering a
// merchant's request.
//
// The split: `message` is the safe public sentence, `detail` is the
// operator-facing specifics for the log. The exception carries both so no call
// site has to remember the difference.

const ENV_VAR_NAMES = [URL_VAR, KEY];

function configErrorFor(serverUrl: string | undefined): BtcpayConfigError {
  let caught: unknown;
  withEnv(serverUrl, () => {
    try {
      getBtcpayConfig();
    } catch (err) {
      caught = err;
    }
  });
  if (!(caught instanceof BtcpayConfigError)) {
    throw new Error('expected getBtcpayConfig to throw a BtcpayConfigError');
  }
  return caught;
}

Deno.test('the client-facing configuration message names no environment variable', () => {
  // A missing secret is the case that spelled the variable names out in full.
  const prevKey = Deno.env.get(KEY);
  const prevUrl = Deno.env.get(URL_VAR);
  try {
    Deno.env.delete(KEY);
    Deno.env.delete(URL_VAR);
    let caught: unknown;
    try {
      getBtcpayConfig();
    } catch (err) {
      caught = err;
    }
    const message = (caught as BtcpayConfigError).message;
    for (const name of ENV_VAR_NAMES) {
      assertEquals(
        message.includes(name),
        false,
        `the client-facing message discloses the environment variable ${name}: ${message}`,
      );
    }
  } finally {
    if (prevKey === undefined) Deno.env.delete(KEY);
    else Deno.env.set(KEY, prevKey);
    if (prevUrl === undefined) Deno.env.delete(URL_VAR);
    else Deno.env.set(URL_VAR, prevUrl);
  }
});

Deno.test('the client-facing configuration message does not describe the misconfiguration', () => {
  // Every rejection reason must collapse to the SAME public sentence: which one
  // tripped is a fact about the server, not an answer to the caller.
  const messages = new Set(
    [
      'http://btcpay.hachisu.io',
      'ftp://btcpay.hachisu.io',
      'not-a-url',
      'https://user:pass@btcpay.hachisu.io',
    ].map((url) => configErrorFor(url).message),
  );
  assertEquals(
    messages.size,
    1,
    `distinct rejection reasons leak through the public message: ${[...messages].join(' | ')}`,
  );
});

Deno.test('the operator-facing detail is still available for the log', () => {
  const err = configErrorFor('http://btcpay.hachisu.io');
  assertEquals(typeof err.detail, 'string');
  assertEquals(err.detail.length > 0, true);
  // The detail is for the log, so it may be specific — but never the key itself.
  assertEquals(err.detail.includes('test-greenfield-key-not-a-real-secret'), false);
});
