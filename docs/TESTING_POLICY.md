# Testing policy

Hachisu talks to a **live BTCPay Server** and a **live Supabase project** that
hold real merchant money and real merchant records. There is no staging copy.
Everything below follows from that.

## Hard rule: never mutate infrastructure to make a test possible

> Do not install, uninstall, enable, disable, or otherwise mutate production
> database extensions, schema infrastructure, networking capabilities, or other
> infrastructure solely to facilitate testing.

Prohibited when the only reason is testing:

- `CREATE EXTENSION` / `DROP EXTENSION` / `ALTER EXTENSION` (e.g. `pg_net`)
- temporary triggers, temporary schema changes, temporary migrations
- temporary cron jobs
- temporary deployed Edge Functions (including "probe" or "diagnostic" functions)
- weakening RLS, or adding a service-role bypass, to make a test easier
- any temporary networking or database infrastructure

Infrastructure may change only when the **product feature itself** requires it and
that change is reviewed as part of the implementation — never as test scaffolding.

Weakening production authorization to observe a behaviour is never acceptable.
If a check makes something hard to test, that check is doing its job; test it from
the outside instead.

## Testing hierarchy — prefer the earliest level that can answer the question

1. **Pure unit tests.** Normalization, decimal arithmetic, CSV generation,
   pagination/cursor logic, status and payment-rail mapping. Most reporting logic
   is deliberately extracted into `supabase/functions/_shared/*` so it can be
   tested here with no network at all.

   ```bash
   cd supabase/functions
   deno test --allow-read --allow-env --node-modules-dir=none _shared/
   ```

   `--node-modules-dir=none` is not optional. Without it Deno walks up to the
   root `package.json`, installs *the mobile app's* dependencies into
   `node_modules/.deno`, and replaces npm's `node_modules/<pkg>` entries with
   symlinks into that store. The tree then silently stops matching
   `package-lock.json`, so local builds and tests exercise different dependency
   versions than `npm ci` installs in CI/EAS. `npm run check:supplychain` fails
   if this has happened; recover with `rm -rf node_modules && npm ci`.

2. **Deterministic fixtures / mocked upstream responses.** Feed recorded BTCPay
   payloads to the shared modules rather than calling BTCPay.

3. **Read-only validation against production data.** Compare what the app returns
   against invoices and payments that already exist. This answers most
   reconciliation questions and changes nothing.

4. **Minimal production transaction test.** Only when a real end-to-end path must
   be exercised, and only if it uses normal application/API paths, mutates no
   infrastructure, affects no other user's data, and has deterministic cleanup.
   A temporary invoice or payment request is usually enough. Keep these rare, name
   them obviously (`EXT-TEST-…`), and clean up in the same session.

5. **Infrastructure mutation.** Not permitted for testing. Full stop.

## Verifying production is clean

Inspection after any validation work is **read-only**. Check that no temporary
user, store row, table, migration, cron job, or deployed function survives.

If you cannot prove what the baseline was, say so — do not mutate production to
find out. Re-installing and re-dropping an extension "just to check" is exactly
the action this policy forbids.

## Type-checking Edge Functions

`npx tsc --noEmit` excludes `supabase/functions` (it is Deno, not React Native).
Type-check those separately, with the same flag shown above:

```bash
cd supabase/functions
deno check --node-modules-dir=none <function>/index.ts
```

Do not commit a `deno.json` or `deno.lock` under `supabase/functions` — either
would change how functions are bundled at deploy time. Determinism there comes
from the import specifiers themselves: every remote import names an exact
version (`jsr:@supabase/supabase-js@2.112.4`, not `@2`), so a deploy resolves the
same code the repository was tested against. `npm run check:supplychain` enforces
that. When bumping one, change every function together and re-run the checks
above — these functions hold the service-role and BTCPay Greenfield keys.
