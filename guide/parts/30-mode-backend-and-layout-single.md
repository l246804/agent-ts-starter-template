
### Backend mode: delete the client, then put the server at the project root

A `backend` project has no client, so the one the generator just wrote is waste: `src/`, `public/`
and `index.html` go. What stays is the project itself — the project-local pinned toolchain, the
`imports` alias map, the trimmed configuration, the refined ignore rules — and on top of it the
server: Nitro v3 consumed as a Vite plugin, with `serverDir` pointing at `server/` in the project
root. This is the composition ADR-0003 (one of the inherited ADRs, which land where Phase 5 resolves
this project's convention to) records, and it is
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

```bash guide:exec id=backend-skeleton when=mode:backend&layout:single
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

```bash guide:exec id=backend-manifest when=mode:backend&layout:single
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

```bash guide:exec id=backend-plugin when=mode:backend&layout:single
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

```bash guide:exec id=agents-rules-backend-single when=mode:backend&layout:single
set -euo pipefail

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
echo "ok  backend/single rules appended"
```

```bash guide:exec id=prov-backend-single when=mode:backend&layout:single
set -euo pipefail
: "${GUIDE_FRAMEWORK:?Phase 1 must answer GUIDE_FRAMEWORK}"
nitro_pin=${GUIDE_NITRO_VERSION:-}
[ -n "$nitro_pin" ] || { echo "GUIDE_NITRO_VERSION was never answered (Phase 2)" >&2; exit 1; }
nitro_version=$(node -p 'require("./node_modules/nitro/package.json").version')
installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

choice_rows="| Scaffold base | ${GUIDE_FRAMEWORK} (the client it writes is pruned in the same run: a backend project has no frontend) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease) |"
scaffold_line="3. Skeleton: \`vp create vite:application\` + \`--template ${GUIDE_FRAMEWORK}\`, alias map, configuration trimmed, ignore rules refined, dependencies installed."
server_step="4. Server: the scaffold's client pruned (\`src/\`, \`public/\`, \`index.html\`), \`nitro\` pinned and installed, \`serverDir: \"./server\"\` with \`output: { dir: \"dist\" }\` in \`nitro.config.ts\`, and \`nitro()\` registered in the \`plugins\` array of \`vite.config.ts\`."
verify_step="8. Verification: format, static check with a live type checker, the build script with its output in \`dist/\`, and smoke tests of the dev server and of the built \`dist/server/index.mjs\`. Recorded ${installed_at}."

printf '%s\n' "$choice_rows" > .vite-plus-prov-choice
printf '%s\n' "$scaffold_line" > .vite-plus-prov-scaffold
printf '%s\n' "$server_step" > .vite-plus-prov-server
printf '%s\n' "$verify_step" > .vite-plus-prov-verify
echo "ok  provenance arm backend/single: choices, skeleton, server and verification rows written"
```

```bash guide:exec id=report-backend-single when=mode:backend&layout:single
set -euo pipefail
# The lines Phase 7's report repeats, and only this shape's: what it did on purpose, and what it
# does not cover. They live here rather than in Phase 7's prose because Phase 7 is shared by every
# shape, and a shared report can only be wrong for five of the six.
cat <<'REPORT'
Deliberate — the toolchain and nitro are pinned prereleases, and the client `vp create` wrote is deleted in the same run, so this project has no frontend at all.
Deliberate — the routes carry no `/api` prefix (that prefix belongs to the frontend modes' dev proxy), and Nitro's output goes to `dist/`, which the scaffold's ignore rules already cover: that is why this run added no ignore rule.
Not covered — only the one initialized route is verified. A real route table is something the project adds later, under the same rules.
Not covered — production deployment topology, and anything a browser would do: this shape serves no page.
REPORT
echo "ok  handoff lines for backend/single are above"
```
