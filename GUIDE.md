# GUIDE.md — turn an empty directory into a Vite+-managed TypeScript project

This guide is written for an agent (or a careful human) to execute **inside an empty target
directory**. Every command is non-interactive, every version is pinned explicitly, no global
tool is installed, and the toolchain lives in the project. At the end the project proves
itself: format, static check, build script, tests when the profile has them, and a dev-server
smoke test that goes through the real dev proxy.

Two properties are deliberate, because this project exists to prevent them:

- **No silent success.** A green result has to mean something happened. Removing the
  configuration that makes `vp check` type-aware turns it into a formatter that prints
  `pass` — so this guide proves type checking is live instead of assuming it.
- **Stop, don't repair.** If any step or verification fails, stop and report. Do not adjust
  the check until it agrees with the code.

## Profile status

| Mode | Layout | Status in this revision |
| --- | --- | --- |
| `frontend` | `single` | **Implemented and E2E-verified** (pnpm; `react-ts` exercised end to end, other create-vite TypeScript templates share the same steps) |
| `backend`, `fullstack` | any | Not implemented yet — the guide stops at the profile guard and tells you so |

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
- Blocks **without** a `guide:` marker are explanation and examples.

The E2E harness in `e2e/` extracts exactly these markers and runs them from an empty
directory, so the document and the test can never drift into two truths.

## Answers — decision points, asked once and pre-answerable

The guide stops at four decision points: shape/layout/framework/package manager, versions,
the dev-proxy target, and whether to run the skills setup now. Ask them, then record the
answers as environment variables; every step below fails loudly if an answer it needs is
missing. That is also what makes an unattended run possible.

| Variable | Meaning | Accepted values |
| --- | --- | --- |
| `GUIDE_MODE` | project shape | `frontend` (this revision) |
| `GUIDE_LAYOUT` | single repo or monorepo | `single` (this revision) |
| `GUIDE_FRAMEWORK` | create-vite template id | `react-ts`, `vue-ts`, `svelte-ts`, `solid-ts`, `preact-ts`, `lit-ts`, `vanilla-ts`, … |
| `GUIDE_PM` | package manager | `pnpm` (verified), `npm`, `yarn`, `bun` |
| `GUIDE_VP_VERSION` | pinned `vite-plus` | e.g. `1.0.0-rc.0` (prerelease — disclose this) |
| `GUIDE_TS_VERSION` | pinned TypeScript line | `^7.0.2` |
| `GUIDE_TNB` | bridge TypeScript 6's API for tools that still need it | `yes` for `vue-ts`/`svelte-ts`, else `no` |
| `GUIDE_TNB_VERSION` | pinned bridge package | `6.0.3-bridge.17.tsgo.7.0.2` |
| `GUIDE_SKILLS_VERSION` | pinned `skills` CLI | `1.7.0` |
| `GUIDE_DEV_PROXY` | backend the dev server proxies `/api/*` to (frontend modes) | e.g. `http://127.0.0.1:3000` |
| `GUIDE_PROXY_SMOKE_PATH` | route the proxy smoke test calls (frontend modes) | e.g. `/hello` |
| `GUIDE_DEV_PORT` | port the smoke test uses for the dev server | default `5173` |
| `GUIDE_SETUP` | run the skills setup now? | `no` in unattended runs (see Phase 4.5) |

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

## Phase 1 — Decision point: shape, layout, framework, package manager

Ask these together, then stop asking:

- **Shape** — which kind of project: a pure frontend, a backend, or fullstack (and for
  fullstack, same-origin SSR or a split frontend/backend).
- **Layout** — single repository or monorepo. Layout is orthogonal to shape: a monorepo is a
  way of arranging a shape, never a fourth shape.
- **Framework** — for a frontend, which create-vite TypeScript template; it decides the
  dependencies, the config, and the entry point that the generator writes.
- **Package manager** — recommend `pnpm`. In this revision only `pnpm` has been verified end
  to end; the other choices run the same steps through their own `dlx`/`install` spellings.

Record the answers as `GUIDE_MODE`, `GUIDE_LAYOUT`, `GUIDE_FRAMEWORK`, `GUIDE_PM`.

```bash guide:exec id=profile-guard
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single) echo "ok  profile frontend/single" ;;
  *)
    printf 'this revision implements only the frontend/single profile; asked for %s/%s.\n' \
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
pm_run() {
  case "$GUIDE_PM" in
    pnpm) pnpm "$@" ;;
    npm) npm "$@" ;;
    yarn) yarn "$@" ;;
    bun) bun "$@" ;;
    *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
  esac
}

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

## Phase 3.5 — Dev proxy: only when a frontend is not same-origin as its backend

A pure frontend always has a backend somewhere else, so it needs a dev proxy. The production
edge strips the `api` prefix before the server sees the path; the dev server has to reproduce
that exactly, or `/api/*` will work in dev and 404 in production.

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
skill is picked up instead of silently pinned to today's list.

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
if (names.length !== 25) { console.error(`upstream declares ${names.length} promoted skills, expected 25`); process.exit(1); }
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
  this project deliberately does not use.
- **`docs/adr/`** — why, and what would change the decision.
- **`docs/agent-notes.md`** — what is already known to bite, as facts rather than rules.
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

- Import cross-directory modules as `#/src/…` (extensionless). The only alias mechanism is
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

### Development proxy

- `DEV_PROXY` lives in `.env` and is committed; personal overrides go in `.env.local` or
  `.env.development.local`. The one-line guard in `vite.config.ts` is deliberate: without it,
  a missing variable makes `/api/*` answer `200` with this app's HTML instead of failing.
- The proxy prefix is a regular expression and is written `/api/` with the trailing slash.
- Verification of the proxy means a request through the **frontend** port, asserting JSON —
  an HTML answer on an `/api` path is the failure mode, not a success.

### Code organisation

- Business code stays where it is used: one directory per page or feature, private until
  something else needs it. Shared code only when the deletion test (removing it scatters
  complexity back into N callers) or the cross-cutting test (auth, error contract, data
  access, telemetry, i18n) says it must exist.
- Dependencies point one way: pages → shared. Shared code never imports a page, and pages
  never import each other.
- This profile ships no test harness by decision. Add one only as an explicit decision, and
  record the reason in an ADR.

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

Any server side in this project is built on Nitro v3, consumed as a Vite plugin in the same
project as the frontend. Nitro v3 has no stable release — every published version carries a
beta or alpha suffix — and we accept the prerelease, because the alternative is not "the same
thing, more safely" but a different package with a different API and a different name.

## Considered Options

- **`nitropack` v2 (stable)** — rejected: v3 renamed the package, so choosing v2 means building
  against v2's API rather than derisking v3.
- **A hand-rolled `node:http` server** — rejected: the fullstack shapes need a server that
  shares one project and one build with the Vite frontend, which is what Nitro's Vite plugin
  provides.
- **Scaffolding with `create-nitro-app` and migrating Vite+ in afterwards** — rejected: it
  rewrites the project around Nitro's own starter, and that starter fails `vp build` until a
  migration runs.

## Consequences

- The prerelease is surfaced as a decision point rather than hidden, and the resolved version
  is recorded in `docs/provenance.md`; the dependency is never left at `latest`.
- Server code imports explicitly — v3 has no auto-imports — and server tests never live under
  the directory Nitro compiles into routes.
- Build output goes to a directory the ignore rules already cover, so a fresh build cannot
  make the static check fail.
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
- If this profile has no test harness, `vp test` fails with "No test files found". That is the
  configured state, not a broken project.
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

mkdir -p docs
cat > docs/provenance.md <<PROVENANCE
# Provenance — how this project was generated

One initialization, recorded so that a future anomaly can be attributed to a version or a
choice instead of guessed at. Versions here are the ones that actually resolved.

## Choices made at initialization

| Decision | Answer |
| --- | --- |
| Shape | ${GUIDE_MODE} |
| Layout | ${GUIDE_LAYOUT} |
| Framework template | ${GUIDE_FRAMEWORK} |
| Package manager | ${GUIDE_PM} |
| Skills setup run now | ${GUIDE_SETUP} (inherited ADRs use \`docs/adr/\` when deferred) |
| Dev proxy target | ${GUIDE_DEV_PROXY:-not applicable} |

## Toolchain that resolved

| Component | Version | Pinned as |
| --- | --- | --- |
| vite-plus | ${vite_plus_version} | \`${GUIDE_VP_VERSION}\` (prerelease) |
| TypeScript | ${typescript_version} | \`${GUIDE_TS_VERSION}\` |
| create-vite | ${create_vite_version:-see note below} | \`create-vite@latest\`, unpinnable upstream |

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
2. Decision points: shape/layout/framework/package manager; versions (prereleases disclosed); dev proxy target.
3. Skeleton: \`vp create vite:application\` + \`--template ${GUIDE_FRAMEWORK}\`, alias map, configuration trimmed, ignore rules refined, dependencies installed.
4. Dev proxy: \`DEV_PROXY\` in \`.env\`, transformer wired with a guard.
5. Skills: upstream set resolved at run time, installed, lockfile verified against that set.
6. Setup decision: recorded above.
7. Documents: constraints in \`AGENTS.md\`, inherited ADRs in \`docs/adr/\`, traps in \`docs/agent-notes.md\`, this file.
8. Verification: format, static check with a live type checker, build script, and a dev-server smoke test through the proxy. Recorded ${installed_at}.

## If something looks wrong

Start here before changing code: the version table above is the shortest path to the right
documentation, and \`docs/agent-notes.md\` lists the failures that are known to be silent.
PROVENANCE

rm -f .vite-plus-create.log .vite-plus-skills.log .vite-plus-skill-names .vite-plus-skills-commit
echo "ok  docs/provenance.md written"
```

## Phase 6 — Verify (the assertion set)

Run this as one script and stop if any part of it fails. A red result is a report, not a task
list: do not adjust the project until the verification agrees with it. Nothing here is
re-implemented anywhere else — this is the assertion set.

The proxy part of the smoke test calls the backend named by `GUIDE_DEV_PROXY`, so that backend
has to be reachable while this runs. If it is not, the proxy answers `502` and verification
fails — which is the correct outcome, not a reason to skip the check.

```bash guide:verify id=verify
set -euo pipefail
: "${GUIDE_MODE:?}"; : "${GUIDE_PM:?}"; : "${GUIDE_DEV_PROXY:?}"
: "${GUIDE_PROXY_SMOKE_PATH:?}"; : "${GUIDE_DEV_PORT:?}"

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

step "format"
$VP fmt

step "static check (format + lint + types)"
$VP check

step "build (the project's own build script)"
pm_run run build
[ -f dist/index.html ] || { echo "the build produced no dist/index.html" >&2; exit 1; }

step "tests"
if node -e 'process.exit(require("./package.json").scripts?.test ? 0 : 1)'; then
  pm_run run test
else
  echo "no test script in this profile - nothing to run"
fi

step "dev server smoke: app and proxy through the frontend port"
dev_pid=""
cleanup() { if [ -n "$dev_pid" ]; then kill "$dev_pid" 2>/dev/null || true; wait "$dev_pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
$VP dev --port "$GUIDE_DEV_PORT" --strictPort > dev.log 2>&1 &
dev_pid=$!
ready=0
for _ in $(seq 150); do
  if node -e "fetch('http://127.0.0.1:$GUIDE_DEV_PORT/').then(() => process.exit(0)).catch(() => process.exit(1))" 2>/dev/null; then
    ready=1; break
  fi
  sleep 0.4
done
if [ "$ready" -ne 1 ]; then
  echo "the dev server never answered on port $GUIDE_DEV_PORT" >&2
  tail -20 dev.log >&2
  exit 1
fi

node --input-type=module - <<'NODE'
const port = process.env.GUIDE_DEV_PORT;
const path = process.env.GUIDE_PROXY_SMOKE_PATH;
const failures = [];
const get = async (url) => {
  const response = await fetch(url);
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
};

const app = await get(`http://127.0.0.1:${port}/`);
if (app.status !== 200 || !app.type.includes("text/html")) {
  failures.push(`the app at / answered ${app.status} ${app.type}, expected 200 text/html`);
}

// The whole point of the proxy: the backend sees the path WITHOUT the /api prefix. A proxy
// that forwards the prefix unconsumed answers 404 here, and a missing proxy answers 200 with
// this app's HTML - so require JSON and require the route to exist behind the prefix.
const proxied = await get(`http://127.0.0.1:${port}/api${path}`);
if (proxied.status !== 200 || !proxied.type.includes("application/json")) {
  failures.push(`/api${path} answered ${proxied.status} ${proxied.type}, expected 200 application/json from the backend`);
} else if (!proxied.body.includes(path)) {
  failures.push(`/api${path} did not reach the backend as ${path}: ${proxied.body.slice(0, 160)}`);
}

const unknown = await get(`http://127.0.0.1:${port}/api/definitely-not-a-route`);
if (unknown.status !== 404 || unknown.type.includes("text/html")) {
  failures.push(`an unknown /api path answered ${unknown.status} ${unknown.type}, expected 404 rather than the app's HTML`);
}

if (failures.length) {
  console.error("smoke failures:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`app 200, /api${path} 200 application/json (prefix stripped), unknown /api 404`);
NODE

step "verification passed"
```

## Phase 7 — Handoff

Report, in this order:

1. **What was built** — the shape, layout, framework and package manager that were chosen, and
   the versions that actually resolved (`docs/provenance.md` is the record).
2. **What was verified** — the Phase 6 result, and the fact that the type checker was proven
   live with a deliberate error rather than assumed.
3. **What is deliberate** — the pinned prerelease toolchain; `.env` being committed while
   `*.local` is not; the constraints section in `AGENTS.md` correcting the tool's own
   `vp env doctor` advice; no test harness in the frontend profile.
4. **What is not covered** — browser hydration is not verified (the smoke test asserts the
   server's response, not the browser's), and production deployment topology is out of scope.
5. **Next steps** — put the project under version control yourself (`git init`; this guide
   deliberately does not touch version control), then start the first feature with
   `/grill-with-docs` so the design conversation happens before the code.
6. **Commands to live with** — `pnpm run dev` (dev server, port `GUIDE_DEV_PORT`),
   `./node_modules/.bin/vp check` (format, lint, types), `pnpm run build`, `pnpm run preview`,
   and `./node_modules/.bin/vp migrate` when it is time to move the toolchain forward.
