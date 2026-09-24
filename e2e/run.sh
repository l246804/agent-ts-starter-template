#!/usr/bin/env bash
# E2E harness: run GUIDE.md from zero, end to end, and assert what it produced.
#
#   ./e2e/run.sh [--profile <name>] [--workdir <dir>]
#
# What it does, in order:
#   1. loads the profile's pre-answered decision points (e2e/profiles/<name>.env)
#   2. creates an empty target directory and extracts GUIDE.md's executable plan
#      into <workdir> with e2e/extract.mjs
#   3. runs every extracted step in document order, stopping at the first failure
#      (the guide's own rule: report, never "fix until green")
#   4. runs the guide's verify block — extracted from GUIDE.md, never re-implemented
#      here — and reports its exit code
#   5. runs e2e/assert.mjs for the external-behaviour checks the guide itself does
#      not make (file tree, document placement, skills lockfile agreement)
#   6. runs the negative controls: the preflight must refuse a non-empty target and an old
#      Node, the profile guard must refuse an unimplemented answer without writing anything,
#      the route-scan assertion must catch a test file planted next to the routes, and the
#      verify block must go red on a planted type error.
#
# What it is NOT: a replacement for an agent reading GUIDE.md. The guide's decision
# points are pre-answered here, and the parts that need judgement are listed in
# e2e/README.md.
set -euo pipefail

E2E_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$E2E_DIR/.." && pwd)
PROFILE_NAME=frontend-single
WORK_ROOT="${GUIDE_E2E_WORKDIR:-$E2E_DIR/.work}"

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE_NAME="$2"; shift 2 ;;
    --workdir) WORK_ROOT="$2"; shift 2 ;;
    --help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

PROFILE_FILE="$E2E_DIR/profiles/$PROFILE_NAME.env"
[ -f "$PROFILE_FILE" ] || { echo "no such profile: $PROFILE_FILE" >&2; exit 2; }
[ -f "$REPO_ROOT/GUIDE.md" ] || { echo "GUIDE.md not found at $REPO_ROOT/GUIDE.md" >&2; exit 2; }

RUN_DIR="$WORK_ROOT/runs/$(date +%Y%m%d-%H%M%S)-$PROFILE_NAME"
TARGET="$RUN_DIR/target"
PLAN="$RUN_DIR/plan"
LOGS="$RUN_DIR/logs"
CACHE="$WORK_ROOT/cache"
mkdir -p "$TARGET" "$CACHE/npm" "$CACHE/xdg" "$CACHE/pnpm-home" "$LOGS"

# Cache locations are pinned inside the work directory: the harness must run on
# machines whose $HOME is not writable (CI sandboxes, this repo's own test rig),
# and it must not mutate the machine it tests. The guide itself does not depend on
# any of this.
export npm_config_cache="$CACHE/npm"
export XDG_CACHE_HOME="$CACHE/xdg"
export PNPM_HOME="$CACHE/pnpm-home"

# The machine's own PATH, kept because every step after the preflight runs with a poisoned one
# (see run_plan).
MACHINE_PATH="$PATH"

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mSTOP: %s\033[0m\n' "$*" >&2; exit 1; }

free_port() {
  node -e 'const s = require("node:net").createServer(); s.listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); });'
}

require_tools() {
  for tool in node git; do
    command -v "$tool" >/dev/null 2>&1 || die "the harness needs $tool on PATH"
  done
  command -v "${GUIDE_PM:-pnpm}" >/dev/null 2>&1 || die "the harness needs the profile's package manager (${GUIDE_PM:-pnpm}) on PATH"
  [ -z "$(ls -A "$TARGET")" ] || die "the harness's own target directory is not empty: $TARGET"
}

# ---------------------------------------------------------------- proxy target
STUB_PID=""
cleanup() {
  if [ -n "$STUB_PID" ]; then kill "$STUB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

start_stub() {
  local stub_port
  node "$E2E_DIR/stub-backend.mjs" --port 0 --route "$GUIDE_PROXY_SMOKE_PATH" > "$RUN_DIR/stub-backend.log" 2>&1 &
  STUB_PID=$!
  for _ in $(seq 100); do
    grep -q STUB_BACKEND_LISTENING "$RUN_DIR/stub-backend.log" && break
    sleep 0.1
  done
  stub_port=$(grep -oE 'STUB_BACKEND_LISTENING [0-9]+' "$RUN_DIR/stub-backend.log" | grep -oE '[0-9]+')
  [ -n "$stub_port" ] || die "the stub backend never reported a port (see $RUN_DIR/stub-backend.log)"
  echo "$stub_port"
}

# ---------------------------------------------------------------------- steps
run_plan() {
  node "$E2E_DIR/extract.mjs" --guide "$REPO_ROOT/GUIDE.md" --out "$PLAN" --answers "$ANSWERS_FILE"
  # The extractor printed plan.tsv; the harness reads the same file the extractor wrote rather
  # than re-deriving the plan's shape here.
  # The harness hooks into these steps by id; a renamed step must break the harness loudly
  # rather than silently skip the accommodation or the negative controls.
  for required in preflight bootstrap; do
    grep -q "$(printf '\t')exec$(printf '\t')$required$(printf '\t')" "$PLAN/plan.tsv" \
      || die "the harness depends on a plan step named $required"
  done
  # The guide's first promise is that the run depends on no global CLI: the toolchain is the
  # project's own devDependency. That promise is enforced here rather than assumed — this machine
  # has a global Vite+, and it would happily stand in for the project-local one (it delegates to
  # it, measured). So every step except the preflight, whose whole job is to report the machine as
  # it really is, runs with a `vp` that refuses to work first on PATH: a step that reached for the
  # global toolchain fails loudly instead of passing on a binary the project does not own.
  # `pnpm dlx` is unaffected because it runs the binary of the package it downloaded, not the one
  # on PATH (measured before relying on it).
  local poison="$RUN_DIR/poison-bin"
  mkdir -p "$poison"
  printf '#!/usr/bin/env bash\necho "this step reached for a bare global vp; the guide must use ./node_modules/.bin/vp" >&2\nexit 1\n' \
    > "$poison/vp"
  chmod +x "$poison/vp"
  export PATH="$poison:$PATH"

  while IFS=$'\t' read -r n kind id payload destination; do
    case "$kind" in
      file)
        mkdir -p "$TARGET/$(dirname "$destination")"
        cp "$PLAN/$payload" "$TARGET/$destination"
        printf '  %s  file  %s\n' "$n" "$destination"
        ;;
      exec|verify)
        printf '  %s  %-6s %s\n' "$n" "$kind" "$id"
        local step_path="$PATH"
        if [ "$id" = "preflight" ]; then step_path="$MACHINE_PATH"; fi
        if ! (cd "$TARGET" && PATH="$step_path" bash "$PLAN/$payload") > "$LOGS/$n-$id.log" 2>&1; then
          echo
          tail -30 "$LOGS/$n-$id.log"
          die "step $n ($kind $id) failed — the guide stops here, it does not repair itself (full log: $LOGS/$n-$id.log)"
        fi
        if [ "$id" = "bootstrap" ]; then
          # Environment accommodation, not part of the guide: Vite+'s file discovery is
          # gitignore-driven, and this harness runs the target inside this repository's work
          # tree, which ignores e2e/.work. A target with its own repository is invisible to
          # none of that — and it is the state a real project reaches as soon as its owner
          # runs `git init`. It happens only after the scaffold has run, because `vp create`
          # refuses a non-empty directory and a `.git` directory is not empty enough.
          git -C "$TARGET" init -q
          echo "        (git init in the target: vp's file discovery is gitignore-driven, and this repo ignores e2e/.work)"
        fi
        ;;
      *) die "unknown plan entry kind: $kind" ;;
    esac
  done < "$PLAN/plan.tsv"
}

negative_controls() {
  local preflight verify guard
  preflight=$(awk -F'\t' '$2 == "exec" && $3 == "preflight" { print $4 }' "$PLAN/plan.tsv")
  verify=$(awk -F'\t' '$2 == "verify" { print $4 }' "$PLAN/plan.tsv")
  guard=$(awk -F'\t' '$2 == "exec" && $3 == "profile-guard" { print $4 }' "$PLAN/plan.tsv")
  [ -n "$preflight" ] && [ -n "$verify" ] && [ -n "$guard" ] || die "the plan is missing the preflight, profile-guard or verify step"

  # A guard that cannot fail is not a guard. The route-scan rule ("tests never live under
  # server/routes/ or server/api/, where Nitro compiles every file into a route") has nothing to
  # catch in a freshly initialized project — the guide writes no test file — so it is made to
  # fail here, on purpose, and has to name the rule.
  if [ -d "$TARGET/server/routes" ]; then
    say "negative control: the route-scan check catches a test next to the routes"
    local planted_route="$TARGET/server/routes/__e2e_probe.test.ts"
    printf 'export const probe = true;\n' > "$planted_route"
    if node "$E2E_DIR/assert.mjs" --target "$TARGET" --answers "$ANSWERS_FILE" > "$LOGS/neg-route-scan.log" 2>&1; then
      rm -f "$planted_route"
      die "assert.mjs accepted a test file inside server/routes/ — the route-scan guard cannot fail"
    fi
    rm -f "$planted_route"
    grep -q 'compiled into routes' "$LOGS/neg-route-scan.log" || {
      tail -5 "$LOGS/neg-route-scan.log"
      die "assert.mjs failed with the planted test file, but not on the route scan (see $LOGS/neg-route-scan.log)"
    }
    echo "  refused, and named the route scan (see $LOGS/neg-route-scan.log)"
  fi

  say "negative control: preflight refuses a non-empty target"
  local dirty="$RUN_DIR/negative/non-empty-target"
  mkdir -p "$dirty"
  echo "already here" > "$dirty/keep-me.txt"
  if (cd "$dirty" && PATH="$MACHINE_PATH" bash "$PLAN/$preflight") > "$LOGS/neg-non-empty.log" 2>&1; then
    cat "$LOGS/neg-non-empty.log"
    die "preflight accepted a non-empty target directory"
  fi
  local survivors
  survivors=$(cd "$dirty" && ls -A | sort | tr '\n' ' ')
  [ "$survivors" = "keep-me.txt " ] || die "preflight wrote to a non-empty target: $survivors"
  echo "  refused, and wrote nothing ($survivors)"

  say "negative control: preflight refuses Node < 24.14"
  local fake_bin="$RUN_DIR/negative/fake-node"
  local old_target="$RUN_DIR/negative/empty-target"
  mkdir -p "$fake_bin" "$old_target"
  cat > "$fake_bin/node" <<FAKE
#!/usr/bin/env bash
if [ "\$1" = "--version" ] || [ "\$1" = "-v" ]; then echo "v24.13.0"; exit 0; fi
exec "$(command -v node)" "\$@"
FAKE
  chmod +x "$fake_bin/node"
  if (cd "$old_target" && PATH="$fake_bin:$MACHINE_PATH" bash "$PLAN/$preflight") > "$LOGS/neg-old-node.log" 2>&1; then
    cat "$LOGS/neg-old-node.log"
    die "preflight accepted Node $(node --version) pretending to be v24.13.0"
  fi
  [ -z "$(ls -A "$old_target")" ] || die "preflight wrote files before rejecting the Node version"
  echo "  refused, and wrote nothing"

  say "negative control: the profile guard refuses an answer no profile implements"
  # The guard is the guide's "stop before writing" edge, so both halves of it are exercised: a
  # profile that does not exist, and a base template a backend project cannot prune. Each must
  # fail without writing anything into the (empty) target it is pointed at.
  if (cd "$old_target" && GUIDE_MODE=fullstack GUIDE_LAYOUT=single bash "$PLAN/$guard") > "$LOGS/neg-guard-profile.log" 2>&1; then
    cat "$LOGS/neg-guard-profile.log"
    die "the profile guard accepted mode=fullstack"
  fi
  if (cd "$old_target" && GUIDE_MODE=backend GUIDE_LAYOUT=single GUIDE_FRAMEWORK=react-ts bash "$PLAN/$guard") > "$LOGS/neg-guard-framework.log" 2>&1; then
    cat "$LOGS/neg-guard-framework.log"
    die "the profile guard accepted a backend project on the react-ts base"
  fi
  [ -z "$(ls -A "$old_target")" ] || die "the profile guard wrote into the target it refused"
  grep -q 'vanilla-ts' "$LOGS/neg-guard-framework.log" || die "the framework refusal does not name the base it wants"
  echo "  refused fullstack, and refused backend + react-ts, naming vanilla-ts"

  say "negative control: the verify block goes red on a planted type error"
  # The plant goes where this profile's source lives: a frontend has src/, a backend has server/
  # (its client is pruned), and a profile with neither is a plan this control does not know.
  local plant_dir
  if [ -d "$TARGET/src" ]; then plant_dir=src; elif [ -d "$TARGET/server" ]; then plant_dir=server; else
    die "cannot plant a type error: neither src/ nor server/ exists in $TARGET"
  fi
  local planted="$TARGET/$plant_dir/__e2e_planted.ts"
  printf 'export const planted: number = "not a number";\n' > "$planted"
  if (cd "$TARGET" && bash "$PLAN/$verify") > "$LOGS/neg-verify-red.log" 2>&1; then
    rm -f "$planted"
    die "the verify block passed with a type error in the project — green is not meaningful"
  fi
  rm -f "$planted"
  echo "  verify failed as it must (see $LOGS/neg-verify-red.log)"
}

# ----------------------------------------------------------------------- main
say "profile $PROFILE_NAME  ->  $RUN_DIR"

# shellcheck disable=SC1090
set -a; . "$PROFILE_FILE"; set +a
require_tools

if printf '%s' "${GUIDE_DEV_PROXY:-}" | grep -q __STUB_PORT__; then
  stub_port=$(start_stub)
  GUIDE_DEV_PROXY=${GUIDE_DEV_PROXY/__STUB_PORT__/$stub_port}
fi
if printf '%s' "${GUIDE_DEV_PORT:-}" | grep -q __FREE_PORT__; then
  GUIDE_DEV_PORT=$(free_port)
fi
export GUIDE_DEV_PROXY GUIDE_DEV_PORT

ANSWERS_FILE="$RUN_DIR/answers.env"
env | grep -E '^GUIDE_[A-Z0-9_]+=' | sort > "$ANSWERS_FILE"
say "answers"
sed 's/^/  /' "$ANSWERS_FILE"

say "extracting GUIDE.md"
run_plan

say "external behaviour: e2e/assert.mjs"
node "$E2E_DIR/assert.mjs" --target "$TARGET" --answers "$ANSWERS_FILE" | sed 's/^/  /'

say "negative controls"
negative_controls

say "PASS — $PROFILE_NAME initialized, verified, and asserted"
echo "  run: $RUN_DIR"
