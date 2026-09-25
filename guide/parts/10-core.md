```bash guide:exec id=bootstrap
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_FRAMEWORK:?Phase 1 must answer GUIDE_FRAMEWORK}"
: "${GUIDE_VP_VERSION:?Phase 2 must answer GUIDE_VP_VERSION}"
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"

case "$GUIDE_PM" in
  pnpm) dlx() { pnpm dlx "$@"; } ;;
  npm) dlx() { npx --yes "$@"; } ;;
  yarn) dlx() { yarn dlx "$@"; } ;;
  bun) dlx() { bunx "$@"; } ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

# The two layouts are scaffolded by two different templates, with one flag between them: the
# application template takes a create-vite template id, and the monorepo template writes its own
# app (vanilla-ts under apps/website) — there is no framework flag to pass it, which is exactly
# why the profile guard only accepts vanilla-ts for this layout.
create_args=(
  --directory .
  --no-interactive
  --no-git
  --no-hooks
  --package-manager "$GUIDE_PM"
  --verbose
)
case "$GUIDE_LAYOUT" in
  single) create_args=(vite:application "${create_args[@]}" -- --template "$GUIDE_FRAMEWORK") ;;
  monorepo) create_args=(vite:monorepo "${create_args[@]}") ;;
  *) echo "unsupported layout: $GUIDE_LAYOUT" >&2; exit 1 ;;
esac

# The verbose output is the only place the resolved create-vite version appears; keep it for
# the provenance record, then remove it at the end of Phase 5. It is captured rather than
# streamed through `tee`, because the scaffold refuses anything but an empty directory and a
# tee target created before it runs would be enough to make the directory non-empty.
if ! create_log=$(dlx --package="vite-plus@$GUIDE_VP_VERSION" vp create "${create_args[@]}" 2>&1); then
  printf '%s\n' "$create_log" >&2
  echo "vp create failed; the target directory was left as it was" >&2
  exit 1
fi
printf '%s\n' "$create_log" > .vite-plus-create.log
printf '%s\n' "$create_log" | tail -25

for expected in package.json vite.config.ts tsconfig.json AGENTS.md; do
  [ -f "$expected" ] || { echo "the generator did not write $expected" >&2; exit 1; }
done

# The monorepo template's own shape, asserted rather than assumed: the frontend app and the
# placeholder package are the two directories every later step in this layout names.
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  for expected in apps/website/package.json apps/website/index.html packages/utils/package.json pnpm-workspace.yaml; do
    [ -f "$expected" ] || { echo "the monorepo scaffold did not write $expected" >&2; exit 1; }
  done
  case "${GUIDE_PLACEHOLDER:-}" in
    yes|no) : ;;
    *) echo "the monorepo layout must answer GUIDE_PLACEHOLDER (yes to keep packages/utils, no to delete it)" >&2; exit 1 ;;
  esac
fi

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

In a workspace the map is per package, because `imports` resolves against the nearest
`package.json`: the root's map covers the root's own files, and every package the layout has gets
its own map for its own files — which packages those are is the arrangement's, and the steps below
write each one's. A package without a map simply has no alias — which is the honest state, not a
broken one.

```bash guide:exec id=manifest
set -euo pipefail
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_TS_VERSION:?Phase 2 must answer GUIDE_TS_VERSION}"
# Read with its documented default and exported for the script below: whether the bridge is in use
# decides which spec `typescript` gets, and a shape that never needs the bridge (every backend and
# workspace shape) should not have to answer the question to find that out.
GUIDE_TNB=${GUIDE_TNB:-no}
export GUIDE_TNB
case "$GUIDE_TNB" in
  yes|no) : ;;
  *) echo "GUIDE_TNB must be yes or no, got '$GUIDE_TNB'" >&2; exit 1 ;;
esac

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const monorepo = process.env.GUIDE_LAYOUT === "monorepo";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
manifest.imports = { "#/*": { types: "./*.ts", default: "./*" } };

// The TypeScript pin belongs to the manifest only in the single layouts. In a monorepo it is the
// workspace catalog that carries it (the scaffold puts `typescript: ^7.0.2` there and the app and
// the placeholder package already reference `catalog:`), so writing a literal here would be the
// second place a version lives.
if (!monorepo) {
  manifest.devDependencies.typescript =
    process.env.GUIDE_TNB === "yes" ? "catalog:" : process.env.GUIDE_TS_VERSION;
}

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
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  echo "ok  imports alias installed; TypeScript stays in the workspace catalog ($(grep -E '^\s+typescript:' pnpm-workspace.yaml | head -1 | tr -d ' '))"
else
  echo "ok  imports alias installed, typescript set to $(node -p 'require("./package.json").devDependencies.typescript')"
fi
```

### Leave each project's TypeScript layout alone (frontend modes, and the workspace layouts' programs)

A frontend mode keeps the tsconfig layout the generator wrote, because that is the layout the
template's own build script (`tsc -b`) expects: create-vite's framework templates split the
browser program and the Node-side config file into separate project references, and a pure
frontend has no second toolchain to reconcile with them. The single, merged tsconfig belongs to
the modes that compose a Nitro server into the **same** project: there `server/`, the tests
directory and `nitro.config.ts` have to join one program — and so does `src/`, in the SSR shape,
where the browser half is part of a server program too. One config extending `nitro/tsconfig` is
the layout that was proven to work; the backend section and the SSR section at the end of this
phase are that layout.

The workspace layout is the case where that reasoning inverts rather than extends: every package
keeps the program its own generator wrote — the root keeps the scaffold's `tsconfig.json`, whose
lack of an `include` list is what already covers `server/`, `tests/`, `nitro.config.ts` and
`vite.config.ts` when the root is the application, and `apps/website` keeps create-vite's
`tsconfig.json`. Merging them would erase the package boundary the layout exists for — and the root
check still type-checks both, because `vp check` walks every package's program, which is asserted
where each arrangement is built. The one package that prunes its tsconfig is the placeholder
package, and only its publishing shape; the file itself stays.

What every mode enforces about TypeScript is negative and checkable: none of those files may
carry an alias mechanism of its own. The alias control below proves the `imports` map is the one
that actually resolves, and the harness re-checks from outside that no `paths`, `resolve.alias`
or `resolve.tsconfigPaths` turned up anywhere.

### Trim the configuration, then prove the trim did not hollow out the check

The generator writes configuration that is not carrying its weight — an empty `fmt: {}` that
equals the default, for instance. Delete what is redundant, keep what has an effect, and treat
"it looks like a default" as a hypothesis to test, never as permission: a green `vp check`
means nothing if the configuration that made it type-aware is gone.

The control below proves that about one configuration — the one this step trims, which is the one
the frontend and the workspace layouts ship. It is **not** inherited by the two server shapes: the
backend and SSR sections below replace `tsconfig.json` with a merged program, and each of them runs
the same control again (plant a `TS2322`, require it to be caught, remove the probe) against the
configuration it just wrote. The claim travels only where the control ran.

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
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"

vp_run() { ./node_modules/.bin/vp "$@"; }

# Where this profile's source lives decides where a probe can be planted. In the single layouts it
# is the scaffolded src/; in the monorepo layout the root is the server, so the probes go next to
# the root's own TypeScript — the tests directory, which is not a route directory and not an entry.
case "$GUIDE_LAYOUT" in
  single) probe_dir=src ;;
  monorepo) probe_dir=tests ;;
  *) echo "unsupported layout: $GUIDE_LAYOUT" >&2; exit 1 ;;
esac
mkdir -p "$probe_dir"

# Control 1 - the type checker is alive. Plant a type error; a check that still passes is a
# check that never looked. This is the only reason to believe the config trim above was safe.
# The probe is removed on every exit path, not only the happy one: a step that stops here would
# otherwise leave a planted type error behind, and in three of these steps that file sits where the
# server scans for routes (see the same control in the backend, SSR and workspace sections).
trap 'rm -f "$probe_dir/__guide_probe.ts"' EXIT
printf 'export const __guideProbe: number = "not a number";\n' > "$probe_dir/__guide_probe.ts"
vp_run fmt > /dev/null
if vp_run check > .vite-plus-control.log 2>&1; then
  rm -f "$probe_dir/__guide_probe.ts"
  echo "vp check passed with a type error under $probe_dir - type checking is not active" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-control.log" >&2
  exit 1
}
echo "ok  planted type error was caught (TS2322)"
rm -f "$probe_dir/__guide_probe.ts" .vite-plus-control.log

# Control 2 - the alias resolves in the type checker, not only in the bundler. A wrong
# `imports` shape (for example {"#*": "./*"}) leaves dev and build green and reports TS2307
# on every aliased import, so prove the positive case instead of assuming it.
trap 'rm -f "$probe_dir/__guide_alias_target.ts" "$probe_dir/__guide_alias_use.ts"' EXIT
cat > "$probe_dir/__guide_alias_target.ts" <<'TS'
export const aliasProbe = "imports-alias-resolves";
TS
cat > "$probe_dir/__guide_alias_use.ts" <<TS
import { aliasProbe } from "#/$probe_dir/__guide_alias_target";

export const aliasProbeUse: string = aliasProbe;
TS
vp_run fmt > /dev/null
vp_run check
rm -f "$probe_dir/__guide_alias_target.ts" "$probe_dir/__guide_alias_use.ts"
# The probe directory was created for this control when the profile did not already have it.
# Leaving an empty directory behind would put something in the project that the profile's own
# decision says should not be there — a frontend ships no test harness, so it has no tests/.
rmdir "$probe_dir" 2>/dev/null || true
echo "ok  '#/...' resolves through package.json imports"
```

### Install, and refine the ignore rules

The ignore file keeps the project's secrets stance explicit: `.env` is committed (only
`*.local` is ignored, so `.env.local` stays personal), and editor configuration is committed
too — a team that standardises on one editor wants its settings reviewed like any other file.
The monorepo scaffold ships exactly the two rule groups this rejects — a `.env`/`.env.*` block
and a `.vscode/*` block — so the same edit is a deletion there rather than a check, and the
package-level `.gitignore` files get the same treatment (their rules apply to their own
directory, and the frontend app's `.env` lives inside `apps/website`).

```bash guide:exec id=install
set -euo pipefail
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const monorepo = process.env.GUIDE_LAYOUT === "monorepo";
const file = ".gitignore";
const before = readFileSync(file, "utf8");
let after = before;

// The scaffold's .vscode rules, removed in every layout: editor configuration is committed.
const withoutVscode = after.replace(
  /^# Editor directories and files\n(?:(?:!)?\.vscode\/[^\n]*\n)+/m,
  "",
);
after = withoutVscode.replace(/^(?:!)?\.vscode\/[^\n]*\n/gm, "");
if (after === before) {
  console.error("no '.vscode/*' ignore lines were found; inspect .gitignore before continuing");
  process.exit(1);
}

// The monorepo scaffold also ignores .env and .env.*; this guide commits the environment file,
// so those lines (and the !.env.example exception that hangs off them) go as well.
if (monorepo) {
  after = after.replace(/^# dotenv environment variable files\n(?:(?:!)?\.env[^\n]*\n)+/m, "");
  after = after.replace(/^(?:!)?\.env[^\n]*\n/gm, "");
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

// A package's own .gitignore applies to that package's directory: the app keeps the same stance
// for the .env it carries, so the same two groups are deleted there.
if (monorepo) {
  for (const pkg of ["apps/website", "packages/utils"]) {
    const path = `${pkg}/.gitignore`;
    let source = readFileSync(path, "utf8");
    source = source.replace(/^# Editor directories and files\n(?:(?:!)?\.vscode\/[^\n]*\n)+/m, "");
    source = source.replace(/^(?:!)?\.vscode\/[^\n]*\n/gm, "");
    source = source.replace(/^# dotenv environment variable files\n(?:(?:!)?\.env[^\n]*\n)+/m, "");
    source = source.replace(/^(?:!)?\.env[^\n]*\n/gm, "");
    writeFileSync(path, source);
  }
}
NODE

if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # The workspace is already installed here: `vp create vite:monorepo` installs what it writes, and
  # the manifest step above left the catalog alone (TypeScript belongs to it), so an `vp install` at
  # this point is a no-op — measured: `Already up to date … Done in 13ms`. The installs this layout
  # still runs are the ones that follow a manifest change: the workspace skeleton, after it extends
  # the catalog, and the proxy steps, after they add their transformer.
  #
  # What is asserted here is the shape-independent half: the project's own toolchain exists, and
  # typescript resolves in the workspace. Naming `apps/website/node_modules/typescript` would assert
  # a fact about a package the backend workspace deletes later in the same run.
  [ -x ./node_modules/.bin/vp ] || { echo "the workspace has no project toolchain at ./node_modules/.bin/vp" >&2; exit 1; }
  resolved=""
  for package in apps/website packages/utils .; do
    if [ -f "$package/node_modules/typescript/package.json" ]; then
      resolved=$(node -p "require('./$package/node_modules/typescript/package.json').version")
      break
    fi
  done
  [ -n "$resolved" ] || { echo "typescript did not resolve in any package of this workspace" >&2; exit 1; }
  echo "ok  workspace dependencies are installed (vp create installed them); typescript resolves to $resolved"
else
  case "$GUIDE_PM" in
    pnpm) pnpm install --no-frozen-lockfile ;;
    npm) npm install ;;
    yarn) yarn install ;;
    bun) bun install ;;
    *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
  esac

  resolved=$(node -p 'require("./node_modules/typescript/package.json").version')
  echo "ok  dependencies installed; typescript resolves to $resolved"
fi
```
### Write each dev server's port into the configuration

Where a dev server binds is configuration, not a flag. The port the answers name is written once,
here, into the `vite.config.ts` that owns each server — so the verification step, the user's first
`vp dev`, and every later command agree, and nothing has to carry `--port`. The toolchain resolves a
port in this order: `PORT` in the environment (the running process), then Vite's `server.port`, then
Nitro's own `devServer.port` (default `3000`) — which is why one `server: { port, strictPort: true }`
per config file is enough for every shape. `strictPort` is the loud half: without it a busy port
moves the server silently and the smoke test would read a stranger.

```bash guide:exec id=ports
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"

if [ "$GUIDE_LAYOUT" = monorepo ]; then
  root_port=${GUIDE_DEV_PORT:-3000}   # a root server keeps Nitro's default in this layout
  app_port=${GUIDE_WEBSITE_PORT:-5173}
else
  root_port=${GUIDE_DEV_PORT:-5173}   # Vite's own default; override only to dodge a busy port
  app_port=""
fi
export GUIDE_MODE GUIDE_LAYOUT ROOT_PORT="$root_port" APP_PORT="$app_port"

node --input-type=module - <<'NODE'
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const fail = (message) => { console.error(message); process.exit(1); };
// The port is added to the server block in place when the proxy steps already wrote one (the
// single frontend's root config and the workspace layouts' app config), and as a new key of the
// exported config otherwise. Indentation is copied from the block, so the file is already the shape
// `vp fmt` would produce.
const patch = (file, port) => {
  const source = readFileSync(file, "utf8");
  if (/\bport:\s*\d+/.test(source)) fail(`${file} already names a port; this step writes it once`);
  const block = /^([ \t]*)server:\s*\{\s*$/m.exec(source);
  if (block) {
    const at = source.indexOf(block[0]) + block[0].length;
    const next = /^([ \t]*)\S/m.exec(source.slice(at));
    const indent = next ? next[1] : `${block[1]}  `;
    writeFileSync(file, `${source.slice(0, at)}\n${indent}port: ${port},\n${indent}strictPort: true,${source.slice(at)}`);
    return;
  }
  const close = source.lastIndexOf("});");
  if (close < 0) fail(`${file} does not end with "});" — inspect it before adding a server block`);
  writeFileSync(file, `${source.slice(0, close)}  server: {\n    port: ${port},\n    strictPort: true,\n  },\n${source.slice(close)}`);
};

const rootIsServer = process.env.GUIDE_LAYOUT === "single" || process.env.GUIDE_MODE !== "frontend";
if (rootIsServer) patch("vite.config.ts", process.env.ROOT_PORT);
if (process.env.APP_PORT && existsSync("apps/website/vite.config.ts")) patch("apps/website/vite.config.ts", process.env.APP_PORT);
NODE

./node_modules/.bin/vp fmt

# Assert on the files, not on the patch having run: the verification step starts every dev server
# with no port flag, so a port that did not land would show up as a server on the wrong port, or as
# no server at all, several minutes later.
node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";
const check = (file, port) => {
  const source = readFileSync(file, "utf8");
  if (!new RegExp(`(^|\\s)port:\\s*${port},`).test(source)) { console.error(`${file} does not carry port: ${port}`); process.exit(1); }
  if (!/(^|\s)strictPort:\s*true,/.test(source)) { console.error(`${file} does not carry strictPort: true`); process.exit(1); }
};
const rootIsServer = process.env.GUIDE_LAYOUT === "single" || process.env.GUIDE_MODE !== "frontend";
const appConfig = process.env.APP_PORT && existsSync("apps/website/vite.config.ts");
if (rootIsServer) check("vite.config.ts", process.env.ROOT_PORT);
if (appConfig) check("apps/website/vite.config.ts", process.env.APP_PORT);
console.log(`${rootIsServer ? `port ${process.env.ROOT_PORT} in the root config` : "no root dev server in this shape"}${appConfig ? `; port ${process.env.APP_PORT} in apps/website` : ""}`);
NODE

echo "ok  dev server ports are in the configuration: no command needs --port"
```

## Phase 4 — Agent skills (automatic, then verified)

Install the promoted skill set from the toolkit's upstream repository. The set is resolved
from upstream **at run time** — never frozen in this guide — so a renamed or newly promoted
skill is picked up instead of silently pinned to today's list. The count is not asserted
anywhere: the contract is that the installed set equals the set the upstream manifest
declares, whatever that set is today.

The install command has a trap worth naming: `skills` 1.7.0 only understands the bare
`--skill` token. Its own documentation shows `--skill=<name>`, which the parser ignores, so
the CLI installs every skill in the repository — whatever the upstream manifest declares that day,
not a number written here — and exits 0. The exit code is not evidence here: the lockfile's name
set is.

```bash guide:exec id=skills
set -euo pipefail
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
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

# The installer runs ephemerally either way. In the monorepo layout it runs through the
# project's own toolchain (`vp dlx` downloads the CLI and runs it, exactly as `pnpm dlx` would),
# because that layout's rule is that no package-manager command appears in its flow; in the
# single layouts it runs through the chosen package manager's dlx.
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  ./node_modules/.bin/vp dlx "skills@$GUIDE_SKILLS_VERSION" add mattpocock/skills -y -a universal --json --skill $names > .vite-plus-skills.log 2>&1
else
  case "$GUIDE_PM" in
    pnpm) dlx() { pnpm dlx "$@"; } ;;
    npm) dlx() { npx --yes "$@"; } ;;
    yarn) dlx() { yarn dlx "$@"; } ;;
    bun) dlx() { bunx "$@"; } ;;
    *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
  esac
  dlx "skills@$GUIDE_SKILLS_VERSION" add mattpocock/skills -y -a universal --json --skill $names > .vite-plus-skills.log 2>&1
fi

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

The installed set has one skill that configures the project *for* the other skills:
`/setup-matt-pocock-skills`. It is a prompt-driven conversation, not a script — it explores the
repo, presents what it found, asks for confirmation, and only then writes — and it asks about:

- the **issue tracker** — where issues and specs live for this project: GitHub (the `gh` CLI,
  proposed when a remote points there), GitLab (`glab`), local markdown files under
  `.scratch/<feature>/`, or a workflow the user describes in a paragraph (Jira, Linear, …);
- the **triage label vocabulary** — keep the five canonical role names (`needs-triage`,
  `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) or map them to names the
  tracker already uses (asked only when the `triage` skill is installed, which the promoted set
  is);
- the **domain-doc layout** — single-context (one `CONTEXT.md` and one ADR directory at the repo
  root: the default, recorded without asking) or multi-context (a root `CONTEXT-MAP.md` pointing
  at one `CONTEXT.md` per context, with per-context ADR directories; offered only when the repo
  shows monorepo signals);
- the **agent brief** — the `## Agent skills` block it adds to the file the repo already has
  (`CLAUDE.md` when it exists, otherwise `AGENTS.md`).

**Only the user can start it.** That skill carries `disable-model-invocation: true`: a
user-invocable skill is one an agent may *execute* once the user asks for it, and may not
*originate* — an agent cannot decide on its own that this project should be configured, so it
cannot take this branch by itself. So **ask the question, and say both of those things out loud**:
what the skill will ask (the four items above) and why only the user can start it. The answer
picks the branch.

- **Yes** — the user runs `/setup-matt-pocock-skills`; the agent then follows that skill's own
  process: **explore** the repo (remote, `AGENTS.md`/`CLAUDE.md`, `CONTEXT.md`, existing `docs/`),
  **present** what it found and what each section will say, **confirm** with the user — the user's
  edits during confirmation, including the ADR directory the convention ends up naming, *are* the
  decision — and **write** the files. It must not overwrite document sections that already exist:
  the `## Agent skills` block is updated in place when the file has one and nothing above or below
  it is rewritten. The `docs/agents/` files are the skill's generated output, so — as that skill's
  own text says — a re-run regenerates them from its seeds, and a hand patch to one is lost.
- **No** — continue. No convention is negotiated, so the inherited ADRs (Phase 5) take the
  default landing point, `docs/adr/`, and the assumption is written into the birth certificate
  (`docs/provenance.md`) rather than left implicit: a project that adopts a convention later has
  to know those ADRs were placed by default, not by a decision.

The questions that skill asks map onto answers a run can carry in advance, which is what makes this
decision point testable: `GUIDE_TRACKER` (Section A), `GUIDE_DOMAIN_LAYOUT` (Section C), and
`GUIDE_ADR_DIR` — the ADR directory the confirmed convention ends up naming, which is Section C's
output and the field a user edits during confirmation. The triage vocabulary is written as the
canonical five; a non-default vocabulary is the user's own edit to the generated table (and, like
every generated file here, that edit is regenerated from the skill's seed when the skill runs
again). One answer is not pre-answerable: `other`, the tracker written from the user's own
paragraph, needs the conversation itself — this flow refuses it rather than inventing a file. In an
unattended run answer `no`, or answer `yes` with all three; a `yes` with a missing or unwritable
answer stops at the guard below rather than guessing at it.

```bash guide:exec id=setup-guard
set -euo pipefail
: "${GUIDE_SETUP:?Phase 4.5 must answer GUIDE_SETUP}"

# Both branches are checked before either one touches the project: a `no` is complete on its own,
# and a `yes` is only runnable when the questions the skill would ask have answers — the user's
# own, or the ones a pre-answered run supplied.
case "$GUIDE_SETUP" in
  no)
    echo "ok  setup deferred to the user; the inherited ADRs take the default landing point and"
    echo "ok  docs/provenance.md records that as an assumption rather than a decision"
    ;;
  yes)
    # Read with a default and required here: the answer only belongs to this branch, and the
    # extractor's rule is that a `$GUIDE_…` without a default must be answered by every profile.
    tracker=${GUIDE_TRACKER:-}
    adr_dir=${GUIDE_ADR_DIR:-docs/adr}
    adr_dir=${adr_dir%/}
    domain_layout=${GUIDE_DOMAIN_LAYOUT:-single}
    case "$tracker" in
      github|gitlab|local) : ;;
      "") echo "GUIDE_TRACKER must be answered when the setup flow runs: it is the issue tracker that flow settles (Phase 4.5)" >&2; exit 1 ;;
      other)
        echo "GUIDE_TRACKER=other cannot be written by this step: that file is written from the user's" >&2
        echo "own description of their workflow, which comes from the setup skill's conversation and" >&2
        echo "cannot be pre-answered. Run /setup-matt-pocock-skills attended, or answer github," >&2
        echo "gitlab or local." >&2
        exit 1
        ;;
      *) echo "GUIDE_TRACKER must be github, gitlab, local or other, got '$tracker'" >&2; exit 1 ;;
    esac
    case "$domain_layout" in
      single|multi) : ;;
      *) echo "GUIDE_DOMAIN_LAYOUT must be single or multi, got '$domain_layout'" >&2; exit 1 ;;
    esac
    case "$adr_dir" in
      /*|*..*|"") echo "GUIDE_ADR_DIR must be a project-relative directory without '..', got '$adr_dir'" >&2; exit 1 ;;
    esac
    echo "ok  setup runs now: tracker=$tracker, domain docs=$domain_layout (ADRs in $adr_dir/)"
    ;;
  *) echo "GUIDE_SETUP must be yes or no, got '$GUIDE_SETUP'" >&2; exit 1 ;;
esac
```

## Phase 5 — Documents: constraints, reasons, traps, provenance

Four documents, each with one job:

- **`AGENTS.md`** — what to do. The generator's own marked block stays exactly as written,
  with one correction appended below it: `vp env doctor` exists only in the global CLI, which
  this project deliberately does not use. The rules that only one arrangement has are appended only
  in that arrangement: the frontend modes get the dev-proxy rules, the server modes the server ones,
  the SSR shape the rendering ones on top, and each workspace arrangement the workspace rules plus
  its own (the proxy's, in the package that owns the dev server; the root-as-application rules,
  where the root is one). Nothing describes a package or a file this project does not have.
- **the inherited ADRs** — why, and what would change the decision. They land in the directory this
  project's own convention names (Phase 4.5 wrote that convention when the setup flow ran, and the
  step below reads it back out); the guide's default, `docs/adr/`, applies when there is no
  convention to read.
- **`docs/agent-notes.md`** — what is already known to bite, as facts rather than rules, in the
  same shape: the traps every mode shares, plus the ones this mode's stack brings with it.
- **`docs/provenance.md`** — what was actually installed and chosen, so a future anomaly can
  be attributed to a version instead of guessed at.

The ADR landing point comes first, because the documents that point at it are written after it.

```bash guide:exec id=adr-convention
set -euo pipefail

# Where the inherited ADRs land is the project's decision, not this guide's. The setup flow records
# it in the convention file the project's own brief points at (`docs/agents/domain.md`), so this
# step reads that file — the same way an agent reading the project would — and writes down what it
# resolved. No convention (the setup flow was deferred, or the file names none) means the default,
# and the deferred case is recorded in the birth certificate precisely because it is an assumption
# rather than a decision.
node --input-type=module - <<'NODE'
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function fail(message) {
  console.error(`adr-convention: ${message}`);
  process.exit(1);
}

// The convention file the project's own brief names. The brief is whichever of CLAUDE.md/AGENTS.md
// the repo has, its `### Domain docs` section is where the file is named, and the setup flow's own
// path is the fallback when nothing names one.
function conventionFromBrief(brief) {
  const lines = readFileSync(brief, "utf8").split("\n");
  const at = lines.findIndex((line) => /^### Domain docs[ \t]*$/.test(line));
  if (at < 0) return null;
  const section = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    if (/^#{1,3} /.test(lines[i])) break;
    section.push(lines[i]);
  }
  const paths = (section.join("\n").match(/`[^`]+\.md`/g) ?? [])
    .map((token) => token.slice(1, -1))
    .filter((path) => path.includes("/"));
  return paths.length ? paths[paths.length - 1] : null;
}

let convention = null;
for (const brief of ["CLAUDE.md", "AGENTS.md"]) {
  if (!existsSync(brief)) continue;
  convention = conventionFromBrief(brief);
  if (convention) break;
}
convention ??= "docs/agents/domain.md";

// The convention shows this repo's layout as a directory tree, and the inherited (system-wide)
// decisions belong in the directory that tree gives for the numbered NNNN-*.md files. A tree line
// may carry an annotation after the path (`docs/adr/    ← system-wide decisions`) — the skill's own
// seed writes multi-context exactly that way — so only the first token of a line is the name. The
// directory holding the numbered files is the answer; a tree that shows the layout only as
// annotations, with no files beneath, answers with the annotated directory instead.
function adrDirFromConvention(text) {
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  let annotated = null;
  for (const block of text.matchAll(fence)) {
    const stack = [];
    for (const raw of block[1].split("\n")) {
      const match = /^([\s│├└─]*)(.*?)\s*$/.exec(raw);
      const rest = match[2];
      if (!rest) continue;
      const name = rest.split(/\s+/)[0];
      const annotation = rest.slice(name.length);
      const level = Math.floor(match[1].length / 4);
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].path : "";
      if (name === "/") { stack.push({ level, path: "" }); continue; }
      if (name.endsWith("/")) {
        const path = `${parent}${name.slice(0, -1)}`;
        stack.push({ level, path });
        if (annotated === null && /[←#]|\s--/.test(annotation)) annotated = path;
        continue;
      }
      if (/^\d{4}-.*\.md$/.test(name) && parent) return parent;
    }
  }
  return annotated;
}

let dir = "docs/adr";
let source = "the guide's default (no convention names one)";
if (existsSync(convention)) {
  const resolved = adrDirFromConvention(readFileSync(convention, "utf8"));
  if (resolved) {
    if (resolved.startsWith("/") || resolved.split("/").includes("..")) {
      fail(`${convention} names ${resolved}, which is not a directory inside this project`);
    }
    dir = resolved.replace(/\/+$/, "");
    source = `the project's convention, ${convention}`;
  } else {
    source = `the guide's default (${convention} names no ADR directory)`;
  }
} else {
  source = `the guide's default (${convention} does not exist: the setup flow was deferred)`;
}

writeFileSync(".vite-plus-adr-dir", `${dir}\n`);
writeFileSync(".vite-plus-adr-source", `${source}\n`);
console.log(`ok  the inherited ADRs land in ${dir}/ — ${source}`);
NODE
```

```bash guide:exec id=agents-md
set -euo pipefail

# The landing point the convention resolved: the constraints' closing line points at it, and this
# step runs before the ADRs are installed there.
adr_dir=$(cat .vite-plus-adr-dir)
[ -n "$adr_dir" ] || { echo "adr-convention resolved no landing point" >&2; exit 1; }

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
- If a command this project needs fails because the environment blocks it — network, registry,
  credentials, sandbox — retry it once, unchanged, with the narrowest escalation that unblocks it,
  and say why. Never work around a failing test or a sandbox denial, and never retry blindly after
  an operation that may have had side effects.

### Path aliases

- Import cross-directory modules as `#/…` (extensionless), resolved from the **package** root: the
  project root in a single project, and each package's own root in a workspace — a file is reached
  as `#/<path-from-that-package's-root>`, and a package with no map simply has no aliases. The only
  alias mechanism is the `imports` map in that package's `package.json`. Never add `paths` to a
  tsconfig, `resolve.alias` to the Vite config, or `resolve.tsconfigPaths` — each one silently
  out-ranks `imports` for some consumer, so the type checker and the bundler can disagree without
  either going red.
- Keep the `types` branch first in that map: TypeScript never probes extensions, so a
  `default`-only map makes every aliased import a type error while dev and build stay green.

### Configuration

- Configuration must earn its place: delete what equals a default, keep what has an effect.
- Deleting configuration requires re-running the verification **and** re-proving that type
  checking still catches a deliberate error. "Looks like a default" is a hypothesis, not
  evidence.
AGENTS

echo "ok  constraints section appended"
```

```bash guide:exec id=agents-md-tail
set -euo pipefail

# The closing line and the checks read the landing point again: shell state does not cross a
# step boundary, so this step re-reads what adr-convention wrote.
adr_dir=$(cat .vite-plus-adr-dir)
[ -n "$adr_dir" ] || { echo "adr-convention resolved no landing point" >&2; exit 1; }

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

### Documents and decisions

- Every fact has one home: how to work goes in this file, why a choice was made goes in the ADRs,
  what has already bitten goes in `docs/agent-notes.md`, and what was installed goes in
  `docs/provenance.md`. Refer to a fact elsewhere by link, never by restating it — a copy drifts.
- A decision record keeps the alternatives it beat: an ADR describes the shipped decision in the
  present tense, is updated when the code moves, and is superseded by a new record that links
  back — never rewritten into a different decision.
- Anything that can drift — a version, an upstream default, a command's output — says what to
  re-check when it moves. Without that sentence a stale fact reads like a current one.
AGENTS

# The closing line names the directory the convention actually resolved. It is printed here rather
# than shipped inside the heredoc above because that path is not known until the convention has
# been read, and a constraints document pointing at the wrong directory is worse than one pointing
# at none.
printf '\nSee `docs/agent-notes.md` for the traps behind these rules, and `%s/` for the reasoning.\n' "$adr_dir" >> AGENTS.md

grep -q '<!--VITE PLUS START-->' AGENTS.md
grep -q '## Project constraints' AGENTS.md
grep -qF "\`$adr_dir/\`" AGENTS.md
echo "ok  constraints section appended, tool-owned block preserved, ADR directory named as $adr_dir/"
```


The inherited ADRs are shipped as text below, into a staging directory, because their landing
point is the one `adr-convention` just resolved: `adr-land` installs them where that step said,
and stops rather than overwriting a document that is already there — a file at that path is
somebody's decision, not a place to write over.

```markdown guide:file path=.vite-plus-inherited-adrs/0001-toolchain.md
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

```markdown guide:file path=.vite-plus-inherited-adrs/0002-code-locality.md
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

```bash guide:exec id=adr-land
set -euo pipefail

adr_dir=$(cat .vite-plus-adr-dir)
source=$(cat .vite-plus-adr-source)
stage=.vite-plus-inherited-adrs

[ -d "$stage" ] || { echo "the inherited ADRs are not staged in $stage" >&2; exit 1; }
[ -n "$adr_dir" ] || { echo "adr-convention resolved no landing point" >&2; exit 1; }
staged=$(find "$stage" -maxdepth 1 -name '*.md' | wc -l)
[ "$staged" -gt 0 ] || { echo "no inherited ADR is staged in $stage" >&2; exit 1; }

# Install, never overwrite: a document already at the landing point is somebody else's decision,
# and an inherited document is not allowed to replace one. This is the rule the setup flow follows
# for the brief as well — a file that already has a section is edited where it is.
#
# The whole set is checked *before* anything is copied, and that order is the point: an install that
# copies until it meets a conflict leaves a half-landed directory, and the only recovery it could
# offer ("resolve the conflict and re-run") would then fail again on the files it had just put
# there. Validate all, then copy all.
mkdir -p "$adr_dir"
conflicts=()
for file in "$stage"/*.md; do
  name=$(basename "$file")
  if [ -e "$adr_dir/$name" ]; then conflicts+=("$adr_dir/$name"); fi
done
if [ "${#conflicts[@]}" -gt 0 ]; then
  echo "$adr_dir is not empty where the inherited ADRs have to land: nothing was copied." >&2
  printf '  %s already exists\n' "${conflicts[@]}" >&2
  echo "read each one, keep whichever version is right (move the other aside), and re-run this step" >&2
  exit 1
fi

landed=0
for file in "$stage"/*.md; do
  name=$(basename "$file")
  cp "$file" "$adr_dir/$name"
  # Prove the landing instead of trusting the copy: byte-identical, at the resolved directory.
  cmp -s "$file" "$adr_dir/$name" || { echo "$adr_dir/$name does not match the inherited document $file" >&2; exit 1; }
  landed=$((landed + 1))
done

# The staging directory goes: the documents live at the landing point, not in a scratch directory.
rm -rf "$stage"
echo "ok  $landed inherited ADRs installed in $adr_dir/ — $source"
```

```markdown guide:file path=docs/agent-notes.md
# Agent notes — known traps and version facts

Facts about this project's stack, recorded because each one has already cost someone time.
Rules live in `AGENTS.md`; the ADRs behind them live in the directory `docs/provenance.md`
records — shipped text cannot name a path this run decides.

Record a trap here only if it has actually been hit, its failure is silent, and rediscovering it
would cost real time. Each entry says what happened and why the existing verification did not
catch it; an entry that cannot answer that second question is a fact to delete, not a rule to add.

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

- TypeScript is the 7.x line. The pin this project actually resolved is the one
  `docs/provenance.md` records (`^7.0.2` when this guide's own default was answered) — read it
  there rather than assuming it here.
- If this project uses the TypeScript 6 API bridge (`typescript-native-bridge`, needed by
  `vue-tsc` and friends), `tsc --version` prints the classic API's version (6.0.3 for the bridge
  this guide pins) while the package version carries `-bridge…`. Never assert the TypeScript
  version from that string; check the resolved package instead.
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
- `vp test` exits 1 when it finds no test files, which is why a project that has a test script
  passes `--passWithNoTests` until there is something to run. A green test command over an empty
  suite means the runner is wired, not that anything is covered.
```

```bash guide:exec id=provenance
set -euo pipefail
: "${GUIDE_MODE:?}"; : "${GUIDE_LAYOUT:?}"; : "${GUIDE_FRAMEWORK:?}"
: "${GUIDE_PM:?}"; : "${GUIDE_VP_VERSION:?}"; : "${GUIDE_TS_VERSION:?}"
: "${GUIDE_SKILLS_VERSION:?}"; : "${GUIDE_SETUP:?}"

# The landing point the convention resolved, and where that resolution came from: the birth
# certificate is the one document that says *why* the inherited ADRs are where they are, which is
# what makes moving them later (or leaving them) a decision instead of a guess.
adr_dir=$(cat .vite-plus-adr-dir)
adr_source=$(cat .vite-plus-adr-source)
[ -n "$adr_dir" ] || { echo "adr-convention resolved no landing point" >&2; exit 1; }

vite_plus_version=$(node -p 'require("./node_modules/vite-plus/package.json").version')
# In the monorepo layout TypeScript belongs to the packages that compile; the root's own program is
# type-checked by the toolchain's checker, and the root manifest has no typescript dependency to
# read a version from. Which package that is depends on the arrangement: the app in the shapes that
# have one, the placeholder package in a backend workspace that kept it — and a backend workspace
# that deleted the placeholder has no compiled package at all, which is a fact this record states
# rather than one it guesses at.
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  typescript_pin=$(grep -E '^[ \t]+typescript:' pnpm-workspace.yaml | head -1 | sed -E 's/^[ \t]+typescript:[ \t]*//')
  if [ -d apps/website/node_modules/typescript ]; then
    typescript_version=$(node -p 'require("./apps/website/node_modules/typescript/package.json").version')
  elif [ -d packages/utils/node_modules/typescript ]; then
    typescript_version=$(node -p 'require("./packages/utils/node_modules/typescript/package.json").version')
  else
    typescript_version="not installed in a package of this workspace (the root's program is checked by the toolchain)"
  fi
else
  typescript_version=$(node -p 'require("./node_modules/typescript/package.json").version')
  typescript_pin="$GUIDE_TS_VERSION"
fi
create_vite_version=$(grep -oE 'create-vite[ @]+[0-9]+\.[0-9]+\.[0-9]+' .vite-plus-create.log | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)
# `vp create` resolves create-vite through the package manager's dlx cache and, on the Vite+ this
# guide pins, prints no version of its own — so when the log carries none, the version is read from
# where the resolver left it. Best-effort on purpose: this is a record, not an assertion, and a
# version that cannot be found is written down as not printed rather than guessed at.
if [ -z "$create_vite_version" ]; then
  create_vite_version=$(find "${XDG_CACHE_HOME:-$HOME/.cache}/pnpm/dlx" -maxdepth 8 -type f \
    -path '*create-vite@*/node_modules/create-vite/package.json' 2>/dev/null \
    | head -1 | sed -E 's#.*/create-vite@([^/]+)/.*#\1#' || true)
fi
skills_commit=$(cat .vite-plus-skills-commit)
skill_count=$(node -p 'Object.keys(require("./skills-lock.json").skills).length')

# What the record says depends on the profile: a backend project has a server and no proxy, a
# frontend project the other way round, the SSR shape has both halves in one origin, the split shape
# has both halves in two packages, a backend workspace has the server and no client package, and a
# frontend workspace has the app and no server. Naming another profile's fact here — a proxy target
# that does not exist, a frontend package that was deleted, or a server that was never installed —
# would put a wrong fact in the one document whose whole job is to be the record.
toolchain_rows="| vite-plus | ${vite_plus_version} | \`${GUIDE_VP_VERSION}\` (prerelease) |
| TypeScript | ${typescript_version} | \`${typescript_pin}\` |
| create-vite | ${create_vite_version:-not printed by vp create in this run} | \`create-vite@latest\`, unpinnable upstream |"
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
# Read back the four rows the arm of this shape wrote above. Which arm ran is the shape's own
# decision and this step runs in every shape, so a missing file means the arm never ran: the record
# would then be a template with a hole in it, which is worse than a stop.
for row in choice scaffold server verify; do
  [ -s ".vite-plus-prov-$row" ] || {
    echo "no provenance arm wrote .vite-plus-prov-$row for $GUIDE_MODE/$GUIDE_LAYOUT; stop and report" >&2
    exit 1
  }
done
choice_rows=$(cat .vite-plus-prov-choice)
scaffold_line=$(cat .vite-plus-prov-scaffold)
server_step=$(cat .vite-plus-prov-server)
verify_step=$(cat .vite-plus-prov-verify)

# The setup decision point's record, and — in the deferred branch — the assumption it leaves
# behind. The paragraph is what makes the landing point above revisitable: it names the documents
# that carry the directory, so a project that adopts a convention later knows what to update.
# `$(cat …)` strips the trailing newline, so the template below keeps a blank line after
# `${assumptions}`: without it the last line of that paragraph is glued to the next heading, and a
# `##` that does not start a line is not a heading.
if [ "$GUIDE_SETUP" = yes ]; then
  setup_row="yes — the skill's flow ran, and the convention it wrote (Phase 4.5) named the landing point"
  assumptions=""
else
  setup_row="no — deferred to the user, so no convention was negotiated"
  assumptions=$(cat <<'ASSUMPTIONS'
## Assumptions worth revisiting

- **The skills setup was deferred** at Phase 4.5 (`GUIDE_SETUP=no`), so this project never
  negotiated its domain-doc convention and the inherited ADRs took the guide's default landing
  point — an assumption, not a decision. When a convention does arrive, run
  `/setup-matt-pocock-skills` (or write `docs/agents/domain.md` yourself) and move the ADRs to the
  directory it names. Two documents carry the directory — `AGENTS.md` (the closing line of the
  constraints) and this file — and `docs/agent-notes.md` points at this record rather than naming a
  path of its own.

ASSUMPTIONS
)
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
| Skills setup run now | ${setup_row} |
| Inherited ADR landing point | \`${adr_dir}/\` — ${adr_source} |

## Toolchain that resolved

| Component | Version | Pinned as |
| --- | --- | --- |
${toolchain_rows}

create-vite is the one unpinnable piece: \`vp create\` resolves it from \`create-vite@latest\`, and
upstream offers no way to pin it. The row above carries the version this run resolved — read from
the resolver's own dlx cache when \`vp create\` printed none — or says so when it could not be read
at all, which is a fact about this record rather than a version to guess at.

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

## What to re-check when upstream moves

Each fact below can go stale without anything going red, so this table is where a re-check starts.

| Fact | Re-check by |
| --- | --- |
| \`vite-plus\` pin | \`vp --version\`; releases are prerelease-tagged, so read the release notes before \`vp migrate\` |
| TypeScript pin | the resolved package version — not \`tsc --version\`, which a bridge reports as its own |
| Installed skills | re-resolve the upstream plugin manifest and compare its name set with \`skills-lock.json\` |
| Scaffold skeleton | \`create-vite\` cannot be pinned: a later re-run may produce a different skeleton, so diff before assuming |

## Steps executed

1. Preflight: empty target, Node version, package managers actually available, global Vite+ detected and avoided.
2. Decision points: mode/layout/framework/package manager; versions (prereleases disclosed).
${scaffold_line}
${server_step}
5. Skills: upstream set resolved at run time, installed, lockfile verified against that set.
6. Setup decision: recorded above.
7. Documents: constraints in \`AGENTS.md\`, inherited ADRs in \`${adr_dir}/\`, traps in \`docs/agent-notes.md\`, this file.
${verify_step}

${assumptions}

## If something looks wrong

Start here before changing code: the version table above is the shortest path to the right
documentation, and \`docs/agent-notes.md\` lists the failures that are known to be silent.
PROVENANCE

# Every `.vite-plus-*` file goes, not a list: the scratch convention is the prefix, and a list is
# one edit away from leaving a file behind (the probes' control logs are the ones that used to
# survive a failure). `-r` because one of them is a directory when a run stops before adr-land.
rm -rf .vite-plus-*
echo "ok  docs/provenance.md written"
```

## Phase 6 — Verify (the assertion set)

Run this as one script and stop if any part of it fails. A red result is a report, not a task
list: do not adjust the project until the verification agrees with it. This is the assertion
set for what one run built — the code, and the documents Phase 5 wrote; Phase 7's report is
speech rather than an artefact, so nothing here asserts it. The E2E harness runs this exact text
rather than keeping its own copy of these checks, because a second copy would be a second truth.

The proxy part of the frontend smoke test calls the backend named by `GUIDE_DEV_PROXY` (a pure
frontend) or this workspace's own root server (the split shape), so that backend has to be
reachable while this runs. If it is not, the proxy answers `502` and verification fails — which is
the correct outcome, not a reason to skip the check. The server-side smokes need nothing external:
they start the artefact the build just produced, then the dev server, and assert what each one
answers. In the SSR shape that assertion is the **render marker** — markup only the server-side
render can produce — because a `200` alone is exactly what the silent client-shell degradation
returns; in the split shape it is the **path the server received** — `/hello` rather than
`/api/hello` — because that is what "the prefix was stripped" means, and a proxy that forwards the
prefix unconsumed answers a 404 that looks like a missing route.

```bash guide:verify id=verify
set -euo pipefail
: "${GUIDE_MODE:?}"; : "${GUIDE_LAYOUT:?}"; : "${GUIDE_PM:?}"
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # A root server keeps Nitro's default port in this layout, and an app keeps Vite's.
  dev_port=${GUIDE_DEV_PORT:-3000}
else
  dev_port=${GUIDE_DEV_PORT:-5173}   # Vite's own default; override only to dodge a busy port
fi
# The smoke script reads the port from the environment, and the extractor's rule is that every
# `$GUIDE_…` named without a default has to have been answered — the port is an answer with a
# default, so it is read once here and used under a local name from there on.
GUIDE_DEV_PORT="$dev_port"
# Read into a local with a default: the app's port belongs to the monorepo layout, and this step
# runs in every profile, where the extractor requires every `$GUIDE_…` named without a default to
# have been answered.
website_port=${GUIDE_WEBSITE_PORT:-5173}
export GUIDE_DEV_PORT GUIDE_MODE GUIDE_LAYOUT

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

# The count of what this script checked, printed once at the end: a section that ran, a receipt
# that was printed, or a deliverable assertion that passed each increments it, so deleting or
# skipping one moves the number. A verification whose size cannot be seen is a verification whose
# shrinkage cannot be seen either.
checks=0
step() { checks=$((checks + 1)); printf '\n== %s ==\n' "$*"; }
ok() { checks=$((checks + 1)); printf 'ok  %s\n' "$*"; }
done_checking() { printf 'ok  verification passed: %s checks ran\n' "$checks"; }

# An answer only one profile reads is checked in that profile: the frontend smokes go through a
# proxy to a backend this project does not own, the split shape's page and API are two servers, and
# the server smokes call their own server on one port. The proxy target is read with the placeholder
# default, because the answer is allowed to be the placeholder.
case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single|frontend/monorepo)
    GUIDE_DEV_PROXY=${GUIDE_DEV_PROXY:-http://127.0.0.1:3000}
    [ -n "${GUIDE_PROXY_SMOKE_PATH:-}" ] || { echo "GUIDE_PROXY_SMOKE_PATH was never answered (Phase 3.5)" >&2; exit 1; }
    export GUIDE_DEV_PROXY GUIDE_PROXY_SMOKE_PATH
    ;;
  backend/single|backend/monorepo|fullstack/single|fullstack/monorepo) ;;
  *) echo "no verification is implemented for profile '$GUIDE_MODE/$GUIDE_LAYOUT'" >&2; exit 1 ;;
esac

step "format"
$VP fmt

step "static check (format + lint + types)"
# At the workspace root this is the workspace's static check: `vp check` walks every package, and
# the controls that proved it were run in Phase 3.
$VP check

step "the workspace form of the static check, and what it skips"
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # `vp run -r check` runs each package's own `check` script. apps/website has none — create-vite
  # writes a dev/build/preview app — so it is skipped silently, by contract. That skip is not
  # invisible: the task summary of `-v` lists every scheduled task, so its absence from that list
  # is the assertion. (`-v` goes before the task name; after it, the flag is forwarded to the task
  # and vp fails.)
  $VP run -r -v check > .vite-plus-check-all.log 2>&1 || {
    cat .vite-plus-check-all.log >&2
    echo "vp run -r check failed" >&2
    exit 1
  }
  grep -q '#check' .vite-plus-check-all.log || {
    echo "vp run -r check scheduled no check task at all" >&2
    exit 1
  }
  if grep -q 'apps/website' .vite-plus-check-all.log; then
    cat .vite-plus-check-all.log >&2
    echo "vp run -r check scheduled apps/website, which has no check script" >&2
    exit 1
  fi
  rm -f .vite-plus-check-all.log
  if [ "$GUIDE_MODE" = frontend ] || [ "$GUIDE_MODE" = fullstack ]; then
    ok "vp run -r check ran the packages that define a check script and skipped apps/website"
  else
    ok "vp run -r check ran the packages that define a check script"
  fi
else
  echo "single project: the vp check above is the whole check"
fi

step "build (the project's own build script)"
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # One command, every package: the root server, the app, and the placeholder package each build
  # into their own dist/. This is the workspace form of the build script, and the reason the
  # packages do not each need to be remembered. `--no-cache` because a task runner replays what it
  # has already built, and a verification step has to make the build happen rather than trust a
  # cache entry.
  $VP run --no-cache -r build
else
  pm_run run build
fi

step "the build output is where it belongs"
case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single)
    [ -f dist/index.html ] || { echo "the build produced no dist/index.html" >&2; exit 1; }
    ok "dist/index.html"
    ;;
  backend/single)
    [ -f dist/server/index.mjs ] || { echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/, and the ignore rules do not cover it" >&2; exit 1; }
    ok "dist/server/index.mjs and dist/nitro.json, with no .output/ beside them"
    ;;
  fullstack/single)
    # Both halves have to be in the output: the client bundle the document references, and the SSR
    # renderer the server bundle loads. `_ssr/` exists only in an SSR build — a client-only build
    # leaves it out even when everything else about the server looks right.
    [ -f dist/server/index.mjs ] || { echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
    [ -f dist/server/_ssr/ssr.mjs ] || { echo "the build produced no SSR renderer (dist/server/_ssr/ssr.mjs) — this is a client-only build" >&2; exit 1; }
    [ -n "$(ls dist/public/assets/*.js 2>/dev/null)" ] || { echo "the build produced no client bundle under dist/public/assets" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/, and the ignore rules do not cover it" >&2; exit 1; }
    ok "client bundle in dist/public/assets, the SSR renderer in dist/server/_ssr, no .output/ beside them"
    ;;
  fullstack/monorepo)
    # Three packages, three outputs, and the root's output is the server's. The app's build is
    # asserted here too: the workspace build is one command, so "it passed" has to mean every
    # package produced what it is for.
    [ -f dist/server/index.mjs ] || { echo "the root build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the root build produced no dist/nitro.json" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/ at the root; output.dir did not take effect" >&2; exit 1; }
    [ -f apps/website/dist/index.html ] || { echo "the app build produced no apps/website/dist/index.html" >&2; exit 1; }
    if [ "${GUIDE_PLACEHOLDER:-}" = yes ]; then
      [ -f packages/utils/dist/index.mjs ] || { echo "the placeholder package build produced no packages/utils/dist/index.mjs" >&2; exit 1; }
      ok "root dist/server/index.mjs + dist/nitro.json, apps/website/dist, packages/utils/dist, no .output/"
    else
      ok "root dist/server/index.mjs + dist/nitro.json, apps/website/dist, no .output/"
    fi
    ;;
  backend/monorepo)
    # One package that matters — the root, whose output is the server's — and one that may exist.
    # The workspace build is one command, so "it passed" has to mean the root produced its artefact:
    # a root build task that is missing or was left pointing at the deleted app builds nothing.
    [ -f dist/server/index.mjs ] || { echo "the workspace build produced no dist/server/index.mjs — the root's build is not covering the server" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the workspace build produced no dist/nitro.json" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/ at the root; output.dir did not take effect" >&2; exit 1; }
    [ ! -e apps ] || { echo "a backend workspace has no client, and apps/ exists" >&2; exit 1; }
    if [ "${GUIDE_PLACEHOLDER:-}" = yes ]; then
      [ -f packages/utils/dist/index.mjs ] || { echo "the placeholder package build produced no packages/utils/dist/index.mjs" >&2; exit 1; }
      ok "root dist/server/index.mjs + dist/nitro.json, packages/utils/dist, no .output/, no apps/"
    else
      ok "root dist/server/index.mjs + dist/nitro.json, no .output/, no apps/"
    fi
    ;;
  frontend/monorepo)
    # The app is the only artefact that matters, and there is no server anywhere in this workspace:
    # a `dist/server/index.mjs` at the root would mean the layout grew a server the mode did not ask
    # for.
    [ -f apps/website/dist/index.html ] || { echo "the app build produced no apps/website/dist/index.html" >&2; exit 1; }
    [ ! -e dist/server/index.mjs ] || { echo "this workspace has no server, but the root built one" >&2; exit 1; }
    if [ "${GUIDE_PLACEHOLDER:-}" = yes ]; then
      [ -f packages/utils/dist/index.mjs ] || { echo "the placeholder package build produced no packages/utils/dist/index.mjs" >&2; exit 1; }
      ok "apps/website/dist, packages/utils/dist, no root server output"
    else
      ok "apps/website/dist, no root server output"
    fi
    ;;
  *)
    # Without this arm a shape this revision does not know would print the banner above and assert
    # nothing about where its build output went — the section would look passed and check nothing.
    echo "no build-output assertion is implemented for $GUIDE_MODE/$GUIDE_LAYOUT; stop and report" >&2
    exit 1
    ;;
esac

step "static check after the build"
# `vp fmt` and `vp check` take their file set from the ignore rules, so this second check is also
# the assertion that the build output really landed somewhere ignored — which in this layout means
# the root's `dist/`, the app's `apps/website/dist` and the placeholder's `packages/utils/dist`
# alike.
$VP check

step "the documents this run wrote"
# Phase 5's half of the deliverable, asserted here from outside the way a reader would check it: the
# record, the constraints, the landed ADRs, the traps, and the skills lockfile. Without this section
# a run could drop Phase 5 and still print "verification passed" — the code half of the
# initialization would be proven and the documents half assumed.
[ -f docs/provenance.md ] || { echo "docs/provenance.md is missing — Phase 5 wrote no record" >&2; exit 1; }
grep -qE '^\| Inherited ADR landing point \| `[^`]+/` — .+ \|$' docs/provenance.md || {
  echo "docs/provenance.md records no ADR landing point, or not where it came from" >&2
  exit 1
}
adr_dir=$(sed -n 's/^| Inherited ADR landing point | `\(.*\)\/` — .*$/\1/p' docs/provenance.md)
[ -n "$adr_dir" ] || { echo "the recorded ADR landing point could not be read back" >&2; exit 1; }
ok "docs/provenance.md records the landing point $adr_dir/ and its source"

[ -f AGENTS.md ] || { echo "AGENTS.md is missing" >&2; exit 1; }
grep -q '## Project constraints' AGENTS.md || { echo "AGENTS.md carries no '## Project constraints' section" >&2; exit 1; }
grep -qF "\`$adr_dir/\`" AGENTS.md || { echo "AGENTS.md's closing line does not name the recorded ADR directory \`$adr_dir/\`" >&2; exit 1; }
ok "the constraints are in AGENTS.md, whose closing line names $adr_dir/"

[ -d "$adr_dir" ] || { echo "the recorded ADR landing point $adr_dir/ does not exist" >&2; exit 1; }
for expected in 0001-toolchain 0002-code-locality; do
  ls "$adr_dir"/$expected*.md > /dev/null 2>&1 || {
    echo "$adr_dir/ holds no $expected*.md: the inherited ADRs did not land where the record says" >&2
    exit 1
  }
done
for file in "$adr_dir"/*.md; do
  [ -s "$file" ] || { echo "$file is empty" >&2; exit 1; }
  head -1 "$file" | grep -q '^# ' || { echo "$file has no heading; it is not the document the guide shipped" >&2; exit 1; }
done
landed=$(find "$adr_dir" -maxdepth 1 -name '*.md' | wc -l)
ok "$landed inherited ADRs are at $adr_dir/"

[ -f docs/agent-notes.md ] || { echo "docs/agent-notes.md is missing" >&2; exit 1; }
grep -q '^# Agent notes — known traps and version facts' docs/agent-notes.md || {
  echo "docs/agent-notes.md is not the shipped traps document: its header is missing" >&2
  exit 1
}
grep -q '^## Two engines, one green light' docs/agent-notes.md || {
  echo "docs/agent-notes.md carries no traps section — an append-created shell looks like this" >&2
  exit 1
}
ok "docs/agent-notes.md is the shipped document, traps included"

installed_skills=$(node --input-type=module - <<'NODE'
import { existsSync, readFileSync, readdirSync } from "node:fs";
const locked = Object.keys(JSON.parse(readFileSync("skills-lock.json", "utf8")).skills).sort();
const dirs = existsSync(".agents/skills") ? readdirSync(".agents/skills") : [];
const installed = dirs.filter((name) => existsSync(`.agents/skills/${name}/SKILL.md`)).sort();
const missing = locked.filter((name) => !installed.includes(name));
const extra = installed.filter((name) => !locked.includes(name));
if (missing.length || extra.length) {
  console.error(`skills-lock.json and .agents/skills disagree: locked but not installed [${missing}], installed but not locked [${extra}]`);
  process.exit(1);
}
if (installed.length === 0) { console.error("no skill is installed under .agents/skills/"); process.exit(1); }
process.stdout.write(String(installed.length));
NODE
)
ok "$installed_skills skills are installed, and skills-lock.json names exactly those"

step "tests"
if node -e 'process.exit(require("./package.json").scripts?.test ? 0 : 1)'; then
  if [ "$GUIDE_LAYOUT" = monorepo ]; then
    # The root's test script scans the workspace, so this runs every package's tests once. The `-r`
    # form would run the root's scan *and* each package's own test script — the same file twice.
    $VP run test
  else
    pm_run run test
  fi
else
  echo "no test script in this profile - nothing to run"
fi

step "smoke: the server that was built, and the dev server"

prod_pid=""
dev_pid=""
website_pid=""
cleanup() {
  if [ -n "$prod_pid" ]; then kill "$prod_pid" 2>/dev/null || true; wait "$prod_pid" 2>/dev/null || true; fi
  if [ -n "$dev_pid" ]; then kill "$dev_pid" 2>/dev/null || true; wait "$dev_pid" 2>/dev/null || true; fi
  if [ -n "$website_pid" ]; then kill "$website_pid" 2>/dev/null || true; wait "$website_pid" 2>/dev/null || true; fi
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

smoke() {  # smoke <base-url> <description-of-the-server> [frontend-url]
  BASE_URL="$1" WHAT="$2" WEBSITE_URL="${3:-}" node --input-type=module - <<'NODE'
const base = process.env.BASE_URL;
const website = process.env.WEBSITE_URL;
const what = process.env.WHAT;
const path = process.env.GUIDE_PROXY_SMOKE_PATH ?? "";
const failures = [];
const get = async (url) => {
  const response = await fetch(url);
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
};

// The app answers its own page, and the page loads this project's entry module. A browser is not
// part of this verification, so the marker cannot be read from the served HTML (the module injects
// it when it runs) — it is read from the module the document names, which is the same "the server
// serves what it points at" claim the SSR shape's smoke makes. Every script the document asks for
// is followed, because the dev server injects its own client module ahead of the app's entry.
async function checkApp(url, marker) {
  const page = await get(`${url}/`);
  if (page.status !== 200 || !page.type.includes("text/html")) {
    failures.push(`the app at / answered ${page.status} ${page.type}, expected 200 text/html`);
    return;
  }
  const scripts = [...page.body.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  if (scripts.length === 0) {
    failures.push("the app's document has no module entry to load");
    return;
  }
  let found = "";
  const broken = [];
  for (const src of scripts) {
    const module = await get(new URL(src, url).href);
    if (module.status !== 200 || !module.type.includes("javascript")) {
      broken.push(`${src} (${module.status} ${module.type})`);
    } else if (module.body.includes(marker)) {
      found = src;
    }
  }
  if (!found) {
    failures.push(
      broken.length
        ? `the app's scripts do not all load: ${broken.join(", ")}`
        : `none of the app's scripts (${scripts.join(", ")}) carries the page marker — this is not the page the skeleton wrote`,
    );
  }
}

if (process.env.GUIDE_MODE === "frontend") {
  // The app is whatever the dev server of this shape serves: the project itself in the single
  // layout, the app package in the workspace layout.
  const appUrl = website || base;
  if (process.env.GUIDE_LAYOUT === "monorepo") {
    // The workspace arrangement's app is the one this guide pruned and wrote a marker into, so the
    // marker is what proves the page is that page.
    await checkApp(appUrl, "Frontend works");
  } else {
    // A single frontend keeps the app its scaffold wrote; the claim here is that its dev server
    // serves a document, and the marker belongs to the page this guide writes.
    const page = await get(`${appUrl}/`);
    if (page.status !== 200 || !page.type.includes("text/html")) {
      failures.push(`the app at / answered ${page.status} ${page.type}, expected 200 text/html`);
    }
  }

  // The whole point of the proxy: the backend sees the path WITHOUT the /api prefix. A proxy
  // that forwards the prefix unconsumed answers 404 here, and a missing proxy answers 200 with
  // this app's HTML - so require JSON and require the route to exist behind the prefix.
  const proxied = await get(`${appUrl}/api${path}`);
  if (proxied.status !== 200 || !proxied.type.includes("application/json")) {
    failures.push(`/api${path} answered ${proxied.status} ${proxied.type}, expected 200 application/json from the backend`);
  } else if (!proxied.body.includes(path)) {
    failures.push(`/api${path} did not reach the backend as ${path}: ${proxied.body.slice(0, 160)}`);
  }

  const unknown = await get(`${appUrl}/api/definitely-not-a-route`);
  if (unknown.status !== 404 || unknown.type.includes("text/html")) {
    failures.push(`an unknown /api path answered ${unknown.status} ${unknown.type}, expected 404 rather than the app's HTML`);
  }

  // Outside /api/, the app's own fallback answers — that contrast is what makes the check above
  // meaningful rather than incidental.
  if (process.env.GUIDE_LAYOUT === "monorepo") {
    const outside = await get(`${appUrl}/definitely-not-a-route`);
    if (outside.status !== 200 || !outside.type.includes("text/html")) {
      failures.push(`an unknown non-/api path answered ${outside.status} ${outside.type}, expected the app's HTML fallback`);
    }
  }
} else if (process.env.GUIDE_MODE === "fullstack" && process.env.GUIDE_LAYOUT === "monorepo") {
  // The split shape on its own server (no frontend URL given): the routes carry no /api prefix,
  // and the server answers JSON because no page is rendered in this package.
  const direct = await get(`${base}/hello`);
  if (direct.status !== 200 || !direct.type.includes("application/json")) {
    failures.push(`/hello answered ${direct.status} ${direct.type}, expected 200 application/json from the handler`);
  } else {
    let payload;
    try {
      payload = JSON.parse(direct.body);
    } catch {
      failures.push(`/hello did not answer JSON: ${direct.body.slice(0, 160)}`);
    }
    // The handler reports the path it received. On this server it must be /hello: the prefix
    // belongs to the proxy in front of it, and a route mounted under server/api/ would answer
    // /api/hello here instead.
    if (payload && payload.serverSawPath !== "/hello") {
      failures.push(`the server received ${JSON.stringify(payload.serverSawPath)}, expected /hello — this route carries no /api prefix`);
    }
  }

  const prefixed = await get(`${base}/api/hello`);
  if (prefixed.status !== 404) {
    failures.push(`/api/hello answered ${prefixed.status} on the server itself; its routes carry no /api prefix`);
  }

  if (!website) {
    // The built artefact and the dev server are the same server here; the app's half of the smoke
    // is the run with the frontend URL.
  } else {
    await checkApp(website, "Split works");

    // The whole point of the proxy chain: a request to the *frontend's* port on /api/* is answered
    // by the workspace root server as /hello. A missing proxy answers 200 with this app's HTML, a
    // proxy that forwards the prefix unconsumed answers 404, and a dead target answers 502 — so
    // require JSON, and require the server to report the stripped path.
    const proxied = await get(`${website}/api/hello`);
    if (proxied.status !== 200 || !proxied.type.includes("application/json")) {
      failures.push(
        `${website}/api/hello answered ${proxied.status} ${proxied.type}, expected 200 application/json from the workspace root server`,
      );
    } else {
      let payload;
      try {
        payload = JSON.parse(proxied.body);
      } catch {
        failures.push(`${website}/api/hello did not answer JSON: ${proxied.body.slice(0, 160)}`);
      }
      if (payload && payload.serverSawPath !== "/hello") {
        failures.push(
          `through the proxy the server received ${JSON.stringify(payload.serverSawPath)}, expected /hello — the /api/ prefix was not stripped`,
        );
      }
      if (payload && !String(payload.serverSawHost ?? "").includes(String(process.env.GUIDE_DEV_PORT))) {
        failures.push(
          `through the proxy the server reported host ${JSON.stringify(payload.serverSawHost)}, expected the root server on port ${process.env.GUIDE_DEV_PORT}`,
        );
      }
    }

    // Inside /api/, Vite's single-page fallback must not apply: an unknown path is the server's
    // 404, not this app's HTML.
    const unknownApi = await get(`${website}/api/definitely-not-a-route`);
    if (unknownApi.status !== 404 || unknownApi.type.includes("text/html")) {
      failures.push(
        `an unknown /api/ path through the proxy answered ${unknownApi.status} ${unknownApi.type}, expected 404 rather than the app's HTML`,
      );
    }

    // Outside /api/, the app's own fallback answers — that contrast is what makes the check above
    // meaningful rather than incidental.
    const unknown = await get(`${website}/definitely-not-a-route`);
    if (unknown.status !== 200 || !unknown.type.includes("text/html")) {
      failures.push(`an unknown non-/api path answered ${unknown.status} ${unknown.type}, expected the app's HTML fallback`);
    }
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

# What this shape runs, read once: a server artefact exists in the modes that have a server, and
# the root is that server in the monorepo layout; an app package exists in the modes that keep the
# frontend the template wrote.
has_server=no
case "$GUIDE_MODE" in
  backend|fullstack) has_server=yes ;;
  frontend) : ;;
  *) echo "unsupported mode: $GUIDE_MODE" >&2; exit 1 ;;
esac
has_app=no
case "$GUIDE_MODE" in
  frontend|fullstack) has_app=yes ;;
  backend) : ;;
  *) echo "unsupported mode: $GUIDE_MODE" >&2; exit 1 ;;
esac

# The artefact first: it is a plain node process, so it starts and stops deterministically, and
# stopping it frees GUIDE_DEV_PORT for the dev server that follows.
if [ "$has_server" = yes ]; then
  PORT="$dev_port" node dist/server/index.mjs > prod.log 2>&1 &
  prod_pid=$!
  # Every one of these answers on the same port its dev server will use; the readiness path is the
  # one each profile is guaranteed to serve (the SSR shape's renderer answers `/`, the others'
  # route answers `/hello`).
  if [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "fullstack/single" ]; then
    wait_ready "http://127.0.0.1:$dev_port/" prod.log
  else
    wait_ready "http://127.0.0.1:$dev_port/hello" prod.log
  fi
  smoke "http://127.0.0.1:$dev_port" "built server (node dist/server/index.mjs)"
  kill "$prod_pid" 2>/dev/null || true
  wait "$prod_pid" 2>/dev/null || true
  prod_pid=""
fi

if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # The dev servers are the packages this arrangement has: the root (the dev form of the artefact
  # above) when the root is an application, and the app where there is one. The proxy chain only
  # exists while both ends are up, so when both exist they are started together and the smoke reads
  # the app's port. No port flag: each server's port is in its own config (the `ports` step), which
  # is also what the user's own `vp dev` will read.
  if [ "$has_server" = yes ]; then
    $VP dev > server-dev.log 2>&1 &
    dev_pid=$!
    wait_ready "http://127.0.0.1:$dev_port/hello" server-dev.log
  fi
  if [ "$has_app" = yes ]; then
    $VP -C apps/website dev > website-dev.log 2>&1 &
    website_pid=$!
    wait_ready "http://127.0.0.1:$website_port/" website-dev.log
  fi
  if [ "$has_server" = yes ] && [ "$has_app" = yes ]; then
    smoke "http://127.0.0.1:$dev_port" "dev server (workspace root)" "http://127.0.0.1:$website_port"
  elif [ "$has_app" = yes ]; then
    # The app is the only dev server in this workspace, so its port is the one the smoke reads.
    smoke "http://127.0.0.1:$website_port" "dev server (apps/website)"
  else
    smoke "http://127.0.0.1:$dev_port" "dev server (workspace root)"
  fi
else
  $VP dev > dev.log 2>&1 &
  dev_pid=$!
  wait_ready "http://127.0.0.1:$dev_port/" dev.log
  smoke "http://127.0.0.1:$dev_port" "dev server"
fi

step "verification passed"
done_checking
```

## Phase 7 — Handoff

Report, in this order. The first two items are read back from what this run produced, the middle
two are the lines this run's own `report-*` step printed, and the last two are the same for every
shape — so a report can only say what this run actually did:

1. **What was built** — read it back from `docs/provenance.md` rather than from memory: the mode,
   layout, framework and package manager that were chosen, the ADR landing point and where it came
   from, and the versions that actually resolved.
2. **What was verified** — Phase 6's result, including the count line it printed (`ok  verification
   passed: N checks ran`), and the fact that the type checker was proven live with a planted error
   (Phase 3) rather than assumed. `docs/provenance.md` also names which branch of the setup decision
   point ran, and the assumption the deferred branch leaves behind.
3. **What is deliberate** — the lines your shape's `report-*` step printed under "Deliberate". They
   are the only deliberate facts that are true of this run; a fact from another shape would be
   wrong here even when it sounds right.
4. **What is not covered** — the same step's "Not covered" lines.
5. **Next steps** — put the project under version control yourself (`git init`; this guide
   deliberately does not touch version control), then start the first feature with
   `/grill-with-docs` so the design conversation happens before the code.
6. **Commands to live with** — the project's own toolchain, in vp form: `./node_modules/.bin/vp dev`
   (the dev server, on the port the project's own configuration names),
   `./node_modules/.bin/vp check` (format, lint, types), `./node_modules/.bin/vp run build` (the
   project's build script), `./node_modules/.bin/vp test` where the project defines one,
   `./node_modules/.bin/vp preview`, and `./node_modules/.bin/vp migrate` when it is time to move
   the toolchain forward. In the workspace layouts the root manifest's scripts are the commands
   (`vp run dev:server`, `vp run dev:website`, `vp run check`, `vp run build`, `vp run ready` as the
   one-command gate), `./node_modules/.bin/vp run -r <task>` runs a task across every package, and
   `./node_modules/.bin/vp add -w -D <name>` adds a dependency. In the server modes the build's
   artefact is started with `node dist/server/index.mjs`. pnpm, npm, yarn and bun commands are not
   part of this project's operation.
