#!/usr/bin/env node
/**
 * Self-test for the exceptional-condition guard (OWASP A10:2025).
 *
 *   npm run check:exceptions:selftest
 *
 * check-exceptional-conditions.mjs is itself a security control, so per the
 * repo's Red -> Green directive it must be shown to FAIL on each state it
 * claims to detect. All five of its rules were observed failing against the tree
 * as it stood before the A10 fixes — 34 violations across 30 functions — but a
 * guard that passes only because the tree was fixed is not evidence that the
 * guard still works. Each rule is therefore re-armed here by reintroducing the
 * exact defect it exists to catch.
 *
 * Runs entirely offline against a temporary COPY of the repository. Nothing in
 * the working tree is modified.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const GUARD = join(ROOT, 'scripts', 'check-exceptional-conditions.mjs');

/** Only what the guard actually reads. */
const COPIED = ['supabase/functions'];

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
    detail: expect === 'pass' ? `exit ${code}` : `exit ${code} rules=[${rules.join(',') || 'none'}]`,
  });
  if (!ok) failed++;
}

const work = mkdtempSync(join(tmpdir(), 'hachisu-a10-selftest-'));

try {
  let seq = 0;
  const fresh = (label) => {
    const dir = join(work, `${++seq}-${label}`);
    for (const rel of COPIED) {
      cpSync(join(ROOT, rel), join(dir, rel), { recursive: true });
    }
    return dir;
  };

  const edit = (dir, rel, fn) => {
    const abs = join(dir, rel);
    writeFileSync(abs, fn(readFileSync(abs, 'utf8')));
  };

  // R1 — CWE-234/235/248/476: a handler back to reading req.json() raw.
  {
    const dir = fresh('red-body');
    edit(dir, 'supabase/functions/create-btcpay-store/index.ts', (s) =>
      s.replace(
        /const body:[\s\S]*?= await readJsonObjectBody\(req\);/,
        'let body: Record<string, unknown>;\n  try {\n    body = await req.json();\n  } catch {\n    return jsonResponse({ error: "bad" }, 400);\n  }\n  if (!body) {',
      ),
    );
    check('RED-1  a handler reads req.json() unguarded', 'json-body-shape', dir);
  }

  // R2a — CWE-209/550: BtcpayConfigError loses its message/detail split.
  {
    const dir = fresh('red-config-split');
    edit(dir, 'supabase/functions/_shared/btcpay-client.ts', (s) =>
      s.replace('readonly detail: string;', 'readonly reason: string;'),
    );
    check('RED-2a the config error has no separate detail', 'config-error-not-returned', dir);
  }

  // R2b — CWE-209/550: a call site reaches for the operator-facing detail.
  {
    const dir = fresh('red-config-leak');
    edit(dir, 'supabase/functions/create-btcpay-store/index.ts', (s) =>
      s.replace(
        "err instanceof BtcpayConfigError ? err.message : 'BTCPay is not configured.';",
        "err instanceof BtcpayConfigError ? err.detail : 'BTCPay is not configured.';",
      ),
    );
    check('RED-2b a call site returns the config detail', 'config-error-not-returned', dir);
  }

  // R3 — CWE-390/636: the POS save downgrades a BTCPay failure to a warning.
  {
    const dir = fresh('red-pos');
    edit(dir, 'supabase/functions/update-btcpay-pos-app/index.ts', (s) =>
      s.replace(
        'return jsonResponse({ posApp: updated });',
        'return jsonResponse({ posApp: updated, btcpayWarning: null });',
      ),
    );
    check('RED-3  a failed BTCPay push becomes a warning', 'pos-save-fails-closed', dir);
  }

  // R4 — CWE-252/636: the deletion read-back drops its own error again.
  {
    const dir = fresh('red-readback');
    edit(dir, 'supabase/functions/delete-account/index.ts', (s) =>
      s.replace(
        'const readback = confirmAccountDeleted(await admin.auth.admin.getUserById(user.id));\n  if (!readback.confirmed) {',
        'const { data: after } = await admin.auth.admin.getUserById(user.id);\n  if (after?.user) {',
      ),
    );
    check('RED-4  the deletion read-back ignores its error', 'deletion-readback-checked', dir);
  }

  // R5 — CWE-460/636: an unknown BTCPay outcome answered as a clean failure.
  {
    const dir = fresh('red-uncertainty');
    edit(dir, 'supabase/functions/replace-btcpay-onchain-wallet/index.ts', (s) =>
      s.replace(
        'await markOnchainStateUnknown(admin, store.id, lockToken);',
        "await recordOp(admin, store.id, idempotencyKey, 'failed', { ok: false });\n      return fail('BTCPAY_REPLACEMENT_FAILED', 'The replacement could not be completed.', 500);",
      ),
    );
    check('RED-5  an unknown outcome answered as failed', 'replace-uncertainty-recorded', dir);
  }

  check('GREEN  the current tree still passes', 'pass', fresh('green-after'));
} finally {
  rmSync(work, { recursive: true, force: true });
}

const width = Math.max(...results.map((r) => r.name.length));
console.log('check:exceptions self-test');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.detail}`);
if (failed > 0) {
  console.error(`\nself-test FAILED (${failed}/${results.length})`);
  process.exit(1);
}
console.log(
  `\nself-test passed (${results.length}/${results.length}) — every exceptional-condition rule ` +
    `fails on the state it claims to detect`,
);
