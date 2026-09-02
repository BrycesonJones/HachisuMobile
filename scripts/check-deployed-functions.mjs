#!/usr/bin/env node
/**
 * Deployed-source integrity guard (OWASP A08:2025 — Software or Data Integrity
 * Failures; CWE-345 Insufficient Verification of Data Authenticity, CWE-353
 * Missing Support for Integrity Check).
 *
 *   npm run check:deployed                 # baseline: working tree  (post-deploy)
 *   npm run check:deployed -- --against=head    # baseline: git HEAD (release)
 *   npm run check:deployed -- --only create-btcpay-invoice,delete-account
 *   npm run check:deployed -- --project-ref <ref>
 *
 * WHY THIS EXISTS
 * ---------------
 * `check:supplychain` proves the REPOSITORY resolves deterministically. It says
 * nothing about what is actually RUNNING. Hachisu's Edge Functions hold the
 * Supabase service-role key and the BTCPay Greenfield key, and they are deployed
 * by hand from a developer checkout — so until now the only thing tying reviewed
 * source to production source was developer discipline. That is a procedural
 * control, not a verifiable one, and it cannot detect:
 *
 *   * a STALE function      — a shared module changed but a function that bundles
 *                             it was never redeployed
 *   * a DASHBOARD EDIT      — source changed in the Supabase UI, never in git
 *   * a WRONG CHECKOUT      — deployed from another branch or an old worktree
 *   * a DIRTY-TREE DEPLOY   — deployed bytes that exist in no commit
 *   * a MISSING function    — in the repository, absent from the project
 *   * an UNEXPECTED function— running in the project, absent from the repository
 *   * a DISABLED JWT GATE   — verify_jwt turned off (invisible in source)
 *   * an IMPORT MAP         — module specifiers re-resolved at deploy time
 *
 * HOW IT WORKS
 * ------------
 * `supabase functions download <slug> --use-api` unbundles the deployed function
 * SERVER-SIDE and writes back the real source bytes — the function's own
 * `index.ts` plus every `_shared/*.ts` module its bundle actually contains — in
 * the same `supabase/functions/...` layout the repository uses. So this is a
 * BYTE comparison of source, not a hash of an artifact and not a heuristic.
 *
 * The download target is a fresh `mkdtemp` directory outside the repository, and
 * it is removed on every exit path. The repository is never written to. Nothing
 * downloaded is ever printed: the report names functions and files only, never a
 * line of source, never a diff body, never an environment variable — a deployed
 * function body can legitimately quote a secret name, and a diff could echo one.
 *
 * NO CONTENT NORMALIZATION IS PERFORMED. The platform's layout already matches
 * the repository's (`supabase/functions/<slug>/index.ts`,
 * `supabase/functions/_shared/<mod>.ts`), so path mapping is the identity
 * function and every byte of every file is compared as-is. If that ever stops
 * being true, normalize the PATH, never the CONTENT.
 *
 * COMPARISON BASELINE — read this before trusting a PASS
 * -----------------------------------------------------
 * `--against=worktree` (default) compares production against the files on disk
 * right now. That is the correct baseline IMMEDIATELY AFTER A DEPLOY: it answers
 * "did the bytes I just pushed actually land?". It is NOT a release attestation,
 * because uncommitted local source is not reviewed source — a PASS here would be
 * equally happy if the working tree contained something nobody has ever seen. So
 * when the tree is dirty under supabase/functions this mode says so, loudly, and
 * labels its own verdict as unattested.
 *
 * `--against=head` compares production against `git show HEAD:<path>`. That is
 * the RELEASE baseline: it can only pass if production is byte-identical to
 * committed, reviewable, pushable source. Use it after committing, and in any
 * context where the answer is meant to be evidence.
 *
 * This is a guard, not a bug report: production is expected to match. Its job is
 * to make undetected divergence unrepresentable going forward.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const ROOT = flag('root', process.cwd());
const AGAINST = flag('against', 'worktree');
const ONLY = (flag('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const FIXTURE = flag('fixture', null); // self-test only: a pre-downloaded tree
const CLI = flag('cli', 'supabase');

if (AGAINST !== 'worktree' && AGAINST !== 'head') {
  console.error(`--against must be "worktree" or "head" (got "${AGAINST}")`);
  process.exit(2);
}

const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');

/**
 * Functions that are DELIBERATELY deployed public (verify_jwt=false).
 *
 * This set is the declared intent the deployed configuration is verified
 * against, in BOTH directions: a function not listed here must have the
 * platform JWT gate on, and a function listed here must have it off — a
 * public endpoint that silently regains the gate is config drift too (it
 * breaks its anonymous callers), and either direction means production was
 * changed out-of-band.
 *
 * Listing a function here is a security decision. It is only correct when the
 * function holds no privileged credential path reachable from caller input and
 * is hardened as a public API (bounded validated input, fixed destinations,
 * generic errors). Currently:
 *
 *   send-contact-message — the hachisu.io landing-page contact form; visitors
 *   have no Supabase session. Server-fixed recipient, bounded inputs,
 *   origin-scoped CORS, no service-role usage. See its index.ts header.
 */
const PUBLIC_FUNCTIONS = new Set(['send-contact-message']);

const failures = [];
const checks = [];
const notes = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const pass = (rule) => checks.push(rule);

// ---------------------------------------------------------------------------
// Baseline resolution — worktree bytes, or the bytes at HEAD
// ---------------------------------------------------------------------------
const git = (args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });

/** Repository bytes for a path relative to ROOT, or null when absent. */
function baselineBytes(relPath) {
  if (AGAINST === 'head') {
    try {
      return git(['show', `HEAD:${relPath}`]);
    } catch {
      return null;
    }
  }
  const abs = join(ROOT, relPath);
  return existsSync(abs) ? readFileSync(abs) : null;
}

/** Function slugs the repository declares (a directory with an index.ts). */
function repoSlugs() {
  if (!existsSync(FUNCTIONS_DIR)) return [];
  return readdirSync(FUNCTIONS_DIR)
    .filter((name) => name !== '_shared' && !name.startsWith('.'))
    .filter((name) => statSync(join(FUNCTIONS_DIR, name)).isDirectory())
    .filter((name) => existsSync(join(FUNCTIONS_DIR, name, 'index.ts')))
    .sort();
}

// ---------------------------------------------------------------------------
// Deployed inventory
// ---------------------------------------------------------------------------
function resolveProjectRef() {
  const explicit = flag('project-ref', process.env.SUPABASE_PROJECT_REF || null);
  if (explicit) return explicit;
  // The project ref is public configuration (it is the client's API hostname),
  // unlike anything else in these files — which is why only the URL is read.
  for (const file of ['.env', '.env.local']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const match = /EXPO_PUBLIC_SUPABASE_URL\s*=\s*"?https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(
      readFileSync(path, 'utf8'),
    );
    if (match) return match[1];
  }
  return null;
}

/** [{ slug, status }] for every function deployed to the project. */
function listDeployed(projectRef) {
  const raw = execFileSync(CLI, ['functions', 'list', '--project-ref', projectRef, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('unexpected functions list payload');
  return parsed
    .map((fn) => ({
      slug: String(fn.slug ?? ''),
      status: String(fn.status ?? ''),
      verifyJwt: fn.verify_jwt,
      importMap: fn.import_map,
    }))
    .filter((fn) => fn.slug)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Downloads one deployed function's source into `workdir`. */
function downloadFunction(slug, projectRef, workdir) {
  execFileSync(
    CLI,
    ['functions', 'download', slug, '--project-ref', projectRef, '--use-api', '--workdir', workdir],
    { cwd: workdir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** Every *.ts the download produced, as paths relative to the workdir. */
function downloadedFiles(workdir) {
  const base = join(workdir, 'supabase', 'functions');
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (entry.endsWith('.ts')) out.push(relative(workdir, abs));
    }
  };
  walk(base);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const declared = repoSlugs();
if (declared.length === 0) {
  fail('no-local-functions', `${relative(process.cwd(), FUNCTIONS_DIR)}: no Edge Functions found`);
}

let workRoot = null;
try {
  let deployed;
  let projectRef = null;

  if (FIXTURE) {
    // Self-test path: a fixture stands in for the platform. Every comparison
    // below is the real one; only the transport is replaced.
    notes.push(`fixture mode: ${FIXTURE}`);
    // A `verify_jwt_disabled` marker file in a fixture function's directory
    // stands in for the platform's verify_jwt=false on that function.
    deployed = readdirSync(FIXTURE)
      .filter((name) => statSync(join(FIXTURE, name)).isDirectory())
      .sort()
      .map((slug) => ({
        slug,
        status: 'ACTIVE',
        verifyJwt: !existsSync(join(FIXTURE, slug, 'verify_jwt_disabled')),
        importMap: false,
      }));
  } else {
    projectRef = resolveProjectRef();
    if (!projectRef) {
      fail(
        'project-ref-unresolved',
        'could not determine the Supabase project ref (pass --project-ref or set SUPABASE_PROJECT_REF)',
      );
      throw new Error('project ref unresolved');
    }
    deployed = listDeployed(projectRef);
  }

  const deployedSlugs = deployed.map((fn) => fn.slug);

  // -- 1. Inventory: the deployed set must be exactly the declared set --------
  const missing = declared.filter((slug) => !deployedSlugs.includes(slug));
  const unexpected = deployedSlugs.filter((slug) => !declared.includes(slug));
  for (const slug of missing) {
    fail('function-missing', `${slug}: declared in the repository but not deployed`);
  }
  for (const slug of unexpected) {
    fail(
      'function-unexpected',
      `${slug}: deployed to the project but not present in the repository — it has no reviewed source`,
    );
  }
  if (missing.length === 0 && unexpected.length === 0) {
    pass(`the deployed function set is exactly the ${declared.length} declared in the repository`);
  }

  // -- 2. Every deployed function must be ACTIVE ------------------------------
  const inactive = deployed.filter((fn) => fn.status && fn.status !== 'ACTIVE');
  for (const fn of inactive) {
    fail('function-not-active', `${fn.slug}: deployed status is ${fn.status}, expected ACTIVE`);
  }
  if (inactive.length === 0 && deployed.length > 0) {
    pass(`all ${deployed.length} deployed functions report ACTIVE`);
  }

  // -- 2b. Gateway auth + module resolution must not have been altered -------
  //
  // Neither of these is visible in source, so a byte comparison alone cannot see
  // them. `verify_jwt: false` would drop the platform's JWT gate in front of a
  // function holding the service-role key (its in-code auth.getUser() check
  // would still stand, but defence-in-depth would be silently gone), and an
  // import map would re-resolve module specifiers at deploy time without
  // changing a single byte of the source this guard compares.
  // The declared-public set (PUBLIC_FUNCTIONS) is verified in both directions.
  const unverified = deployed.filter(
    (fn) => fn.verifyJwt === false && !PUBLIC_FUNCTIONS.has(fn.slug),
  );
  for (const fn of unverified) {
    fail(
      'verify-jwt-disabled',
      `${fn.slug}: deployed with verify_jwt=false — the platform JWT gate is off for this function`,
    );
  }
  const gatedPublic = deployed.filter(
    (fn) => PUBLIC_FUNCTIONS.has(fn.slug) && fn.verifyJwt !== false,
  );
  for (const fn of gatedPublic) {
    fail(
      'public-function-gated',
      `${fn.slug}: declared public (verify_jwt=false) but deployed with the JWT gate on — ` +
        `configuration drifted from declared intent and anonymous callers are broken`,
    );
  }
  if (unverified.length === 0 && gatedPublic.length === 0 && deployed.length > 0) {
    const publicDeployed = deployed.filter((fn) => PUBLIC_FUNCTIONS.has(fn.slug)).length;
    pass(
      `all ${deployed.length - publicDeployed} gated functions enforce verify_jwt; ` +
        `${publicDeployed} declared-public function(s) verified public as intended`,
    );
  }

  const withImportMap = deployed.filter((fn) => fn.importMap === true);
  for (const fn of withImportMap) {
    fail(
      'import-map-present',
      `${fn.slug}: deployed with an import map — module specifiers no longer resolve from source alone`,
    );
  }
  if (withImportMap.length === 0 && deployed.length > 0) {
    pass('no deployed function resolves modules through an import map');
  }

  // -- 3. Byte-compare the source of every function present in both -----------
  const comparable = declared.filter((slug) => deployedSlugs.includes(slug));
  const targets = ONLY.length > 0 ? comparable.filter((s) => ONLY.includes(s)) : comparable;
  if (ONLY.length > 0) {
    notes.push(`--only: comparing ${targets.length} of ${comparable.length} functions`);
    for (const slug of ONLY) {
      if (!comparable.includes(slug)) fail('unknown-slug', `${slug}: not a comparable function`);
    }
  }

  // The union of shared modules the deployed bundles actually contain. A shared
  // module imported by nothing never reaches production and is not compared.
  const sharedSeen = new Set();
  let filesCompared = 0;
  const driftedFunctions = new Set();

  for (const slug of targets) {
    workRoot = workRoot ?? mkdtempSync(join(tmpdir(), 'hachisu-deployed-'));
    const workdir = join(workRoot, slug);

    let files;
    if (FIXTURE) {
      files = downloadedFiles(join(FIXTURE, slug));
      for (const relPath of files) {
        compare(join(FIXTURE, slug, relPath), relPath, slug);
      }
    } else {
      try {
        execFileSync('mkdir', ['-p', join(workdir, 'supabase', 'functions')]);
        downloadFunction(slug, projectRef, workdir);
      } catch (err) {
        fail('download-failed', `${slug}: could not download the deployed source (${err.code ?? 'error'})`);
        continue;
      }
      files = downloadedFiles(workdir);
      if (files.length === 0) {
        fail('download-empty', `${slug}: the deployed bundle produced no source files`);
        continue;
      }
      for (const relPath of files) compare(join(workdir, relPath), relPath, slug);
      rmSync(workdir, { recursive: true, force: true });
    }
  }

  /** Byte-compares one downloaded file against its repository baseline. */
  function compare(absDownloaded, relPath, slug) {
    filesCompared++;
    if (relPath.includes('/_shared/')) sharedSeen.add(relPath);
    const repoBytes = baselineBytes(relPath);
    if (repoBytes === null) {
      driftedFunctions.add(slug);
      fail(
        'source-absent-in-repository',
        `${slug}: deployed bundle contains ${relPath}, which does not exist in the ${AGAINST} baseline`,
      );
      return;
    }
    const deployedBytes = readFileSync(absDownloaded);
    if (!deployedBytes.equals(repoBytes)) {
      driftedFunctions.add(slug);
      fail(
        'deployed-source-mismatch',
        `${slug}: deployed ${relPath} differs from the ${AGAINST} baseline ` +
          `(stale deploy, dashboard edit, wrong checkout, or an uncommitted local change)`,
      );
    }
  }

  if (targets.length > 0 && driftedFunctions.size === 0) {
    pass(
      `${filesCompared} deployed source files across ${targets.length} functions are byte-identical to ${AGAINST}`,
    );
    pass(`${sharedSeen.size} bundled _shared modules match the repository byte-for-byte`);
  }
} catch (err) {
  if (failures.length === 0) {
    fail('verification-failed', `could not verify deployed source: ${err.message}`);
  }
} finally {
  if (workRoot) rmSync(workRoot, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Baseline honesty: a worktree PASS is not a release attestation
// ---------------------------------------------------------------------------
let dirty = [];
if (!FIXTURE) {
  try {
    dirty = git(['status', '--porcelain', '--untracked-files=all', '--', 'supabase/functions'])
      .toString('utf8')
      .split('\n')
      .filter(Boolean);
  } catch {
    /* not a git tree — say nothing rather than guess */
  }
}

// ---------------------------------------------------------------------------
// Report — function and file names only. Never source, never a diff, never env.
// ---------------------------------------------------------------------------
const baselineLabel =
  AGAINST === 'head'
    ? 'git HEAD (release baseline — production matches committed source)'
    : 'working tree (post-deploy baseline — NOT a release attestation)';

if (failures.length === 0) {
  console.log('deployed source integrity OK');
  console.log(`  baseline: ${baselineLabel}`);
  for (const n of notes) console.log(`  note: ${n}`);
  for (const c of checks) console.log(`  ✓ ${c}`);
  if (AGAINST === 'worktree' && dirty.length > 0) {
    console.log('');
    console.log(
      `  ⚠ ${dirty.length} uncommitted change(s) under supabase/functions. This run proves only`,
    );
    console.log(
      '    that production matches LOCAL source. Re-run with --against=head after committing',
    );
    console.log('    to attest that production matches reviewed, committed source.');
  }
  process.exit(0);
}
console.error(`deployed source integrity FAILED (${failures.length})`);
console.error(`  baseline: ${baselineLabel}`);
for (const n of notes) console.error(`  note: ${n}`);
for (const f of failures) console.error(`  ✗ [${f.rule}] ${f.detail}`);
process.exit(1);
