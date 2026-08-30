#!/usr/bin/env node
/**
 * Design-invariant guard (OWASP A06:2025 — Insecure Design).
 *
 *   node scripts/check-design-invariants.mjs
 *   node scripts/check-design-invariants.mjs --root <dir>     # used by the self-test
 *
 * A05 and earlier fixed things individual functions got wrong. A06 is about the
 * properties that hold BETWEEN functions — and those are exactly the properties
 * that rot silently, because a new Edge Function that forgets one still reviews
 * fine on its own. This script asserts them structurally so the insecure shape
 * stops being representable:
 *
 *   1. CWE-602 — a product feature disabled only in the client bundle is still a
 *      live capability. Lightning is switched off for users, so the Lightning
 *      endpoints that CREATE or CHANGE Lightning capability must refuse
 *      server-side, and the two flags must agree.
 *   2. CWE-362/CWE-841 — every endpoint that mutates a store's on-chain payment
 *      destination must take the shared operation lock. One endpoint that skips
 *      it defeats the lock for all of them.
 *   3. CWE-642/CWE-807 — user_profiles is client-writable, so its BTCPay summary
 *      columns must be server-owned at the grant level and must never reach a
 *      privileged BTCPay call without server-side attestation.
 *   4. CWE-362 — account deletion must re-verify the store set before the
 *      irreversible step, so a store created mid-deletion cannot be orphaned.
 *   5. CWE-799 — store creation is the one endpoint where a single authenticated
 *      request mints a durable entity on the shared BTCPay instance. It must be
 *      bounded.
 *   6. CWE-598/CWE-525 — extended public keys derive every address a merchant
 *      will ever receive to. They must not travel as route params, which are the
 *      URL (and browser history) on the web target.
 *   7. CWE-693/CWE-657 — a table whose rows gate a privileged decision must be
 *      deny-by-default at the GRANT layer, not only at the policy layer. The
 *      attestation and wallet-replacement tables became load-bearing when the
 *      A06-01/A06-02 fixes started trusting them.
 *
 * These are guards, not bug reports: the tree is expected to pass today.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();

const failures = [];
const checks = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const pass = (rule) => checks.push(rule);

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const fnPath = (name) => join(ROOT, 'supabase', 'functions', name, 'index.ts');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Lightning is denied server-side while the product gate is off.
// ---------------------------------------------------------------------------
{
  const rule = 'Lightning capability is denied server-side while the product gate is off';
  const clientFlags = read(join(ROOT, 'constants', 'feature-flags.ts'));
  const serverGates = read(join(ROOT, 'supabase', 'functions', '_shared', 'feature-gates.ts'));

  if (!clientFlags || !serverGates) {
    fail(rule, 'constants/feature-flags.ts or supabase/functions/_shared/feature-gates.ts is missing');
  } else {
    const clientOn = /export const LIGHTNING_ENABLED\s*=\s*true/.test(clientFlags);
    const serverOn = /export const LIGHTNING_ENABLED\s*=\s*true/.test(serverGates);
    if (clientOn !== serverOn) {
      fail(
        rule,
        `client LIGHTNING_ENABLED=${clientOn} but server LIGHTNING_ENABLED=${serverOn}; ` +
          'the gate must be flipped in both places at once',
      );
    }

    // Endpoints that create or change Lightning capability. Read-only settings
    // and teardown (remove-lightning) stay reachable on purpose: a merchant with
    // Lightning configured from an earlier build must be able to see it and
    // turn it off.
    const mutators = [
      'prepare-btcpay-boltz-lightning',
      'connect-btcpay-lbtc-wallet',
      'update-lightning-settings',
    ];
    for (const name of mutators) {
      const src = read(fnPath(name));
      if (!src) {
        fail(rule, `${name}/index.ts not found`);
        continue;
      }
      const imports = /from '\.\.\/_shared\/feature-gates\.ts'/.test(src);
      const enforces = /if\s*\(!LIGHTNING_ENABLED\)\s*return lightningDisabledResponse\(\)/.test(src);
      if (!imports || !enforces) {
        fail(
          rule,
          `${name} does not enforce the server-side Lightning gate ` +
            '(expected `if (!LIGHTNING_ENABLED) return lightningDisabledResponse();`)',
        );
      }
    }
  }
  if (!failures.some((f) => f.rule === rule)) pass(rule);
}

// ---------------------------------------------------------------------------
// 2. Every on-chain payment-destination mutator takes the shared lock.
// ---------------------------------------------------------------------------
{
  const rule = 'every on-chain wallet mutator acquires the shared operation lock';
  const mutators = [
    'connect-btcpay-onchain-wallet',
    'replace-btcpay-onchain-wallet',
    'remove-btcpay-onchain-wallet',
    'sync-btcpay-onchain-wallet',
    'update-btcpay-onchain-wallet-settings',
  ];
  for (const name of mutators) {
    const src = read(fnPath(name));
    if (!src) {
      fail(rule, `${name}/index.ts not found`);
      continue;
    }
    if (!/from '\.\.\/_shared\/onchain-lock\.ts'/.test(src)) {
      fail(rule, `${name} does not import the shared on-chain lock`);
      continue;
    }
    if (!/acquireOnchainLock\(\s*admin\s*,/.test(src)) {
      fail(rule, `${name} imports the lock but never acquires it`);
      continue;
    }
    // Every write that clears the lock must be conditional on owning its token,
    // or a superseded operation can clobber the operation that replaced it.
    const clearsLock = /onchain_operation:\s*'none'/.test(src);
    const guardsClear = /\.eq\('onchain_operation_token',\s*(lockToken|token|tok)\)/.test(src);
    if (clearsLock && !guardsClear) {
      fail(rule, `${name} clears the operation lock without checking it still owns the token`);
    }
  }
  if (!failures.some((f) => f.rule === rule)) pass(rule);
}

// ---------------------------------------------------------------------------
// 3. user_profiles BTCPay summary columns are server-owned.
// ---------------------------------------------------------------------------
{
  const rule = 'user_profiles server-summary columns are not client-writable';
  const migrations = join(ROOT, 'supabase', 'migrations');
  const lockdown = walk(migrations)
    .filter((f) => f.endsWith('lock_down_user_profile_server_columns.sql'))
    .map((f) => read(f))
    .find(Boolean);

  if (!lockdown) {
    fail(rule, 'no lock_down_user_profile_server_columns migration found');
  } else {
    if (!/revoke\s+insert,\s*update,\s*delete\s+on\s+public\.user_profiles/i.test(lockdown)) {
      fail(rule, 'the migration does not revoke table-level writes on user_profiles');
    }
    // The columns that must NOT appear in any client grant.
    const serverOwned = [
      'btcpay_user_id', 'btcpay_store_id', 'btcpay_store_name',
      'store_provisioning_status', 'wallet_status',
      'lightning_status', 'lightning_provider',
      'onchain_status', 'onchain_provider',
      'store_count', 'has_stores', 'default_merchant_store_id',
      'wallet_address', 'wallet_connected',
    ];
    const grantBlocks = [...lockdown.matchAll(/grant\s+(?:insert|update)\s*\(([^)]*)\)/gi)]
      .map((m) => m[1].split(',').map((c) => c.trim()));
    if (grantBlocks.length === 0) {
      fail(rule, 'the migration issues no column-level grants');
    }
    for (const columns of grantBlocks) {
      for (const column of serverOwned) {
        if (columns.includes(column)) {
          fail(rule, `server-owned column "${column}" is granted to the client`);
        }
      }
    }
  }

  // And the one privileged consumer must corroborate it server-side.
  const deleteAccount = read(fnPath('delete-account'));
  if (!deleteAccount) {
    fail(rule, 'delete-account/index.ts not found');
  } else if (/user_profiles/.test(deleteAccount)) {
    const attests = /btcpay_store_provisioning_events/.test(deleteAccount) &&
      /attestedStoreIds/.test(deleteAccount);
    if (!attests) {
      fail(
        rule,
        'delete-account reads user_profiles but does not attest the id against ' +
          'btcpay_store_provisioning_events before deleting a BTCPay store',
      );
    }
  }
  if (!failures.some((f) => f.rule === rule)) pass(rule);
}

// ---------------------------------------------------------------------------
// 4. Account deletion re-verifies the store set before the irreversible step.
// ---------------------------------------------------------------------------
{
  const rule = 'account deletion re-verifies the store set before deleting the user';
  const src = read(fnPath('delete-account'));
  if (!src) {
    fail(rule, 'delete-account/index.ts not found');
  } else {
    if (!/unhandledBtcpayStoreIds/.test(src)) {
      fail(rule, 'delete-account does not re-enumerate stores between cleanup passes');
    }
    const recheckAt = src.indexOf('unhandledBtcpayStoreIds(');
    const deleteAt = src.indexOf('admin.auth.admin.deleteUser');
    if (recheckAt !== -1 && deleteAt !== -1 && recheckAt > deleteAt) {
      fail(rule, 'the store re-check runs AFTER the account is deleted, which is too late');
    }
  }
  if (!failures.some((f) => f.rule === rule)) pass(rule);
}

// ---------------------------------------------------------------------------
// 5. Store creation is bounded.
// ---------------------------------------------------------------------------
{
  const rule = 'store creation is bounded per account';
  const src = read(fnPath('create-btcpay-store'));
  if (!src) {
    fail(rule, 'create-btcpay-store/index.ts not found');
  } else if (!/MAX_STORES_PER_USER/.test(src) || !/STORE_LIMIT_REACHED/.test(src)) {
    fail(rule, 'create-btcpay-store enforces no per-account store ceiling');
  }
  if (!failures.some((f) => f.rule === rule)) pass(rule);
}

// ---------------------------------------------------------------------------
// 6. Extended public keys never travel as route params.
// ---------------------------------------------------------------------------
{
  const rule = 'wallet key material is not passed through Expo Router params';
  const screens = walk(join(ROOT, 'app')).filter((f) => /\.tsx?$/.test(f));
  for (const file of screens) {
    const src = read(file);
    if (!src) continue;
    // A route params object (push/replace/navigate `params: { ... }`) or a
    // useLocalSearchParams type literal naming the key itself.
    const inParamsObject = /params:\s*\{[^}]*\bextendedPublicKey\b/s.test(src);
    const inSearchParams = /useLocalSearchParams<\{[^}]*\bextendedPublicKey\b/s.test(src);
    if (inParamsObject || inSearchParams) {
      fail(
        rule,
        `${relative(ROOT, file)} carries extendedPublicKey through the router; ` +
          'hand it over via lib/wallet/derivation-handoff.ts instead',
      );
    }
  }
  if (!failures.some((f) => f.rule === rule)) pass(rule);
}

// ---------------------------------------------------------------------------
// 7. Tables that gate privileged decisions are deny-by-default at the grant layer.
// ---------------------------------------------------------------------------
{
  const rule = 'tables that gate privileged decisions are not client-writable';
  const migrations = join(ROOT, 'supabase', 'migrations');
  const all = walk(migrations).filter((f) => f.endsWith('.sql')).map((f) => read(f) ?? '').join('\n');

  // btcpay_store_provisioning_events decides whether a profile-supplied BTCPay
  // store id may be deleted; the replacement tables decide whether a wallet
  // change may proceed and whether it already has. A client write to any of them
  // re-opens a Critical or High finding.
  const loadBearing = [
    'btcpay_store_provisioning_events',
    'onchain_wallet_replacement_previews',
    'onchain_wallet_replacement_ops',
  ];
  for (const table of loadBearing) {
    const revoked = new RegExp(
      `revoke\\s+insert,\\s*update,\\s*delete\\s+on\\s+public\\.${table}\\s+from[^;]*authenticated`,
      'i',
    ).test(all);
    if (!revoked) {
      fail(rule, `public.${table} has no revoke of client INSERT/UPDATE/DELETE`);
    }
  }
  if (!failures.some((f) => f.rule === rule)) pass(rule);
}

// ---------------------------------------------------------------------------

for (const rule of checks) console.log(`  ✓ ${rule}`);
for (const { rule, detail } of failures) console.error(`  ✗ ${rule}\n      ${detail}`);

if (failures.length > 0) {
  console.error(`\ncheck:design FAILED (${failures.length} problem(s)).`);
  process.exit(1);
}
console.log(`\ncheck:design passed (${checks.length} invariants).`);
