/**
 * Transitive local-import closure for Supabase Edge Functions.
 *
 * A Hachisu function is deployed as a BUNDLE: its own `index.ts` plus every
 * local module that entrypoint reaches, transitively. So "which functions does
 * this change affect?" is never "the files I edited" — it is every function
 * whose bundle contains one of them. Getting that wrong is precisely the STALE
 * DEPLOY that scripts/check-deployed-functions.mjs exists to catch, so the same
 * closure is used to decide what to deploy and to synthesize the self-test's
 * fixture.
 *
 * Only relative specifiers are followed: `jsr:` / `npm:` / `https:` imports are
 * remote, exactly version-pinned, and enforced separately by check:supplychain.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

/** Every relative specifier imported (or re-exported) by a module's source. */
function localImportsOf(absPath) {
  const source = readFileSync(absPath, 'utf8');
  const out = new Set();
  // Import/export clauses in these modules routinely span many lines, so the
  // specifier is matched directly rather than by walking the clause: any
  // `from '<relative>'` in a TS module is a module reference, and a bare
  // `import '<relative>'` is a side-effect import. Missing a multi-line import
  // here would understate the deployment closure and cause exactly the stale
  // deploy this tooling exists to prevent, so this is deliberately permissive —
  // and the result is cross-checked against the real deployed bundles.
  const re = /\bfrom\s*['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const spec = m[1] ?? m[2];
    if (spec && spec.startsWith('.')) out.add(spec);
  }
  return [...out];
}

/**
 * Every repo-relative file in one function's deploy bundle, including its own
 * entrypoint. Paths are relative to `root` and use forward slashes.
 */
export function bundleFilesFor(root, slug) {
  const entry = join(root, 'supabase', 'functions', slug, 'index.ts');
  if (!existsSync(entry)) return [];
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const abs = stack.pop();
    const rel = relative(root, abs).split(/[\\/]/).join('/');
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const spec of localImportsOf(abs)) {
      const target = normalize(join(dirname(abs), spec));
      if (existsSync(target)) stack.push(target);
    }
  }
  return [...seen].sort();
}

/** Every function slug the repository declares. */
export function functionSlugs(root) {
  const dir = join(root, 'supabase', 'functions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n !== '_shared' && !n.startsWith('.'))
    .filter((n) => statSync(join(dir, n)).isDirectory())
    .filter((n) => existsSync(join(dir, n, 'index.ts')))
    .sort();
}

/**
 * The functions whose bundle contains at least one of `changedPaths`
 * (repo-relative, forward-slashed) — i.e. the exact deployment closure.
 */
export function affectedFunctions(root, changedPaths) {
  const changed = new Set(changedPaths);
  const affected = [];
  for (const slug of functionSlugs(root)) {
    const files = bundleFilesFor(root, slug);
    const hits = files.filter((f) => changed.has(f));
    if (hits.length > 0) affected.push({ slug, hits });
  }
  return affected;
}
