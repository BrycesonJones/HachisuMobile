// A09 (Security Logging & Alerting Failures) tests for the shared security
// logger.
//
// Run from supabase/functions:
//   deno test --allow-read --allow-env _shared/security-log.test.ts
//
// Two properties are pinned here, both of which the free-text `console.*` lines
// this module replaces did NOT have:
//
//   1. CWE-117 — a record is a record. No attacker-supplied value, in any field,
//      may terminate it or start a second one. The corpus below is the one the
//      A09 brief calls for: newlines, CRLF, tabs, quotes, JSON-looking strings,
//      ANSI control sequences, long strings and Unicode separators.
//
//   2. CWE-532 — a record carries only allowlisted fields. A caller cannot smuggle
//      a token, a header or a body into a log by passing an extra key, because
//      the builder copies from a fixed list rather than spreading its input.

import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

import {
  buildSecurityRecord,
  logAuthorizationDenied,
  logSecurityEvent,
  sanitizeLogValue,
  SecurityEvents,
} from './security-log.ts';

// ---------------------------------------------------------------------------
// The log-injection corpus.
// ---------------------------------------------------------------------------

const INJECTION_CORPUS: Record<string, string> = {
  newline: 'hello\nFAKE_ADMIN_LOGIN_SUCCESS',
  crlf: 'hello\r\nseverity=critical',
  bare_cr: 'hello\roverwritten',
  tab: 'hello\tstore=other-merchant',
  quotes: 'hello"; "event":"authorization.granted',
  json_shaped: '{"event":"authorization.granted","outcome":"success"}',
  ansi: 'hello\u001b[2K\u001b[1Gforged line',
  ansi_color: '\u001b[31mCRITICAL\u001b[0m',
  nul: 'hello\u0000truncate-here',
  vertical_tab: 'hello\u000bforged',
  form_feed: 'hello\u000cforged',
  c1_nel: 'hello\u0085forged',
  unicode_line_sep: 'hello\u2028forged record',
  unicode_para_sep: 'hello\u2029forged record',
  long: 'A'.repeat(10_000),
  // The exact payload that forged a second record through the old free-text line.
  real_world:
    'aaaa\n2026-08-30T02:00:00Z [activity-detail] result=OK user=victim store=FORGED admin=true',
};

/** Every character that must never survive into an emitted record. */
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

Deno.test('no corpus payload can introduce a record separator, in any field', () => {
  for (const [name, payload] of Object.entries(INJECTION_CORPUS)) {
    for (const field of ['resourceId', 'storeId', 'userId', 'code', 'reason', 'action'] as const) {
      const line = JSON.stringify(
        buildSecurityRecord({
          event: SecurityEvents.AUTHORIZATION_DENIED,
          outcome: 'denied',
          [field]: payload,
        }),
      );
      assertEquals(
        line.split('\n').length,
        1,
        `payload "${name}" in ${field} split the record into multiple lines`,
      );
      assertEquals(line.includes('\r'), false, `payload "${name}" in ${field} embedded a CR`);
      assertEquals(
        FORBIDDEN.test(line),
        false,
        `payload "${name}" in ${field} left a control/separator character in the record`,
      );
    }
  }
});

Deno.test('a forged payload stays DATA — it never becomes a second event', () => {
  const record = buildSecurityRecord({
    event: SecurityEvents.AUTHORIZATION_DENIED,
    outcome: 'denied',
    userId: 'user-1',
    resourceId: INJECTION_CORPUS.real_world,
  });
  const parsed = JSON.parse(JSON.stringify(record));
  // Exactly one record, and the payload is quoted inside one field.
  assertEquals(parsed.event, 'authorization.denied');
  assertEquals(parsed.outcome, 'denied');
  assertEquals(parsed.userId, 'user-1');
  assert(
    typeof parsed.resourceId === 'string' && parsed.resourceId.startsWith('aaaa'),
    'the payload must be preserved as a single string value',
  );
  assert(
    !parsed.resourceId.includes('\n'),
    'the payload must not carry its newline into the record',
  );
});

Deno.test('a JSON-shaped payload cannot forge sibling fields', () => {
  const record = buildSecurityRecord({
    event: SecurityEvents.AUTHORIZATION_DENIED,
    outcome: 'denied',
    resourceId: INJECTION_CORPUS.json_shaped,
  });
  // The outcome stays 'denied': the payload is a value, not structure.
  assertEquals(record.outcome, 'denied');
  assertEquals(typeof record.resourceId, 'string');
});

Deno.test('an over-long value is bounded and marked, never dropped silently', () => {
  const record = buildSecurityRecord({
    event: SecurityEvents.AUTHORIZATION_DENIED,
    outcome: 'denied',
    resourceId: INJECTION_CORPUS.long,
  });
  const value = record.resourceId as string;
  assert(value.length < 300, `expected a bounded value, got ${value.length} characters`);
  assert(value.endsWith('[truncated]'), 'truncation must be visible to the reader');
});

Deno.test('sanitizeLogValue leaves ordinary identifiers untouched', () => {
  for (const value of [
    '5f1c2b7e-8a3d-4c9f-9b1e-2d4a6c8e0f11',
    'authorization.denied',
    'not_owner',
    'replace-btcpay-onchain-wallet',
    'BTC-CHAIN',
  ]) {
    assertEquals(sanitizeLogValue(value), value);
  }
});

// ---------------------------------------------------------------------------
// CWE-532 — the record is closed.
// ---------------------------------------------------------------------------

Deno.test('only allowlisted fields are emitted — a smuggled key is dropped', () => {
  const record = buildSecurityRecord({
    event: SecurityEvents.AUTHORIZATION_DENIED,
    outcome: 'denied',
    userId: 'user-1',
    // Keys a careless caller (or a future refactor) might try to attach. None of
    // these are in FIELDS, so none of them can reach the log.
    ...({
      token: 'SHOULD-NEVER-APPEAR',
      accessToken: 'SHOULD-NEVER-APPEAR',
      refreshToken: 'SHOULD-NEVER-APPEAR',
      authorization: 'Bearer SHOULD-NEVER-APPEAR',
      apiKey: 'SHOULD-NEVER-APPEAR',
      derivationScheme: 'zpubSHOULDNEVERAPPEAR',
      otp: '123456',
      password: 'SHOULD-NEVER-APPEAR',
      email: 'merchant@example.com',
      body: { secret: 'SHOULD-NEVER-APPEAR' },
    } as Record<string, unknown>),
  });
  const serialized = JSON.stringify(record);
  assertEquals(
    serialized.includes('SHOULD-NEVER-APPEAR'),
    false,
    'a non-allowlisted value reached the record',
  );
  assertEquals(serialized.includes('merchant@example.com'), false, 'an email reached the record');
  assertEquals(serialized.includes('123456'), false, 'an OTP reached the record');
  for (const key of ['token', 'accessToken', 'refreshToken', 'authorization', 'apiKey', 'derivationScheme', 'otp', 'password', 'email', 'body']) {
    assertEquals(Object.hasOwn(record, key), false, `field "${key}" must not exist on the record`);
  }
});

Deno.test('absent fields are omitted rather than emitted as null noise', () => {
  const record = buildSecurityRecord({
    event: SecurityEvents.FEATURE_DISABLED_ATTEMPT,
    outcome: 'denied',
    userId: null,
    storeId: '',
  });
  assertEquals(Object.hasOwn(record, 'userId'), false);
  assertEquals(Object.hasOwn(record, 'storeId'), false);
  assertEquals(record.event, 'feature.disabled_attempt');
});

// ---------------------------------------------------------------------------
// Emission: one line, correct stream.
// ---------------------------------------------------------------------------

/** Captures console output for one call. */
function capture(run: () => void): { method: string; lines: string[] } {
  const original = { log: console.log, warn: console.warn, error: console.error };
  let method = 'none';
  const lines: string[] = [];
  console.log = (...a: unknown[]) => { method = 'log'; lines.push(a.join(' ')); };
  console.warn = (...a: unknown[]) => { method = 'warn'; lines.push(a.join(' ')); };
  console.error = (...a: unknown[]) => { method = 'error'; lines.push(a.join(' ')); };
  try {
    run();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
  return { method, lines };
}

Deno.test('a denial emits exactly one warn line of parseable JSON', () => {
  const { method, lines } = capture(() =>
    logAuthorizationDenied({
      action: 'replace-btcpay-onchain-wallet',
      userId: 'user-1',
      resourceType: 'merchant_store',
      resourceId: INJECTION_CORPUS.newline,
      reason: 'not_owner',
    }),
  );
  assertEquals(method, 'warn');
  assertEquals(lines.length, 1);
  assertEquals(lines[0].split('\n').length, 1, 'the emitted line must be a single record');
  const parsed = JSON.parse(lines[0]);
  assertEquals(parsed.event, 'authorization.denied');
  assertEquals(parsed.outcome, 'denied');
  assertEquals(parsed.reason, 'not_owner');
  assertEquals(parsed.action, 'replace-btcpay-onchain-wallet');
  assertEquals(parsed.userId, 'user-1');
  assertEquals(String(parsed.resourceId).includes('FAKE_ADMIN_LOGIN_SUCCESS'), true);
  assertEquals(String(parsed.resourceId).includes('\n'), false);
});

Deno.test('severity selects the stream: success->log, denied->warn, error->error', () => {
  assertEquals(
    capture(() => logSecurityEvent({ event: 'x', outcome: 'success' })).method,
    'log',
  );
  assertEquals(
    capture(() => logSecurityEvent({ event: 'x', outcome: 'denied' })).method,
    'warn',
  );
  assertEquals(
    capture(() => logSecurityEvent({ event: 'x', outcome: 'failure', severity: 'error' })).method,
    'error',
  );
});

Deno.test('every emitted record carries the minimum investigable context', () => {
  const { lines } = capture(() =>
    logAuthorizationDenied({
      action: 'delete-btcpay-pos-app',
      userId: 'user-1',
      storeId: 'store-1',
      resourceType: 'pos_app',
      resourceId: 'app-1',
      reason: 'not_owner',
    }),
  );
  const parsed = JSON.parse(lines[0]);
  for (const field of ['event', 'outcome', 'severity', 'action', 'userId', 'resourceType', 'resourceId', 'reason']) {
    assert(Object.hasOwn(parsed, field), `a denial record must carry "${field}"`);
  }
});
