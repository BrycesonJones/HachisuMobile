#!/usr/bin/env node
/**
 * Self-test for the deployed-source integrity guard (OWASP A08:2025).
 *
 *   npm run check:deployed:selftest
 *
 * check-deployed-functions.mjs is itself a security control, so per the repo's
 * Red -> Green directive it must be shown to FAIL on the states it claims to
 * detect — not merely to pass when everything is fine. A guard that cannot fail
 * is indistinguishable from no guard.
 *
 * This runs entirely OFFLINE and touches nothing in the project: it synthesizes
 * a "deployed" tree from repository source using the same bundle closure the
 * platform uses (scripts/lib/function-closure.mjs, cross-checked against real
 * downloaded bundles), feeds it to the guard through --fixture, then mutates a
 * COPY to reproduce each divergence class. Production is never contacted and
 * never tampered with to manufacture a RED.
 *
 * Baseline is --against=worktree, because the synthesized fixture is built from
 * the working tree.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { bundleFilesFor, functionSlugs } from './lib/function-closure.mjs';

const ROOT = process.cwd();
const GUARD = join(ROOT, 'scripts', 'check-deployed-functions.mjs');

const results = [];
let failed = 0;

/** Runs the guard against a fixture; returns { code, rules }. */
function runGuard(fixture) {
  try {
    execFileSync(process.execPath, [GUARD, '--against=worktree', '--fixture', fixture], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, rules: [] };
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    const rules = [...out.matchAll(/✗ \[([a-z-]+)\]/g)].map((m) => m[1]);
    return { code: err.status ?? 1, rules: [...new Set(rules)] };
  }
}

function check(name, expect, fixture) {
  const { code, rules } = runGuard(fixture);
  const ok =
    expect === 'pass'
      ? code === 0
      : code !== 0 && rules.includes(expect);
  results.push({ name, ok, detail: expect === 'pass' ? `exit ${code}` : `exit ${code} rules=[${rules.join(',')}]` });
  if (!ok) failed++;
}

/** Builds a synthetic deployed tree: fixture/<slug>/supabase/functions/... */
function synthesize(dest) {
  for (const slug of functionSlugs(ROOT)) {
    for (const rel of bundleFilesFor(ROOT, slug)) {
      const target = join(dest, slug, rel);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(ROOT, rel), target);
    }
  }
}

const work = mkdtempSync(join(tmpdir(), 'hachisu-deployed-selftest-'));
try {
  const pristine = join(work, 'pristine');
  synthesize(pristine);

  const fresh = (name) => {
    const dir = join(work, name);
    cpSync(pristine, dir, { recursive: true });
    return dir;
  };

  // GREEN: a faithful deployment must pass.
  check('GREEN  a faithful deployed tree passes', 'pass', fresh('green-before'));

  // RED 1 — one byte of a deployed entrypoint differs (dashboard edit / wrong checkout).
  {
    const dir = fresh('red-byte');
    const file = join(dir, 'delete-account', 'supabase/functions/delete-account/index.ts');
    const bytes = readFileSync(file);
    const i = bytes.indexOf('const');
    bytes[i] = 'C'.charCodeAt(0);
    writeFileSync(file, bytes);
    check('RED-1  a single changed byte in index.ts', 'deployed-source-mismatch', dir);
  }

  // RED 2 — a declared function is not deployed (missing / failed deploy).
  {
    const dir = fresh('red-missing');
    rmSync(join(dir, 'delete-account'), { recursive: true, force: true });
    check('RED-2  a declared function is not deployed', 'function-missing', dir);
  }

  // RED 3 — a function runs in the project with no reviewed source.
  {
    const dir = fresh('red-unexpected');
    const src = join(dir, 'delete-btcpay-pos-app');
    const rogue = join(dir, 'zz-unreviewed-function');
    cpSync(src, rogue, { recursive: true });
    cpSync(
      join(rogue, 'supabase/functions/delete-btcpay-pos-app'),
      join(rogue, 'supabase/functions/zz-unreviewed-function'),
      { recursive: true },
    );
    rmSync(join(rogue, 'supabase/functions/delete-btcpay-pos-app'), { recursive: true, force: true });
    check('RED-3  an unexpected deployed function', 'function-unexpected', dir);
  }

  // RED 4 — a bundled _shared module differs (the stale-shared-module case).
  {
    const dir = fresh('red-shared');
    const file = join(dir, 'update-btcpay-pos-mode', 'supabase/functions/_shared/pos-template.ts');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n// injected out-of-band\n`);
    check('RED-4  a bundled _shared module differs', 'deployed-source-mismatch', dir);
  }

  // RED 5 — the bundle carries a file that exists in no reviewed source.
  {
    const dir = fresh('red-absent');
    const shared = join(dir, 'delete-account', 'supabase/functions/_shared');
    cpSync(join(shared, 'cors.ts'), join(shared, 'zz-not-in-repo.ts'));
    check('RED-5  a deployed file absent from the repository', 'source-absent-in-repository', dir);
  }

  // GREEN again: the mutations must not have leaked into the pristine tree.
  check('GREEN  a faithful deployed tree still passes', 'pass', fresh('green-after'));
} finally {
  rmSync(work, { recursive: true, force: true });
}

const width = Math.max(...results.map((r) => r.name.length));
console.log('check:deployed self-test');
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.detail}`);
}
if (failed > 0) {
  console.error(`\nself-test FAILED (${failed}/${results.length})`);
  process.exit(1);
}
console.log(`\nself-test passed (${results.length}/${results.length}) — the guard fails on every divergence class it claims to detect`);
