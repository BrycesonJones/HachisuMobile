# RLS write-lockdown regression (OWASP A01)

Adversarial regression for the fix in
`supabase/migrations/20260829120000_lock_down_client_write_policies.sql`.

## What it proves

Every BTCPay edge function authorizes by resolving the caller's
`merchant_stores` / `merchant_pos_apps` row and then trusting its
server-managed columns (`btcpay_store_id`, `btcpay_app_id`,
`merchant_store_id`, the `onchain_operation*` lock, `*_status`). The original
RLS policies let the authenticated **owner** INSERT/UPDATE their own rows, and
RLS is row-scoped (not column-scoped) — so a client could rewrite exactly those
trusted columns via PostgREST. This test authenticates as an attacker and
attempts the writes.

- **RED** (`_policies_vulnerable.sql`, verbatim from the original migrations):
  all four write attacks succeed — the script `RAISE`s and psql exits non-zero.
- **GREEN** (`_policies_fixed.sql`, mirrors the fix migration): the tables are
  SELECT-only, every attack is blocked, psql exits zero.

The owner `SELECT` policy is unchanged, so legitimate reads keep working; all
writes flow through service-role edge functions, which bypass RLS.

## Files

| file | purpose |
| --- | --- |
| `_harness.sql` | schema + Supabase-equivalent `auth.uid()` + `authenticated` role + two-tenant seed |
| `_policies_vulnerable.sql` | the pre-fix policies (RED) |
| `_policies_fixed.sql` | the post-fix SELECT-only policies + defensive revoke (GREEN) |
| `_attack.sql` | authenticates as the attacker and runs the four write attacks |
| `run.sh` | runs RED then GREEN and asserts RED fails / GREEN passes |

## Run

Needs `psql` pointed at any throwaway PostgreSQL (never a real Supabase DB):

```bash
brew install postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
D=$(mktemp -d); initdb -D "$D/pg" -U postgres --auth=trust >/dev/null
pg_ctl -D "$D/pg" -o "-p 5439 -c listen_addresses=127.0.0.1" -l "$D/log" start
PGHOST=127.0.0.1 PGPORT=5439 PGUSER=postgres PGDATABASE=postgres \
  bash supabase/tests/rls/run.sh
```
