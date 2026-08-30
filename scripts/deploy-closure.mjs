#!/usr/bin/env node
/**
 * Prints the transitive deployment closure for a set of changed files.
 *
 *   node scripts/deploy-closure.mjs supabase/functions/_shared/pos-template.ts ...
 *   node scripts/deploy-closure.mjs --changed        # vs git HEAD
 *   node scripts/deploy-closure.mjs --changed --slugs-only
 *
 * Answers "what must be redeployed?" by bundle containment, never by guesswork.
 * Test files are excluded: they are never imported by an entrypoint and never
 * reach a deployed bundle.
 */
import { execFileSync } from 'node:child_process';
import { affectedFunctions } from './lib/function-closure.mjs';

const argv = process.argv.slice(2);
const slugsOnly = argv.includes('--slugs-only');
let changed = argv.filter((a) => !a.startsWith('--'));

if (argv.includes('--changed')) {
  changed = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((p) => p.startsWith('supabase/functions/'));
}

const production = changed.filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'));
const affected = affectedFunctions(process.cwd(), production);

if (slugsOnly) {
  for (const { slug } of affected) console.log(slug);
  process.exit(0);
}

console.log(`changed production modules (${production.length}):`);
for (const p of production) console.log(`  ${p}`);
const excluded = changed.filter((p) => !production.includes(p));
if (excluded.length > 0) {
  console.log(`excluded from the closure (never bundled) (${excluded.length}):`);
  for (const p of excluded) console.log(`  ${p}`);
}
console.log(`\ndeployment closure — ${affected.length} function(s) must be redeployed:`);
for (const { slug, hits } of affected) console.log(`  ${slug}  <- ${hits.join(', ')}`);
