#!/usr/bin/env node
/**
 * Security logging guard (OWASP A09:2025 — Security Logging & Alerting Failures).
 *
 *   node scripts/check-logging.mjs
 *   node scripts/check-logging.mjs --root <dir>      # used by the self-test
 *
 * A09 is not "log more". It is: when something security-relevant happens, is it
 * recorded accurately enough to investigate, without leaking anything, and is it
 * recorded at all? This guard pins the four properties that answer that, each of
 * which was violated somewhere in the tree when it was written:
 *
 *   1. CWE-117 — a client-supplied identifier must never be interpolated into a
 *      newline-delimited console template. `merchantStoreId` is only `.trim()`ed,
 *      so an interior "\n" in it forges a second, fully attacker-authored record
 *      in the same log stream an investigator would rely on.
 *
 *   2. CWE-532 — a raw upstream response body (BtcpayApiError.body) must never be
 *      logged or persisted. Bodies echo submitted values; the sibling call sites
 *      already record `{ status }` only, and that is the rule.
 *
 *   3. CWE-223/778 — a cross-tenant authorization denial must emit a security
 *      event. A01 proved the boundary holds; this is what makes an ATTEMPT to
 *      cross it investigable rather than invisible.
 *
 *   4. CWE-778 — a server-side feature gate that refuses a capability-bearing
 *      request must emit a security event, so repeated bypass attempts are
 *      visible.
 *
 * Plus one client-side rule:
 *
 *   5. CWE-532 — every console call in shipped client code must be dev-gated, so
 *      a future `console.log(session)` cannot reach a merchant's device logs.
 *
 * These are guards, not bug reports: the tree is expected to pass. Their job is
 * to make the unloggable and the over-logged state unrepresentable going forward.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();

const failures = [];
const checks = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const pass = (rule) => checks.push(rule);
const rel = (p) => relative(ROOT, p).split(/[\\/]/).join('/');

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

function walk(dir, out = [], filter = (n) => n.endsWith('.ts') || n.endsWith('.tsx')) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out, filter);
    else if (filter(entry) && !entry.includes('.test.')) out.push(abs);
  }
  return out;
}

const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const edgeFiles = walk(FUNCTIONS_DIR);

// ---------------------------------------------------------------------------
// 1. CWE-117 — no client-supplied identifier inside a console template.
// ---------------------------------------------------------------------------
//
// "Client-supplied" is decided from the source itself: any identifier assigned
// from `body.<something>` in the same file. That is exactly the set of values an
// attacker controls end-to-end.
{
  let offenders = 0;
  for (const file of edgeFiles) {
    const source = read(file);
    if (!source) continue;
    const clientVars = new Set(
      [...source.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*[^;]*\bbody\.[A-Za-z_$][\w$]*/g)].map(
        (m) => m[1],
      ),
    );
    if (clientVars.size === 0) continue;
    source.split('\n').forEach((line, i) => {
      if (!/console\.(log|warn|error|info|debug)\s*\(/.test(line)) return;
      for (const name of clientVars) {
        if (new RegExp(`\\$\\{\\s*${name}\\b`).test(line)) {
          offenders++;
          fail(
            'log-injection-risk',
            `${rel(file)}:${i + 1}: client-supplied "${name}" is interpolated into a console template — an interior newline forges a log record. Emit it as a structured field instead.`,
          );
        }
      }
    });
  }
  if (offenders === 0) pass('no client-supplied identifier is interpolated into a console template');
}

// ---------------------------------------------------------------------------
// 2. CWE-532 — no raw upstream response body in a log or a persisted field.
// ---------------------------------------------------------------------------
{
  let offenders = 0;
  for (const file of edgeFiles) {
    const source = read(file);
    if (!source) continue;
    source.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      // A raw upstream body reaching console output or a persisted audit column.
      if (/\b(err|error|apiError)\.body\b/.test(line) && /console\.|rawError|raw_error|body:/.test(line)) {
        offenders++;
        fail(
          'raw-upstream-body-logged',
          `${rel(file)}:${i + 1}: a raw upstream response body is logged or persisted — record the normalized status instead.`,
        );
      }
      // Passing the error OBJECT itself: the runtime serializes its own
      // properties, which for BtcpayApiError includes `body`.
      if (/console\.(error|warn|log)\([^)]*,\s*(err|error|listErr|revertErr|cause)\s*\)\s*;?\s*$/.test(trimmed)) {
        offenders++;
        fail(
          'raw-error-object-logged',
          `${rel(file)}:${i + 1}: a raw error object is passed to console — its own properties (including an upstream body) are serialized. Log a normalized code/status.`,
        );
      }
    });
  }
  if (offenders === 0) pass('no raw upstream response body or error object reaches a log or an audit column');
}

// ---------------------------------------------------------------------------
// 3. CWE-223/778 — every cross-tenant authorization denial emits an event.
// ---------------------------------------------------------------------------
{
  let unlogged = 0;
  let sites = 0;
  const check = (file, source) => {
    const lines = source.split('\n');
    // Lines that sit INSIDE a logAuthorizationDenied({...}) call are not denial
    // sites — the `reason` discriminator legitimately re-tests ownership there.
    const insideLogCall = new Set();
    let depth = 0;
    lines.forEach((line, i) => {
      if (/logAuthorizationDenied\s*\(\{/.test(line)) depth = 1;
      if (depth > 0) {
        insideLogCall.add(i);
        if (/^\s*\}\)\s*;/.test(line)) depth = 0;
      }
    });
    lines.forEach((line, i) => {
      if (!/user_id !== user!?\.id/.test(line)) return;
      if (insideLogCall.has(i)) return;
      sites++;
      // The denial branch. The event is emitted as the first statement inside the
      // block, which for a multi-line condition sits AFTER the matched line, so
      // the window looks forward far enough to clear the longest condition here.
      const window = lines.slice(i, i + 20).join('\n');
      if (!/logSecurityEvent|logAuthorizationDenied/.test(window)) {
        unlogged++;
        fail(
          'authorization-denial-unlogged',
          `${rel(file)}:${i + 1}: a cross-tenant ownership denial returns without emitting a security event — an attempted IDOR leaves no trace.`,
        );
      }
    });
  };
  for (const file of edgeFiles) {
    const source = read(file);
    if (source) check(file, source);
  }
  if (sites === 0) fail('no-ownership-checks-found', 'expected ownership comparisons in supabase/functions');
  else if (unlogged === 0) pass(`all ${sites} cross-tenant ownership denials emit a security event`);
}

// ---------------------------------------------------------------------------
// 4. CWE-778 — the server-side feature gate records refusals.
// ---------------------------------------------------------------------------
{
  const gate = join(FUNCTIONS_DIR, '_shared', 'feature-gates.ts');
  const source = read(gate);
  if (source === null) {
    fail('feature-gate-missing', `${rel(gate)}: expected the server-side feature gate here`);
  } else {
    // The event must be emitted INSIDE the refusal function. Matching the
    // identifier anywhere in the file would be satisfied by the import alone,
    // which is not evidence that anything is recorded.
    const body = /export function lightningDisabledResponse\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(source);
    if (!body) {
      fail(
        'feature-gate-shape-unknown',
        `${rel(gate)}: could not locate the lightningDisabledResponse body to verify its refusal is recorded.`,
      );
    } else if (!/logSecurityEvent\s*\(|logFeatureDisabledAttempt\s*\(/.test(body[1])) {
      fail(
        'feature-gate-refusal-unlogged',
        `${rel(gate)}: a refusal by the server-side feature gate emits no security event — repeated attempts to reach a disabled capability are invisible.`,
      );
    } else {
      pass('server-side feature-gate refusals emit a security event');
    }
  }
}

// ---------------------------------------------------------------------------
// 5. CWE-532 (client) — every shipped client console call is dev-gated.
// ---------------------------------------------------------------------------
{
  const CLIENT_DIRS = ['app', 'lib', 'components', 'hooks', 'contexts', 'constants', 'utils'];
  const GATES = /__DEV__|isProfileDebugEnabled|isAuthDevBypassEnabled|isDevAuthActive/;
  let offenders = 0;
  let total = 0;
  for (const dirName of CLIENT_DIRS) {
    for (const file of walk(join(ROOT, dirName))) {
      const source = read(file);
      if (!source) continue;
      const lines = source.split('\n');
      lines.forEach((line, i) => {
        if (!/console\.(log|warn|error|info|debug)\s*\(/.test(line)) return;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        total++;
        // A gate on this line or in the preceding few lines (the enclosing `if`).
        const context = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
        if (!GATES.test(context)) {
          offenders++;
          fail(
            'client-log-not-dev-gated',
            `${rel(file)}:${i + 1}: a console call in shipped client code is not behind a __DEV__ gate — it would run on a merchant's device.`,
          );
        }
      });
    }
  }
  if (offenders === 0) pass(`all ${total} client console calls are dev-gated`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log('security logging OK');
  for (const c of checks) console.log(`  ✓ ${c}`);
  process.exit(0);
}
console.error(`security logging FAILED (${failures.length})`);
for (const f of failures) console.error(`  ✗ [${f.rule}] ${f.detail}`);
process.exit(1);
