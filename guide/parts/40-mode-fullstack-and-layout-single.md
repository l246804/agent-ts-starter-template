
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

```bash guide:exec id=ssr-skeleton when=mode:fullstack&layout:single
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

```bash guide:exec id=ssr-manifest when=mode:fullstack&layout:single
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

```bash guide:exec id=ssr-plugin when=mode:fullstack&layout:single
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

```markdown guide:file path=.vite-plus-inherited-adrs/0004-ssr-shape.md when=mode:fullstack&layout:single
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

```bash guide:exec id=notes-ssr when=mode:fullstack&layout:single
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
