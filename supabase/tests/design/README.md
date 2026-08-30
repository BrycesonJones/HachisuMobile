# Design-invariant regressions (OWASP A06:2025 — Insecure Design)

Adversarial regressions for the two A06 defects that live in the *relationships
between* components rather than inside any one of them. Each is RED against the
pre-fix design and GREEN against the fix.

Unlike `supabase/tests/rls/` (A01), these are not only about what the client may
write — one of them runs as the table owner, because the question is whether the
**server's own sequencing** holds.

## 1. `user_profiles` server-owned columns

Fix: `supabase/migrations/20260830120000_lock_down_user_profile_server_columns.sql`
plus the attestation added to `_shared/account-deletion.ts` and `delete-account`.

`user_profiles` is deliberately client-writable — the profile hub edits it. But
the same row carries the BTCPay "default store summary", and RLS is row-scoped,
so the owner could rewrite `btcpay_store_id` to **another merchant's** BTCPay
store id. `delete-account` passed that value to Greenfield
`DELETE /api/v1/stores/{id}` under a server-wide credential that can delete every
store on the instance, so closing your own account destroyed the victim's store.
Those ids are not secret: they are published verbatim in a merchant's Pay Button
HTML and POS links. The partial unique index on `user_profiles.btcpay_store_id`
only shields a victim's *default* store, leaving every second-or-later store a
valid target.

- **RED** (`_profile_grants_vulnerable.sql`): Supabase's default table-level
  grants. All four write attacks succeed; psql `RAISE`s and exits non-zero.
- **GREEN** (`_profile_grants_fixed.sql`): column-level grants. Every attack is
  blocked, and the same script asserts that legitimate profile-hub edits *and*
  the client's `UPSERT` path still work — a regression there fails the run too.

## 2. On-chain operation lock

Fix: `supabase/functions/_shared/onchain-lock.ts`, adopted by
`connect` / `replace` / `remove` / `sync` / `update-…-settings`.

The staged replacement flow already had a DB-backed operation lock with stale
supersession and per-request ownership tokens. Only `replace` used it. The other
four endpoints mutate the same BTCPay payment method and the same
`merchant_stores` columns without taking it, and `sync` cleared it outright — so
any authenticated owner could free a live lock mid-replacement.

`_attack_onchain_lock.sql` replays the SQL each endpoint issues, interleaved,
against a mock `btcpay_onchain` table standing in for the authoritative payment
method, and asserts Hachisu's mirror never contradicts it. Scenario 1 is the
sharp one: a removal that lands its `not_connected` write after a replacement's
commit leaves **BTCPay routing real payments to the replacement wallet while the
merchant's dashboard says no wallet is connected.**

The same script asserts liveness: a *stale* lock must still be supersedable (an
abandoned request must never wedge a merchant out of their wallet settings), and
an idle store must still accept every operation normally.

## Files

| file | purpose |
| --- | --- |
| `_harness.sql` | schema + Supabase-equivalent `auth.uid()` + `authenticated` role + attacker/victim seed |
| `_profile_grants_vulnerable.sql` | pre-fix table-level grants (RED) |
| `_profile_grants_fixed.sql` | post-fix column-level grants (GREEN) |
| `_attack_profile.sql` | four write attacks + two legitimate-use regressions |
| `_onchain_harness.sql` | mock BTCPay payment-method state + the replacement's lock SQL |
| `_onchain_ops_vulnerable.sql` | pre-fix connect/remove/sync (no lock; sync clears it) |
| `_onchain_ops_fixed.sql` | post-fix shared-lock operations |
| `_attack_onchain_lock.sql` | interleavings + liveness assertions |
| `run.sh` | runs both pairs and asserts RED fails / GREEN passes |

## Run

Needs `psql` pointed at any throwaway PostgreSQL (never a real Supabase DB):

```bash
brew install postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
D=$(mktemp -d); initdb -D "$D/pg" -U postgres --auth=trust >/dev/null
pg_ctl -D "$D/pg" -o "-p 5441 -c listen_addresses=127.0.0.1" -l "$D/log" start
PGHOST=127.0.0.1 PGPORT=5441 PGUSER=postgres PGDATABASE=postgres \
  bash supabase/tests/design/run.sh
```

## Related

The structural half of A06 — "does every endpoint still follow the invariant" —
is guarded by `npm run check:design`
(`scripts/check-design-invariants.mjs`), which fails if a new function skips the
lock, the Lightning gate, the attestation, the store ceiling, or passes wallet
key material through a route param.
