// Structured security-event logging (OWASP A09:2025 — Security Logging &
// Alerting Failures).
//
// WHY THIS EXISTS
// ---------------
// Hachisu's Edge Function logs are the only record of what happened on the
// server. Before this module they were free-text `console.*` lines, which fails
// A09 in two opposite directions at once:
//
//   * TOO MUCH — a raw upstream error body or a raw error object was passed
//     straight to console, so whatever the upstream chose to echo (a submitted
//     POS template, a validation message quoting merchant input) landed in a log
//     nobody had reviewed (CWE-532).
//
//   * TOO LITTLE, and forgeable — a client-supplied identifier interpolated into
//     a newline-delimited line lets an attacker author a second, entirely fake
//     record in the same stream an investigator would read (CWE-117); and the
//     events that matter most for an investigation — a cross-tenant access
//     denial, a refusal by a disabled feature gate — were not recorded at all
//     (CWE-223, CWE-778).
//
// So a security event here is a CLOSED record, not a sentence:
//
//   * every field is ALLOWLISTED. There is no spread of a caller's object and no
//     `extra` bag, so an untrusted value can never introduce a key. The type has
//     no slot for a token, an OTP, an Authorization header, a PKCE verifier, a
//     service-role or Greenfield key, a derivation scheme, or a request body —
//     none of those may ever be added to it.
//   * every string value is neutralized and bounded before it is emitted, so no
//     value can terminate the record or flood the sink.
//   * the record is emitted as ONE line of JSON. JSON.stringify escapes every C0
//     control character, which is what actually makes log injection impossible;
//     the sanitizer below closes what JSON does not (U+2028/U+2029, which are
//     valid JSON string content but are treated as line terminators by some log
//     readers) and bounds length.
//
// This is not a SIEM and does not try to be. It is a stable, greppable event
// shape so that "did anyone try to reach another merchant's store last Tuesday?"
// is a query rather than an archaeology project.

/** Whether the actor got what they asked for. */
export type SecurityOutcome = 'success' | 'denied' | 'failure';

export type SecuritySeverity = 'info' | 'warn' | 'error';

/**
 * The security-event taxonomy. Stable strings, dotted `subject.action[.result]`,
 * so events can be filtered without matching prose.
 */
export const SecurityEvents = {
  /** A caller asked for a resource that is not theirs (or does not exist). */
  AUTHORIZATION_DENIED: 'authorization.denied',
  /** A capability-bearing endpoint refused because its product gate is off. */
  FEATURE_DISABLED_ATTEMPT: 'feature.disabled_attempt',
  /** An upstream (BTCPay) response was rejected as unusable. */
  UPSTREAM_RESPONSE_REJECTED: 'integrity.upstream_response_rejected',
  /** A store-scoped lookup failed before ownership could be decided. */
  STORE_LOOKUP_FAILED: 'store.lookup_failed',
} as const;

/**
 * The complete set of fields a security event may carry. Adding a field here is
 * a deliberate act — see the header for what must never be added.
 */
export interface SecurityEvent {
  /** Taxonomy string; prefer a SecurityEvents constant. */
  event: string;
  outcome: SecurityOutcome;
  severity?: SecuritySeverity;
  /** Authenticated caller (auth.users.id). Never an email. */
  userId?: string | null;
  /** Hachisu merchant store id (public.merchant_stores.id). */
  storeId?: string | null;
  /** What kind of thing was acted on, e.g. 'merchant_store', 'pos_app'. */
  resourceType?: string | null;
  /** The resource identifier the caller supplied or the server resolved. */
  resourceId?: string | null;
  /** The function/action, e.g. 'replace-btcpay-onchain-wallet'. */
  action?: string | null;
  /** Stable machine-readable failure/denial code. */
  code?: string | null;
  /** Short, non-free-form discriminator, e.g. 'not_owner' | 'not_found'. */
  reason?: string | null;
  /** Upstream HTTP status, when an upstream call is involved. */
  status?: number | null;
  /** Platform request id, when one is available. */
  requestId?: string | null;
  durationMs?: number | null;
}

/** Field order in the emitted record — also the allowlist. */
const FIELDS = [
  'event',
  'outcome',
  'severity',
  'action',
  'userId',
  'storeId',
  'resourceType',
  'resourceId',
  'code',
  'reason',
  'status',
  'requestId',
  'durationMs',
] as const;

/**
 * Longest string any single field may contribute. Identifiers are UUIDs (36) and
 * codes are short; anything approaching this bound is a caller-supplied value
 * being used as an identifier, which is exactly what must not be able to flood
 * the log.
 */
const MAX_FIELD_LENGTH = 200;

/**
 * Characters that must never survive into a log value: C0 controls (includes LF,
 * CR, TAB and the ANSI escape introducer), DEL + C1 controls, and the Unicode
 * line/paragraph separators. JSON.stringify already escapes the C0 range, but
 * U+2028/U+2029 pass through it literally while several log readers treat them
 * as line terminators — so they are removed here rather than trusted to encoding.
 */
const UNSAFE_LOG_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** Replacement for a neutralized character. U+FFFD reads as "something was here". */
const REPLACEMENT = '�';

/**
 * Makes one value safe to place in a log record.
 *
 * Unsafe characters are REPLACED rather than escaped, so a value can never read
 * as a record boundary in any downstream viewer regardless of how that viewer
 * decodes the line. Over-long values are truncated with an explicit marker so a
 * reader can tell truncation from data.
 */
export function sanitizeLogValue(value: string): string {
  const neutralized = value.replace(UNSAFE_LOG_CHARS, REPLACEMENT);
  return neutralized.length > MAX_FIELD_LENGTH
    ? `${neutralized.slice(0, MAX_FIELD_LENGTH)}…[truncated]`
    : neutralized;
}

/**
 * Builds the record that would be emitted, without emitting it. Exported so the
 * shape and its neutralization can be asserted directly in tests.
 */
export function buildSecurityRecord(event: SecurityEvent): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const value = event[field as keyof SecurityEvent];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) record[field] = value;
      continue;
    }
    record[field] = sanitizeLogValue(String(value));
  }
  if (record.severity === undefined) {
    record.severity = event.outcome === 'success' ? 'info' : 'warn';
  }
  return record;
}

/**
 * Emits one security event as a single line of JSON.
 *
 * Severity maps to the console method so the platform's own level filtering
 * works: `denied` and `failure` default to warn, `success` to info.
 */
export function logSecurityEvent(event: SecurityEvent): void {
  const record = buildSecurityRecord(event);
  const line = JSON.stringify(record);
  if (record.severity === 'error') console.error(line);
  else if (record.severity === 'info') console.log(line);
  else console.warn(line);
}

/**
 * A caller asked for a resource that is not theirs.
 *
 * `reason` deliberately does NOT reach the RESPONSE — not-found and not-owner
 * stay indistinguishable to the caller, because distinguishing them is an
 * enumeration oracle (A01). It is recorded in the LOG, which only an operator
 * reads. That is the point: the caller learns nothing, the investigator learns
 * what actually happened.
 */
export function logAuthorizationDenied(input: {
  action: string;
  userId: string;
  resourceType: string;
  resourceId?: string | null;
  storeId?: string | null;
  reason: 'not_owner' | 'not_found' | 'wrong_store' | 'inactive';
}): void {
  logSecurityEvent({
    event: SecurityEvents.AUTHORIZATION_DENIED,
    outcome: 'denied',
    severity: 'warn',
    action: input.action,
    userId: input.userId,
    storeId: input.storeId ?? null,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    reason: input.reason,
  });
}

/** A capability-bearing endpoint refused because its product gate is off. */
export function logFeatureDisabledAttempt(input: {
  action: string;
  feature: string;
  userId?: string | null;
  storeId?: string | null;
}): void {
  logSecurityEvent({
    event: SecurityEvents.FEATURE_DISABLED_ATTEMPT,
    outcome: 'denied',
    severity: 'warn',
    action: input.action,
    userId: input.userId ?? null,
    storeId: input.storeId ?? null,
    resourceType: 'feature',
    resourceId: input.feature,
    code: 'LIGHTNING_DISABLED',
  });
}
