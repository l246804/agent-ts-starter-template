# GUIDE.md — turn an empty directory into a Vite+-managed TypeScript project

This guide is written for an agent (or a careful human) to execute **inside an empty target
directory**. Every command is non-interactive, every version is pinned explicitly, no global
tool is installed, and the toolchain lives in the project. At the end the project proves
itself: format, static check, build script, tests when the profile has them, and a smoke test
of what the mode actually serves — the dev proxy's route in a frontend project, the server's
own route plus the built artefact in a backend one, and the server-rendered page plus the
same-origin API in an SSR one.

Two properties are deliberate, because this project exists to prevent them:

- **No silent success.** A green result has to mean something happened. Removing the
  configuration that makes `vp check` type-aware turns it into a formatter that prints
  `pass` — so this guide proves type checking is live instead of assuming it.
- **Stop, don't repair.** If any step or verification fails, stop and report. Do not adjust
  the check until it agrees with the code.

## Profile status

| Mode | Layout | Status in this revision |
| --- | --- | --- |
| `frontend` | `single` | **Implemented and E2E-verified** (pnpm + `react-ts`); the same steps cover the other create-vite TypeScript templates |
| `backend` | `single` | **Implemented and E2E-verified** (pnpm): a Nitro v3 server at the project root, as a Vite plugin, with no client |
| `fullstack` | `single` | **Implemented and E2E-verified** (pnpm + `react-ts`): the SSR shape — server-side rendering and the same-origin API in one project |
| `fullstack` | `monorepo`, and `frontend`/`backend` in any other layout | Not implemented yet — the guide stops at the profile guard and tells you so |

`backend/single` initializes a project whose only artefact is a server: the client that `vp create`
scaffolds is deleted in the same run, `server/` holds the routes and sits at the project root, the
routes are not `/api`-prefixed (that prefix belongs to the frontend modes' dev proxy), and Nitro's
production output goes to `dist/` — a directory the scaffold's ignore rules already cover — rather
than Nitro's default `.output/`, which they do not.

`fullstack/single` is the **SSR shape**: one project renders the page on the server and hydrates it
in the browser, and the API that page calls belongs to the same server, so there is one origin and
no dev proxy. The shape keeps **no `index.html` at all** — with no template, Nitro installs its
built-in SSR renderer and the SSR entry's own response *is* the document. That is the explicit
choice this profile makes about its failure mode: with a template in place, the
`<!--ssr-outlet-->` comment is what decides whether the entry's output reaches the page, and a
missing comment is **silent** — the entry is still detected, still logged, and `/` answers the
plain client shell with exit 0. Deleting the template removes that class of error instead of
guarding against it, and verification asserts the rendered marker on top.

Two branches are written from the research but **not exercised by this revision's harness**:
`GUIDE_TNB=yes` (the TypeScript 6 API bridge, needed by `vue-ts`/`svelte-ts`), every package
manager other than `pnpm`, and every SSR base other than `react-ts` — the SSR entry is framework
code, so the guard refuses those before writing anything rather than generating a project whose
renderer cannot work. Treat a green run there as unproven until it has been run once.

The phase skeleton below (preflight → decisions → initialize → skills → documents → verify →
handoff) is the structure every profile fills in; the profile guard keeps unimplemented
combinations from producing a half-built project.

## How to read this guide

- Run everything from the **root of the target project** — the directory that starts empty.
- A fenced block marked **`guide:exec`** is a step: run that shell text **verbatim**, in one
  shell, from the project root. Every block starts with `set -euo pipefail` and stops on the
  first failure.
- A fenced block marked **`guide:file`** is a document to write **verbatim** to the given
  path. The ADRs, the traps list, and the constraints section are shipped as text on purpose:
  the wording is the deliverable, not something to improvise.
- A fenced block marked **`guide:verify`** is the verification step. It is the assertion set
  for the whole initialization: run it as-is, and treat a red result as a stop.
- A step whose marker carries a **`when=…`** clause belongs to the answers it names and is skipped
  otherwise: `when=mode:backend` is a step for backend projects, and an alternative list such as
  `when=mode=backend|fullstack` covers either of those modes. Every step without one applies to
  the mode you are initializing.
- Blocks **without** a `guide:` marker are explanation and examples.

The E2E harness in `e2e/` extracts exactly these markers and runs them from an empty
directory, so the document and the test can never drift into two truths.

## Answers — decision points, asked once and pre-answerable

The guide stops at four decision points: mode/layout/framework/package manager, versions (which
include the server foundation in the modes that have one), the dev-proxy target (frontend mode
only), and whether to run the skills setup now. Ask them, then record the answers as environment
variables; every step below fails loudly if an answer it needs is missing. That is also what makes
an unattended run possible.

| Variable | Meaning | Accepted values |
| --- | --- | --- |
| `GUIDE_MODE` | project mode (形态) | `frontend`, `backend`, `fullstack` (this revision) |
| `GUIDE_LAYOUT` | single repo or monorepo | `single` (this revision); in `fullstack` mode the layout names the shape: `single` is SSR, `monorepo` is the split frontend/backend |
| `GUIDE_FRAMEWORK` | create-vite template id; in `backend` mode the client is deleted, so only `vanilla-ts` — a base with no framework to unpick — is accepted, and in `fullstack` mode the SSR entry renders a component tree, so only `react-ts` is implemented | `react-ts` (fullstack SSR); `react-ts`, `vue-ts`, `svelte-ts`, `solid-ts`, `preact-ts`, `lit-ts`, `vanilla-ts`, … (frontend); `vanilla-ts` (backend) |
| `GUIDE_PM` | package manager | `pnpm` (verified), `npm`, `yarn`, `bun` |
| `GUIDE_VP_VERSION` | pinned `vite-plus` | e.g. `1.0.0-rc.0` (prerelease — disclose this) |
| `GUIDE_TS_VERSION` | pinned TypeScript line | `^7.0.2` |
| `GUIDE_TNB` | bridge TypeScript 6's API for tools that still need it | `yes` for `vue-ts`/`svelte-ts`, else `no` |
| `GUIDE_TNB_VERSION` | pinned bridge package | `6.0.3-bridge.17.tsgo.7.0.2` |
| `GUIDE_NITRO_VERSION` | pinned `nitro` (modes with a server) | e.g. `3.0.260903-beta` (prerelease — disclose this) |
| `GUIDE_SKILLS_VERSION` | pinned `skills` CLI | `1.7.0` |
| `GUIDE_DEV_PROXY` | backend the dev server proxies `/api/*` to (`frontend` mode) | e.g. `http://127.0.0.1:3000` |
| `GUIDE_PROXY_SMOKE_PATH` | route the proxy smoke test calls — must exist on that backend (`frontend` mode) | e.g. `/hello` |
| `GUIDE_DEV_PORT` | port the smoke tests use for the dev server | default `5173`; without it Nitro's plugin would pick its own default (`3000`) in the modes with a server |
| `GUIDE_SETUP` | run the skills setup now? | `no` in unattended runs (see Phase 4.5) |

An answer that only one mode reads is only needed in that mode: the steps that read it are the
same steps the mode gates, so a `backend` run never needs `GUIDE_DEV_PROXY` and a `frontend` run
never needs `GUIDE_NITRO_VERSION`. In the SSR shape neither the proxy nor its smoke path is
answered — the page and the API are the same origin, which is also why no `.env` is written.

If the user has pre-answered everything, export the whole table and the run needs no further
input.

---

## Phase 0 — Preflight (no questions, writes nothing)

Four checks, all of them about facts that must be true before a single file is written:

1. the target directory is **completely empty**, hidden files and `.git` included;
2. Node is at least **24.14.0** — older Node cannot resolve the `#/…` import specifier this
   project uses for path aliases, and falling back to a different alias mechanism is a
   silent-failure trap, not a fix;
3. which package managers are **really** available — `pnpm`, `yarn`, `vp` and `vpx` are all
   often the same Vite+ shim, so presence on `PATH` proves nothing;
4. whether a **global `vp`** exists, so the run can avoid it: the toolchain must be
   project-local.

```bash guide:exec id=preflight
set -euo pipefail

fail() { printf 'preflight: %s\n' "$*" >&2; exit 1; }

# 1. the target directory must be completely empty -----------------------------
entries=$(ls -A .)
if [ -n "$entries" ]; then
  printf 'preflight: the target directory is not empty:\n%s\n' "$entries" >&2
  fail "run this guide in an empty directory, or move these files away first"
fi
echo "ok  target directory is empty"

# 2. Node must resolve the '#/...' import specifier (>= 24.14.0) ----------------
node_version=$(node -v 2>/dev/null) || fail "node is not on PATH"
major=${node_version#v}; major=${major%%.*}
rest=${node_version#v}; rest=${rest#*.}; minor=${rest%%.*}
case "$major$minor" in *[!0-9]*) fail "cannot parse the Node version: $node_version" ;; esac
if [ "$major" -lt 24 ] || { [ "$major" -eq 24 ] && [ "$minor" -lt 14 ]; }; then
  fail "Node $node_version is too old: path aliases use the '#/...' import specifier, which needs Node >= 24.14.0; upgrade Node instead of switching alias mechanism"
fi
echo "ok  Node $node_version (>= 24.14.0)"

# 3. which package managers really work ---------------------------------------
# A Vite+ shim answers 'pnpm --version' with a managed pnpm version, so what the name
# resolves to is what tells a real binary from a chameleon. A shim without a managed
# tool answers nothing useful and exits non-zero; that is a report, not a failure.
echo "package managers:"
for pm in pnpm npm yarn bun; do
  bin=$(command -v "$pm" 2>/dev/null) || { printf '  %-5s absent\n' "$pm"; continue; }
  real=$(readlink -f "$bin" 2>/dev/null || printf '%s' "$bin")
  version=$("$pm" --version 2>/dev/null | head -1) || version=""
  case "$version" in
    *[0-9].[0-9]*) : ;;
    *) version="<no usable --version>" ;;
  esac
  case "$(basename "$real")" in
    vp|vpr) note=" <- Vite+ shim, not an independent $pm" ;;
    *) note="" ;;
  esac
  printf '  %-5s %s  %s%s\n' "$pm" "$version" "$real" "$note"
done
echo "ok  package manager inventory above; pnpm is the recommended choice"

# 4. a global vp must not be what this project runs ----------------------------
if command -v vp >/dev/null 2>&1; then
  echo "note: a global vp is installed at $(readlink -f "$(command -v vp)")"
  echo "note: this run never calls it; the project gets its own vite-plus devDependency"
else
  echo "ok  no global vp on PATH"
fi
```

## Phase 1 — Decision point: mode, layout, framework, package manager

Ask these together, then stop asking:

- **Mode** — which kind of project: a pure frontend, a backend, or a fullstack project. This
  revision implements all three, but only in the `single` layout; other layouts are refused by the
  guard below rather than half-built.
- **Layout** — single repository or monorepo. Layout is orthogonal to mode: a monorepo is a
  way of arranging a mode, never a fourth mode. In **`fullstack` mode the layout is the shape
  decision**: `single` is the SSR shape (one project, one origin, no proxy), while the split
  frontend/backend shape is `fullstack` × `monorepo` and is not implemented yet — the guard
  refuses it instead of generating something in between.
- **Framework** — for a frontend, which create-vite TypeScript template; it decides the
  dependencies, the config, and the entry point that the generator writes. A `backend` project
  has no framework: the guide still scaffolds a client base, because every mode starts from the
  same `vp create` step, and then deletes it in the same run — answer `vanilla-ts` there, since
  a framework base writes a `plugins` array and dependencies that a backend project would only
  have to unpick. The guard below refuses anything else before a file is written. The SSR shape
  is the mirror image: it renders a component tree on the server and hydrates it in the browser,
  so it needs a framework base rather than a plain one, and this revision implements the entry
  for `react-ts` only.
- **Package manager** — recommend `pnpm`. In this revision only `pnpm` has been verified end
  to end; the other choices run the same steps through their own `dlx`/`install` spellings.

Record the answers as `GUIDE_MODE`, `GUIDE_LAYOUT`, `GUIDE_FRAMEWORK`, `GUIDE_PM`.

```bash guide:exec id=profile-guard
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single) echo "ok  profile frontend/single" ;;
  backend/single)
    # A backend project deletes the client the generator writes, so all the base has to be is a
    # base. A framework template is not one: create-vite's react-ts, for instance, writes its own
    # `plugins` array (which the backend wiring below would have to unpick) and dependencies
    # nothing in this project uses. Refusing it here costs one answer; discovering it after the
    # prune costs the run.
    case "${GUIDE_FRAMEWORK:-}" in
      vanilla-ts) echo "ok  profile backend/single (base template vanilla-ts, pruned below)" ;;
      *)
        printf 'backend mode scaffolds the vanilla-ts base and deletes its client; %s is not a base this profile can prune.\n' \
          "${GUIDE_FRAMEWORK:-<unanswered>}" >&2
        printf 'Answer GUIDE_FRAMEWORK=vanilla-ts, or stop and report — nothing has been written.\n' >&2
        exit 1
        ;;
    esac
    ;;
  fullstack/single)
    # The SSR shape is the opposite requirement: it renders a component tree on the server and
    # hydrates the same tree in the browser, so the base has to be a framework template. A plain
    # base has no renderer — the server could only produce an HTML string, and the client module
    # would then wipe the server's markup out of the page. Frameworks other than react-ts need
    # their own SSR entry (and, for Vue, a plugin workaround that has not been verified here), so
    # they are refused rather than silently given a React renderer.
    case "${GUIDE_FRAMEWORK:-}" in
      react-ts) echo "ok  profile fullstack/single (SSR shape: the document is rendered by src/entry-server.tsx)" ;;
      vanilla-ts)
        printf 'fullstack mode renders a component tree on the server and hydrates it in the browser; vanilla-ts has no framework renderer, so its server output would be overwritten by the client module.\n' >&2
        printf 'Answer GUIDE_FRAMEWORK=react-ts, or stop and report — nothing has been written.\n' >&2
        exit 1
        ;;
      *)
        printf 'the SSR shape is implemented for the react-ts base in this revision; %s needs its own SSR entry, which this guide does not write.\n' \
          "${GUIDE_FRAMEWORK:-<unanswered>}" >&2
        printf 'Answer GUIDE_FRAMEWORK=react-ts, or stop and report — nothing has been written.\n' >&2
        exit 1
        ;;
    esac
    ;;
  *)
    printf 'this revision implements only the frontend/single, backend/single and fullstack/single profiles; asked for %s/%s.\n' \
      "$GUIDE_MODE" "$GUIDE_LAYOUT" >&2
    printf 'Stop here and report — do not improvise a partially generated project.\n' >&2
    exit 1
    ;;
esac
```

## Phase 2 — Decision point: versions

Nothing in the generated project may sit on a floating version. Report what will be used,
disclose prereleases explicitly, and confirm:

- **`vite-plus`** — pinned, e.g. `1.0.0-rc.0`. It is a **prerelease**: the only alternatives
  are older prereleases, and the rc keeps its `devEngines`/`catalog` behaviour consistent.
  The unversioned `pnpm dlx vite-plus` form is not usable (the package ships several binaries
  and pnpm refuses to guess), so the version is always explicit.
- **TypeScript** — `^7.0.2`. TypeScript 7 is the Go-native compiler and the only 7.x line;
  older scaffolds pin `~6.0.2`, so the dependency gets replaced during initialization.
- **TypeScript bridge** — `vue-tsc` (and the checkers for Svelte, Astro, Glint) still consume
  TypeScript 6's programmatic API, which 7.0 does not ship. For those frameworks set
  `GUIDE_TNB=yes` and pin `6.0.3-bridge.17.tsgo.7.0.2` as both the `typescript` dependency
  and a pnpm override, so every consumer resolves the bridged package. Vue + TypeScript 6 has
  this exact failure signature, which is why the bridge exists:
  `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc'`.
  Under the bridge `tsc --version` prints `6.0.3` — that is the classic API's version, and it
  must never be used to assert the TypeScript version.
- **`skills` CLI** — `1.7.0`, pinned, because its `--skill` parsing has a
  silently-wrong form (`--skill=name` installs every skill in the repository with exit 0).
- **`nitro`** — pinned, e.g. `3.0.260903-beta`, as `GUIDE_NITRO_VERSION` (modes with a server
  only). It is a **prerelease, and there is no stable line to fall back to**: every published v3
  version carries a `-beta` or `-alpha` suffix, and `latest` itself resolves to a prerelease — so
  leaving `latest` here means a dependency that moves underneath the project. The alternative is
  not a safer version of the same thing: v2 is a different package (`nitropack`) with a different
  API, so pinning v3 exactly is the choice that keeps the record honest. v3 also scans nothing by
  default (`serverDir` defaults to `false`), so the server directory is something this guide sets
  deliberately, not something the framework assumes.

## Phase 3 — Initialize the skeleton (automatic)

The generator runs through the chosen package manager, ephemerally, with the version pinned:
`pnpm dlx --package=vite-plus@<version> vp create …`. The template is `vite:application`, which
scaffolds the framework through create-vite and then adds the Vite+ layer (`vite.config.ts`,
the workspace catalog, `devEngines`). `--no-git --no-hooks` keep the run from deciding your
version control and commit hooks for you.

```bash guide:exec id=bootstrap
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"
: "${GUIDE_FRAMEWORK:?Phase 1 must answer GUIDE_FRAMEWORK}"
: "${GUIDE_VP_VERSION:?Phase 2 must answer GUIDE_VP_VERSION}"

case "$GUIDE_PM" in
  pnpm) dlx() { pnpm dlx "$@"; } ;;
  npm) dlx() { npx --yes "$@"; } ;;
  yarn) dlx() { yarn dlx "$@"; } ;;
  bun) dlx() { bunx "$@"; } ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

# The verbose output is the only place the resolved create-vite version appears; keep it for
# the provenance record, then remove it at the end of Phase 5. It is captured rather than
# streamed through `tee`, because the scaffold refuses anything but an empty directory and a
# tee target created before it runs would be enough to make the directory non-empty.
if ! create_log=$(dlx --package="vite-plus@$GUIDE_VP_VERSION" vp create vite:application \
  --directory . \
  --no-interactive \
  --no-git \
  --no-hooks \
  --package-manager "$GUIDE_PM" \
  --verbose \
  -- --template "$GUIDE_FRAMEWORK" 2>&1); then
  printf '%s\n' "$create_log" >&2
  echo "vp create failed; the target directory was left as it was" >&2
  exit 1
fi
printf '%s\n' "$create_log" > .vite-plus-create.log
printf '%s\n' "$create_log" | tail -25

for expected in package.json vite.config.ts tsconfig.json AGENTS.md; do
  [ -f "$expected" ] || { echo "the generator did not write $expected" >&2; exit 1; }
done

# Verify the version that actually ran, not the version that was asked for: pnpm resolves
# 'latest' unpredictably, and an older CLI would scaffold a different project silently.
ran=$(./node_modules/.bin/vp --version | head -1)
case "$ran" in
  *"$GUIDE_VP_VERSION"*) echo "ok  scaffolded with $ran" ;;
  *) echo "expected vite-plus $GUIDE_VP_VERSION, but $ran ran" >&2; exit 1 ;;
esac
echo "ok  skeleton written"
```

### Alias the project root with Node's own import map

Path aliases use exactly one mechanism: `package.json` `imports`. Not `tsconfig` `paths`, not
`resolve.alias`, not `resolve.tsconfigPaths` — with more than one of them in play, the module
the type checker sees, the module the bundler loads, and the module that actually ships can be
three different files, and nothing goes red. The `types` branch must be first: TypeScript
resolves an `imports` target exactly and never probes extensions, so without it every
extensionless `#/…` import is a `TS2307` while dev and build stay green.

```bash guide:exec id=manifest
set -euo pipefail
: "${GUIDE_TS_VERSION:?Phase 2 must answer GUIDE_TS_VERSION}"
: "${GUIDE_TNB:?Phase 2 must answer GUIDE_TNB (yes when the framework checker needs the TS 6 API)}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
manifest.imports = { "#/*": { types: "./*.ts", default: "./*" } };
manifest.devDependencies.typescript =
  process.env.GUIDE_TNB === "yes" ? "catalog:" : process.env.GUIDE_TS_VERSION;

// A predictable key order keeps diffs readable: identity, alias map, scripts, dependencies.
const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];

// Edit the manifest as JSON: `npm pkg set` refuses to run inside a project whose
// devEngines pin a different package manager (EBADDEVENGINES).
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
NODE

node -e 'const m = require("./package.json"); if (Object.keys(m.imports["#/*"])[0] !== "types") { throw new Error("the types branch must come first"); }'
echo "ok  imports alias installed, typescript set to $(node -p 'require("./package.json").devDependencies.typescript')"
```

For frameworks whose checker still needs TypeScript 6's API, the bridge replaces the
`typescript` package everywhere it is resolved — both the catalog entry and the override, or
packages that depend through `catalog:` keep resolving the unbridged one.

```bash guide:exec id=manifest-tnb when=tnb:yes
set -euo pipefail
: "${GUIDE_TNB_VERSION:?Phase 2 must answer GUIDE_TNB_VERSION when GUIDE_TNB=yes}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "pnpm-workspace.yaml";
const spec = `npm:typescript-native-bridge@${process.env.GUIDE_TNB_VERSION}`;
let source = readFileSync(file, "utf8");

if (!/^catalog:/m.test(source)) source = `catalog:\n${source}`;
if (/^\s*typescript:/m.test(source)) {
  source = source.replace(/^\s*typescript:.*$/m, `  typescript: ${spec}`);
} else {
  source = source.replace(/^catalog:\n/m, `catalog:\n  typescript: ${spec}\n`);
}
if (/^overrides:/m.test(source)) {
  source = source.replace(/^overrides:\n/m, `overrides:\n  typescript: ${spec}\n`);
} else {
  source += `overrides:\n  typescript: ${spec}\n`;
}
writeFileSync(file, source);
NODE

grep -q 'typescript-native-bridge' pnpm-workspace.yaml
echo "ok  catalog and overrides both point at the TypeScript 6 API bridge"
```

### Leave the framework's TypeScript project layout alone (frontend modes)

A frontend mode keeps the tsconfig layout the generator wrote, because that is the layout the
template's own build script (`tsc -b`) expects: create-vite's framework templates split the
browser program and the Node-side config file into separate project references, and a pure
frontend has no second toolchain to reconcile with them. The single, merged tsconfig belongs to
the modes that compose a Nitro server into the project: there `server/`, the tests directory and
`nitro.config.ts` have to join one program — and so does `src/`, in the SSR shape, where the
browser half is part of a server program too. One config extending `nitro/tsconfig` is the layout
that was proven to work; the backend section and the SSR section at the end of this phase are
that layout.

What every mode enforces about TypeScript is negative and checkable: none of those files may
carry an alias mechanism of its own. The alias control below proves the `imports` map is the one
that actually resolves, and the harness re-checks from outside that no `paths`, `resolve.alias`
or `resolve.tsconfigPaths` turned up anywhere.

### Trim the configuration, then prove the trim did not hollow out the check

The generator writes configuration that is not carrying its weight — an empty `fmt: {}` that
equals the default, for instance. Delete what is redundant, keep what has an effect, and treat
"it looks like a default" as a hypothesis to test, never as permission: a green `vp check`
means nothing if the configuration that made it type-aware is gone.

```bash guide:exec id=config-trim
set -euo pipefail

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");
const hits = before.match(/^[ \t]*fmt: \{\},\n/gm) ?? [];
if (hits.length !== 1) {
  console.error(`expected exactly one default-valued 'fmt: {}' line, found ${hits.length}`);
  process.exit(1);
}
const trimmed = before.replace(/^[ \t]*fmt: \{\},\n/gm, "");
for (const key of ["typeAware", "typeCheck"]) {
  if (!trimmed.includes(key)) {
    console.error(`trimming also removed the load-bearing ${key}; vp check would not check types`);
    process.exit(1);
  }
}
writeFileSync(file, trimmed);
NODE

echo "ok  default-valued fmt: {} removed, typeAware/typeCheck kept"
```

```bash guide:exec id=config-controls
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"

vp_run() { ./node_modules/.bin/vp "$@"; }

# Control 1 - the type checker is alive. Plant a type error; a check that still passes is a
# check that never looked. This is the only reason to believe the config trim above was safe.
printf 'export const __guideProbe: number = "not a number";\n' > src/__guide_probe.ts
vp_run fmt > /dev/null
if vp_run check > .vite-plus-control.log 2>&1; then
  rm -f src/__guide_probe.ts
  echo "vp check passed with a type error in the project - type checking is not active" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-control.log" >&2
  exit 1
}
echo "ok  planted type error was caught (TS2322)"
rm -f src/__guide_probe.ts .vite-plus-control.log

# Control 2 - the alias resolves in the type checker, not only in the bundler. A wrong
# `imports` shape (for example {"#*": "./*"}) leaves dev and build green and reports TS2307
# on every aliased import, so prove the positive case instead of assuming it.
cat > src/__guide_alias_target.ts <<'TS'
export const aliasProbe = "imports-alias-resolves";
TS
cat > src/__guide_alias_use.ts <<'TS'
import { aliasProbe } from "#/src/__guide_alias_target";

export const aliasProbeUse: string = aliasProbe;
TS
vp_run fmt > /dev/null
vp_run check
rm -f src/__guide_alias_target.ts src/__guide_alias_use.ts
echo "ok  '#/...' resolves through package.json imports"
```

### Install, and refine the ignore rules

The ignore file keeps the project's secrets stance explicit: `.env` is committed (only
`*.local` is ignored, so `.env.local` stays personal), and editor configuration is committed
too — a team that standardises on one editor wants its settings reviewed like any other file.

```bash guide:exec id=install
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = ".gitignore";
const before = readFileSync(file, "utf8");
const after = before.replace(/^\.vscode\/\*\n(?:!\.vscode\/extensions\.json\n)?/m, "");
if (after === before) {
  console.error("no '.vscode/*' ignore lines were found; inspect .gitignore before continuing");
  process.exit(1);
}
const rules = after
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const envIgnore = rules.find(
  (rule) =>
    !rule.startsWith("!") &&
    [".env", ".env*", ".env.*", "*.env", "/.env", "/.env*"].includes(rule.replace(/\/$/, "")),
);
if (envIgnore) {
  console.error(`.gitignore still ignores the environment file ('${envIgnore}'); only *.local may be ignored`);
  process.exit(1);
}
for (const required of ["*.local", "dist", "node_modules"]) {
  if (!new RegExp(`^${required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(after)) {
    console.error(`.gitignore no longer ignores ${required}`);
    process.exit(1);
  }
}
writeFileSync(file, after);
NODE

case "$GUIDE_PM" in
  pnpm) pnpm install --no-frozen-lockfile ;;
  npm) npm install ;;
  yarn) yarn install ;;
  bun) bun install ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

resolved=$(node -p 'require("./node_modules/typescript/package.json").version')
echo "ok  dependencies installed; typescript resolves to $resolved"
```

### Backend mode: delete the client, then put the server at the project root

A `backend` project has no client, so the one the generator just wrote is waste: `src/`, `public/`
and `index.html` go. What stays is the project itself — the project-local pinned toolchain, the
`imports` alias map, the trimmed configuration, the refined ignore rules — and on top of it the
server: Nitro v3 consumed as a Vite plugin, with `serverDir` pointing at `server/` in the project
root. This is the composition ADR-0003 (in the generated project's `docs/adr/`) records, and it is
Vite+-first on purpose: `vp create` built the project, Nitro was added to it, so there is no
migration step and no second toolchain.

Three details decide whether the result is a server or a lie, and two of them fail silently:

- **The plugin must land in a `plugins` array.** The scaffold's `vite.config.ts` has `fmt` and
  `lint` and **no `plugins` key at all**, so the obvious edit — add the
  `import { nitro } from "nitro/vite"` line, forget the array — leaves an unused import:
  `vp check` still exits 0 (with a lint warning an agent can filter out) and the server is inert.
  The step below creates the array, and then asserts the final file's text, because "the patch
  ran" and "the plugin is registered" are not the same claim.
- **Routes live in `server/routes/`, not `server/api/`.** Under `serverDir`, Nitro's `api/`
  directory is URL-prefixed with `/api` by default while `routes/` is not. The `/api` prefix is
  the frontend modes' dev-proxy convention — a backend that serves its own routes has no reason
  to carry it, and a route that answers somewhere other than where the guide says it does is
  exactly the kind of quiet mismatch this project exists to prevent.
- **Production output goes to `dist/`.** Nitro's default output directory is `.output/`, which
  the scaffold's ignore rules do not cover; `vp fmt` and `vp check` take their file set from the
  ignore rules, so a build would make the static check fail on Nitro's own artefacts. `output:
  { dir: "dist" }` relocates the whole layout (`dist/public`, `dist/server`, `dist/nitro.json`)
  into the directory `.gitignore` already has, so the run adds no ignore rule — and the step
  below fails if a build creates `.output/` anyway, which is what a forgotten `output` key looks
  like.

```bash guide:exec id=backend-skeleton when=mode:backend
set -euo pipefail

# 1. the client is not part of a backend project ---------------------------------
rm -rf src public index.html
for gone in src public index.html; do
  [ ! -e "$gone" ] || { echo "$gone survived the prune" >&2; exit 1; }
done
for kept in package.json vite.config.ts tsconfig.json .gitignore; do
  [ -f "$kept" ] || { echo "$kept did not survive the prune; stop and report" >&2; exit 1; }
done
echo "ok  client pruned (src/, public/, index.html)"

# 2. the server, at the project root ---------------------------------------------
mkdir -p server/routes tests
cat > nitro.config.ts <<'TS'
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  output: { dir: "dist" },
});
TS

cat > server/routes/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler(() => ({ hello: "world" }));
TS

# The tests directory is created here and stays outside server/: Nitro compiles every file under
# server/routes/ (and server/api/) into a route, so a test living there would be served instead
# of run. tests/.gitkeep holds the directory in version control; the test command added below is
# wired but has nothing to run yet — that is the configured state, not a passing test suite.
: > tests/.gitkeep

# 3. one TypeScript program for the whole server ---------------------------------
# Nitro's own preset, plus the file set plain `tsc` (the build script's first half) has to see:
# without `server` here, `tsc` passes while never looking at a handler.
cat > tsconfig.json <<'JSON'
{
  "extends": "nitro/tsconfig",
  "include": ["server", "tests", "nitro.config.ts", "vite.config.ts"]
}
JSON

node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

const nitro = readFileSync("nitro.config.ts", "utf8");
if (!/serverDir:\s*"\.\/server"/.test(nitro)) {
  console.error("nitro.config.ts does not point serverDir at ./server");
  process.exit(1);
}
if (!/output:\s*\{\s*dir:\s*"dist"/.test(nitro)) {
  console.error("nitro.config.ts does not send the production output to dist");
  process.exit(1);
}
for (const file of ["server/routes/hello.ts", "tests/.gitkeep", "tsconfig.json"]) {
  if (!existsSync(file)) { console.error(`${file} is missing`); process.exit(1); }
}
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
if (tsconfig.extends !== "nitro/tsconfig") {
  console.error("tsconfig.json does not extend nitro/tsconfig");
  process.exit(1);
}
for (const included of ["server", "tests", "nitro.config.ts", "vite.config.ts"]) {
  if (!(tsconfig.include ?? []).includes(included)) {
    console.error(`tsconfig.json does not include ${included}; plain tsc would not check it`);
    process.exit(1);
  }
}
console.log("ok  server skeleton: serverDir ./server, output dist, tests/ outside the route scan");
NODE
```

```bash guide:exec id=backend-manifest when=mode:backend
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"
: "${GUIDE_NITRO_VERSION:?Phase 2 must answer GUIDE_NITRO_VERSION}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

// The pin is written as JSON rather than through the package manager: the exact spec is the
// contract (a save that normalised it to a range would look the same in the manifest and resolve
// somewhere else later), and `npm pkg set` refuses to run at all inside a project whose
// devEngines pin a package manager (EBADDEVENGINES). Every manifest edit in this guide is a JSON
// edit.
manifest.devDependencies.nitro = process.env.GUIDE_NITRO_VERSION;

// The test runner is wired at initialization and has no example test: a project is not
// initialized with someone else's guess at a test. `--passWithNoTests` is what makes an empty
// suite an exit 0 while `vp test` with no files is an exit 1.
manifest.scripts.test = "vp test --passWithNoTests";

// A predictable key order keeps diffs readable: identity, alias map, scripts, dependencies.
const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
NODE

case "$GUIDE_PM" in
  pnpm) pnpm install --no-frozen-lockfile ;;
  npm) npm install ;;
  yarn) yarn install ;;
  bun) bun install ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

# Assert what resolved, not what was asked for: a prerelease range would install something else
# and still exit 0.
resolved=$(node -p 'require("./node_modules/nitro/package.json").version')
[ "$resolved" = "$GUIDE_NITRO_VERSION" ] || {
  echo "expected nitro@$GUIDE_NITRO_VERSION, but $resolved resolved" >&2
  exit 1
}
echo "ok  nitro@$resolved pinned in devDependencies and installed"
```

```bash guide:exec id=backend-plugin when=mode:backend
set -euo pipefail

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");
if (/^ {2}plugins\s*:/m.test(before)) {
  // Reached only if the file is not the one this step expects — the patch below would otherwise
  // add a second `plugins` key, and a duplicated key is the silent-inert failure again. The match
  // is anchored at the top level: a scaffold's own `lint` block may carry a `plugins` list, and
  // that one is not this one.
  console.error("vite.config.ts already has a top-level plugins entry, so this step would add a second one");
  process.exit(1);
}
const head = "export default defineConfig({";
if (before.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}

// Both halves of the wiring, in one edit: the import, and the array the import has to be called
// from. The scaffold has no `plugins` key, so the array is created, not appended to.
let source = before.replace(
  /(import \{[^}]*\} from "vite-plus";\n)/,
  '$1import { nitro } from "nitro/vite";\n',
);
if (source === before) {
  console.error("vite.config.ts has no vite-plus import to sit next to");
  process.exit(1);
}
source = source.replace(head, `${head}\n  plugins: [nitro()],`);
writeFileSync(file, source);
NODE

./node_modules/.bin/vp fmt

# The registration is the difference between a server and a dead import, so it is asserted on the
# formatted file rather than assumed from the patch having run.
node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
const source = readFileSync("vite.config.ts", "utf8");
if (!/import \{ nitro \} from "nitro\/vite";/.test(source)) {
  console.error("vite.config.ts does not import nitro from nitro/vite");
  process.exit(1);
}
const keys = source.match(/^ {2}plugins\s*:/gm) ?? [];
if (keys.length !== 1) {
  console.error(`expected exactly one top-level plugins entry in vite.config.ts, found ${keys.length}`);
  process.exit(1);
}
if (!/^ {2}plugins:\s*\[nitro\(\)\],$/m.test(source)) {
  console.error("the plugins array does not call nitro() — the server would be inert");
  process.exit(1);
}
console.log("ok  nitro() is registered in vite.config.ts plugins");
NODE

./node_modules/.bin/vp check

# The merged tsconfig exists so that the server is type-checked, so that is proved rather than
# trusted: a planted type error inside a route has to turn `vp check` red. Without this, a
# tsconfig that quietly excluded server/ would leave every later `vp check` green and blind.
printf 'export const __guideServerProbe: number = "not a number";\n' > server/routes/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null   # a formatting complaint would short-circuit the check
if ./node_modules/.bin/vp check > .vite-plus-server-control.log 2>&1; then
  rm -f server/routes/__guide_probe.ts
  echo "vp check passed with a type error in server/routes - the server is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-server-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-server-control.log" >&2
  exit 1
}
rm -f server/routes/__guide_probe.ts .vite-plus-server-control.log
echo "ok  a planted type error in server/routes was caught (TS2322)"

# And the wiring is proved by its product, not by the patch: the build has to come out of the
# plugin, in the directory the ignore rules cover.
./node_modules/.bin/vp build
[ -f dist/server/index.mjs ] || {
  echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2
  exit 1
}
[ ! -e .output ] || {
  echo "the build also wrote .output/; output.dir did not take effect" >&2
  exit 1
}
echo "ok  build output is dist/server/index.mjs, with no .output/ beside it"
```

### Fullstack SSR mode: the server renders the document, the browser hydrates it

The SSR shape keeps the client **and** adds a renderer for it. Three things make that work, and
the first one is the shape itself: **there is no `index.html`**. Nitro treats an `index.html` as
the renderer template, and the `<!--ssr-outlet-->` comment inside it is the only channel between
the template and the SSR entry — a `String.replace` on that comment, so no comment means no
insertion and no warning, while the entry is still detected and announced and `/` quietly answers
the client shell, at exit 0. With no template, the plugin installs its own renderer and passes the
SSR entry's `Response` through unchanged — status, headers and body are the entry's — so the
failure mode is removed rather than guarded against. Verification asserts the rendered marker on
top of that: a shape that degraded like this stops being an SSR build at all — no `_ssr/` bundle,
just an inlined renderer template — and the marker is the layer behind that.

The second is the entry contract. Nitro auto-detects `entry-server.(ts|tsx|js|jsx|mts|mjs)` in the
project root, `app/`, `src/` or the server directory, and the file must **default-export an object
with a `fetch` method**: there is no `render()` contract and no h3 app here. Ours renders the same
tree the client entry hydrates, and it needs the client's identity — the hashed asset URLs and the
CSS — to finish the document, which is what the `?assets=client` / `?assets=ssr` imports and their
`merge()` are for.

The third is the client entry. With the template gone, Vite has nothing to take the client entry
from, so the client environment has to name it: `environments.client.build.rollupOptions.input`.
Without that line the client environment falls back to the renderer template — the file this shape
deleted — and the build fails in Nitro's asset step (`TypeError: Cannot convert undefined or null
to object`, exit 1). That is the loud half of the mistake, which is the acceptable one; what the
shape refuses to do is ship a document whose client entry does not exist.

`server/` follows the same rules the backend profile uses — routes at the project root, production
output in `dist/` — with one difference: the API belongs to this project's own page, so it is
mounted where its URL says it is, `server/routes/api/hello.ts` → `/api/hello`. There is no proxy
and no `.env`: the page and the API are one origin by construction, and the verification proves it
by calling `/api/hello` on the same port that served the page.

The TypeScript config is merged into one file, like the backend profile's, and for the same
reason: the build script's `tsc` only checks what the program includes, so a config that covered
`src/` alone would leave every handler unchecked while `vp build` stayed green. One program over
`src/`, `server/`, `tests/` and the config files is what makes the build script see both halves —
and the step below proves both halves are in it with a deliberate error in each. The scaffold's
two project-reference configs are deleted with it: nothing would keep them in sync with the merged
program, and a second description of the layout is exactly the kind of thing that is read later
and believed.

```bash guide:exec id=ssr-skeleton when=mode:fullstack
set -euo pipefail

# 1. the shape: no template to fall back to ----------------------------------------------
# An index.html is the renderer template, and the <!--ssr-outlet--> comment in it is the only
# channel into the page. With no template, Nitro installs its built-in renderer and the SSR
# entry's own Response IS the document, status and headers included. The demo files the scaffold
# wrote for its landing page have no consumer in this shape and go with it, and so do the two
# project-reference tsconfigs the merged program below replaces — leaving them would keep a
# second, contradictory description of how this project's TypeScript is laid out.
rm -f index.html src/main.tsx src/App.css public/icons.svg tsconfig.app.json tsconfig.node.json
rm -rf src/assets
for gone in index.html src/main.tsx; do
  [ ! -e "$gone" ] || { echo "$gone survived the shape change" >&2; exit 1; }
done
echo "ok  no index.html: the SSR entry owns the document"

# 2. the app both sides render -----------------------------------------------------------
cat > src/App.tsx <<'TSX'
export function App() {
  return (
    <main>
      <h1>SSR works</h1>
      <p>This page is rendered on the server and hydrated in the browser. Edit src/App.tsx.</p>
    </main>
  );
}
TSX

# 3. the two entries ---------------------------------------------------------------------
# The server entry returns the whole document: shell, asset links and app markup. The client
# entry hydrates the same tree — hydration compares the browser's tree with the server's, so
# the two have to stay the same tree.
cat > src/entry-server.tsx <<'TSX'
import { renderToReadableStream } from "react-dom/server.edge";

import { App } from "./App.tsx";

import clientAssets from "./entry-client?assets=client";
import serverAssets from "./entry-server?assets=ssr";

import "./index.css";

export default {
  async fetch(_request: Request): Promise<Response> {
    const assets = clientAssets.merge(serverAssets);
    return new Response(
      await renderToReadableStream(
        <html lang="en">
          <head>
            <meta charSet="UTF-8" />
            <link rel="icon" href="/favicon.svg" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>app</title>
            {assets.css.map((attr) => (
              <link key={attr.href} rel="stylesheet" {...attr} />
            ))}
            {assets.js.map((attr) => (
              <link key={attr.href} rel="modulepreload" {...attr} />
            ))}
          </head>
          <body>
            <div id="root">
              <App />
            </div>
            <script type="module" src={assets.entry} />
          </body>
        </html>
      ),
      { headers: { "Content-Type": "text/html;charset=utf-8" } },
    );
  },
};
TSX

cat > src/entry-client.tsx <<'TSX'
import "@vitejs/plugin-react/preamble";
import { hydrateRoot } from "react-dom/client";

import { App } from "./App.tsx";

import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("the server-rendered shell must provide #root");
hydrateRoot(root, <App />);
TSX

# 4. the server, at the project root -----------------------------------------------------
mkdir -p server/routes/api tests
cat > nitro.config.ts <<'TS'
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  output: { dir: "dist" },
});
TS

# /api/hello is where the file sits, not a prefix something added: server/api/ is the directory
# that adds one implicitly, and this project does not use it.
cat > server/routes/api/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler(() => ({ hello: "world" }));
TS

: > tests/.gitkeep

# 5. one TypeScript program over both halves ---------------------------------------------
# tsBuildInfoFile keeps the build script's cache file inside node_modules, the place the
# scaffold's own configs put theirs, instead of a stray tsconfig.tsbuildinfo at the root.
cat > tsconfig.json <<'JSON'
{
  "extends": "nitro/tsconfig",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client", "nitro/vite/types", "node"],
    "allowArbitraryExtensions": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.tsbuildinfo",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src", "server", "tests", "nitro.config.ts", "vite.config.ts"]
}
JSON

node --input-type=module - <<'NODE'
import { existsSync, readdirSync, readFileSync } from "node:fs";

for (const file of [
  "src/App.tsx",
  "src/entry-server.tsx",
  "src/entry-client.tsx",
  "nitro.config.ts",
  "server/routes/api/hello.ts",
  "tests/.gitkeep",
]) {
  if (!existsSync(file)) { console.error(`${file} is missing`); process.exit(1); }
}
// One program, and only one description of it: a split config that survived the merge would
// still be read by anything that trusts the scaffold's old layout.
const splits = readdirSync(".").filter((name) => /^tsconfig\..*\.json$/.test(name));
if (splits.length) {
  console.error(`split tsconfig files survived the merge: ${splits.join(", ")}`);
  process.exit(1);
}
const nitro = readFileSync("nitro.config.ts", "utf8");
if (!/serverDir:\s*"\.\/server"/.test(nitro) || !/output:\s*\{\s*dir:\s*"dist"/.test(nitro)) {
  console.error("nitro.config.ts does not set serverDir ./server and output dir dist");
  process.exit(1);
}
const entry = readFileSync("src/entry-server.tsx", "utf8");
if (!/export default \{/.test(entry) || !/fetch\(/.test(entry)) {
  console.error("src/entry-server.tsx does not default-export a { fetch } handler");
  process.exit(1);
}
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
if (tsconfig.extends !== "nitro/tsconfig") {
  console.error("tsconfig.json does not extend nitro/tsconfig");
  process.exit(1);
}
for (const included of ["src", "server", "tests", "nitro.config.ts", "vite.config.ts"]) {
  if (!(tsconfig.include ?? []).includes(included)) {
    console.error(`tsconfig.json does not include ${included}; plain tsc would not check it`);
    process.exit(1);
  }
}
console.log("ok  SSR skeleton: no template, both entries, server at the root, one program over src/ and server/");
NODE
```

```bash guide:exec id=ssr-manifest when=mode:fullstack
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"
: "${GUIDE_NITRO_VERSION:?Phase 2 must answer GUIDE_NITRO_VERSION}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

// The pin goes in as JSON for the same reason as everywhere else in this guide: the exact spec
// is the contract, and `npm pkg set` refuses to run inside a project whose devEngines pin a
// package manager (EBADDEVENGINES).
manifest.devDependencies.nitro = process.env.GUIDE_NITRO_VERSION;
manifest.scripts.test = "vp test --passWithNoTests";

const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
NODE

case "$GUIDE_PM" in
  pnpm) pnpm install --no-frozen-lockfile ;;
  npm) npm install ;;
  yarn) yarn install ;;
  bun) bun install ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

# Assert what resolved, not what was asked for: a prerelease range would install something else
# and still exit 0.
resolved=$(node -p 'require("./node_modules/nitro/package.json").version')
[ "$resolved" = "$GUIDE_NITRO_VERSION" ] || {
  echo "expected nitro@$GUIDE_NITRO_VERSION, but $resolved resolved" >&2
  exit 1
}
echo "ok  nitro@$resolved pinned in devDependencies and installed"
```

```bash guide:exec id=ssr-plugin when=mode:fullstack
set -euo pipefail

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");

let source = before.replace(
  /(import \{[^}]*\} from "vite-plus";\n)/,
  '$1import { nitro } from "nitro/vite";\n',
);
if (source === before) {
  console.error("vite.config.ts has no vite-plus import to sit next to");
  process.exit(1);
}

// The react-ts scaffold already has a plugins array, wrapped in vp's lazyPlugins(). nitro() goes
// inside that array; a second top-level `plugins` key is a duplicate object key, and JS keeps one
// of them, dropping the other plugin without a word.
const pluginsLine = "plugins: lazyPlugins(() => [react()])";
if (!source.includes(pluginsLine)) {
  console.error(`expected ${JSON.stringify(pluginsLine)} in vite.config.ts`);
  process.exit(1);
}
source = source.replace(pluginsLine, "plugins: lazyPlugins(() => [nitro(), react()])");

// The client entry, now that no index.html names it: without this input the client environment
// falls back to the renderer template — the file the skeleton deleted.
const head = "export default defineConfig({";
if (source.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}
source = source.replace(
  head,
  `${head}\n  environments: {\n    client: { build: { rollupOptions: { input: "./src/entry-client.tsx" } } },\n  },`,
);
writeFileSync(file, source);
NODE

./node_modules/.bin/vp fmt

# Registration is asserted on the formatted file, because "the patch ran" and "the plugin is
# registered" are not the same claim. The count is anchored at the top level: the scaffold's own
# `lint` block carries a `plugins` list, so an unanchored match finds two on a correct file.
node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
const source = readFileSync("vite.config.ts", "utf8");
if (!/import \{ nitro \} from "nitro\/vite";/.test(source)) {
  console.error("vite.config.ts does not import nitro from nitro/vite");
  process.exit(1);
}
const keys = source.match(/^ {2}plugins\s*:/gm) ?? [];
if (keys.length !== 1) {
  console.error(`expected exactly one top-level plugins entry in vite.config.ts, found ${keys.length}`);
  process.exit(1);
}
if (!/^ {2}plugins: lazyPlugins\(\(\) => \[nitro\(\), react\(\)\]\),$/m.test(source)) {
  console.error("nitro() is not called inside the scaffold's lazyPlugins array — the server would be inert");
  process.exit(1);
}
if (!source.includes('input: "./src/entry-client.tsx"')) {
  console.error("the client environment does not build from ./src/entry-client.tsx");
  process.exit(1);
}
console.log("ok  nitro() registered in lazyPlugins, client entry declared for the client environment");
NODE

./node_modules/.bin/vp check

# Both halves of the merged program are proved, not trusted: a planted type error in src/ and one
# in server/routes/api/ each have to turn `vp check` red. A tsconfig that quietly covered only one
# half would leave every later `vp check` green and blind there.
printf 'export const __guideClientProbe: number = "not a number";\n' > src/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
if ./node_modules/.bin/vp check > .vite-plus-client-control.log 2>&1; then
  rm -f src/__guide_probe.ts
  echo "vp check passed with a type error in src/ — the client half is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-client-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-client-control.log" >&2
  exit 1
}
rm -f src/__guide_probe.ts .vite-plus-client-control.log
echo "ok  a planted type error in src/ was caught (TS2322)"

printf 'export const __guideServerProbe: number = "not a number";\n' > server/routes/api/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
if ./node_modules/.bin/vp check > .vite-plus-server-control.log 2>&1; then
  rm -f server/routes/api/__guide_probe.ts
  echo "vp check passed with a type error in server/routes/api/ — the server half is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-server-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-server-control.log" >&2
  exit 1
}
rm -f server/routes/api/__guide_probe.ts .vite-plus-server-control.log
echo "ok  a planted type error in server/routes/api/ was caught (TS2322)"

# The build has to produce both halves: the client bundle the document references, and the SSR
# renderer the server bundle loads. `_ssr/` exists only in an SSR build, which is what makes it
# the cheap way to tell this shape's output from a client-only one.
./node_modules/.bin/vp build
[ -f dist/server/index.mjs ] || {
  echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2
  exit 1
}
[ -f dist/server/_ssr/ssr.mjs ] || {
  echo "the build produced no SSR renderer (dist/server/_ssr/ssr.mjs) — this is a client-only build" >&2
  exit 1
}
[ -n "$(ls dist/public/assets/*.js 2>/dev/null)" ] || {
  echo "the build produced no client bundle under dist/public/assets" >&2
  exit 1
}
[ ! -e .output ] || {
  echo "the build also wrote .output/; output.dir did not take effect" >&2
  exit 1
}
echo "ok  build output: client bundles in dist/public/assets, the SSR renderer in dist/server/_ssr, no .output/"
```

## Phase 3.5 — Dev proxy: only when a frontend is not same-origin as its backend

A pure frontend always has a backend somewhere else, so it needs a dev proxy. The production
edge strips the `api` prefix before the server sees the path; the dev server has to reproduce
that exactly, or `/api/*` will work in dev and 404 in production. The whole phase is gated to
`frontend` mode: in a backend project the server is this project's own, and in the SSR shape the
page and the API share one origin — in both, a proxy would be a second mechanism for a problem
that does not exist.

Three details are load-bearing:

- `DEV_PROXY` lives in **`.env`**, not `.env.development`: `loadEnv` reads files per mode, and
  a production build would not see a development-mode file — the guard below would then throw
  during `vp build` and kill the build for a variable the build does not need.
- the **guard is a single unconditional line**. Without it, an unset variable makes
  `proxyTransformer` return an empty config: `/api/*` quietly returns `200` with the app's
  HTML, and the dev log says nothing.
- the **prefix is a regular expression**, so write `/api/` with the trailing slash unless you
  want `/apix/…` proxied too.

```bash guide:exec id=proxy when=mode:frontend
set -euo pipefail
: "${GUIDE_DEV_PROXY:?Phase 3.5 must answer GUIDE_DEV_PROXY (the backend address)}"
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"

cat > .env <<ENV
# Dev proxy: the nginx-equivalent for local development. The /api prefix is stripped, so
# /api/hello reaches the backend as /hello. Committed on purpose: only *.local is ignored.
DEV_PROXY="[ ['/api','${GUIDE_DEV_PROXY}',''] ]"
ENV

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
let source = readFileSync(file, "utf8");

// 1. `loadEnv` comes from vite-plus, which is where the project's Vite flavor lives.
const vpImport = /import \{([^}]*)\} from "vite-plus";/.exec(source);
if (!vpImport) {
  console.error("vite.config.ts has no vite-plus import to extend");
  process.exit(1);
}
const names = vpImport[1].split(",").map((name) => name.trim()).filter(Boolean);
if (!names.includes("loadEnv")) names.push("loadEnv");
names.sort();
source = source.replace(vpImport[0], `import { ${names.join(", ")} } from "vite-plus";`);
source = source.replace(
  /(import \{[^}]*\} from "vite-plus";\n)/,
  '$1import { proxyTransformer } from "vite-proxy-from-env";\n',
);

// 2. Wrap the exported config so the proxy target can be read per mode, and keep the guard
//    one line long: it is here to turn a silent fallback into a loud failure.
const head = "export default defineConfig({";
if (source.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}
source = source.replace(
  head,
  [
    "export default defineConfig(({ mode }) => {",
    '  const env = loadEnv(mode, process.cwd(), "");',
    '  if (!env.DEV_PROXY) throw new Error("DEV_PROXY is not set — see .env");',
    "  return {",
  ].join("\n"),
);
if (!source.trimEnd().endsWith("});")) {
  console.error("vite.config.ts does not end with '});'");
  process.exit(1);
}
source = source.replace(
  /\n\}\);\s*$/,
  "\n  server: {\n    proxy: proxyTransformer(env.DEV_PROXY),\n  },\n  };\n});\n",
);

// 3. Pin the transformer, which never reads the environment itself.
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
manifest.devDependencies["vite-proxy-from-env"] = "1.1.0";
manifest.devDependencies = Object.fromEntries(
  Object.entries(manifest.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(file, source);
NODE

case "$GUIDE_PM" in
  pnpm) pnpm install --no-frozen-lockfile ;;
  npm) npm install ;;
  yarn) yarn install ;;
  bun) bun install ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

./node_modules/.bin/vp fmt
./node_modules/.bin/vp check
echo "ok  dev proxy wired: /api/* -> $GUIDE_DEV_PROXY with the prefix stripped"
```

## Phase 4 — Agent skills (automatic, then verified)

Install the promoted skill set from the toolkit's upstream repository. The set is resolved
from upstream **at run time** — never frozen in this guide — so a renamed or newly promoted
skill is picked up instead of silently pinned to today's list. The count is not asserted
anywhere: the contract is that the installed set equals the set the upstream manifest
declares, whatever that set is today.

The install command has a trap worth naming: `skills` 1.7.0 only understands the bare
`--skill` token. Its own documentation shows `--skill=<name>`, which the parser ignores, so
the CLI installs all 38 skills and exits 0. The exit code is not evidence here — the lockfile's
name set is.

```bash guide:exec id=skills
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"
: "${GUIDE_SKILLS_VERSION:?Phase 2 must answer GUIDE_SKILLS_VERSION}"

node --input-type=module -e '
const response = await fetch("https://raw.githubusercontent.com/mattpocock/skills/main/.claude-plugin/plugin.json");
if (!response.ok) { console.error(`could not read the upstream manifest (${response.status})`); process.exit(1); }
const manifest = await response.json();
const names = manifest.skills.map((path) => path.replace(/\/+$/, "").split("/").pop());
if (names.length === 0) { console.error("the upstream manifest declares no promoted skills"); process.exit(1); }
process.stdout.write(names.join(" "));
' > .vite-plus-skill-names

names=$(cat .vite-plus-skill-names)
echo "upstream declares $(echo "$names" | wc -w) promoted skills"

case "$GUIDE_PM" in
  pnpm) dlx() { pnpm dlx "$@"; } ;;
  npm) dlx() { npx --yes "$@"; } ;;
  yarn) dlx() { yarn dlx "$@"; } ;;
  bun) dlx() { bunx "$@"; } ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac
dlx "skills@$GUIDE_SKILLS_VERSION" add mattpocock/skills -y -a universal --json --skill $names > .vite-plus-skills.log 2>&1

# Record the commit that upstream was on while installing: the lockfile carries content
# hashes, not a revision.
git ls-remote https://github.com/mattpocock/skills.git refs/heads/main | cut -f1 > .vite-plus-skills-commit

node --input-type=module - <<'NODE'
import { readFileSync, existsSync } from "node:fs";

const raw = readFileSync(".vite-plus-skills.log", "utf8");
const start = raw.indexOf("[");
if (start < 0) { console.error("the installer printed no JSON result; see .vite-plus-skills.log"); process.exit(1); }
let depth = 0, end = -1;
for (let i = start; i < raw.length; i += 1) {
  if (raw[i] === "[") depth += 1;
  else if (raw[i] === "]") { depth -= 1; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) { console.error("the installer's JSON result is truncated"); process.exit(1); }
const results = JSON.parse(raw.slice(start, end));
const failed = results.filter((entry) => entry.status !== "installed");
if (failed.length) {
  console.error("skills that did not install:", failed.map((entry) => `${entry.name} (${entry.status})`).join(", "));
  process.exit(1);
}
console.log(`installer reported ${results.length} skills installed`);

const want = readFileSync(".vite-plus-skill-names", "utf8").trim().split(/\s+/).sort();
const lock = JSON.parse(readFileSync("skills-lock.json", "utf8"));
const got = Object.keys(lock.skills).sort();
const missing = want.filter((name) => !got.includes(name));
const extra = got.filter((name) => !want.includes(name));
if (missing.length || extra.length) {
  console.error(`lockfile does not match the upstream set: missing [${missing}] unexpected [${extra}]`);
  process.exit(1);
}
for (const name of got) {
  const entry = lock.skills[name];
  if (!entry.skillPath || !entry.computedHash) { console.error(`lockfile entry ${name} is incomplete`); process.exit(1); }
  if (!existsSync(`.agents/skills/${name}/SKILL.md`)) { console.error(`.agents/skills/${name}/SKILL.md is missing`); process.exit(1); }
}
console.log(`ok  ${got.length} skills installed, lockfile matches the upstream declaration`);
NODE
```

## Phase 4.5 — Decision point: run the skills setup now?

After the skills are in place, ask whether to run the toolkit's setup skill for this project.
Say what it will ask (issue tracker, triage labels, domain-document layout, agent brief), and
say plainly why the user has to trigger it: that skill is marked user-invocable only, so the
agent may execute its steps but cannot originate the request.

- **Yes** — the user runs `/setup-matt-pocock-skills`; the agent then follows that skill's own
  flow (explore → present → confirm → write) and must not overwrite existing document
  sections.
- **No** — continue; the inherited ADRs land in `docs/adr/` (the default the setup skill would
  otherwise negotiate), and the assumption is recorded in the provenance.

In an unattended run set `GUIDE_SETUP=no`; a `yes` there would ask a question that nobody is
present to answer.

```bash guide:exec id=setup-guard
set -euo pipefail
: "${GUIDE_SETUP:?Phase 4.5 must answer GUIDE_SETUP}"
case "$GUIDE_SETUP" in
  no) echo "ok  setup deferred to the user; inherited ADRs use docs/adr/" ;;
  yes)
    echo "GUIDE_SETUP=yes needs the user to invoke /setup-matt-pocock-skills; there is nobody to" >&2
    echo "answer its prompts in an unattended run, and this revision does not automate that flow." >&2
    exit 1
    ;;
  *) echo "GUIDE_SETUP must be yes or no, got '$GUIDE_SETUP'" >&2; exit 1 ;;
esac
```

## Phase 5 — Documents: constraints, reasons, traps, provenance

Four documents, each with one job:

- **`AGENTS.md`** — what to do. The generator's own marked block stays exactly as written,
  with one correction appended below it: `vp env doctor` exists only in the global CLI, which
  this project deliberately does not use. The rules that only one mode has are appended only in
  that mode: a frontend project gets the dev-proxy rules, the server modes the server ones, and
  the SSR shape the rendering ones on top.
- **`docs/adr/`** — why, and what would change the decision.
- **`docs/agent-notes.md`** — what is already known to bite, as facts rather than rules, in the
  same shape: the traps every mode shares, plus the ones this mode's stack brings with it.
- **`docs/provenance.md`** — what was actually installed and chosen, so a future anomaly can
  be attributed to a version instead of guessed at.

```bash guide:exec id=agents-md
set -euo pipefail

# The constraints section is appended, never merged: the marked block above it belongs to the
# tool and gets rewritten on upgrade, so anything written inside it would be silently lost.
cat >> AGENTS.md <<'AGENTS'

## Project constraints

Engineering rules for this project. They are not suggestions, and each one exists because the
alternative fails quietly.

### Toolchain

- The toolchain is **project-local**: `vite-plus` is a devDependency and every command is
  `./node_modules/.bin/vp …` or a package script. Never install Vite+ globally, and never run
  a bare `vp` from another project's toolchain.
- **Pin every version.** `latest` is not a version. Upgrade the toolchain with `vp migrate`,
  not with a package-manager update, and re-read `docs/provenance.md` afterwards.
- Read the documentation for the **installed** version — the provenance record says which one
  that is. Other versions' documentation describes other behaviour.
- Do not hand-write toolchain configuration: it is generated, and after any hand edit run
  `vp fmt` before trusting any other command's output.
- `vp env doctor` (mentioned in the tool's own instructions above) does **not** exist in a
  project-local setup. Use `vp --version` and `vp toolchain` instead.
- A green result has to be meaningful: a `vp check` without type-aware linting checks no
  types, and a `vp test` with no test files proves nothing. Fix the configuration, not the
  expectation.

### Path aliases

- Import cross-directory modules as `#/…` (extensionless), resolved from the project root:
  `#/src/…` in a frontend project, `#/server/…` in a backend one. The only alias mechanism is
  the `imports` map in `package.json`. Never add `paths` to a tsconfig, `resolve.alias` to the
  Vite config, or `resolve.tsconfigPaths` — each one silently out-ranks `imports` for some
  consumer, so the type checker and the bundler can disagree without either going red.
- Keep the `types` branch first in that map: TypeScript never probes extensions, so a
  `default`-only map makes every aliased import a type error while dev and build stay green.

### Configuration

- Configuration must earn its place: delete what equals a default, keep what has an effect.
- Deleting configuration requires re-running the verification **and** re-proving that type
  checking still catches a deliberate error. "Looks like a default" is a hypothesis, not
  evidence.
AGENTS

# The mode-specific rules are appended as their own block: a frontend project has no server to
# describe and a backend project has no dev proxy, so each mode gets the rules that are true of
# it instead of the union of all of them.
case "$GUIDE_MODE" in
  frontend)
    cat >> AGENTS.md <<'FRONTEND'

### Development proxy

- `DEV_PROXY` lives in `.env` and is committed; personal overrides go in `.env.local` or
  `.env.development.local`. The one-line guard in `vite.config.ts` is deliberate: without it,
  a missing variable makes `/api/*` answer `200` with this app's HTML instead of failing.
- The proxy prefix is a regular expression and is written `/api/` with the trailing slash.
- Verification of the proxy means a request through the **frontend** port, asserting JSON —
  an HTML answer on an `/api` path is the failure mode, not a success.

### Tests

- This profile ships no test harness by decision: a page-iteration loop is faster without a
  suite that goes stale. Adding one is an explicit decision — say what it is for, and record
  the reason in an ADR.
FRONTEND
    ;;
  backend)
    cat >> AGENTS.md <<'BACKEND'

### Server

- The server is **Nitro v3 as a Vite plugin**, registered in the `plugins` array of
  `vite.config.ts`. An import without that call is silently inert: `vp check` still exits 0 and
  every route 404s.
- Routes are files under `server/routes/`, and their URL is the file path without any prefix.
  `server/api/` carries an `/api` prefix by default; do not move a route there unless that
  prefix is what you want.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already
  cover. A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check`
  fail on the build's own artefacts, because those commands take their file set from the ignore
  rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports,
  so an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro`
  itself is a devDependency, like the rest of the toolchain.

### Tests

- The runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files. That
  is the configured state, not coverage — a green test command means the runner works.
- Tests live in `tests/` at the project root, never under `server/`: Nitro compiles every file
  under `server/routes/` and `server/api/` into a route, so a test in there would be served
  rather than run.
BACKEND
    ;;
  fullstack)
    cat >> AGENTS.md <<'FULLSTACK'

### Server

- The server is **Nitro v3 as a Vite plugin**, registered inside the scaffold's `lazyPlugins`
  array in `vite.config.ts`: `plugins: lazyPlugins(() => [nitro(), react()])`. A second
  top-level `plugins` key is a duplicate object key — JS keeps one of them, and the plugin it
  drops is silently gone.
- The API is **same-origin**: routes live under `server/routes/api/`, which is why they answer
  `/api/…`. There is no `DEV_PROXY` and no proxy in this project — the page and the API are one
  origin, and a proxy here would be a second mechanism for a problem that does not exist.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already
  cover. A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check`
  fail on the build's own artefacts, because those commands take their file set from the ignore
  rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports,
  so an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro`
  itself is a devDependency, like the rest of the toolchain.

### Rendering (SSR)

- The page is rendered by `src/entry-server.tsx` and hydrated by `src/entry-client.tsx`; the two
  must render the same tree, because hydration compares the browser's tree with the server's.
- There is deliberately **no `index.html`**. Nitro uses that file as the renderer template, and
  the `<!--ssr-outlet-->` comment inside it is the only channel into the page: a template without
  the comment is still detected, still logged, and still answers `/` with the plain client shell
  at exit 0. Adding a template back re-introduces a silent failure whose only warning is the
  smoke test's missing render marker.
- The SSR entry default-exports an object with a `fetch` method — there is no `render()`
  contract — and the document it returns must carry the client's assets (`?assets=client` and
  `?assets=ssr`, merged), which is why `environments.client.build.rollupOptions.input` names
  `src/entry-client.tsx`: without it Vite has no client entry to build.
- The SSR entry is the catch-all: any path no route claims is rendered by it, including an
  unknown `/api/…` path. API routes still answer first.

### Tests

- The runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files. That
  is the configured state, not coverage — a green test command means the runner works.
- Tests live in `tests/` at the project root, never under `server/`: Nitro compiles every file
  under `server/routes/` and `server/api/` into a route, so a test in there would be served
  rather than run.
FULLSTACK
    ;;
esac

cat >> AGENTS.md <<'AGENTS'

### Code organisation

- Business code stays where it is used: one directory per feature — a page, in a frontend
  project — private until something else needs it. Shared code only when the deletion test
  (removing it scatters complexity back into N callers) or the cross-cutting test (auth, error
  contract, data access, telemetry, i18n) says it must exist.
- Dependencies point one way: features → shared. Shared code never imports a feature, and
  features never import each other.

### Defensive code

- Write a guard only for a state that has actually been observed and whose failure is silent.
  "It might happen" is not a reason; a loud failure for a state that cannot occur is noise.

See `docs/agent-notes.md` for the traps behind these rules, and `docs/adr/` for the reasoning.
AGENTS

grep -q '<!--VITE PLUS START-->' AGENTS.md
grep -q '## Project constraints' AGENTS.md
echo "ok  constraints section appended, tool-owned block preserved"
```

```markdown guide:file path=docs/adr/0001-toolchain.md
# The toolchain is project-local and pinned

Every project generated by this guide carries its own Vite+ toolchain as a devDependency, with
every version pinned, and resolves path aliases through a single mechanism. Nothing is
installed globally, so an initialized project cannot be changed by whatever toolchain the
machine happens to have, and a build three weeks from now resolves exactly what it resolved
today.

## Considered Options

- **A global `vp` install** — rejected: it mutates the machine and makes the project inherit
  an arbitrary version. Measured: a global 0.3.3 and a project-local 1.0.0-rc.0 behave
  differently on the same directory.
- **`latest` version ranges** — rejected: `latest` has resolved to prereleases and to older
  alphas, and the difference shows up as behaviour, not as an error.
- **Scaffolding with plain `create-vite` and writing the toolchain config by hand** —
  rejected: `create-vite` writes no `vite.config.ts`, so the config that makes the check
  type-aware would be hand-written, and its absence is silent — a green check that checks
  nothing.
- **`tsconfig` `paths` or a Vite `resolve.alias` for path aliases** — rejected: two mechanisms
  can point at two different files, and the type checker, the bundler and the shipped output
  each follow a different one without any of them failing.

## Consequences

- Bootstrap is ephemeral and explicit: `pnpm dlx --package=vite-plus@<version> vp create …`,
  and everything afterwards runs `./node_modules/.bin/vp`.
- The prerelease nature of the toolchain is disclosed at the version decision point and
  recorded in `docs/provenance.md`.
- `vp env doctor`, `vp upgrade` and `vp implode` are global-only subcommands and are therefore
  absent here; `vp migrate` is how the toolchain moves forward.
- Configuration is trimmed to what has an effect, and every removal is re-proved with a
  deliberate type error, because a check that no longer type-checks reports success.
```

```markdown guide:file path=docs/adr/0002-code-locality.md
# Business code stays local; sharing has to earn its keep

Business code is written where it is used: each page or feature owns its implementation. A
shared module exists only after passing one of two tests — the deletion test (removing it
scatters complexity back across N callers, rather than making complexity vanish) or the
cross-cutting test (auth, the error contract, data access, telemetry and i18n must be
identical everywhere). We trade leverage for locality on purpose: in agent-driven iteration
the scarce resources are context and blast radius, duplication is cheap to consolidate once
real examples exist, and a premature abstraction built from two examples is expensive to undo.

## Considered Options

- **Extract on the second caller (DRY first)** — rejected: it optimises for a maintainer who
  already knows the codebase, at the cost of each page's independence, and freezes a guess the
  moment it has N callers.
- **No shared code at all** — rejected: cross-cutting concerns would be re-implemented per page
  and drift, so pages would disagree about 401 handling, error shape and telemetry — a
  correctness and security problem, not a style preference.

## Consequences

- A page can be changed or deleted without reading another page; the unit of change,
  knowledge and verification is one directory.
- The costs are accepted knowingly: real duplication, and no test-level enforcement — the
  static check cannot see code locality.
- The only machine-checkable half is dependency direction: pages may import shared code, never
  the reverse, and never each other.
- Architecture-level code is an explicit list, not a judgement call: routing and the app shell,
  the API client with its auth and error contract, telemetry, design primitives, API type
  contracts, and server framework plumbing.
```

```markdown guide:file path=docs/adr/0003-server-foundation.md when=mode:backend|fullstack
# Nitro v3 is the server foundation, even though v3 is prerelease

Any server side in this project is built on Nitro v3 — the `nitro` package — consumed as a Vite
plugin inside the project Vite+ created, with the server directory at the project root. Nitro v3
has no stable release — every published version carries a beta or alpha suffix — and we accept
the prerelease, because the alternative is not "the same thing, more safely" but a different
package with a different API and a different name.

## Considered Options

- **`nitropack` v2 (stable)** — rejected: v3 renamed the package, so choosing v2 means building
  against v2's API rather than derisking v3.
- **A hand-rolled `node:http` server** — rejected: the fullstack modes need a server that
  shares one project and one build with the Vite frontend, which is what Nitro's Vite plugin
  provides.
- **Scaffolding with `create-nitro-app` and migrating Vite+ in afterwards** — rejected: it
  rewrites the project around Nitro's own starter, and that starter fails `vp build` until a
  migration runs.
- **Nitro's default output directory (`.output/`)** — rejected: the scaffold's ignore rules do
  not cover it, and `vp fmt` and `vp check` take their file set from those rules, so a build
  would make the static check fail on Nitro's own output. `output: { dir: "dist" }` reuses the
  `dist` rule the scaffold already ships, and the run adds no ignore rule.

## Consequences

- The prerelease is surfaced as a decision point rather than hidden, and the resolved version
  is recorded in `docs/provenance.md`; the dependency is never left at `latest`.
- The plugin is registered by **calling** `nitro()` in `vite.config.ts`'s `plugins` array: the
  scaffold writes no such key, and an import without the call is silently inert — exit 0, and
  every route 404s. Where that array comes from is the base template's business: a framework
  base wraps its own in `lazyPlugins(() => […])`, and a second top-level key there is a duplicate
  key that silently drops a plugin.
- Server code imports explicitly — v3 has no auto-imports — and server tests never live under
  the directory Nitro compiles into routes (`server/routes/` and `server/api/`): a file there is
  compiled into a route instead of being run.
- Server routes live in `server/routes/`, and their URL is their path under it: `routes/hello.ts`
  is `/hello`, and `routes/api/hello.ts` is `/api/hello` because that is where the file sits.
  Nothing adds a prefix implicitly — `server/api/` is the directory that does, and a project that
  wants `/api/…` says so in the file path instead of relying on that default.
- Build output goes to a directory the ignore rules already cover, so a fresh build cannot
  make the static check fail. The output directory is emptied on every build, so nothing else
  may be stored there.
```

```markdown guide:file path=docs/adr/0004-ssr-shape.md when=mode:fullstack
# The SSR shape renders the document on the server, and keeps no `index.html`

This project renders its page on the server: `src/entry-server.tsx` default-exports an object
with a `fetch` method that returns the whole document, `src/entry-client.tsx` hydrates the same
tree in the browser, and the API the page calls belongs to the same server — one origin, so there
is no dev proxy and no `DEV_PROXY`. The shape keeps **no `index.html`**: with no template, Nitro
installs its built-in renderer and passes the SSR entry's `Response` through, status, headers and
body included.

The alternative — keeping an `index.html` with an `<!--ssr-outlet-->` comment — was rejected
because its failure is silent. Nitro replaces that comment with the entry's output using a string
replace, so a template without the comment gets no insertion and no warning, while the entry is
still detected and announced: `/` answers the plain client shell and everything exits 0. Deleting
the template removes that class of error instead of guarding against it, and verification asserts
the rendered marker on top.

## Considered Options

- **`index.html` with `<!--ssr-outlet-->`** — rejected: it makes one comment the switch between a
  rendered page and a client-only shell, and the failure is silent. It is the right choice only
  when an existing `index.html` has to remain the source of truth.
- **A plain base with server-side string templating** — rejected: there is no component tree to
  render or hydrate, and the client module would replace the server's markup as soon as it runs.
- **A separate frontend and backend, joined by a proxy** — rejected: this project is one
  deployment; a proxy would exist only to undo a split it does not have.
- **Setting Vite's `build.outDir` as well** — rejected: the Nitro plugin already points the client
  build at its public directory, and a second output directory duplicates assets into a nested,
  publicly reachable tree.

## Consequences

- The client entry is named in `environments.client.build.rollupOptions.input`; with no template,
  that config is the only thing that says which file the browser entry is. The document is
  assembled from two asset lists — `?assets=client` and `?assets=ssr` — combined with `merge()`.
- The SSR entry is the catch-all: any path no route claims renders the same document, including
  an unknown `/api/…` path, while routes under `server/routes/api/` answer first.
- One TypeScript program covers both halves (`src/`, `server/`, `tests/` and the config files),
  because the build script's `tsc` only checks what the program includes.
- The build emits the client bundle in `dist/public/assets/` and the SSR renderer in
  `dist/server/_ssr/`; `_ssr/` exists only in this shape's build, and
  `node dist/server/index.mjs` serves both.
- Browser hydration itself is not verified here: verification asserts the server-rendered
  document, the render marker, and that the client bundle is emitted and referenced.
```

```markdown guide:file path=docs/agent-notes.md
# Agent notes — known traps and version facts

Facts about this project's stack, recorded because each one has already cost someone time.
Rules live in `AGENTS.md`; the reasoning lives in `docs/adr/`.

## Two engines, one green light

- `vp check` type-checks with the TypeScript Go engine (`oxlint-tsgolint`), while the build
  script runs `tsc -b` — two different engines. A green `vp check` does not imply a green
  build, and vice versa, which is why verification runs both.
- `vp check` reports formatting problems *before* it reports lint or type problems, and stops
  there: a run that fails on formatting tells you nothing about types. Run `vp fmt` first.
- `vp check` only type-checks when `lint.options.typeAware` and `typeCheck` are both `true`
  in `vite.config.ts`. Without them it prints `pass` while checking nothing.

## Modules and aliases

- Path aliases are `package.json` `imports` only. If a `paths` block, `resolve.alias` or
  `resolve.tsconfigPaths` ever appears, the type checker and the bundler can resolve the same
  specifier to different files and nothing goes red.
- The `types` branch must be the first key of the `#/*` entry. TypeScript never probes
  extensions: with a `default`-only map, every extensionless `#/…` import is `TS2307` in the
  type checker while dev, tests and build keep working.
- `#/…` specifiers need Node >= 24.14.0. Plain `node` cannot execute an extensionless aliased
  import — only the bundler and the test runner can — so scripts run directly by Node use
  `#/path/file.ts`.

## Versions

- TypeScript is 7.x (`^7.0.2`); `tsc --version` prints `7.0.2`.
- If this project uses the TypeScript 6 API bridge (`typescript-native-bridge`, needed by
  `vue-tsc` and friends), `tsc --version` prints `6.0.3` while the package version carries
  `-bridge…`. Never assert the TypeScript version from that string; check the resolved package
  instead.
- `vite-plus` is a devDependency, never a global install. `vp env`, `vp upgrade` and
  `vp implode` do not exist in a project-local setup — the tool's own instructions suggest
  `vp env doctor`, which is one of them.

## Package managers

- The project declares its package manager in `devEngines`. Running another one inside the
  project fails with `EBADDEVENGINES` — including `npx` — so use the project's own manager
  (`pnpm dlx …`, `pnpm install`, `pnpm run …`).
- `pnpm install` under `CI=1` uses a frozen lockfile and fails when the manifest changed; pass
  `--no-frozen-lockfile` in that case.
- Do not move `vite-plus` with a package-manager update: an exact pin does not move, and the
  supported path is `vp migrate`.

## Skills and setup

- Skills install through the `skills` CLI with `--skill name1 name2` (a space). The
  `--skill=name` spelling is silently ignored by 1.7.0: it installs every skill in the source
  repository with exit 0. Exit codes lie here — verify the lockfile's name set instead.
- `skills-lock.json` records content hashes, not a commit. If you need to know which upstream
  revision is installed, compare the hashes or read the revision recorded in
  `docs/provenance.md`.
- If the issue tracker is this project's GitHub repository and it was configured through the
  setup skill, read blocking edges with `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary`
  or `gh issue view <n> --json blockedBy`. The generated `docs/agents/issue-tracker.md` shows
  a REST field name that `gh issue view --json` rejects; do not patch that generated file —
  re-running the setup skill regenerates it from its seed.
- `vp test` exits 1 when it finds no test files, which is why a project that has a test script
  passes `--passWithNoTests` until there is something to run. A green test command over an empty
  suite means the runner is wired, not that anything is covered.
```

```bash guide:exec id=notes-proxy when=mode:frontend
set -euo pipefail

# Traps that only exist in a project whose backend is somewhere else.
cat >> docs/agent-notes.md <<'NOTES'

## The development proxy

- `DEV_PROXY` is read from `.env` by `loadEnv(mode, process.cwd(), "")`, so it is visible to
  both `dev` and `build`. A `production`-mode build must not miss it: put the value in `.env`,
  and any personal override in `.env.local` or `.env.development.local` (both ignored).
- The guard `if (!env.DEV_PROXY) throw …` is deliberate and unconditional. Without it an unset
  variable makes `/api/*` return `200` with this app's HTML and the dev log stays silent.
- The proxy prefix is a regular expression: `/api/` with the trailing slash, or `/apix/…` gets
  proxied too.
- A dead backend produces `502`, and an unknown `/api/*` path produces `404` — never the
  single-page-app fallback. A `200` with `text/html` on an `/api` path means the proxy is not
  running.
NOTES
echo "ok  dev-proxy traps appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-server when=mode:backend|fullstack
set -euo pipefail

# Traps that only exist once a Nitro server is part of the project.
cat >> docs/agent-notes.md <<'NOTES'

## The server (Nitro)

- Nitro v3 has no stable release: every published version carries a `-beta`/`-alpha` suffix and
  `latest` is itself a prerelease, so the pin is the only thing holding the version still.
- `serverDir` defaults to `false`: nothing is scanned until `nitro.config.ts` points at
  `./server`. Inside it, `routes/` maps a file to its path with no prefix (`routes/hello.ts` →
  `/hello`) and `api/` maps it with `/api`. A test file in either directory is compiled into a
  route instead of being run — which is why `tests/` sits at the project root.
- The plugin has to be **called** in `plugins`, not merely imported: an import without the call
  is inert — exit 0, and every route 404s. Where that array lives depends on the scaffold base,
  so the call goes where the file already keeps its plugins; adding a second top-level `plugins`
  key instead is a duplicate object key, and JS keeps one of them.
- Production output is `dist/` (`output: { dir: "dist" }`), not Nitro's default `.output/`,
  which the ignore rules do not cover — `vp fmt` and `vp check` take their file set from those
  rules and would fail on the build's own artefacts. The output directory is emptied on every
  build, so never keep anything else in `dist/`.
- Do not also set Vite's `build.outDir`: the plugin already points the client build at Nitro's
  public directory, and an explicit `build.outDir` is registered as one more public-assets
  source, so Nitro copies its own output into itself (`dist/public/public/**`, served under
  `/public/…`). The build still exits 0 while it happens.
- Remove a stale `.output/` if one ever appears: `vp preview` and `nitro preview` resolve the
  output directory through `node_modules/.nitro/last-build.json`, which a fresh clone does not
  have, and fall back to serving `.output/` silently.
- v3 has no auto-imports: handlers import `defineHandler` from `nitro` explicitly, and types
  come from the package's own exports (`nitro`, `nitro/h3`, `nitro/types`).
- The dev server's default port comes from Nitro (`3000`), not from Vite (`5173`), once the
  plugin is in play. Pass `--port` when the port matters.
- The build script's `tsc` only checks what the tsconfig `include` lists. The config here
  extends `nitro/tsconfig` and lists the file set this shape needs; without `server` in that
  list, `tsc` passes while never looking at a handler.
- The production artefact is `node dist/server/index.mjs` (the `PORT` environment variable is
  honoured by the node-server preset); the Nitro CLI is not needed to run it.
- With the plugin wired, `vp test` ends with `close timed out after 10000ms … Tests closed
  successfully but something prevents 2 Vite servers from exiting`. It costs about ten seconds
  and exits 0 — a warning, not a failure.
NOTES
echo "ok  server traps appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-backend when=mode:backend
set -euo pipefail

# The one trap that is only true of a project with no client at all.
cat >> docs/agent-notes.md <<'NOTES'

## No client

- There is no client build phase in this project (no `index.html`), and `/` answers `404`
  because nothing renders a page — that is the configured state, not a broken project.
NOTES
echo "ok  no-client trap appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-ssr when=mode:fullstack
set -euo pipefail

# Traps that only exist once the project renders a page on the server.
cat >> docs/agent-notes.md <<'NOTES'

## Rendering (SSR)

- There is no `index.html` on purpose. With no template, Nitro installs its built-in renderer at
  build time and the SSR entry's `Response` is passed through — status, headers and body. That
  shape's fingerprint in the output is `dist/server/_ssr/ssr.mjs` next to a
  `_chunks/ssr-renderer.mjs` chunk. A build that used a template emits neither: its server bundle
  carries an inlined `_chunks/renderer-template.mjs`, and the SSR service it built stays in
  `node_modules/.nitro/vite/services/ssr/`. The shape is therefore checkable at the artefact
  level, not only by looking at `/`.
- The template channel is a silent switch. If an `index.html` is present, Nitro uses it as the
  renderer template and replaces the `<!--ssr-outlet-->` comment in it with the SSR entry's
  output — a `String.replace`, so a template without the comment gets no insertion and no
  warning. The entry is still announced (``Using `src/entry-server.tsx` as vite ssr entry.``),
  `/` answers the plain client shell, and everything exits 0. The render marker
  (`<h1>SSR works</h1>` in the skeleton) is what notices that: a 200 is not evidence.
- The SSR entry's contract is `export default { fetch(request) }` — no `render()`, no h3 app, no
  `server.ts` entry. The service loader throws
  ``[nitro] Vite service "ssr" entry does not export a `fetch` handler.`` when the default
  export has no callable `fetch`.
- `environments.client.build.rollupOptions.input` must name `src/entry-client.tsx`: with no
  `index.html`, that config is the only thing that says which file is the client entry, and
  `?assets=client` would have nothing to describe without it. The `*?assets` module declarations
  ship with `nitro/vite/types`, which `nitro/vite` itself imports, so having `vite.config.ts` in
  the program is enough.
- The document is assembled from two asset lists — `?assets=client` (the browser entry and its
  CSS) and `?assets=ssr` (the CSS the server render itself pulled in) — combined with `merge()`.
  In dev the links point at source modules with `data-vite-dev-id`; in a build they are hashed
  `/assets/…` URLs.
- The SSR bundle lands in `dist/server/_ssr/ssr.mjs` and the client bundle in
  `dist/public/assets/`; `_ssr/` exists only in an SSR build, which is the cheap way to tell
  this shape's output from a client-only one. `node dist/server/index.mjs` serves both the
  document and the client's hashed assets on one port.
- One tsconfig covers both halves: it extends `nitro/tsconfig` and includes `src`, `server`,
  `tests` and the config files, with `tsBuildInfoFile` under `node_modules/.tmp/` so the build
  script's cache file stays out of the tree. The build script's `tsc` only checks what that
  program includes, so a config that dropped `server` would leave every handler unchecked while
  `vp build` stayed green.
- The SSR entry is the catch-all route: any path no route claims renders the same document —
  including an unknown `/api/…` path, which answers the page rather than a 404. Routes under
  `server/routes/api/` answer first, so a route that exists is never shadowed.
- `react(only-export-components)` warns on `export default {` in the SSR entry. It is a warning
  at exit 0, naming the export does not silence it, and the whole project should not be silenced
  for it — expected noise.
- Hydration is **not verified** in this project's verification: it asserts the server-rendered
  document, the render marker, that the client bundle is emitted, and that the document
  references it. What a browser does with that — mismatches, event handlers, HMR after
  hydration — needs a browser this project does not check with.
NOTES
echo "ok  SSR traps appended to docs/agent-notes.md"
```

```bash guide:exec id=provenance
set -euo pipefail
: "${GUIDE_MODE:?}"; : "${GUIDE_LAYOUT:?}"; : "${GUIDE_FRAMEWORK:?}"
: "${GUIDE_PM:?}"; : "${GUIDE_VP_VERSION:?}"; : "${GUIDE_TS_VERSION:?}"
: "${GUIDE_SKILLS_VERSION:?}"; : "${GUIDE_SETUP:?}"

vite_plus_version=$(node -p 'require("./node_modules/vite-plus/package.json").version')
typescript_version=$(node -p 'require("./node_modules/typescript/package.json").version')
create_vite_version=$(grep -oE 'create-vite[ @]+[0-9]+\.[0-9]+\.[0-9]+' .vite-plus-create.log | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)
skills_commit=$(cat .vite-plus-skills-commit)
skill_count=$(node -p 'Object.keys(require("./skills-lock.json").skills).length')
installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# What the record says depends on the mode: a backend project has a server and no proxy, a
# frontend project the other way round, and the SSR shape has both halves in one origin. Naming
# another mode's fact here — a proxy target that does not exist, or a server that was never
# installed — would put a wrong fact in the one document whose whole job is to be the record.
toolchain_rows="| vite-plus | ${vite_plus_version} | \`${GUIDE_VP_VERSION}\` (prerelease) |
| TypeScript | ${typescript_version} | \`${GUIDE_TS_VERSION}\` |
| create-vite | ${create_vite_version:-see note below} | \`create-vite@latest\`, unpinnable upstream |"
if [ "$GUIDE_MODE" = "backend" ] || [ "$GUIDE_MODE" = "fullstack" ]; then
  nitro_version=$(node -p 'require("./node_modules/nitro/package.json").version')
  # The extractor's rule is that a `$GUIDE_…` without a default must be answered by every
  # profile, and this step runs in every profile; the answer is only needed in this branch, so it
  # is read into a local with a default and then required here.
  nitro_pin=${GUIDE_NITRO_VERSION:-}
  [ -n "$nitro_pin" ] || { echo "GUIDE_NITRO_VERSION was never answered (Phase 2)" >&2; exit 1; }
  toolchain_rows="${toolchain_rows}
| nitro | ${nitro_version} | \`${nitro_pin}\` (prerelease) |"
fi
if [ "$GUIDE_MODE" = "backend" ]; then
  choice_rows="| Scaffold base | ${GUIDE_FRAMEWORK} (the client it writes is pruned in the same run: a backend project has no frontend) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease) |"
  server_step="4. Server: the scaffold's client pruned (\`src/\`, \`public/\`, \`index.html\`), \`nitro\` pinned and installed, \`serverDir: \"./server\"\` with \`output: { dir: \"dist\" }\` in \`nitro.config.ts\`, and \`nitro()\` registered in the \`plugins\` array of \`vite.config.ts\`."
  verify_step="8. Verification: format, static check with a live type checker, the build script with its output in \`dist/\`, and smoke tests of the dev server and of the built \`dist/server/index.mjs\`. Recorded ${installed_at}."
elif [ "$GUIDE_MODE" = "fullstack" ]; then
  choice_rows="| Scaffold base | ${GUIDE_FRAMEWORK} |
| Rendering | SSR: the document is rendered by \`src/entry-server.tsx\` and hydrated by \`src/entry-client.tsx\` (there is no \`index.html\` template) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease) |
| API origin | same origin as the page (\`/api/…\`); no dev proxy, no \`.env\` |"
  server_step="4. SSR shape: \`index.html\` and the SPA entry deleted, \`src/entry-server.tsx\` + \`src/entry-client.tsx\` + \`src/App.tsx\` written, \`nitro\` pinned and installed, \`serverDir: \"./server\"\` with \`output: { dir: \"dist\" }\`, \`nitro()\` registered inside the scaffold's \`lazyPlugins\` array, and the client entry declared in the client environment. No dev proxy: the page and the API share one origin."
  verify_step="8. Verification: format, static check with a live type checker over both \`src/\` and \`server/\`, the build script with its client bundle in \`dist/public/assets\` and its SSR renderer in \`dist/server/_ssr\`, and smoke tests of the built \`dist/server/index.mjs\` and of the dev server, asserting the render marker and the same-origin \`/api/hello\`. Recorded ${installed_at}."
else
  choice_rows="| Framework template | ${GUIDE_FRAMEWORK} |
| Dev proxy target | ${GUIDE_DEV_PROXY:-not applicable} |"
  server_step="4. Dev proxy: \`DEV_PROXY\` in \`.env\`, transformer wired with a guard."
  verify_step="8. Verification: format, static check with a live type checker, build script, and a dev-server smoke test through the proxy. Recorded ${installed_at}."
fi

mkdir -p docs
cat > docs/provenance.md <<PROVENANCE
# Provenance — how this project was generated

One initialization, recorded so that a future anomaly can be attributed to a version or a
choice instead of guessed at. Versions here are the ones that actually resolved.

## Choices made at initialization

| Decision | Answer |
| --- | --- |
| Mode | ${GUIDE_MODE} |
| Layout | ${GUIDE_LAYOUT} |
${choice_rows}
| Package manager | ${GUIDE_PM} |
| Skills setup run now | ${GUIDE_SETUP} (inherited ADRs use \`docs/adr/\` when deferred) |

## Toolchain that resolved

| Component | Version | Pinned as |
| --- | --- | --- |
${toolchain_rows}

create-vite is the one unpinnable piece: \`vp create\` resolves it from \`create-vite@latest\`, and
upstream offers no way to pin it (the version this run used is recorded above when the package
manager printed it, which it only does on a fresh resolve).

Everything is a project dependency: no global CLI is required to build, check or run this
project. Read documentation for the versions above, not for \`latest\`.

## Agent skills

| Fact | Value |
| --- | --- |
| Source | \`mattpocock/skills\` (https://github.com/mattpocock/skills) |
| Revision at install time | \`${skills_commit}\` |
| Skills installed | ${skill_count} (the promoted set declared by the upstream plugin manifest) |
| Installer | \`skills@${GUIDE_SKILLS_VERSION}\` |
| Lockfile | \`skills-lock.json\` (content hashes; no revision recorded by the installer) |

The skill names are resolved from the upstream manifest at initialization time rather than
frozen in the guide, so an upstream rename or promotion is picked up instead of pinned.
Installed content lives in \`.agents/skills/\`.

## Steps executed

1. Preflight: empty target, Node version, package managers actually available, global Vite+ detected and avoided.
2. Decision points: mode/layout/framework/package manager; versions (prereleases disclosed).
3. Skeleton: \`vp create vite:application\` + \`--template ${GUIDE_FRAMEWORK}\`, alias map, configuration trimmed, ignore rules refined, dependencies installed.
${server_step}
5. Skills: upstream set resolved at run time, installed, lockfile verified against that set.
6. Setup decision: recorded above.
7. Documents: constraints in \`AGENTS.md\`, inherited ADRs in \`docs/adr/\`, traps in \`docs/agent-notes.md\`, this file.
${verify_step}

## If something looks wrong

Start here before changing code: the version table above is the shortest path to the right
documentation, and \`docs/agent-notes.md\` lists the failures that are known to be silent.
PROVENANCE

rm -f .vite-plus-create.log .vite-plus-skills.log .vite-plus-skill-names .vite-plus-skills-commit
echo "ok  docs/provenance.md written"
```

## Phase 6 — Verify (the assertion set)

Run this as one script and stop if any part of it fails. A red result is a report, not a task
list: do not adjust the project until the verification agrees with it. This is the assertion
set for one initialization; the E2E harness runs this exact text rather than keeping its own
copy of these checks, because a second copy would be a second truth.

The proxy part of the frontend smoke test calls the backend named by `GUIDE_DEV_PROXY`, so that
backend has to be reachable while this runs. If it is not, the proxy answers `502` and
verification fails — which is the correct outcome, not a reason to skip the check. The server-side
smokes need nothing external: they start the artefact the build just produced, then the dev
server, and assert what each one answers. In the SSR shape that assertion is the **render marker**
— markup only the server-side render can produce — because a `200` alone is exactly what the
silent client-shell degradation returns.

```bash guide:verify id=verify
set -euo pipefail
: "${GUIDE_MODE:?}"; : "${GUIDE_PM:?}"
GUIDE_DEV_PORT=${GUIDE_DEV_PORT:-5173}   # Vite's own default; override only to dodge a busy port
export GUIDE_DEV_PORT GUIDE_MODE

VP=./node_modules/.bin/vp
pm_run() {
  case "$GUIDE_PM" in
    pnpm) pnpm "$@" ;;
    npm) npm "$@" ;;
    yarn) yarn "$@" ;;
    bun) bun "$@" ;;
    *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
  esac
}

step() { printf '\n== %s ==\n' "$*"; }

# An answer only one mode reads is checked in that mode: the frontend smoke goes through a proxy
# to a backend this project does not own, while the backend and SSR smokes call their own server.
case "$GUIDE_MODE" in
  frontend)
    [ -n "${GUIDE_DEV_PROXY:-}" ] || { echo "GUIDE_DEV_PROXY was never answered (Phase 3.5)" >&2; exit 1; }
    [ -n "${GUIDE_PROXY_SMOKE_PATH:-}" ] || { echo "GUIDE_PROXY_SMOKE_PATH was never answered (Phase 3.5)" >&2; exit 1; }
    export GUIDE_DEV_PROXY GUIDE_PROXY_SMOKE_PATH
    ;;
  backend|fullstack) ;;
  *) echo "no verification is implemented for mode '$GUIDE_MODE'" >&2; exit 1 ;;
esac

step "format"
$VP fmt

step "static check (format + lint + types)"
$VP check

step "build (the project's own build script)"
pm_run run build

step "the build output is where it belongs"
case "$GUIDE_MODE" in
  frontend)
    [ -f dist/index.html ] || { echo "the build produced no dist/index.html" >&2; exit 1; }
    echo "ok  dist/index.html"
    ;;
  backend)
    [ -f dist/server/index.mjs ] || { echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/, and the ignore rules do not cover it" >&2; exit 1; }
    echo "ok  dist/server/index.mjs and dist/nitro.json, with no .output/ beside them"
    ;;
  fullstack)
    # Both halves have to be in the output: the client bundle the document references, and the SSR
    # renderer the server bundle loads. `_ssr/` exists only in an SSR build — a client-only build
    # leaves it out even when everything else about the server looks right.
    [ -f dist/server/index.mjs ] || { echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
    [ -f dist/server/_ssr/ssr.mjs ] || { echo "the build produced no SSR renderer (dist/server/_ssr/ssr.mjs) — this is a client-only build" >&2; exit 1; }
    [ -n "$(ls dist/public/assets/*.js 2>/dev/null)" ] || { echo "the build produced no client bundle under dist/public/assets" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/, and the ignore rules do not cover it" >&2; exit 1; }
    echo "ok  client bundle in dist/public/assets, the SSR renderer in dist/server/_ssr, no .output/ beside them"
    ;;
esac

step "static check after the build"
# `vp fmt` and `vp check` take their file set from the ignore rules, so this second check is also
# the assertion that the build output really landed somewhere ignored.
$VP check

step "tests"
if node -e 'process.exit(require("./package.json").scripts?.test ? 0 : 1)'; then
  pm_run run test
else
  echo "no test script in this profile - nothing to run"
fi

step "smoke: the server that was built, and the dev server"

prod_pid=""
dev_pid=""
cleanup() {
  if [ -n "$prod_pid" ]; then kill "$prod_pid" 2>/dev/null || true; wait "$prod_pid" 2>/dev/null || true; fi
  if [ -n "$dev_pid" ]; then kill "$dev_pid" 2>/dev/null || true; wait "$dev_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT

wait_ready() {  # wait_ready <url> <log>
  for _ in $(seq 150); do
    if node -e "fetch('$1').then(() => process.exit(0)).catch(() => process.exit(1))" 2>/dev/null; then
      return 0
    fi
    sleep 0.4
  done
  echo "nothing answered at $1" >&2
  tail -20 "$2" >&2
  return 1
}

smoke() {  # smoke <base-url> <description-of-the-server>
  BASE_URL="$1" WHAT="$2" node --input-type=module - <<'NODE'
const base = process.env.BASE_URL;
const what = process.env.WHAT;
const path = process.env.GUIDE_PROXY_SMOKE_PATH ?? "";
const failures = [];
const get = async (url) => {
  const response = await fetch(url);
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
};

if (process.env.GUIDE_MODE === "frontend") {
  const app = await get(`${base}/`);
  if (app.status !== 200 || !app.type.includes("text/html")) {
    failures.push(`the app at / answered ${app.status} ${app.type}, expected 200 text/html`);
  }

  // The whole point of the proxy: the backend sees the path WITHOUT the /api prefix. A proxy
  // that forwards the prefix unconsumed answers 404 here, and a missing proxy answers 200 with
  // this app's HTML - so require JSON and require the route to exist behind the prefix.
  const proxied = await get(`${base}/api${path}`);
  if (proxied.status !== 200 || !proxied.type.includes("application/json")) {
    failures.push(`/api${path} answered ${proxied.status} ${proxied.type}, expected 200 application/json from the backend`);
  } else if (!proxied.body.includes(path)) {
    failures.push(`/api${path} did not reach the backend as ${path}: ${proxied.body.slice(0, 160)}`);
  }

  const unknown = await get(`${base}/api/definitely-not-a-route`);
  if (unknown.status !== 404 || unknown.type.includes("text/html")) {
    failures.push(`an unknown /api path answered ${unknown.status} ${unknown.type}, expected 404 rather than the app's HTML`);
  }
} else if (process.env.GUIDE_MODE === "fullstack") {
  // The render marker is the assertion, not the status code: a client-only shell answers 200
  // text/html with an empty #root and never contains this markup, which is exactly the
  // degradation the shape exists to make impossible. An HTML answer without it is a failure even
  // though it is a 200.
  const marker = "<h1>SSR works</h1>";
  const page = await get(`${base}/`);
  if (page.status !== 200 || !page.type.includes("text/html") || !page.body.includes(marker)) {
    failures.push(
      `the render marker ${marker} was not in the response from /: got ${page.status} ${page.type} (${page.body.length} bytes) — an empty #root or a client-only shell looks exactly like this`,
    );
  } else {
    // The document has to reference the client entry, and the server has to serve what it
    // references: "a bundle exists on disk" and "the page can hydrate from this URL" are two
    // different claims, and this one is the second.
    const entry = /<script[^>]+src="([^"]+)"/.exec(page.body);
    if (!entry) {
      failures.push("the rendered document has no client script to hydrate from");
    } else {
      const asset = await get(new URL(entry[1], base).href);
      if (asset.status !== 200 || !asset.type.includes("javascript")) {
        failures.push(
          `the document's client entry ${entry[1]} answered ${asset.status} ${asset.type}, expected 200 and a javascript type`,
        );
      }
    }
  }

  // Same port, same origin: the API is this project's own server, not a proxy in front of one.
  const api = await get(`${base}/api/hello`);
  if (api.status !== 200 || !api.type.includes("application/json")) {
    failures.push(`/api/hello answered ${api.status} ${api.type}, expected 200 application/json from the handler`);
  } else if (!api.body.includes("hello")) {
    failures.push(`/api/hello did not answer with the handler's payload: ${api.body.slice(0, 160)}`);
  }
} else {
  // The backend serves its own routes and none of them carries an /api prefix - that prefix is
  // what the frontend modes' proxy strips. A 200 on /api/hello would mean the route is mounted
  // somewhere other than where this guide says, and an HTML answer would mean something is
  // rendering a page in a project that has no client.
  const served = await get(`${base}/hello`);
  if (served.status !== 200 || !served.type.includes("application/json")) {
    failures.push(`/hello answered ${served.status} ${served.type}, expected 200 application/json from the handler`);
  } else if (!served.body.includes("hello")) {
    failures.push(`/hello did not answer with the handler's payload: ${served.body.slice(0, 160)}`);
  }

  const prefixed = await get(`${base}/api/hello`);
  if (prefixed.status !== 404) {
    failures.push(`/api/hello answered ${prefixed.status}; this project's routes carry no /api prefix`);
  }

  const unknown = await get(`${base}/nope`);
  if (unknown.status !== 404 || unknown.type.includes("text/html")) {
    failures.push(`an unknown path answered ${unknown.status} ${unknown.type}, expected 404 rather than a page`);
  }
}

if (failures.length) {
  console.error(`${what} smoke failures:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`${what}: ok`);
NODE
}

# The artefact first: it is a plain node process, so it starts and stops deterministically, and
# stopping it frees GUIDE_DEV_PORT for the dev server that follows.
if [ "$GUIDE_MODE" = "backend" ] || [ "$GUIDE_MODE" = "fullstack" ]; then
  PORT="$GUIDE_DEV_PORT" node dist/server/index.mjs > prod.log 2>&1 &
  prod_pid=$!
  # Both modes answer on the same port the dev server will use; the readiness path is the one
  # each mode is guaranteed to serve (the SSR shape's renderer answers `/`, the backend's route
  # answers `/hello`).
  if [ "$GUIDE_MODE" = "fullstack" ]; then
    wait_ready "http://127.0.0.1:$GUIDE_DEV_PORT/" prod.log
  else
    wait_ready "http://127.0.0.1:$GUIDE_DEV_PORT/hello" prod.log
  fi
  smoke "http://127.0.0.1:$GUIDE_DEV_PORT" "built server (node dist/server/index.mjs)"
  kill "$prod_pid" 2>/dev/null || true
  wait "$prod_pid" 2>/dev/null || true
  prod_pid=""
fi

$VP dev --port "$GUIDE_DEV_PORT" --strictPort > dev.log 2>&1 &
dev_pid=$!
wait_ready "http://127.0.0.1:$GUIDE_DEV_PORT/" dev.log
smoke "http://127.0.0.1:$GUIDE_DEV_PORT" "dev server"

step "verification passed"
```

## Phase 7 — Handoff

Report, in this order:

1. **What was built** — the mode, layout, framework (frontend and SSR modes) and package manager
   that were chosen, and the versions that actually resolved: `docs/provenance.md` is the record.
2. **What was verified** — the Phase 6 result, and the fact that the type checker was proven
   live with a deliberate error rather than assumed. A frontend run verified the dev proxy end
   to end; a backend run verified the Vite plugin by making it serve a route, and verified the
   built `dist/server/index.mjs` by running it; an SSR run verified the render marker on the
   built server *and* on the dev server, with the same-origin API answered on the same port.
3. **What is deliberate** — the pinned prerelease toolchain, and the pinned prerelease Nitro in
   the modes that have a server; `.env` being committed while `*.local` is not (frontend mode);
   the constraints in `AGENTS.md` correcting the tool's own `vp env doctor` advice and carrying
   only the rules this mode has; the frontend profile shipping no test harness at all, against
   the server profiles' wired-but-empty `tests/`; Nitro's output living in `dist/` (server
   modes), which is why the run added no ignore rule; and, in the SSR shape, the absence of
   `index.html` — the template is what makes the outlet comment a silent switch, so the shape
   deletes it and verification asserts the render marker instead.
4. **What is not covered** — browser hydration is not verified (the smoke test asserts the
   server's response, not the browser's), and production deployment topology is out of scope.
   In backend mode only the one initialized route is verified: a real route table is something
   the project adds later, under the same rules. In the SSR shape only the one page and the one
   API route are verified, and anything the browser does after the first paint — hydration
   mismatches, event handlers, HMR — is outside this verification by construction.
5. **Next steps** — put the project under version control yourself (`git init`; this guide
   deliberately does not touch version control), then start the first feature with
   `/grill-with-docs` so the design conversation happens before the code.
6. **Commands to live with** — the project's own toolchain, in vp form:
   `./node_modules/.bin/vp dev` (dev server, port `GUIDE_DEV_PORT`),
   `./node_modules/.bin/vp check` (format, lint, types),
   `./node_modules/.bin/vp run build` (the project's build script),
   `./node_modules/.bin/vp preview`, and `./node_modules/.bin/vp migrate` when it is time to
   move the toolchain forward. In the server modes, `./node_modules/.bin/vp test` runs the suite
   (empty by design until the first test), and the build's artefact is started with
   `node dist/server/index.mjs` — which, in the SSR shape, serves the rendered page and the
   `/api/…` routes on the same port.
