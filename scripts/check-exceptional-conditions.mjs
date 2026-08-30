#!/usr/bin/env node
/**
 * Exceptional-condition guard (OWASP A10:2025 — Mishandling of Exceptional
 * Conditions).
 *
 *   node scripts/check-exceptional-conditions.mjs
 *   node scripts/check-exceptional-conditions.mjs --root <dir>   # self-test
 *
 * A10 is not "handle more errors". It is: when an assumption fails — a body is
 * not the shape the handler assumed, a dependency returns something unexpected,
 * a verification call itself errors, a remote mutation's outcome is unknown —
 * does Hachisu fail CLOSED, keep its durable state truthful, and surface an
 * error that says nothing it should not?
 *
 * Each rule below was violated somewhere in this tree when it was written, and
 * each violation had a state or disclosure consequence, not merely a stack
 * trace. Ordinary reliability bugs are deliberately NOT encoded here.
 *
 *   1. CWE-234/235/248/476 — a handler that reads a JSON request body must go
 *      through readJsonObjectBody(). `await req.json()` succeeds on `null`, on
 *      an array, and on a bare scalar; the very next line dereferences it as an
 *      object, so a syntactically valid body throws an uncaught TypeError and
 *      the caller gets an opaque 500 instead of a stable 400.
 *
 *   2. CWE-209/550 — a BtcpayConfigError message must never become a client
 *      response body. Those messages name the server's environment variables
 *      and describe how it is misconfigured; that belongs in the log, not in an
 *      answer to a request.
 *
 *   3. CWE-390/636 — the POS app save must not persist a menu to Supabase after
 *      the BTCPay push for that same menu failed. Supabase is what the merchant
 *      sees; BTCPay is what charges the customer. A "warning" the caller is free
 *      to ignore is not error handling, it is a detected error the code walked
 *      past. Its sibling update-btcpay-pos-mode already fails closed.
 *
 *   4. CWE-252/636 — delete-account's post-deletion read-back exists so a
 *      deletion that did not happen is never reported as one. If the read-back
 *      call ITSELF errors and that error is not checked, the control inverts:
 *      the failure to verify is read as a clean verification.
 *
 *   5. CWE-460/636 — replace-btcpay-onchain-wallet's last-resort path (the
 *      reconcile attempt itself threw, so what BTCPay now holds is UNKNOWN) must
 *      not answer with a clean "failed". A merchant told the replacement failed
 *      believes the OLD wallet still receives; if the PUT did land, the store
 *      row keeps asserting a wallet that no longer routes payments. The
 *      uncertainty has to be recorded and surfaced as reconcile-required.
 *
 * These are guards, not a bug list: the tree is expected to pass. Their job is
 * to keep the unsafe state unrepresentable going forward.
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

const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');

/** Every deployed Edge Function entrypoint: supabase/functions/<slug>/index.ts. */
function entrypoints() {
  if (!existsSync(FUNCTIONS_DIR)) return [];
  return readdirSync(FUNCTIONS_DIR)
    .filter((slug) => slug !== '_shared' && !slug.startsWith('.'))
    .map((slug) => ({ slug, file: join(FUNCTIONS_DIR, slug, 'index.ts') }))
    .filter(({ file }) => existsSync(file) && statSync(file).isFile());
}

const FUNCTIONS = entrypoints();

// ---------------------------------------------------------------------------
// 1. CWE-234/235/248/476 — a JSON request body is read as an OBJECT or refused.
// ---------------------------------------------------------------------------
{
  let offenders = 0;
  let total = 0;
  for (const { slug, file } of FUNCTIONS) {
    const source = read(file);
    if (!source) continue;
    const readsBody =
      /\breq\.json\s*\(/.test(source) || /\breadJsonObjectBody\s*\(/.test(source);
    if (!readsBody) continue;
    total++;
    if (/\breq\.json\s*\(/.test(source)) {
      offenders++;
      fail(
        'json-body-shape',
        `${slug}: reads req.json() directly. A body of \`null\`, \`[]\` or \`"x"\` parses fine ` +
          `and is then dereferenced as an object — an uncaught TypeError instead of a 400. ` +
          `Use readJsonObjectBody() from _shared/request-body.ts.`,
      );
    }
  }
  if (offenders === 0) {
    pass(`all ${total} body-reading functions refuse a non-object JSON body`);
  }
}

// ---------------------------------------------------------------------------
// 2. CWE-209/550 — BTCPay misconfiguration detail never reaches the client.
// ---------------------------------------------------------------------------
//
// Thirty call sites answered with `err instanceof BtcpayConfigError ?
// err.message : '...'`, and that message named the missing environment
// variables. Rewriting thirty ternaries would leave the next one free to leak
// again, so the split is made at the source: BtcpayConfigError.message is the
// SAFE public sentence, and the operator-facing specifics live on a separate
// `detail` property that only the log side reads.
//
// Two things are pinned here. The unit test in
// supabase/functions/_shared/btcpay-config.test.ts pins the third — that the
// public message names no environment variable.
{
  const clientSource = read(join(FUNCTIONS_DIR, '_shared', 'btcpay-client.ts'));
  if (clientSource === null) {
    fail('config-error-not-returned', '_shared/btcpay-client.ts is missing.');
  } else if (!/class\s+BtcpayConfigError[\s\S]{0,600}?\breadonly\s+detail\b/.test(clientSource)) {
    fail(
      'config-error-not-returned',
      `_shared/btcpay-client.ts: BtcpayConfigError carries no separate \`detail\`. Without one, ` +
        `the only message a call site can return is the operator-facing text naming the ` +
        `server's environment variables.`,
    );
  } else {
    let offenders = 0;
    for (const { slug, file } of FUNCTIONS) {
      const source = read(file);
      if (!source || !/\bBtcpayConfigError\b/.test(source)) continue;
      if (/\.detail\b/.test(source)) {
        offenders++;
        fail(
          'config-error-not-returned',
          `${slug}: reads a BtcpayConfigError \`detail\`. That text is for the log only; a ` +
            `response must carry the error's safe public message.`,
        );
      }
    }
    if (offenders === 0) {
      pass('BTCPay misconfiguration detail is separated from the client-facing message');
    }
  }
}

// ---------------------------------------------------------------------------
// 3. CWE-390/636 — the POS save does not persist past a failed BTCPay push.
// ---------------------------------------------------------------------------
{
  const file = join(FUNCTIONS_DIR, 'update-btcpay-pos-app', 'index.ts');
  const source = read(file);
  if (source === null) {
    fail('pos-save-fails-closed', 'update-btcpay-pos-app/index.ts is missing.');
  } else if (/btcpayWarning/.test(source)) {
    fail(
      'pos-save-fails-closed',
      `${rel(file)}: a failed BTCPay push is downgraded to a "warning" and the menu is written ` +
        `to Supabase anyway. Supabase drives the merchant's screen; BTCPay charges the ` +
        `customer. Return the failure before persisting, as update-btcpay-pos-mode does.`,
    );
  } else {
    pass('the POS app save refuses to persist a menu BTCPay did not accept');
  }
}

// ---------------------------------------------------------------------------
// 4. CWE-252/636 — the account-deletion read-back checks its own error.
// ---------------------------------------------------------------------------
{
  const file = join(FUNCTIONS_DIR, 'delete-account', 'index.ts');
  const source = read(file);
  if (source === null) {
    fail('deletion-readback-checked', 'delete-account/index.ts is missing.');
  } else if (!/getUserById\(/.test(source)) {
    fail(
      'deletion-readback-checked',
      `${rel(file)}: no post-deletion getUserById read-back found. Success is only reported ` +
        `after the account is confirmed gone.`,
    );
  } else if (!/confirmAccountDeleted\(\s*await\s+admin\.auth\.admin\.getUserById\(/.test(source)) {
    // The shape that failed open destructured only `data`: a read-back that
    // could not RUN answers `{ data: { user: null }, error }`, which is
    // byte-identical to a confirmed deletion once `error` is dropped. Routing
    // the whole response through confirmAccountDeleted() makes the error
    // impossible to drop — and that predicate is pinned by
    // _shared/account-deletion.test.ts.
    fail(
      'deletion-readback-checked',
      `${rel(file)}: the read-back does not go through confirmAccountDeleted(). Reading only ` +
        `\`data\` lets a read-back that itself errored pass as "confirmed deleted" — the ` +
        `verification fails open into the success it exists to prevent.`,
    );
  } else {
    pass('the account-deletion read-back fails closed when it cannot verify');
  }
}

// ---------------------------------------------------------------------------
// 5. CWE-460/636 — an unreconcilable wallet replacement records its uncertainty.
// ---------------------------------------------------------------------------
{
  const file = join(FUNCTIONS_DIR, 'replace-btcpay-onchain-wallet', 'index.ts');
  const source = read(file);
  if (source === null) {
    fail('replace-uncertainty-recorded', 'replace-btcpay-onchain-wallet/index.ts is missing.');
  } else {
    // The last-resort branch: the reconcile attempt threw, so BTCPay's state is
    // unknown. Isolate everything after the reconcile call the outer catch makes.
    const idx = source.lastIndexOf('reconcileFromBtcpay(admin, config, store, lockToken)');
    // Comments are stripped: this file EXPLAINS the old answer in prose, and the
    // rule is about what the code returns, not what the comment names.
    const branch =
      idx === -1 ? '' : source.slice(idx).replace(/^\s*\/\/.*$/gm, '');
    if (!branch) {
      fail(
        'replace-uncertainty-recorded',
        `${rel(file)}: could not locate the reconcile-failure branch to verify.`,
      );
    } else if (/BTCPAY_REPLACEMENT_FAILED/.test(branch)) {
      fail(
        'replace-uncertainty-recorded',
        `${rel(file)}: when reconciliation itself fails, BTCPay's state is UNKNOWN — the PUT may ` +
          `have landed. Answering BTCPAY_REPLACEMENT_FAILED tells the merchant the old wallet ` +
          `still receives and leaves the store row asserting it. Record the uncertainty and ` +
          `return the reconcile-required contract instead.`,
      );
    } else if (!/markOnchainStateUnknown\(/.test(branch)) {
      fail(
        'replace-uncertainty-recorded',
        `${rel(file)}: the reconcile-failure branch does not record an uncertain wallet state.`,
      );
    } else {
      pass('an unreconcilable wallet replacement records uncertainty instead of a clean failure');
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log('exceptional-condition handling OK');
  for (const c of checks) console.log(`  ✓ ${c}`);
  process.exit(0);
}
console.error(`exceptional-condition handling FAILED (${failures.length})`);
for (const f of failures) console.error(`  ✗ [${f.rule}] ${f.detail}`);
process.exit(1);
