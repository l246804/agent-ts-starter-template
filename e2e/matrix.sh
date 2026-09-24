#!/usr/bin/env bash
# Full matrix: run every profile in e2e/profiles/, once each, and rewrite the record.
#
#   ./e2e/matrix.sh [--workdir <dir>] [--profile <name>]...
#
# What it does:
#   1. discovers the profiles from e2e/profiles/*.env (so a new profile is picked up here, in
#      the record, and — through the coverage table — in the per-profile assertions)
#   2. runs each one with e2e/run.sh, capturing its output to <workdir>/matrix/<profile>.log
#   3. rewrites docs/verification.md from the runs' own artifacts (e2e/record.mjs)
#   4. exits non-zero unless every profile passed: a matrix run is one claim, and a profile that
#      stopped is a report, never a green line.
#
# The runs are sequential on purpose: the harness drives dev servers and port allocations, and a
# record that interleaves profiles is harder to attribute than a slower one that does not. Pass
# --profile several times to run a subset (the record then says "not run" for the rest).
set -euo pipefail

E2E_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$E2E_DIR/.." && pwd)
WORK_ROOT="$E2E_DIR/.work"
ONLY=()

while [ $# -gt 0 ]; do
  case "$1" in
    --workdir) WORK_ROOT="$2"; shift 2 ;;
    --profile) ONLY+=("$2"); shift 2 ;;
    --help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

PROFILES=()
for file in "$E2E_DIR"/profiles/*.env; do
  name=$(basename "$file" .env)
  if [ "${#ONLY[@]}" -gt 0 ]; then
    for wanted in "${ONLY[@]}"; do [ "$wanted" = "$name" ] && PROFILES+=("$name"); done
  else
    PROFILES+=("$name")
  fi
done
[ "${#PROFILES[@]}" -gt 0 ] || { echo "no profiles selected" >&2; exit 2; }

mkdir -p "$WORK_ROOT/matrix"

# One pass at a time. Two passes share the manifest and the per-profile logs, so overlapping
# runs would write a record that mixes them — and the mix is invisible in the result. The lock
# holds the time the pass started, not a PID: the only PID a pass could compare against is its
# own namespace's (measured: the harness's sandbox gives each command its own), while a start
# time is comparable everywhere, and a full pass is minutes.
LOCK="$WORK_ROOT/matrix/.lock"
LOCK_WINDOW=3600
if [ -e "$LOCK" ] && [ "${GUIDE_MATRIX_FORCE:-}" != "1" ]; then
  started=$(cat "$LOCK" 2>/dev/null || echo 0)
  age=$(($(date +%s) - started))
  if [ "$age" -lt "$LOCK_WINDOW" ]; then
    echo "STOP: another matrix pass started ${age}s ago and is writing $WORK_ROOT/matrix" >&2
    echo "      wait for it (a full pass is minutes), remove $LOCK if it is stale, or set GUIDE_MATRIX_FORCE=1" >&2
    exit 1
  fi
fi
date +%s > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# The manifest is what ties the record to *these* runs: a profile's run directory is written down
# when it is created, never guessed afterwards from what happens to be newest on disk. A run that
# is killed before it settles has no verdict, and the record says so instead of falling back to an
# older green run of the same profile.
MANIFEST="$WORK_ROOT/matrix/manifest.tsv"
: > "$MANIFEST"

failed=0
for profile in "${PROFILES[@]}"; do
  say "matrix: $profile"
  log="$WORK_ROOT/matrix/$profile.log"
  before=$(ls -d "$WORK_ROOT"/runs/*-"$profile" 2>/dev/null | sort | tail -1 || true)
  if bash "$E2E_DIR/run.sh" --profile "$profile" --workdir "$WORK_ROOT" > "$log" 2>&1; then
    tail -3 "$log" | sed 's/^/  /'
  else
    failed=1
    echo "  STOP: $profile did not pass — see $log"
    tail -20 "$log" | sed 's/^/  /'
  fi
  after=$(ls -d "$WORK_ROOT"/runs/*-"$profile" 2>/dev/null | sort | tail -1 || true)
  if [ -n "$after" ] && [ "$after" != "$before" ]; then
    printf '%s\t%s\n' "$profile" "$after" >> "$MANIFEST"
  else
    echo "  no run directory was created for $profile — the record will say so" >&2
  fi
done

say "record from the runs that happened"
node "$E2E_DIR/record.mjs" --workdir "$WORK_ROOT" --manifest "$MANIFEST" --out "$REPO_ROOT/docs/verification.md" || failed=1

if [ "$failed" -ne 0 ]; then
  echo
  echo "STOP: the matrix did not pass — docs/verification.md records which profile stopped where." >&2
  exit 1
fi
say "PASS — ${#PROFILES[@]} profile(s) initialized, verified, asserted, and recorded"
