#!/usr/bin/env node
/**
 * Client configuration guard (OWASP A02:2025 — Security Misconfiguration).
 *
 *   node scripts/check-client-config.mjs
 *   node scripts/check-client-config.mjs --root <dir>     # used by the self-test
 *
 * The Expo bundle is public and attacker-readable. Everything prefixed
 * EXPO_PUBLIC_ is compiled into it verbatim, and every development affordance
 * ships in the same binary as the production code. This script fails the build
 * on the configuration mistakes that would turn either fact into a vulnerability:
 *
 *   1. CWE-526 — a privileged secret published under an EXPO_PUBLIC_ name.
 *   2. CWE-526 — a server-only secret referenced from client source at all.
 *   3. CWE-489/CWE-11 — a dev auth bypass that is not hard-gated behind __DEV__.
 *   4. CWE-489     — a dev-bypass call site that is not guarded.
 *   5. CWE-5       — a non-HTTPS endpoint configured for the client.
 *
 * These are guards, not bug reports: the tree is expected to pass today. Their
 * job is to make the insecure state unrepresentable going forward.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();

const failures = [];
const checks = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const pass = (rule) => checks.push(rule);

/** Names that must never be readable by the mobile client. */
const PRIVILEGED = [
  'SERVICE_ROLE',
  'BTCPAY_GREENFIELD_API_KEY',
  'GREENFIELD_API_KEY',
  'CLIENT_SECRET',
  'SMTP_PASS',
  'SMTP_PASSWORD',
  'PRIVATE_KEY',
  'JWT_SECRET',
  'DB_PASSWORD',
  'DATABASE_PASSWORD',
  'ACCESS_TOKEN_SECRET',
];

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.expo', 'build', 'web-build', 'ios', 'android', 'coverage',
]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const rel = (p) => relative(ROOT, p) || p;

/** Client-side source: app code only. Edge Functions are server-side. */
const clientFiles = walk(ROOT)
  .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
  .filter((f) => !rel(f).split(sep).includes('supabase'))
  .filter((f) => !rel(f).startsWith('scripts' + sep));

// ---------------------------------------------------------------------------
// 1 + 5. Env files: no privileged EXPO_PUBLIC_ names, no plaintext endpoints.
// ---------------------------------------------------------------------------
const envFiles = ['.env', '.env.local', '.env.example', '.env.production']
  .map((f) => join(ROOT, f))
  .filter(existsSync);

for (const file of envFiles) {
  for (const [i, line] of read(file).split('\n').entries()) {
    const at = `${rel(file)}:${i + 1}`;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();

    if (name.startsWith('EXPO_PUBLIC_')) {
      const hit = PRIVILEGED.find((p) => name.toUpperCase().includes(p));
      if (hit) {
        fail('privileged-env-is-public', `${at}: ${name} publishes a privileged secret (${hit}) into the mobile bundle`);
      }
      if (/^https?:\/\//i.test(value) && !/^https:\/\//i.test(value)) {
        fail('insecure-endpoint', `${at}: ${name} uses plaintext http:// — client traffic must be HTTPS`);
      }
    }
  }
}
if (!failures.some((f) => f.rule === 'privileged-env-is-public')) pass('no privileged secret uses an EXPO_PUBLIC_ name');
if (!failures.some((f) => f.rule === 'insecure-endpoint')) pass('every configured client endpoint is https://');

// ---------------------------------------------------------------------------
// 2. Client source must never reference a server-only secret.
// ---------------------------------------------------------------------------
for (const file of clientFiles) {
  const src = read(file);
  for (const name of PRIVILEGED) {
    if (src.includes(name)) {
      fail('privileged-secret-in-client', `${rel(file)}: references server-only ${name}`);
    }
  }
}
if (!failures.some((f) => f.rule === 'privileged-secret-in-client')) pass('no client source references a server-only secret');

// ---------------------------------------------------------------------------
// 3. The dev auth bypass must be hard-gated behind __DEV__.
// ---------------------------------------------------------------------------
const authConfigPath = join(ROOT, 'lib', 'auth', 'config.ts');
const authConfig = read(authConfigPath);
if (authConfig === null) {
  fail('dev-bypass-gate-missing', `${rel(authConfigPath)}: expected the dev-bypass gate to live here`);
} else {
  // The exported flag must be a conjunction starting with __DEV__, so a
  // production bundle constant-folds it to `false` no matter what the
  // environment says.
  const decl = authConfig.match(/export\s+const\s+isAuthDevBypassEnabled\s*=([\s\S]*?);/);
  if (!decl) {
    fail('dev-bypass-gate-missing', `${rel(authConfigPath)}: isAuthDevBypassEnabled is not exported here`);
  } else if (!/^\s*__DEV__\s*&&/.test(decl[1])) {
    fail('dev-bypass-ungated', `${rel(authConfigPath)}: isAuthDevBypassEnabled must be "__DEV__ && ..." so production folds it to false`);
  } else if (/\|\|\s*__DEV__|__DEV__\s*\|\|/.test(decl[1])) {
    fail('dev-bypass-ungated', `${rel(authConfigPath)}: __DEV__ must not be reachable through a logical OR`);
  } else {
    pass('isAuthDevBypassEnabled is hard-gated behind __DEV__');
  }
}

// ---------------------------------------------------------------------------
// 4. Every dev-bypass call site must be guarded by that flag.
// ---------------------------------------------------------------------------
for (const file of clientFiles) {
  const src = read(file);
  if (!/\bdevSignIn\s*\(/.test(src)) continue;
  // The definition/type sites in the auth context are not call sites.
  if (rel(file).endsWith(join('contexts', 'auth-context.tsx'))) continue;
  if (!src.includes('isAuthDevBypassEnabled')) {
    fail('dev-bypass-callsite-unguarded', `${rel(file)}: calls devSignIn() without an isAuthDevBypassEnabled guard`);
  }
}
if (!failures.some((f) => f.rule === 'dev-bypass-callsite-unguarded')) pass('every devSignIn() call site is guarded');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log('client config OK');
  for (const c of checks) console.log(`  ✓ ${c}`);
  process.exit(0);
}
console.error(`client config FAILED (${failures.length})`);
for (const f of failures) console.error(`  ✗ [${f.rule}] ${f.detail}`);
process.exit(1);
