
### Monorepo modes: one workspace, arranged around what the mode has

The monorepo layout means one pnpm workspace — one lockfile, one catalog of versions, and commands
registered at the root — and the mode decides what lives in it:

- **`fullstack` × `monorepo` is the split shape**: the **root package is the server** (Nitro v3 as
  a Vite plugin, `serverDir: "./server"`, `output: { dir: "dist" }`, routes without an `/api`
  prefix) and **`apps/website` is the frontend**, the app the monorepo template writes.
- **`backend` × `monorepo` is the same server, without a frontend**: the root is the server, the
  app the template wrote is deleted, and the workspace's other package is the placeholder decision.
- **`frontend` × `monorepo` is the same app under a shell root**: nothing in the workspace
  compiles a server, the root owns the catalog and the commands, and the app's backend is somebody
  else's — reached through the app's dev proxy.

The template wrote every one of these files; the work is pruning and wiring what it wrote, the same
shape of work the single-layout profiles do on their base. Four things decide whether the
composition is real, and each one is a place where the wrong answer is quiet:

- **A root that is an app has to be a target.** Vite+ refuses to act on a workspace root that has
  member packages: in the two shapes whose root is a server, `vp dev`/`vp build` print
  ``error: `vp dev` at the workspace root needs a target package.`` and exit 1, listing the
  members. `defaultPackage: "."` in the **root** `vite.config.ts` is the fix (the alternative is
  `vp -C . dev` on every command), and the step below asserts it in the file rather than trusting
  the patch; verification then proves what it is for, by starting the root server and reading a
  route off it. Without the line the failure is a hard stop, not a wrong output. A **shell root** —
  `frontend` × `monorepo` — is not a Vite app at all: no root app command is registered for it, so
  it needs no `defaultPackage`, and the guide does not write one.
- **The mode does not get to leave a dead command behind.** The template's root `"dev"` script is
  `vp run website#dev`: it names a package by its task, and a script that names a package which
  does not exist is a **silent no-op** — measured: exit 0, `vp run: 0/0 cache hit`, nothing runs. A
  backend workspace deletes `apps/website`, so that script must go rather than linger; every root
  command is re-pointed at what the workspace actually has, and the step refuses to leave any
  `vp run <package>#<task>` form in a manifest.
- **Routes carry no `/api` prefix in the server shapes.** The `/api` prefix belongs to the
  production reverse proxy and to the frontend's dev proxy, which strips it: the server sees
  `/hello`, and a project whose routes were mounted under `server/api/` would answer `/api/hello`
  in dev *and* have the proxy rewrite it to `/hello` — a 404 that only appears through the proxy.
  The route the smoke test reads back its own path, so "the prefix was stripped" is an assertion
  rather than a claim.
- **Every version lives in the workspace catalog.** The scaffold already ships
  `catalogMode: prefer` and a `catalog:` block with `vite-plus`, `typescript`, `vite` (an alias for
  `@voidzero-dev/vite-plus-core`) and `@types/node`; the app and the placeholder package already
  reference them with `"…": "catalog:"`. This step adds `nitro` to that block **in the modes that
  have a server**, adds the proxy transformer in the modes that have a proxy, and rewrites the
  specs that were written as literals (`typescript`, `@types/node`), so the root and every package
  resolve one version per dependency and a version is changed in exactly one place.
- **`vp install` is the install.** In a workspace the root owns the lockfile, and the layout's
  whole point is that one toolchain operates it: the project's `vp` installs for the workspace, the
  same way `vp run -r` runs tasks across it. (A package manager does appear once, in the ephemeral
  `vp create` bootstrap above, because at that point there is no `vp` to call.)

The commands that operate the workspace are registered in the root `package.json` and every one of
them is `vp`-form. A shape whose root is a server registers `dev:server` (`vp dev`), and — when the
app survives — `dev:website` (`vp -C apps/website dev`); a `frontend` workspace registers
`dev:website` and nothing else app-shaped. All of them register `check` (`vp check`) and `ready`.
The server shapes also register `test` and `build`, and their `ready` runs the root's own `vp test`
rather than `vp run -r test`: the root's test script already scans the whole workspace, and each
package's own test script would run the same files a second time. A `frontend` workspace registers
no `build` of its own — the root has nothing to build — so its `ready` is `vp check && vp run -r
build`, and the workspace build is `vp run -r build` itself. In every layout the template's stock
`"dev": "vp run website#dev"` is gone: it would either start the app a second time and hide the
server, or no-op against a package the mode deleted.

```bash guide:exec id=workspace-skeleton when=layout:monorepo
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_TS_VERSION:?Phase 2 must answer GUIDE_TS_VERSION}"
: "${GUIDE_TNB:?Phase 2 must answer GUIDE_TNB}"
: "${GUIDE_PLACEHOLDER:?Phase 1 must answer GUIDE_PLACEHOLDER}"

# What this mode puts in the workspace, as the two facts every later step reads: whether a server
# is part of it (the arrangements whose root is a Nitro app) and whether the app the template wrote
# survives (a backend project has no client). GUIDE_NITRO_VERSION is read with a default and
# required in the branch that needs it, because a frontend workspace never answers it — the
# extractor requires every `$GUIDE_…` named without a default to have been answered, in every
# profile that runs the step.
has_server=no
case "$GUIDE_MODE" in
  backend|fullstack) has_server=yes ;;
  frontend) : ;;
  *) echo "unsupported mode: $GUIDE_MODE" >&2; exit 1 ;;
esac
if [ "$has_server" = yes ] && [ -z "${GUIDE_NITRO_VERSION:-}" ]; then
  echo "GUIDE_NITRO_VERSION was never answered (Phase 2)" >&2
  exit 1
fi

# 1. the catalog is where a version lives -----------------------------------------------
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "pnpm-workspace.yaml";
let source = readFileSync(file, "utf8");
if (!/^catalog:/m.test(source)) {
  console.error("pnpm-workspace.yaml has no catalog block; inspect the scaffold before continuing");
  process.exit(1);
}

// nitro joins the catalog in the arrangements that have a server: the root's own dependency and
// any package that later needs it resolve the same version through this line. A frontend
// workspace never installs it.
if (process.env.GUIDE_MODE !== "frontend") {
  const pin = process.env.GUIDE_NITRO_VERSION ?? "";
  if (!pin) { console.error("GUIDE_NITRO_VERSION was never answered (Phase 2)"); process.exit(1); }
  if (/^\s+nitro:/m.test(source)) {
    console.error("the catalog already lists nitro; inspect pnpm-workspace.yaml before continuing");
    process.exit(1);
  }
  source = source.replace(/^catalog:\n/m, `catalog:\n  nitro: ${pin}\n`);
}

// The scaffold ships a TypeScript line of its own; the version decision is this run's, so the
// catalog entry is rewritten to the answer rather than left as whatever the template pinned. With
// the bridge (GUIDE_TNB=yes) the TypeScript 6 API package owns both the catalog entry and the
// override — that step ran above — so this one leaves it alone.
if (process.env.GUIDE_TNB !== "yes") {
  if (!/^\s+typescript:/m.test(source)) {
    console.error("the catalog does not list typescript; inspect pnpm-workspace.yaml before continuing");
    process.exit(1);
  }
  source = source.replace(/^\s+typescript:.*$/m, `  typescript: ${process.env.GUIDE_TS_VERSION}`);
}
writeFileSync(file, source);
NODE

# 2. the root package: the commands that operate the workspace, and the server's dependency -----
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const mode = process.env.GUIDE_MODE;
const hasServer = mode === "backend" || mode === "fullstack";
// A backend project has no client, so the app the template wrote does not survive the prune below.
const app = mode !== "backend";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

// The pin goes in as the catalog reference, not the literal: the catalog is the one place the
// version lives, so the root and any package that needs nitro later resolve the same one.
if (hasServer) manifest.devDependencies.nitro = "catalog:";

// The commands someone actually runs, all vp-form, registered where the workspace is operated
// from. The stock `dev` (vp run website#dev) is deleted in every arrangement: it names a package by
// its task, and in the arrangement where that package is deleted it exits 0 having run nothing.
manifest.scripts = {};
if (hasServer) {
  manifest.scripts["dev:server"] = "vp dev";
  manifest.scripts.build = "vp build";
}
if (app) manifest.scripts["dev:website"] = "vp -C apps/website dev";
manifest.scripts.check = "vp check";
if (hasServer) {
  manifest.scripts.test = "vp test --passWithNoTests";
  // `ready` runs the root's own test rather than `vp run -r test`: the root's script already scans
  // the whole workspace, and the `-r` form would run the same files a second time per package.
  manifest.scripts.ready = "vp check && vp test && vp run -r build";
} else {
  // A frontend workspace ships no test harness of its own — the app has none by decision — and the
  // root has nothing of its own to build, so `ready` is the check and the workspace build.
  manifest.scripts.ready = "vp check && vp run -r build";
}

const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines", "engines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
console.log(`ok  root manifest: ${Object.keys(manifest.scripts).join(", ")}${hasServer ? " (root is the server)" : " (root is a shell)"}`);
NODE

# 3. the app the template wrote: kept and wired in two arrangements, deleted in the third -------
if [ "$GUIDE_MODE" = backend ]; then
  # A backend project has no client. The app is the whole client, so it goes the way src/, public/
  # and index.html go in the single layout — and with it goes the reason the template's `dev` script
  # existed. `apps/` is left with nothing in it, so it goes too.
  rm -rf apps/website
  rmdir apps 2>/dev/null || true
  [ ! -e apps/website ] && [ ! -e apps ] || { echo "the scaffolded app survived the prune" >&2; exit 1; }
  echo "ok  the template's frontend app is deleted (a backend project has no client)"
else
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "apps/website/package.json";
const manifest = JSON.parse(readFileSync(file, "utf8"));

// `imports` resolves against the nearest package.json, so the app needs its own map: `#/src/…`
// is the app's spelling of "from this package's root", exactly as `#/server/…` is the root's.
manifest.imports = { "#/*": { types: "./*.ts", default: "./*" } };

// create-vite wrote `typescript` as a literal here while the workspace catalog carries the same
// version; the layout's rule is one version per dependency, in the catalog.
for (const name of ["typescript", "vite", "vite-plus"]) {
  if (!(name in manifest.devDependencies)) {
    console.error(`apps/website does not depend on ${name}; inspect its manifest`);
    process.exit(1);
  }
  manifest.devDependencies[name] = "catalog:";
}
manifest.devDependencies = Object.fromEntries(
  Object.entries(manifest.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log("ok  apps/website keeps its own alias map, every spec through the catalog");
NODE
fi

# 4. the placeholder package: keep it, or delete it --------------------------------------
case "$GUIDE_PLACEHOLDER" in
  no)
    rm -rf packages/utils
    rmdir packages 2>/dev/null || true
    [ ! -e packages/utils ] && [ ! -e packages ] || { echo "the placeholder package survived the deletion" >&2; exit 1; }
    echo "ok  placeholder package deleted by decision"
    ;;
  yes)
    # It stays, as the home for future shared code — so it is pruned like everything else the
    # generators wrote: the publishing shape of a library starter (bumpp, prepublishOnly, the
    # placeholder repository/author metadata) is not what a package inside an application
    # workspace is for, and its two version literals join the catalog.
    node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "packages/utils/package.json";
const manifest = JSON.parse(readFileSync(file, "utf8"));
for (const key of ["description", "homepage", "bugs", "author", "repository", "publishConfig", "files"]) {
  delete manifest[key];
}
delete manifest.devDependencies.bumpp;
delete manifest.scripts.prepublishOnly;
for (const name of ["@types/node", "typescript", "vite-plus"]) {
  if (!(name in manifest.devDependencies)) {
    console.error(`packages/utils does not depend on ${name}; inspect its manifest`);
    process.exit(1);
  }
  manifest.devDependencies[name] = "catalog:";
}
const order = ["name", "version", "private", "type", "license", "exports", "scripts", "dependencies", "devDependencies"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync(file, JSON.stringify(ordered, null, 2) + "\n");
NODE
    echo "ok  placeholder package kept and pruned (publishing shape removed, versions in the catalog)"
    ;;
esac

# 5. no script in this workspace may name a package by its task -------------------------
# `vp run <package>#<task>` is the template's own `dev` form: when that package does not exist the
# script exits 0 having run nothing (measured: `vp run: 0/0 cache hit`), which is the silent no-op
# this arrangement deletes a package into. The root's own set is written above; this covers every
# manifest the workspace ends up with, so nothing inherited from the template can keep the form.
node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

const manifests = ["package.json"];
if (process.env.GUIDE_MODE !== "backend") manifests.push("apps/website/package.json");
if (existsSync("packages/utils/package.json")) manifests.push("packages/utils/package.json");
for (const file of manifests) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  for (const [name, script] of Object.entries(manifest.scripts ?? {})) {
    if (/vp\s+run\s+\S*#/.test(String(script))) {
      console.error(`${file}: script \`${name}\` names a package (${script}); a package this workspace does not have would make it a silent no-op`);
      process.exit(1);
    }
  }
}
console.log(`ok  no script names a package by its task (${manifests.join(", ")})`);
NODE

# 6. install, then prove the versions are actually shared ---------------------------------
./node_modules/.bin/vp install

node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

const mode = process.env.GUIDE_MODE;
const hasServer = mode === "backend" || mode === "fullstack";
const app = mode !== "backend";
const problems = [];
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
const required = ["vite-plus", "typescript", ...(hasServer ? ["nitro"] : [])];
for (const name of required) {
  if (!new RegExp(`^\\s+"?'?${name}'?:`, "m").test(workspace)) problems.push(`${name} is not in the workspace catalog`);
}

// The version decision has to be the one the catalog carries, or the decision was made and then
// quietly ignored: the entries are the pins, and the packages resolve what is written here.
const entry = (name) => {
  const match = new RegExp(`^\\s+"?'?${name}'?:\\s*(.+?)\\s*$`, "m").exec(workspace);
  return match ? match[1] : "";
};
if (hasServer && entry("nitro") !== process.env.GUIDE_NITRO_VERSION) {
  problems.push(`the catalog pins nitro ${entry("nitro") || "<nothing>"}, the decision was ${process.env.GUIDE_NITRO_VERSION}`);
}
if (process.env.GUIDE_TNB === "yes") {
  if (!entry("typescript").includes("typescript-native-bridge")) {
    problems.push(`the catalog does not point typescript at the bridge: ${entry("typescript")}`);
  }
} else if (entry("typescript") !== process.env.GUIDE_TS_VERSION) {
  problems.push(`the catalog pins typescript ${entry("typescript")}, the decision was ${process.env.GUIDE_TS_VERSION}`);
}

// Every dependency of every manifest is a catalog reference: one version per dependency, one
// place to change it. A literal here would be a second version that nothing else shares.
const manifests = [["package.json", "."]];
if (app) manifests.push(["apps/website/package.json", "apps/website"]);
if (existsSync("packages/utils/package.json")) manifests.push(["packages/utils/package.json", "packages/utils"]);
for (const [file] of manifests) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, spec] of Object.entries(manifest[group] ?? {})) {
      if (spec !== "catalog:" && !String(spec).startsWith("workspace:")) {
        problems.push(`${file}: ${name}@${spec} is not a catalog reference`);
      }
    }
  }
}

// The catalog is only shared if the packages really resolve through it: the same dependency has
// to resolve to the same version from every package that declares it.
const version = (base, name) => JSON.parse(readFileSync(`${base}/node_modules/${name}/package.json`, "utf8")).version;
const vitePlus = manifests.map(([, base]) => [base, version(base, "vite-plus")]);
const distinct = [...new Set(vitePlus.map(([, v]) => v))];
if (distinct.length !== 1) problems.push(`vite-plus resolves to ${distinct.join(" and ")} across the workspace`);
let nitro = "";
if (hasServer) {
  nitro = version(".", "nitro");
  if (nitro !== process.env.GUIDE_NITRO_VERSION) problems.push(`nitro resolved to ${nitro}, expected ${process.env.GUIDE_NITRO_VERSION}`);
}

if (problems.length) {
  console.error("the workspace does not share one version per dependency:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`ok  catalog shared: vite-plus ${distinct[0]} in ${vitePlus.map(([base]) => base).join(", ")}${hasServer ? `; nitro ${nitro} at the root` : "; no server in this workspace"}`);
NODE
```

```bash guide:exec id=notes-workspace when=layout:monorepo
set -euo pipefail

# Traps that only exist because this project is a workspace — true of all three arrangements, so
# the ones that are about a root that *is* an app live in their own block below.
cat >> docs/agent-notes.md <<'NOTES'

## The workspace

- The workspace root is a package of the workspace, and that is what makes the root manifest the
  place the workspace's commands are registered. What those commands need from vp depends on whether
  the root is an application, which the arrangement's own note below covers.
- A root script that names a package by its task (`"dev": "vp run website#dev"`) is a **silent
  no-op** when that package does not exist: it exits 0 with `vp run: 0/0 cache hit` and runs
  nothing. Every root command names something the workspace actually has; a script left pointing at
  a package the layout deleted is worse than a broken command, because nothing goes red.
- `vp run -r <task>` skips a package that does not define the task: no warning, no mention,
  exit 0. `vp run -F <pkg> <task>` and `vp run -w <task>` are the opposite — the missing task is
  `error: Task "<task>" not found`, exit 1 — and a task no package defines is exit 1 as well.
- `vp check` at the root walks every package, so it is the workspace's type check;
  `vp run -r check` runs each package's own `check` script instead — and a package that defines
  none is skipped by that form, silently, by contract. The two forms are not interchangeable.
- `vp run -r test` runs the root's workspace-wide Vitest scan and then each package's own test
  script: the same test file runs twice, and nothing warns. A root whose test script is that scan
  calls `vp test` instead, and a workspace with no root test script at all has `vp run -r test` as
  the only form — which runs the packages that define one.
- `vp run -r check -v` fails: extra arguments after the task name are passed to the task
  (`error: Invalid vite task command`). Put the flag before the task — `vp run -r -v check`.
- A root script and a vite.config.ts task may not share a name; the collision
  (`Task … conflicts with a package.json script`) poisons every `vp run` in the workspace.
- The catalog is the only place a version lives, and `catalogMode: prefer` is what the scaffold
  set: adding a dependency with `vp add -w -D <name>` (or `vp -C <pkg> add -D <name>`) writes the
  version into the catalog and leaves `"<pkg>": "catalog:"` in the manifest. `pnpm install` is not
  the command here — `vp install` is, and it installs the workspace.
- `vp add -D <name>` at the root without `-w` is refused (`ERR_PNPM_ADDING_TO_ROOT`): the root
  package of a workspace has to be named explicitly.
- Task caching is per task input: `vp run -r build` replaying a cached build does not re-read
  the files that are not part of its inputs (`.env` included), so a config error can look green
  until `--no-cache`. When a result matters, re-run the task with `--no-cache`.
NOTES
echo "ok  workspace traps appended to docs/agent-notes.md"
```
