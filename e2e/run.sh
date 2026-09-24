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
#      Node, the profile guard must refuse an unimplemented mode and every base it does not
#      re-scaffold without writing anything, the route-scan assertion must catch a test file
#      planted next to the routes, a workspace whose root script names a missing package must
#      be caught as the silent no-op it is, the verify block must go red on a planted type
#      error, the proxy-bearing profiles' missing DEV_PROXY config must fail loudly instead
#      of serving the app's HTML, and — in the SSR profile — a planted index.html must stop
#      being a silent client-shell degradation and a removed render mark must be what the
#      smoke notices.
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
    --help) sed -n '2,26p' "$0"; exit 0 ;;
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
  # The guard is the guide's "stop before writing" edge, so each of its refusals is exercised:
  # a combination no profile implements, a base template a backend project cannot prune, a
  # framework the SSR shape cannot render and hydrate, a split shape asked for a base it does not
  # re-scaffold, and a monorepo without its placeholder answer. Each must fail without writing
  # anything into the (empty) target it is pointed at.
  if (cd "$old_target" && GUIDE_MODE=desktop GUIDE_LAYOUT=single bash "$PLAN/$guard") > "$LOGS/neg-guard-profile.log" 2>&1; then
    cat "$LOGS/neg-guard-profile.log"
    die "the profile guard accepted mode=desktop"
  fi
  if (cd "$old_target" && GUIDE_MODE=backend GUIDE_LAYOUT=single GUIDE_FRAMEWORK=react-ts bash "$PLAN/$guard") > "$LOGS/neg-guard-framework.log" 2>&1; then
    cat "$LOGS/neg-guard-framework.log"
    die "the profile guard accepted a backend project on the react-ts base"
  fi
  if (cd "$old_target" && GUIDE_MODE=fullstack GUIDE_LAYOUT=single GUIDE_FRAMEWORK=vanilla-ts bash "$PLAN/$guard") > "$LOGS/neg-guard-ssr-base.log" 2>&1; then
    cat "$LOGS/neg-guard-ssr-base.log"
    die "the profile guard accepted a fullstack SSR project on the vanilla-ts base"
  fi
  if (cd "$old_target" && GUIDE_MODE=fullstack GUIDE_LAYOUT=monorepo GUIDE_FRAMEWORK=react-ts GUIDE_PLACEHOLDER=yes bash "$PLAN/$guard") > "$LOGS/neg-guard-split-base.log" 2>&1; then
    cat "$LOGS/neg-guard-split-base.log"
    die "the profile guard accepted a split project on a base the monorepo template does not write"
  fi
  # Neither of the other two monorepo profiles re-scaffolds the template's app either, so a
  # framework answer is refused before anything is written rather than half-built.
  if (cd "$old_target" && GUIDE_MODE=backend GUIDE_LAYOUT=monorepo GUIDE_FRAMEWORK=react-ts GUIDE_PLACEHOLDER=yes bash "$PLAN/$guard") > "$LOGS/neg-guard-backend-mono-base.log" 2>&1; then
    cat "$LOGS/neg-guard-backend-mono-base.log"
    die "the profile guard accepted a backend workspace on a base it cannot prune"
  fi
  if (cd "$old_target" && GUIDE_MODE=frontend GUIDE_LAYOUT=monorepo GUIDE_FRAMEWORK=react-ts GUIDE_PLACEHOLDER=yes bash "$PLAN/$guard") > "$LOGS/neg-guard-frontend-mono-base.log" 2>&1; then
    cat "$LOGS/neg-guard-frontend-mono-base.log"
    die "the profile guard accepted a frontend workspace on a base the monorepo template does not write"
  fi
  # The profiles' answers are exported in this shell, so a control that needs an answer *absent*
  # has to say so: an empty assignment is what "not answered" means here.
  if (cd "$old_target" && GUIDE_MODE=fullstack GUIDE_LAYOUT=monorepo GUIDE_FRAMEWORK=vanilla-ts GUIDE_PLACEHOLDER= bash "$PLAN/$guard") > "$LOGS/neg-guard-placeholder.log" 2>&1; then
    cat "$LOGS/neg-guard-placeholder.log"
    die "the profile guard accepted a monorepo without its placeholder-package answer"
  fi
  [ -z "$(ls -A "$old_target")" ] || die "the profile guard wrote into the target it refused"
  grep -q 'vanilla-ts' "$LOGS/neg-guard-framework.log" || die "the framework refusal does not name the base it wants"
  grep -q 'react-ts' "$LOGS/neg-guard-ssr-base.log" || die "the SSR base refusal does not name the base it wants"
  grep -q 'vanilla-ts' "$LOGS/neg-guard-split-base.log" || die "the split base refusal does not name the base the monorepo template writes"
  grep -q 'vanilla-ts' "$LOGS/neg-guard-backend-mono-base.log" || die "the backend-workspace refusal does not name the base it wants"
  grep -q 'vanilla-ts' "$LOGS/neg-guard-frontend-mono-base.log" || die "the frontend-workspace refusal does not name the base it wants"
  grep -q 'GUIDE_PLACEHOLDER' "$LOGS/neg-guard-placeholder.log" || die "the placeholder refusal does not name the answer it needs"
  echo "  refused desktop/single, backend + react-ts, fullstack SSR + vanilla-ts, split + react-ts, backend workspace + react-ts, frontend workspace + react-ts, monorepo without GUIDE_PLACEHOLDER"

  say "negative control: the verify block goes red on a planted type error"
  # The plant goes where this profile's source lives: a single frontend has src/, every server shape
  # has server/, and a frontend workspace's source is the app package.
  local plant_dir
  if [ -d "$TARGET/apps/website/src" ]; then plant_dir=apps/website/src
  elif [ -d "$TARGET/src" ]; then plant_dir=src
  elif [ -d "$TARGET/server" ]; then plant_dir=server
  else
    die "cannot plant a type error: none of apps/website/src, src/ or server/ exists in $TARGET"
  fi
  local planted="$TARGET/$plant_dir/__e2e_planted.ts"
  printf 'export const planted: number = "not a number";\n' > "$planted"
  if (cd "$TARGET" && bash "$PLAN/$verify") > "$LOGS/neg-verify-red.log" 2>&1; then
    rm -f "$planted"
    die "the verify block passed with a type error in the project — green is not meaningful"
  fi
  rm -f "$planted"
  echo "  verify failed as it must (see $LOGS/neg-verify-red.log)"

  # A root script that names a package by its task is the form this guide's root commands are
  # re-pointed to avoid: in the arrangement that deletes the package, that script exits 0 and runs
  # nothing. A fresh project has no such script, so the rule is made to fail here on purpose — the
  # template's own `dev` script is planted back, and assert.mjs has to reject it and name the rule.
  # (In the two workspaces that still have `website` the same plant proves the form ban rather than
  # the deletion; both live under the same rule.)
  if [ "${GUIDE_LAYOUT:-}" = "monorepo" ]; then
    say "negative control: a root script naming a package is caught by the package-name rule"
    local root_manifest="$TARGET/package.json"
    cp "$root_manifest" "$RUN_DIR/negative/package.json.bak"
    node -e '
      const fs = require("node:fs");
      const path = process.argv[1];
      const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
      manifest.scripts.dev = "vp run website#dev";
      fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
    ' "$root_manifest"
    if node "$E2E_DIR/assert.mjs" --target "$TARGET" --answers "$ANSWERS_FILE" > "$LOGS/neg-package-script.log" 2>&1; then
      cp "$RUN_DIR/negative/package.json.bak" "$root_manifest"
      die "assert.mjs accepted a root script naming a package by its task — the package-name rule cannot fail"
    fi
    cp "$RUN_DIR/negative/package.json.bak" "$root_manifest"
    grep -q 'silent no-op' "$LOGS/neg-package-script.log" || {
      tail -5 "$LOGS/neg-package-script.log"
      die "assert.mjs failed with the planted script, but not on the package-name rule (see $LOGS/neg-package-script.log)"
    }
    echo "  refused, and named the silent no-op a missing package would make of it (see $LOGS/neg-package-script.log)"
  fi

  # The proxy's silent failure, made to happen on purpose. `proxyTransformer` returns an
  # empty config for a missing variable — the dev server starts, `/api/*` answers 200 with the
  # app's HTML, and the log says nothing — so the guide's guard exists to make that state loud.
  # The control removes the variable from the app's committed `.env` and requires the verify block
  # to go red naming it: a green run there would mean the failure mode is silent again.
  # It belongs to the profiles that have a proxy in the frontend package, decided by the profile's
  # answers rather than by what the target happens to contain — the same rule every accommodation
  # here follows.
  if [ "${GUIDE_LAYOUT:-}" = "monorepo" ] && { [ "${GUIDE_MODE:-}" = "fullstack" ] || [ "${GUIDE_MODE:-}" = "frontend" ]; }; then
    [ -f "$TARGET/apps/website/.env" ] \
      || die "the $GUIDE_MODE/monorepo profile produced no apps/website/.env, so its negative control cannot run"
    say "negative control: a missing DEV_PROXY fails loudly instead of serving the app's HTML"
    cp "$TARGET/apps/website/.env" "$RUN_DIR/negative/website-env.bak"
    grep -v '^DEV_PROXY' "$RUN_DIR/negative/website-env.bak" > "$TARGET/apps/website/.env"
    grep -q 'DEV_PROXY' "$TARGET/apps/website/.env" && die "the harness could not remove DEV_PROXY from the app's .env"
    if (cd "$TARGET" && bash "$PLAN/$verify") > "$LOGS/neg-split-noenv.log" 2>&1; then
      cp "$RUN_DIR/negative/website-env.bak" "$TARGET/apps/website/.env"
      die "verify passed with no DEV_PROXY — the proxy failure is silent again"
    fi
    cp "$RUN_DIR/negative/website-env.bak" "$TARGET/apps/website/.env"
    grep -q 'DEV_PROXY' "$TARGET/apps/website/.env" || die "the harness did not restore the app's .env"
    grep -q 'DEV_PROXY' "$LOGS/neg-split-noenv.log" || {
      tail -5 "$LOGS/neg-split-noenv.log"
      die "verify failed without DEV_PROXY, but not on DEV_PROXY (see $LOGS/neg-split-noenv.log)"
    }
    echo "  verify failed as it must, naming DEV_PROXY (see $LOGS/neg-split-noenv.log)"

    # The verify block stops at the build, so the *dev* half of the failure mode is asserted on its
    # own: with no DEV_PROXY the app's dev server must refuse to start rather than come up and
    # answer /api/* with the app's HTML, which is the state the guard exists to make loud.
    printf '# DEV_PROXY removed by the probe\n' > "$TARGET/apps/website/.env"
    set +e
    (cd "$TARGET" && timeout 60 ./node_modules/.bin/vp -C apps/website dev --port "$GUIDE_WEBSITE_PORT" --strictPort) \
      > "$LOGS/neg-split-noenv-dev.log" 2>&1
    dev_code=$?
    set -e
    cp "$RUN_DIR/negative/website-env.bak" "$TARGET/apps/website/.env"
    case "$dev_code" in
      0) cat "$LOGS/neg-split-noenv-dev.log"; die "the app's dev server started with no DEV_PROXY — /api/* would answer the app's HTML" ;;
      124) cat "$LOGS/neg-split-noenv-dev.log"; die "the app's dev server neither refused nor started: it hung (see $LOGS/neg-split-noenv-dev.log)" ;;
    esac
    grep -q 'DEV_PROXY' "$LOGS/neg-split-noenv-dev.log" || {
      tail -5 "$LOGS/neg-split-noenv-dev.log"
      die "the app's dev server refused to start, but not on DEV_PROXY (see $LOGS/neg-split-noenv-dev.log)"
    }
    echo "  and the app's dev server refused to start, naming DEV_PROXY (see $LOGS/neg-split-noenv-dev.log)"
  fi

  # The SSR shape's silent degradation, made to happen on purpose. An index.html is accepted as
  # the renderer template, and with no `<!--ssr-outlet-->` comment inside it Nitro still detects
  # the SSR entry, still logs it, and still exits 0 — while the build quietly stops being an SSR
  # build (no `dist/server/_ssr/` bundle, only an inlined renderer template). The verify block
  # must notice that, and notice it as the shape: the missing SSR renderer is what it names. The
  # marker-removal control below is the one that proves the smoke's own layer.
  # The SSR controls belong to the SSR profile — decided by the profile's answers, never by what
  # the target happens to contain: a fullstack run whose shape is missing is a failure to report,
  # not a control to skip silently (the same rule the harness applies to every accommodation). The
  # split shape is `fullstack` too, so the layout is part of the gate.
  if [ "${GUIDE_MODE:-}" = "fullstack" ] && [ "${GUIDE_LAYOUT:-}" = "single" ]; then
    [ -f "$TARGET/src/entry-server.tsx" ] \
      || die "the fullstack profile produced no src/entry-server.tsx, so its negative controls cannot run"
    say "negative control: a planted index.html is not a silent client-shell degradation"
    cat > "$TARGET/index.html" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>client shell</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
HTML
    if (cd "$TARGET" && bash "$PLAN/$verify") > "$LOGS/neg-ssr-shell.log" 2>&1; then
      rm -f "$TARGET/index.html"
      die "verify passed with an index.html renderer template — the client-shell degradation is invisible"
    fi
    rm -f "$TARGET/index.html"
    grep -q 'client-only build' "$LOGS/neg-ssr-shell.log" || {
      tail -5 "$LOGS/neg-ssr-shell.log"
      die "verify failed on the planted client shell, but not on the missing SSR renderer (see $LOGS/neg-ssr-shell.log)"
    }
    echo "  refused, naming the missing SSR renderer (see $LOGS/neg-ssr-shell.log)"

    # And the render marker itself, so the smoke's assertion is known to read the rendered body
    # rather than merely to run: with the shape intact, only the marker text changes, the build is
    # a real SSR build, and the missing marker is the only thing that can go red.
    say "negative control: the render marker is what the smoke reads"
    cp "$TARGET/src/App.tsx" "$RUN_DIR/negative/ssr-App.tsx.bak"
    node -e 'const f = process.argv[1]; const fs = require("node:fs"); fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("<h1>SSR works</h1>", "<h1>the marker was removed</h1>"))' "$TARGET/src/App.tsx"
    grep -q 'the marker was removed' "$TARGET/src/App.tsx" || die "the harness could not plant the marker change"
    if (cd "$TARGET" && bash "$PLAN/$verify") > "$LOGS/neg-ssr-marker.log" 2>&1; then
      cp "$RUN_DIR/negative/ssr-App.tsx.bak" "$TARGET/src/App.tsx"
      die "verify passed with the render marker removed — the smoke does not read what it claims to"
    fi
    cp "$RUN_DIR/negative/ssr-App.tsx.bak" "$TARGET/src/App.tsx"
    grep -q '<h1>SSR works</h1>' "$TARGET/src/App.tsx" || die "the harness did not restore the marker"
    if ! grep -q 'render marker' "$LOGS/neg-ssr-marker.log"; then
      tail -5 "$LOGS/neg-ssr-marker.log"
      die "verify failed with the marker removed, but not on the render marker (see $LOGS/neg-ssr-marker.log)"
    fi
    echo "  verify failed as it must, naming the render marker (see $LOGS/neg-ssr-marker.log)"
  fi
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
# The split shape needs two: the workspace root server's port (which is also what the app's
# DEV_PROXY points at — the guide writes that file from GUIDE_DEV_PORT) and the frontend app's.
if printf '%s' "${GUIDE_WEBSITE_PORT:-}" | grep -q __FREE_PORT2__; then
  GUIDE_WEBSITE_PORT=$(free_port)
fi
export GUIDE_DEV_PROXY GUIDE_DEV_PORT GUIDE_WEBSITE_PORT

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
