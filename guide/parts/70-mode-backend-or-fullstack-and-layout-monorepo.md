
```bash guide:exec id=workspace-plugin when=mode:backend|fullstack&layout:monorepo
set -euo pipefail

# The server is the root's Vite app, so its plugin goes in the root config — in a `plugins` array
# that the scaffold's root config does not have, next to the `defaultPackage` that lets the root
# act on itself. Both halves in one edit, because "the patch ran" and "the plugin is registered"
# are different claims.
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");
if (/^ {2}plugins\s*:/m.test(before)) {
  console.error("vite.config.ts already has a top-level plugins entry, so this step would add a second one");
  process.exit(1);
}
if (/^ {2}defaultPackage\s*:/m.test(before)) {
  console.error("vite.config.ts already sets defaultPackage; inspect it before continuing");
  process.exit(1);
}
const head = "export default defineConfig({";
if (before.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}
let source = before.replace(
  /(import \{[^}]*\} from ['"]vite-plus['"];\n)/,
  '$1import { nitro } from "nitro/vite";\n',
);
if (source === before) {
  console.error("vite.config.ts has no vite-plus import to sit next to");
  process.exit(1);
}
source = source.replace(head, `${head}\n  defaultPackage: ".",\n  plugins: [nitro()],`);
writeFileSync(file, source);
NODE

cat > nitro.config.ts <<'TS'
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  output: { dir: "dist" },
});
TS

mkdir -p server/routes tests
: > tests/.gitkeep

# The route is deliberately self-describing in the split shape: it answers with the path it
# received, which is the only way "the /api prefix was stripped on the way in" can be asserted
# instead of assumed. A backend workspace has no proxy in front of it, so its route answers the same
# payload its single-layout sibling does.
if [ "$GUIDE_MODE" = fullstack ]; then
cat > server/routes/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler((event) => ({
  hello: "world",
  from: "root-nitro-server",
  route: "server/routes/hello.ts",
  serverSawPath: new URL(event.req.url).pathname,
  serverSawHost: event.req.headers.get("host"),
}));
TS
else
cat > server/routes/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler(() => ({ hello: "world" }));
TS
fi

./node_modules/.bin/vp fmt

node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

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
if (!/^ {2}defaultPackage:\s*"\.",$/m.test(source)) {
  console.error('vite.config.ts does not set defaultPackage: "." — vp would refuse to act on the root');
  process.exit(1);
}
const nitro = readFileSync("nitro.config.ts", "utf8");
if (!/serverDir:\s*"\.\/server"/.test(nitro) || !/output:\s*\{\s*dir:\s*"dist"/.test(nitro)) {
  console.error("nitro.config.ts does not set serverDir ./server and output dir dist");
  process.exit(1);
}
for (const file of ["server/routes/hello.ts", "tests/.gitkeep"]) {
  if (!existsSync(file)) { console.error(`${file} is missing`); process.exit(1); }
}
console.log("ok  root server wired: defaultPackage ., plugins [nitro()], serverDir ./server, output dist");
NODE

./node_modules/.bin/vp check

# The server's own code is type-checked, which is the claim the merged program makes in the other
# server profiles. It cannot be inherited from them: here the server is the root's own program,
# and the whole workspace is what the root check walks.
trap 'rm -f server/routes/__guide_probe.ts' EXIT
printf 'export const __guideServerProbe: number = "not a number";\n' > server/routes/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
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

# The same for the app, whose program belongs to the app's own tsconfig: the root check has to
# cover it, because the app has no `check` script of its own for `vp run -r check` to run. Only the
# split shape has an app; a backend workspace deleted it above.
if [ "$GUIDE_MODE" = fullstack ]; then
trap 'rm -f apps/website/src/__guide_probe.ts' EXIT
printf 'export const __guideAppProbe: number = "not a number";\n' > apps/website/src/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
if ./node_modules/.bin/vp check > .vite-plus-app-control.log 2>&1; then
  rm -f apps/website/src/__guide_probe.ts
  echo "vp check passed with a type error in apps/website/src - the app is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-app-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-app-control.log" >&2
  exit 1
}
rm -f apps/website/src/__guide_probe.ts .vite-plus-app-control.log
echo "ok  a planted type error in apps/website/src was caught (TS2322)"

# And the app's own alias map, in the app's program: the app's tsc runs inside `vp run -r build`,
# so this proves the map resolves for the build script too, not only for the root check.
trap 'rm -f apps/website/src/__guide_alias_target.ts apps/website/src/__guide_alias_use.ts' EXIT
cat > apps/website/src/__guide_alias_target.ts <<'TS'
export const aliasProbe = "imports-alias-resolves";
TS
cat > apps/website/src/__guide_alias_use.ts <<'TS'
import { aliasProbe } from "#/src/__guide_alias_target";

export const aliasProbeUse: string = aliasProbe;
TS
./node_modules/.bin/vp fmt > /dev/null
./node_modules/.bin/vp check
rm -f apps/website/src/__guide_alias_target.ts apps/website/src/__guide_alias_use.ts
echo "ok  '#/...' resolves inside apps/website through its own package.json imports"
fi

# The composition is proved by its product: the root's build has to come out of the plugin, in
# the directory the ignore rules cover, and in the split shape the workspace build has to cover the
# app as well.
./node_modules/.bin/vp build
[ -f dist/server/index.mjs ] || {
  echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2
  exit 1
}
[ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
[ ! -e .output ] || {
  echo "the build also wrote .output/; output.dir did not take effect" >&2
  exit 1
}
echo "ok  root build output is dist/server/index.mjs + dist/nitro.json, with no .output/ beside it"

# In the backend arrangement the client is gone, so the workspace has nothing else to build — which
# is exactly when a root command that was re-pointed wrongly turns into a no-op. The check is the
# workspace form of the build, from an empty output directory: `vp run -r build` has to schedule
# and run the root's own `build` task, and the artefact has to come back. (`0/0 cache hit` with no
# `#build` task in the summary is what the failure looks like.)
if [ "$GUIDE_MODE" = backend ]; then
  rm -rf dist
  ./node_modules/.bin/vp run --no-cache -r -v build > .vite-plus-workspace-build.log 2>&1 || {
    cat .vite-plus-workspace-build.log >&2
    echo "vp run -r build failed" >&2
    exit 1
  }
  grep -q '#build' .vite-plus-workspace-build.log || {
    cat .vite-plus-workspace-build.log >&2
    echo "vp run -r build scheduled no build task at all" >&2
    exit 1
  }
  [ -f dist/server/index.mjs ] || {
    echo "vp run -r build produced no dist/server/index.mjs — the root's build is a no-op" >&2
    exit 1
  }
  rm -f .vite-plus-workspace-build.log
  echo "ok  vp run -r build builds the workspace root (the re-pointed commands are not a no-op)"
fi
```

```bash guide:exec id=notes-workspace-root-server when=mode:backend|fullstack&layout:monorepo
set -euo pipefail

# The workspace traps that are only true when the root is the application: the server's program,
# and the guard the app commands hit.
cat >> docs/agent-notes.md <<'NOTES'

## The workspace root as an application

- `defaultPackage: "."` in the root `vite.config.ts` is what lets `vp dev` and `vp build` act on the
  root; the sign it applied is the `using . (defaultPackage in vite.config.ts)` note on the command
  that runs. Without it the failure is a hard stop (`needs a target package`, exit 1), not a wrong
  output.
- The root's TypeScript program is the scaffold's `tsconfig.json`, which has no `include` list and
  therefore covers every TypeScript file at the root — `server/`, `tests/`, `vite.config.ts` and
  `nitro.config.ts` alike. That is why no second, merged program is written here, and why a planted
  type error inside a route still turns `vp check` red.
- Deleting a package is not enough: every command that referred to it has to be re-pointed. A root
  script of the form `vp run <package>#<task>` exits 0 and does nothing once that package is gone —
  measured. The root manifest here registers `dev:server`, `check`, `test`, `build` and `ready`, and
  `ready` chains the workspace-wide check, tests and build.
NOTES
echo "ok  root-application workspace traps appended to docs/agent-notes.md"
```
