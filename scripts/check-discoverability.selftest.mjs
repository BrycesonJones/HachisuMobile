#!/usr/bin/env node
/**
 * Self-test for the public agent-discoverability guard.
 *
 *   npm run check:discoverability:selftest
 *
 * check-discoverability.mjs encodes what "publicly understandable" means for
 * Hachisu, so per the repo's Red -> Green directive it must be shown to FAIL on
 * each state it claims to detect. Every rule below was observed failing against
 * the tree as it stood before this remediation — web/ did not exist at all, and
 * the live domains served Porkbun's identity — but a guard that passes only
 * because the tree was fixed is not evidence that the guard still works. Each
 * rule is therefore re-armed here by reintroducing the exact defect it exists to
 * catch, including the two the audit actually found in production: registrar
 * identity served under a Hachisu domain, and identity metadata pointing at a
 * non-canonical host.
 *
 * Runs entirely offline against a temporary COPY of the repository. Nothing in
 * the working tree is modified.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const GUARD = join(ROOT, 'scripts', 'check-discoverability.mjs');

/** Only what the guard actually reads. */
const COPIED = ['web', 'constants/feature-flags.ts'];

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
      rules: [...new Set([...out.matchAll(/✗ \[([a-z0-9-]+)\]/g)].map((m) => m[1]))],
    };
  }
}

const work = mkdtempSync(join(tmpdir(), 'hachisu-discoverability-'));

function fresh(name) {
  const dir = join(work, name);
  for (const entry of COPIED) {
    const src = join(ROOT, entry);
    const dest = join(dir, entry);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
  return dir;
}

function edit(dir, relPath, fn) {
  const file = join(dir, relPath);
  writeFileSync(file, fn(readFileSync(file, 'utf8')));
}

/**
 * `expected` is the rule id that must appear. 'pass' asserts a clean exit.
 */
function check(name, expected, dir) {
  const { code, rules } = runGuard(dir);
  let ok;
  let detail;
  if (expected === 'pass') {
    ok = code === 0;
    detail = ok ? 'guard passes' : `expected pass, got: ${rules.join(', ') || `exit ${code}`}`;
  } else {
    ok = code !== 0 && rules.includes(expected);
    detail = ok
      ? `caught [${expected}]`
      : `expected [${expected}], got: ${rules.join(', ') || `exit ${code}`}`;
  }
  if (!ok) failed++;
  results.push({ name, ok, detail });
}

try {
  // RED-1 — the state the audit actually failed on: no public site at all.
  {
    const dir = fresh('red-1');
    rmSync(join(dir, 'web', 'index.html'));
    check('RED-1  no landing page exists', 'canonical-site-exists', dir);
  }

  // RED-2 — the production defect: registrar identity under a Hachisu domain.
  {
    const dir = fresh('red-2');
    edit(dir, 'web/index.html', (s) =>
      s.replace('<title>', '<title>A Brand New Domain! Brought to you by Porkbun. '),
    );
    check('RED-2  Porkbun identity served as Hachisu', 'no-registrar-identity', dir);
  }

  // RED-3 — identity metadata claiming a non-canonical host.
  {
    const dir = fresh('red-3');
    edit(dir, 'web/index.html', (s) =>
      s.replace(
        '<link rel="canonical" href="https://hachisu.io/">',
        '<link rel="canonical" href="https://hachisubitcoin.com/">',
      ),
    );
    check('RED-3  canonical points at an alternate domain', 'canonical-host', dir);
  }

  // RED-4 — a static-template default that silently blocks all discovery.
  {
    const dir = fresh('red-4');
    edit(dir, 'web/robots.txt', (s) => s.replace('Allow: /', 'Disallow: /'));
    check('RED-4  robots.txt blanket-blocks crawlers', 'robots-allows-discovery', dir);
  }

  // RED-5 — an authenticated application route leaking into the sitemap.
  {
    const dir = fresh('red-5');
    edit(dir, 'web/sitemap.xml', (s) =>
      s.replace('</urlset>', '  <url><loc>https://hachisu.io/account/business-profile</loc></url>\n</urlset>'),
    );
    check('RED-5  private route listed in sitemap', 'sitemap-valid', dir);
  }

  // RED-6 — public copy promising a surface the product gates off.
  {
    const dir = fresh('red-6');
    edit(dir, 'web/index.html', (s) =>
      s.replace('</body>', '<p>Hachisu supports Lightning.</p></body>'),
    );
    check('RED-6  copy advertises gated Lightning', 'lightning-not-advertised', dir);
  }

  // RED-6B — a gated feature with no public unavailable/coming-soon status.
  {
    const dir = fresh('red-6b');
    edit(dir, 'web/index.html', (s) =>
      s.replace(
        /<div><dt>Lightning<\/dt><dd>[^<]*<\/dd><\/div>/,
        '<div><dt>Lightning</dt><dd>Roadmap.</dd></div>',
      ),
    );
    check('RED-6B gated Lightning status omitted', 'lightning-not-advertised', dir);
  }

  // RED-7 — machine-readable fiction: schema outrunning visible content.
  {
    const dir = fresh('red-7');
    edit(dir, 'web/index.html', (s) =>
      s.replace(
        '"applicationCategory": "FinanceApplication",',
        '"applicationCategory": "FinanceApplication",\n      "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "2100" },',
      ),
    );
    check('RED-7  fabricated ratings in JSON-LD', 'structured-data-valid', dir);
  }

  // RED-8 — a credential inside the directory served verbatim to the public.
  {
    const dir = fresh('red-8');
    writeFileSync(
      join(dir, 'web', 'config.js'),
      'window.SUPABASE = { service_role: "sb_secret_examplekeyvalue0000" };\n',
    );
    check('RED-8  credential inside web/', 'no-secrets-in-web', dir);
  }

  // RED-9 — serving the site on a host its own metadata disclaims.
  {
    const dir = fresh('red-9');
    writeFileSync(join(dir, 'web', 'CNAME'), 'hachisu.app\n');
    check('RED-9  CNAME disagrees with canonical origin', 'cname-matches-canonical', dir);
  }

  // RED-10 — the soft-404 both parking services exhibited.
  {
    const dir = fresh('red-10');
    rmSync(join(dir, 'web', '404.html'));
    check('RED-10 no real 404 page', 'real-404', dir);
  }

  // RED-11 — a page that loads but cannot be understood.
  {
    const dir = fresh('red-11');
    edit(dir, 'web/index.html', (s) => s.replace(/non-custodial/gi, 'modern'));
    check('RED-11 custody model absent from body text', 'machine-readable-product', dir);
  }

  // RED-12 — a generic title that identifies no product category.
  {
    const dir = fresh('red-12');
    edit(dir, 'web/index.html', (s) =>
      s.replace(
        '<title>Hachisu — Bitcoin Payments for Merchants</title>',
        '<title>The future of payments</title>',
      ),
    );
    check('RED-12 generic, uninformative title', 'metadata-complete', dir);
  }

  // RED-13 — agent guidance that does not name the canonical site.
  {
    const dir = fresh('red-13');
    edit(dir, 'web/llms.txt', (s) => s.replace(/https:\/\/hachisu\.io/g, 'https://example.invalid'));
    check('RED-13 llms.txt omits canonical origin', 'llms-canonical', dir);
  }

  check('GREEN  the current tree still passes', 'pass', fresh('green-after'));
} finally {
  rmSync(work, { recursive: true, force: true });
}

const width = Math.max(...results.map((r) => r.name.length));
console.log('check:discoverability self-test');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.detail}`);
if (failed > 0) {
  console.error(`\nself-test FAILED (${failed}/${results.length})`);
  process.exit(1);
}
console.log(
  `\nself-test passed (${results.length}/${results.length}) — every discoverability rule fails ` +
    `on the state it claims to detect`,
);
