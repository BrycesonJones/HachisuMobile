#!/usr/bin/env node
/**
 * Supply-chain guard (OWASP A03:2025 — Software Supply Chain Failures).
 *
 *   node scripts/check-supply-chain.mjs
 *   node scripts/check-supply-chain.mjs --root <dir>     # used by the self-test
 *
 * Hachisu ships third-party code to two privileged places: the mobile bundle on
 * a merchant's device, and Edge Functions that hold the BTCPay Greenfield key
 * and the Supabase service-role key. Both are only as trustworthy as the code
 * that gets resolved into them at install and deploy time. This script fails on
 * the ways that resolution can stop being deterministic:
 *
 *   1. CWE-1357 — a dependency that does not come from the npm registry.
 *   2. CWE-1357 — a lockfile entry with no integrity hash to verify against.
 *   3. CWE-1357 — install-time code execution from an unreviewed package.
 *   4. CWE-1357 — a mutable remote import in a service-role Edge Function, where
 *                 every deploy re-resolves whatever upstream published last.
 *   5. CWE-1329 — a Deno-managed node_modules shadowing the npm tree, which
 *                 silently swaps the versions the build actually consumes.
 *   6. CWE-1035 — an installed tree that disagrees with the committed lockfile,
 *                 so what a developer tests is not what CI/EAS ships.
 *
 * These are guards, not bug reports: the tree is expected to pass today. Their
 * job is to make the non-reproducible state unrepresentable going forward.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();

const failures = [];
const checks = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const pass = (rule) => checks.push(rule);
const rel = (f) => relative(ROOT, f) || '.';
const read = (f) => readFileSync(f, 'utf8');

/**
 * Packages allowed to run code during `npm install`. Anything else added here
 * is a deliberate decision to execute third-party code with developer and CI
 * privileges, and should be reviewed as such.
 *
 *   fsevents      — macOS file-watcher native binding, used by Metro.
 *   unrs-resolver — native resolver for eslint-plugin-import (dev only).
 */
const INSTALL_SCRIPT_ALLOWLIST = new Set(['fsevents', 'unrs-resolver']);

/** An exactly-pinned jsr:/npm: specifier — `jsr:@scope/name@1.2.3`. */
const PINNED_BARE = /^(?:jsr|npm):(?:@[^/@\s]+\/)?[^@/\s]+@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
/** A remote URL carrying an exact version — `https://deno.land/std@0.224.0/...`. */
const PINNED_URL = /^https:\/\/\S*@\d+\.\d+\.\d+(?:[-+][\w.-]+)?(?:\/|$)/;

// ---------------------------------------------------------------------------
// 1. A committed lockfile is the precondition for every other check.
// ---------------------------------------------------------------------------
const lockPath = join(ROOT, 'package-lock.json');
let lock = null;
if (!existsSync(lockPath)) {
  fail('lockfile-missing', 'package-lock.json is not committed; installs are not reproducible');
} else {
  lock = JSON.parse(read(lockPath));
  if ((lock.lockfileVersion ?? 0) < 3) {
    fail('lockfile-version', `package-lock.json is lockfileVersion ${lock.lockfileVersion}; v3+ is required for integrity coverage`);
  } else {
    pass('package-lock.json is committed at lockfileVersion 3+');
  }
}

// Competing lockfiles mean two different resolvers can disagree about versions.
for (const other of ['yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock']) {
  if (existsSync(join(ROOT, other))) {
    fail('lockfile-conflict', `${other} coexists with package-lock.json; only one package manager may own the tree`);
  }
}
if (!failures.some((f) => f.rule === 'lockfile-conflict')) pass('npm is the only package manager owning the tree');

// ---------------------------------------------------------------------------
// 2/3. Every dependency comes from the registry, with an integrity hash, and
//      does not execute code at install time unless explicitly allowlisted.
// ---------------------------------------------------------------------------
if (lock?.packages) {
  let registryOnly = true;
  let integrityComplete = true;
  let scriptsClean = true;

  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '' || entry.link) continue;
    const resolved = entry.resolved ?? '';

    if (resolved && !resolved.startsWith('https://registry.npmjs.org/')) {
      registryOnly = false;
      fail('dependency-not-from-registry', `${path} resolves to ${resolved}; git, tarball and path dependencies bypass registry integrity`);
    }
    if (resolved && !entry.integrity) {
      integrityComplete = false;
      fail('dependency-no-integrity', `${path} has no integrity hash; its contents cannot be verified on install`);
    }
    if (entry.hasInstallScript) {
      const name = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)$/)?.[1] ?? path;
      if (!INSTALL_SCRIPT_ALLOWLIST.has(name)) {
        scriptsClean = false;
        fail('install-script-not-allowlisted', `${name} runs an install script; review it and add it to INSTALL_SCRIPT_ALLOWLIST if intended`);
      }
    }
  }

  if (registryOnly) pass('every dependency resolves to registry.npmjs.org');
  if (integrityComplete) pass('every resolved dependency carries an integrity hash');
  if (scriptsClean) pass('install-time code execution is limited to the allowlist');
}

// ---------------------------------------------------------------------------
// 4. Edge Functions run with the service-role key. Every remote import they
//    pull must name an exact version, or a deploy silently picks up whatever
//    upstream published since the last one.
// ---------------------------------------------------------------------------
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
/** Prose in comments can read like an import ("...we disambiguate X from 'y'"). */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
let denoPinned = true;
let denoImportCount = 0;

for (const file of walk(FUNCTIONS_DIR)) {
  const src = stripComments(read(file));
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    // Relative paths and node: builtins carry no supply-chain resolution.
    if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
    denoImportCount++;
    const ok = spec.startsWith('http') ? PINNED_URL.test(spec) : PINNED_BARE.test(spec);
    if (!ok) {
      denoPinned = false;
      fail('deno-import-unpinned', `${rel(file)}: '${spec}' is not pinned to an exact version; each deploy re-resolves it`);
    }
  }
}
if (denoPinned && denoImportCount > 0) {
  pass(`all ${denoImportCount} Edge Function remote imports are pinned to an exact version`);
}

// ---------------------------------------------------------------------------
// 5. Deno's own node_modules must never shadow the npm tree. When it does, the
//    versions a developer builds and tests against stop being the versions the
//    lockfile installs in CI.
// ---------------------------------------------------------------------------
let noDenoShadow = true;
for (const dir of [ROOT, FUNCTIONS_DIR]) {
  const shadow = join(dir, 'node_modules', '.deno');
  if (existsSync(shadow)) {
    noDenoShadow = false;
    fail('deno-shadowed-node-modules', `${rel(shadow)} exists; Deno has taken over this node_modules and is overriding npm-resolved versions. Remove ${rel(join(dir, 'node_modules'))} and reinstall with 'npm ci'`);
  }
}
if (noDenoShadow) pass('no Deno-managed node_modules is shadowing the npm tree');

// ---------------------------------------------------------------------------
// 6. What is installed must be what the lockfile says. This is the check that
//    catches a local tree drifting away from what CI and EAS will build.
// ---------------------------------------------------------------------------
const pkgPath = join(ROOT, 'package.json');
if (lock?.packages && existsSync(pkgPath) && existsSync(join(ROOT, 'node_modules'))) {
  const pkg = JSON.parse(read(pkgPath));
  const direct = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
  let inSync = true;

  for (const name of direct) {
    const locked = lock.packages[`node_modules/${name}`]?.version;
    const manifest = join(ROOT, 'node_modules', name, 'package.json');
    if (!locked || !existsSync(manifest)) continue;
    let installed;
    try { installed = JSON.parse(read(manifest)).version; } catch { continue; }
    if (installed !== locked) {
      inSync = false;
      fail('installed-lockfile-drift', `${name}: lockfile pins ${locked} but ${installed} is installed; the build is not reproducing the lockfile`);
    }
  }
  if (inSync) pass('installed direct dependencies match the committed lockfile');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log('supply chain OK');
  for (const c of checks) console.log(`  ✓ ${c}`);
  process.exit(0);
}
console.error(`supply chain FAILED (${failures.length})`);
for (const f of failures) console.error(`  ✗ [${f.rule}] ${f.detail}`);
process.exit(1);
