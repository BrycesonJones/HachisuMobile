#!/usr/bin/env bash
# RLS write-lockdown regression (OWASP A01).
#
# Proves, against a real PostgreSQL, that an authenticated user cannot write the
# server-managed columns of merchant_stores / merchant_pos_apps:
#   RED   = the pre-fix policies let the attacks through (this run must FAIL).
#   GREEN = the fixed (SELECT-only) policies block them (this run must PASS).
#
# Requires psql pointing at any throwaway PostgreSQL (NOT a real Supabase DB):
#   PGHOST=127.0.0.1 PGPORT=5439 PGUSER=postgres PGDATABASE=postgres ./run.sh
#
# On macOS without Docker:
#   brew install postgresql@16
#   export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
#   D=$(mktemp -d); initdb -D "$D/pg" -U postgres --auth=trust >/dev/null
#   pg_ctl -D "$D/pg" -o "-p 5439 -c listen_addresses=127.0.0.1" -l "$D/log" start
#   PGHOST=127.0.0.1 PGPORT=5439 PGUSER=postgres PGDATABASE=postgres ./run.sh

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q)

echo "===== RED: pre-fix policies (attacks must SUCCEED -> psql fails) ====="
"${PSQL[@]}" -f "$DIR/_harness.sql" -f "$DIR/_policies_vulnerable.sql" -f "$DIR/_attack.sql"
red=$?
echo "RED exit: $red"; echo

echo "===== GREEN: fixed SELECT-only policies (attacks must be BLOCKED) ====="
"${PSQL[@]}" -f "$DIR/_harness.sql" -f "$DIR/_policies_fixed.sql" -f "$DIR/_attack.sql"
green=$?
echo "GREEN exit: $green"; echo

if [ "$red" -ne 0 ] && [ "$green" -eq 0 ]; then
  echo "PASS: vulnerability reproduced (RED) and fix verified (GREEN)."
  exit 0
fi
echo "UNEXPECTED: expected RED!=0 and GREEN==0 (got RED=$red GREEN=$green)."
exit 1
