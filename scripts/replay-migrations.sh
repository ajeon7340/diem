#!/usr/bin/env bash
#
# Replay every migration into a throwaway database, in order, and stop on the
# first error.
#
#   npm run verify:migrations
#
# The database is created fresh and dropped at the end, so this says something
# a live project cannot: that the migrations work from NOTHING. A statement that
# depends on a column somebody added by hand in the dashboard passes against the
# live project forever and fails the first time anyone provisions a second one.
#
# Needs a local Postgres. Override with PGHOST/PGPORT/PGUSER as usual, or point
# REPLAY_DB somewhere else if `adfit_replay` is taken.
set -euo pipefail

DB="${REPLAY_DB:-adfit_replay}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

if ! command -v psql >/dev/null 2>&1; then
  echo "  psql not found — skipping migration replay." >&2
  echo "  This check needs a local Postgres; install one or run it where CI has one." >&2
  exit 0
fi

if ! psql -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  no local Postgres reachable — skipping migration replay." >&2
  exit 0
fi

cleanup() {
  psql -d postgres -qc "drop database if exists ${DB} with (force)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -d postgres -qc "drop database if exists ${DB} with (force)" >/dev/null
psql -d postgres -qc "create database ${DB}" >/dev/null

# ON_ERROR_STOP is the entire point: without it psql reports a failed statement
# and carries on, and the replay "passes" with half a schema.
psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f "${HERE}/migration-shim.sql"

count=0
for file in "${ROOT}"/supabase/migrations/*.sql; do
  name="$(basename "${file}")"
  if ! psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f "${file}"; then
    echo "  ✗ ${name}" >&2
    exit 1
  fi
  printf '  ok   %s\n' "${name}"
  count=$((count + 1))
done

echo
echo "  ${count} migrations replayed, 0 failed"

# The replay proves the SQL parses. The probe proves the claim rules decide
# correctly — which is the half that costs money when it is wrong.
echo
echo "  claim rules:"
psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f "${HERE}/probe-jobs.sql" 2>&1 |
  sed -E -e 's/^psql:[^ ]+ (NOTICE|ERROR):  ?//' -e 's/^(NOTICE|ERROR):  ?//'

# The advertiser flow's access model. Unlike the claim rules these are row
# admission checks — two organisations, one shared creator, and the question
# of what each may see of the other.
echo
echo "  campaign isolation:"
psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f "${HERE}/probe-campaigns.sql" 2>&1 |
  sed -E -e 's/^psql:[^ ]+ (NOTICE|ERROR):  ?//' -e 's/^(NOTICE|ERROR):  ?//'
