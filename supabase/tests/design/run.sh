#!/usr/bin/env bash
# A06 (Insecure Design) regression: two design invariants, each RED then GREEN.
#
#   1. user_profiles write surface — the server-owned BTCPay "default store
#      summary" must not be client-writable. RED = table-level grants let the
#      attacker point delete-account at another merchant's BTCPay store.
#      GREEN = column-level grants block it while every profile-hub edit and the
#      client's UPSERT path still work.
#
#   2. on-chain operation lock — every endpoint that mutates the store's on-chain
#      payment destination must take the same lock. RED = only replace does, so a
#      concurrent remove leaves BTCPay routing payments to a wallet Hachisu
#      reports as disconnected. GREEN = the interleavings are refused.
#
# Requires psql pointing at any throwaway PostgreSQL (NOT a real Supabase DB):
#   PGHOST=127.0.0.1 PGPORT=5441 PGUSER=postgres PGDATABASE=postgres ./run.sh
#
# On macOS without Docker:
#   brew install postgresql@16
#   export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
#   D=$(mktemp -d); initdb -D "$D/pg" -U postgres --auth=trust >/dev/null
#   pg_ctl -D "$D/pg" -o "-p 5441 -c listen_addresses=127.0.0.1" -l "$D/log" start
#   PGHOST=127.0.0.1 PGPORT=5441 PGUSER=postgres PGDATABASE=postgres ./run.sh

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q)
rc=0

run_pair() {
  local label="$1" vuln="$2" fixed="$3" attack="$4"
  shift 4
  local extra=("$@")

  echo "===== $label — RED (the unsafe outcome must OCCUR) ====="
  "${PSQL[@]}" -f "$DIR/_harness.sql" ${extra[@]+"${extra[@]}"} -f "$DIR/$vuln" -f "$DIR/$attack" >/dev/null 2>&1
  local red=$?
  echo "RED exit: $red"

  echo "===== $label — GREEN (the fix must BLOCK it) ====="
  "${PSQL[@]}" -f "$DIR/_harness.sql" ${extra[@]+"${extra[@]}"} -f "$DIR/$fixed" -f "$DIR/$attack"
  local green=$?
  echo "GREEN exit: $green"
  echo

  if [ "$red" -ne 0 ] && [ "$green" -eq 0 ]; then
    echo "PASS: $label — vulnerability reproduced (RED) and fix verified (GREEN)."
  else
    echo "UNEXPECTED: $label — expected RED!=0 and GREEN==0 (got RED=$red GREEN=$green)."
    rc=1
  fi
  echo
}

run_pair "user_profiles server-owned columns" \
  _profile_grants_vulnerable.sql _profile_grants_fixed.sql _attack_profile.sql

run_pair "on-chain operation lock" \
  _onchain_ops_vulnerable.sql _onchain_ops_fixed.sql _attack_onchain_lock.sql \
  -f "$DIR/_onchain_harness.sql"

exit $rc
