#!/usr/bin/env bash
# A02 function-hardening configuration regression.
#
# Reproduces the live pre-fix state of the flagged database functions on a
# throwaway PostgreSQL, asserts the permissive properties really exist, applies
# the migration under test, and asserts the permissive state is gone while
# trigger behaviour is preserved.
#
# Requires psql pointed at a throwaway PostgreSQL (NEVER a real Supabase DB):
#   PGHOST=127.0.0.1 PGPORT=5441 PGUSER=postgres PGDATABASE=postgres ./run.sh
#
# On macOS without Docker:
#   brew install postgresql@16
#   export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
#   D=$(mktemp -d); initdb -D "$D/pg" -U postgres --auth=trust >/dev/null
#   pg_ctl -D "$D/pg" -o "-p 5441 -c listen_addresses=127.0.0.1" -l "$D/log" start

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

psql -v ON_ERROR_STOP=1 -q -f "$DIR/function-hardening.sql"
rc=$?
echo "exit: $rc"
if [ "$rc" -eq 0 ]; then
  echo "PASS: permissive state removed, behaviour preserved, security control intact."
  exit 0
fi
echo "FAIL: see output above."
exit 1
