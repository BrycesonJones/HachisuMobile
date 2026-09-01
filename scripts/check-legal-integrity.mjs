#!/usr/bin/env node
/**
 * Legal-content integrity guard (OWASP A08:2025 — Software or Data Integrity
 * Failures; CWE-345 Insufficient Verification of Data Authenticity, CWE-353
 * Missing Support for Integrity Check).
 *
 *   node scripts/check-legal-integrity.mjs
 *   node scripts/check-legal-integrity.mjs --root <dir>   # used by the self-test
 *
 * constants/legal-content.generated.ts is a COMMITTED BUILD ARTIFACT. It is what
 * the app actually renders as the Terms of Service, E-Sign Consent and Privacy
 * Notice, and public.user_legal_acceptances records a user's acceptance against
 * a version string in constants/legal.ts. Nothing in that chain re-derives the
 * artifact at build time, so three silent failures were possible:
 *
 *   1. CWE-345 — docs/legal/*.md is edited (the reviewed source of truth) and
 *      `npm run generate:legal` is not re-run, so users accept a version whose
 *      recorded semantics no longer match the text they were shown.
 *   2. CWE-345 — the generated file is hand-edited despite its DO-NOT-EDIT
 *      banner, so the shipped legal text has no reviewed source at all.
 *   3. CWE-353 — a document is added to LEGAL_DOCUMENTS but never generated, so
 *      the legal gate collects an acceptance for a document that renders empty.
 *
 * The check is a re-derivation, not a hash the same commit could update: the
 * generator is re-run from docs/legal/ into a temporary directory and the result
 * is compared byte-for-byte against the committed artifact.
 *
 * Node is invoked through `process.execPath` (the absolute path of the
 * interpreter already running) rather than a bare `node`, so this guard does not
 * itself resolve an executable through PATH (CWE-426 / CWE-427).
 *
 * This is a guard, not a bug report: the tree is expected to pass today. Its job
 * is to make the drifted state unrepresentable going forward.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();

const failures = [];
const checks = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const pass = (rule) => checks.push(rule);
const rel = (p) => relative(ROOT, p) || p;

const SOURCE_DIR = join(ROOT, 'docs', 'legal');
const GENERATOR = join(ROOT, 'scripts', 'generate-legal-content.js');
const ARTIFACT = join(ROOT, 'constants', 'legal-content.generated.ts');
const LEGAL_CONSTANTS = join(ROOT, 'constants', 'legal.ts');

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

// ---------------------------------------------------------------------------
// 1. The inputs and the artifact must all be present.
// ---------------------------------------------------------------------------
const committed = read(ARTIFACT);
if (committed === null) {
  fail('artifact-missing', `${rel(ARTIFACT)}: the generated legal content is not committed`);
} else if (!existsSync(SOURCE_DIR)) {
  fail('legal-source-missing', `${rel(SOURCE_DIR)}: the legal Markdown source of truth is missing`);
} else if (!existsSync(GENERATOR)) {
  fail('generator-missing', `${rel(GENERATOR)}: the legal content generator is missing`);
} else {
  pass('the legal source, generator and generated artifact are all committed');

  // -------------------------------------------------------------------------
  // 2. Re-derive the artifact from docs/legal/ and compare byte-for-byte.
  // -------------------------------------------------------------------------
  const work = mkdtempSync(join(tmpdir(), 'hachisu-legal-'));
  try {
    mkdirSync(join(work, 'docs'), { recursive: true });
    mkdirSync(join(work, 'scripts'), { recursive: true });
    mkdirSync(join(work, 'constants'), { recursive: true });
    cpSync(SOURCE_DIR, join(work, 'docs', 'legal'), { recursive: true });
    cpSync(GENERATOR, join(work, 'scripts', 'generate-legal-content.js'));

    execFileSync(process.execPath, [join(work, 'scripts', 'generate-legal-content.js')], {
      cwd: work,
      stdio: 'pipe',
    });

    const regenerated = read(join(work, 'constants', 'legal-content.generated.ts'));
    if (regenerated === null) {
      fail('regeneration-failed', 'the generator produced no output');
    } else if (regenerated !== committed) {
      fail(
        'legal-content-drift',
        `${rel(ARTIFACT)} does not match docs/legal/*.md — the app renders legal text ` +
          'that no longer matches its reviewed source. Run `npm run generate:legal` and ' +
          'bump the matching CURRENT_*_VERSION in constants/legal.ts if the text changed.',
      );
    } else {
      pass('the generated legal content is byte-identical to docs/legal/*.md');
    }
  } catch (err) {
    fail('regeneration-failed', `could not re-derive the legal content: ${err.message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  // 2b. The PUBLIC legal pages derive from the same source. web/{terms,privacy,
  // e-sign}.html are committed artifacts of scripts/generate-legal-pages.js,
  // which consumes the same parser as the app artifact — one legal policy set,
  // multiple presentation surfaces. A hand edit to a page, or a docs/legal/
  // change without regeneration, is the same CWE-345 drift as rule 2.
  // -------------------------------------------------------------------------
  const PAGE_GENERATOR = join(ROOT, 'scripts', 'generate-legal-pages.js');
  const WEB_PAGES = ['terms.html', 'privacy.html', 'e-sign.html'];
  if (!existsSync(PAGE_GENERATOR)) {
    fail('web-pages-generator-missing', `${rel(PAGE_GENERATOR)}: the public legal-page generator is missing`);
  } else {
    const webWork = mkdtempSync(join(tmpdir(), 'hachisu-legal-web-'));
    try {
      mkdirSync(join(webWork, 'docs'), { recursive: true });
      mkdirSync(join(webWork, 'scripts'), { recursive: true });
      mkdirSync(join(webWork, 'web'), { recursive: true });
      cpSync(SOURCE_DIR, join(webWork, 'docs', 'legal'), { recursive: true });
      cpSync(GENERATOR, join(webWork, 'scripts', 'generate-legal-content.js'));
      cpSync(PAGE_GENERATOR, join(webWork, 'scripts', 'generate-legal-pages.js'));

      execFileSync(process.execPath, [join(webWork, 'scripts', 'generate-legal-pages.js')], {
        cwd: webWork,
        stdio: 'pipe',
      });

      let webOk = true;
      for (const page of WEB_PAGES) {
        const committedPage = read(join(ROOT, 'web', page));
        const regeneratedPage = read(join(webWork, 'web', page));
        if (committedPage === null) {
          webOk = false;
          fail('web-legal-page-missing', `web/${page}: the public legal page is not committed`);
        } else if (regeneratedPage === null) {
          webOk = false;
          fail('web-regeneration-failed', `web/${page}: the page generator produced no output`);
        } else if (committedPage !== regeneratedPage) {
          webOk = false;
          fail(
            'web-legal-content-drift',
            `web/${page} does not match docs/legal/*.md — the public site shows legal text ` +
              'that no longer matches its reviewed source. Run `npm run generate:legal`.',
          );
        }
      }
      if (webOk) pass('the public web legal pages are byte-identical to docs/legal/*.md');
    } catch (err) {
      fail('web-regeneration-failed', `could not re-derive the web legal pages: ${err.message}`);
    } finally {
      rmSync(webWork, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Every acceptance-bearing document has a version AND rendered content.
// ---------------------------------------------------------------------------
const constants = read(LEGAL_CONSTANTS);
if (constants === null) {
  fail('legal-constants-missing', `${rel(LEGAL_CONSTANTS)}: the legal version constants are missing`);
} else {
  for (const name of [
    'CURRENT_TERMS_VERSION',
    'CURRENT_ESIGN_VERSION',
    'CURRENT_PRIVACY_NOTICE_VERSION',
  ]) {
    const match = new RegExp(`export const ${name}\\s*=\\s*'([^']*)'`).exec(constants);
    if (!match || match[1].trim() === '') {
      fail(
        'legal-version-missing',
        `${rel(LEGAL_CONSTANTS)}: ${name} must be a non-empty version string — an acceptance row is only evidence if it names a version`,
      );
    }
  }
  if (!failures.some((f) => f.rule === 'legal-version-missing')) {
    pass('every legal document declares a non-empty current version');
  }

  const slugs = [...constants.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);
  if (slugs.length === 0) {
    fail('legal-documents-missing', `${rel(LEGAL_CONSTANTS)}: LEGAL_DOCUMENTS declares no slugs`);
  } else if (committed !== null) {
    for (const slug of slugs) {
      if (!committed.includes(`"${slug}": [`)) {
        fail(
          'legal-document-not-generated',
          `${slug}: declared in LEGAL_DOCUMENTS but absent from ${rel(ARTIFACT)} — the legal gate would record an acceptance for a document that renders empty`,
        );
      }
    }
    if (!failures.some((f) => f.rule === 'legal-document-not-generated')) {
      pass(`all ${slugs.length} declared legal documents have generated content`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log('legal content integrity OK');
  for (const c of checks) console.log(`  ✓ ${c}`);
  process.exit(0);
}
console.error(`legal content integrity FAILED (${failures.length})`);
for (const f of failures) console.error(`  ✗ [${f.rule}] ${f.detail}`);
process.exit(1);
