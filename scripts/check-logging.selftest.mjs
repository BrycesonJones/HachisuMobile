#!/usr/bin/env node
/**
 * Self-test for the security logging guard (OWASP A09:2025).
 *
 *   npm run check:logging:selftest
 *
 * check-logging.mjs is itself a security control, so per the repo's Red -> Green
 * directive it must be shown to FAIL on each state it claims to detect. Four of
 * its five rules were observed failing against the tree as it stood before the
 * A09 fixes; the fifth (client console calls must be dev-gated) has never fired,
 * because the client was already correct. An assertion nobody has ever seen fail
 * is not yet evidence of anything, so all five are exercised here.
 *
 * Runs entirely offline against a temporary COPY of the repository. Nothing in
 * the working tree is modified.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const GUARD = join(ROOT, 'scripts', 'check-logging.mjs');

/** Only what the guard actually reads — keeps each copy cheap. */
const COPIED = ['supabase/functions', 'app', 'lib', 'components', 'hooks', 'contexts', 'constants', 'utils'];

const results = [];
let failed = 0;

function runGuard(root) {
  try {
    execFileSync(process.execPath, [GUARD, '--root', root], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, rules: [] };
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    return {
      code: err.status ?? 1,
      rules: [...new Set([...out.matchAll(/✗ \[([a-z-]+)\]/g)].map((m) => m[1]))],
    };
  }
}

function check(name, expect, root) {
  const { code, rules } = runGuard(root);
  const ok = expect === 'pass' ? code === 0 : code !== 0 && rules.includes(expect);
  results.push({
    name,
    ok,
    detail: expect === 'pass' ? `exit ${code}` : `exit ${code} rules=[${rules.join(',')}]`,
  });
  if (!ok) failed++;
}

const work = mkdtempSync(join(tmpdir(), 'hachisu-logging-selftest-'));
try {
  const pristine = join(work, 'pristine');
  for (const dir of COPIED) {
    const src = join(ROOT, dir);
    const dest = join(pristine, dir);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }

  const fresh = (name) => {
    const dir = join(work, name);
    cpSync(pristine, dir, { recursive: true });
    return dir;
  };
  const edit = (root, rel, fn) => {
    const p = join(root, rel);
    writeFileSync(p, fn(readFileSync(p, 'utf8')));
  };

  check('GREEN  the current tree passes', 'pass', fresh('green-before'));

  // R1 — CWE-117: a client-supplied identifier back in a console template.
  {
    const dir = fresh('red-injection');
    edit(dir, 'supabase/functions/get-btcpay-activity-detail/index.ts', (s) =>
      s.replace(
        '  // 3. Verify ownership',
        '  console.error(`[activity-detail] lookup store=${merchantStoreId}`);\n  // 3. Verify ownership',
      ),
    );
    check('RED-1  client input interpolated into a log template', 'log-injection-risk', dir);
  }

  // R2a — CWE-532: a raw upstream response body back in a log.
  {
    const dir = fresh('red-body');
    edit(dir, 'supabase/functions/delete-btcpay-pos-app/index.ts', (s) =>
      s.replace(
        '      console.error(`[delete-pos-app] btcpayStatus=${err.status}`);',
        '      console.error(`[delete-pos-app]`, JSON.stringify(err.body));',
      ),
    );
    check('RED-2  raw upstream response body logged', 'raw-upstream-body-logged', dir);
  }

  // R2b — CWE-532: the error OBJECT itself passed to console.
  {
    const dir = fresh('red-errobj');
    edit(dir, 'supabase/functions/delete-btcpay-pos-app/index.ts', (s) =>
      s.replace(
        '      console.error(`[delete-pos-app] btcpayStatus=${err.status}`);',
        '      console.error(`[delete-pos-app] failed:`, err);',
      ),
    );
    check('RED-3  raw error object passed to console', 'raw-error-object-logged', dir);
  }

  // R3 — CWE-223/778: an ownership denial that records nothing.
  {
    const dir = fresh('red-denial');
    edit(dir, 'supabase/functions/replace-btcpay-onchain-wallet/index.ts', (s) =>
      s.replace(
        /logAuthorizationDenied\(\{[\s\S]*?\n {4}\}\);\n/,
        '',
      ),
    );
    check('RED-4  an ownership denial emits no event', 'authorization-denial-unlogged', dir);
  }

  // R4 — CWE-778: the feature gate stops recording refusals.
  {
    const dir = fresh('red-gate');
    edit(dir, 'supabase/functions/_shared/feature-gates.ts', (s) =>
      s.replace(/logFeatureDisabledAttempt\([^;]*\);/, '').replace(/logSecurityEvent/g, 'x_removed'),
    );
    check('RED-5  feature-gate refusal emits no event', 'feature-gate-refusal-unlogged', dir);
  }

  // R5 — CWE-532 (client): an ungated console call in shipped client code.
  {
    const dir = fresh('red-client');
    edit(dir, 'lib/supabase.ts', (s) => `${s}\nconsole.log('[boot] session debug', supabase);\n`);
    check('RED-6  an ungated client console call', 'client-log-not-dev-gated', dir);
  }

  check('GREEN  the current tree still passes', 'pass', fresh('green-after'));
} finally {
  rmSync(work, { recursive: true, force: true });
}

const width = Math.max(...results.map((r) => r.name.length));
console.log('check:logging self-test');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.detail}`);
if (failed > 0) {
  console.error(`\nself-test FAILED (${failed}/${results.length})`);
  process.exit(1);
}
console.log(
  `\nself-test passed (${results.length}/${results.length}) — every logging rule fails on the state it claims to detect`,
);
