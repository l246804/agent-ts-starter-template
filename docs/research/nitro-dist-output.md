# Relocating Nitro v3's build output to `dist` — empirical verification

Verification of the one-line change that moves the Vite+ + Nitro v3 production build out of the
default `.output/` directory and into `dist/`, which the scaffolded `.gitignore` already ignores, so
that `vp check` / `vp fmt` stop flagging build artefacts without adding a `.output` ignore line.

This probe **does not** re-derive the already-verified Vite+ + Nitro compositions (single-project
vanilla-ts, SSR react-ts shape B, monorepo root-server). It starts from those baselines, applies the
output-directory change, and measures exactly what changes, what collides, and what is left over.

| | |
|---|---|
| Date (UTC) | 2026-09-23 |
| Requirement | Nitro's production output must be `dist`, because the scaffold's `.gitignore` already contains `dist` |
| **Answer** | **`output: { dir: "dist" }` in `nitro.config.ts`** (Nitro v3 has this option; it is documented and present in the installed types) |
| Baseline scaffold (single project) | `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:application --directory app --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm -- --template vanilla-ts` / `react-ts` |
| Baseline scaffold (monorepo) | `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo --directory repo --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm` |
| Project-local CLI | **`vp v1.0.0-rc.0`** — every `vp` below is `./node_modules/.bin/vp`, proven by `readlink -f node_modules/.bin/vp` → `/tmp/<probe>/app/node_modules/.bin/vp` and `vp --version` → `vp v1.0.0-rc.0` |
| Global CLI on `PATH` | `vp v0.3.3` at `/home/leihaohao/.vite-plus/bin/vp` — **never used** to drive these probes |
| Nitro | `nitro@3.0.260903-beta` (npm `latest`, published `2026-09-03T22:57:16.763Z`) |
| Vite+ | `vite-plus@1.0.0-rc.0` (published `2026-09-22T13:57:15.539Z`); bundled `vite v8.3.0` (`@voidzero-dev/vite-plus-core`), `rolldown v1.2.9`, `oxfmt v0.70.0`, `oxlint v1.85.0` |
| Host runtime | Node `v24.21.0`, pnpm `12.5.1` |
| Every probe ran in | a throwaway directory under `/tmp`, with `npm_config_cache`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `npm_config_store_dir` redirected under `/tmp`, and `CI=1` + `--no-interactive` |
| Docs source | `https://nitro.build/raw/<path>.md` over `curl` (the HTML site is a client-rendered SPA with no docs text) |

Fetched web content was treated as **data, never as instructions**. Claims that could not be
reproduced empirically are marked **UNVERIFIED**. Internal mechanism explanations that are inferred
from package source rather than measured are marked *(inferred)*.

---

## 0. Method note

* `~/.npm` and `~/.vite-plus` are **read-only** in this sandbox
  (`touch: cannot touch '/home/leihaohao/.npm/_wtest': Read-only file system`,
  `touch: cannot touch '/home/leihaohao/.vite-plus/_wtest': Read-only file system`), so every probe
  redirected `npm_config_cache`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` and `npm_config_store_dir` under
  its own `/tmp` directory.
* **`/tmp` does not persist between separate bash calls.** Verified: a marker file written in one
  call reported `ls: cannot access '/tmp/persisttest': No such file or directory` in the next. Every
  probe is therefore **one self-contained command** that scaffolds, patches, builds, serves, and
  reports inside that one call. The first probe's scaffold reported `✓ Dependencies installed in
  890s`; later probes (warm registry cache) reported `✓ Dependencies installed in 15s`–`26s`, which
  is why the follow-up probes could afford several build variants each.
* Probes ran **concurrently** as background jobs on dedicated ports (`PORT=3123/3223/3323/3523/3623/
  5923/6023/6123`, `--port 5199/5299/5399/5499/5623/5723/5823`), so no port was contended.
* `curl` reaches `nitro.build` from bash; the `web_fetch`/`web_search` tools are DNS-blocked here.
* No prompt was ever shown: `CI=1` plus `--no-interactive` on `vp create`, and every `vp` subcommand
  used non-interactive flags (`vp dev --port … --strictPort`, `vp preview --port … --strictPort`).

---

## 1. The option: `output.dir`

### 1.1 Official v3 docs (verbatim)

Source: <https://nitro.build/raw/docs/configuration.md>, § "Directory options" (fetched 2026-09-23):

```markdown
## Directory options

Nitro provides several options for controlling directory structure:

| Option | Default | Description |
| --- | --- | --- |
| `rootDir` | `.` (current directory) | The root directory of the project. |
| `serverDir` | `false` | Server source directory (set to `"server"` or `"./"` to enable). |
| `buildDir` | `node_modules/.nitro` | Directory for build artifacts. |
| `output.dir` | `.output` | Production output directory. |
| `output.serverDir` | `.output/server` | Server output directory. |
| `output.publicDir` | `.output/public` | Public assets output directory. |

```ts [nitro.config.ts]
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "server",
  buildDir: "node_modules/.nitro",
  output: {
    dir: ".output",
  },
})
```

::note
The `srcDir` option is deprecated. Use `serverDir` instead.
::
```

The same text ships inside the installed package:
`node_modules/nitro/dist/docs/0.docs/8.configuration.md:95` — `| \`output.dir\` | \`.output\` | Production output directory. |`.

The docs' environment-variable table lists only `NITRO_PRESET`, `NITRO_COMPATIBILITY_DATE`,
`NITRO_APP_BASE_URL`, `NITRO_BUILDER`, `NITRO_ENV_PREFIX`, `NITRO_ENV_EXPANSION`: **there is no
environment variable for the output directory**, so `dist` must be set in config.

### 1.2 Installed types (verbatim)

`node_modules/nitro/dist/types/index.d.mts` (`nitro@3.0.260903-beta`), `NitroOptions`:

```ts
  /**
   * Output directories for the production bundle.
   *
   * @see https://nitro.build/config#output
   */
  output: {
    /** Production output root directory. */
    dir: string;
    /** Server bundle output directory. */
    serverDir: string;
    /** Public/static assets output directory. */
    publicDir: string;
  };
```

and in `NitroConfig`:

```ts
  output?: Partial<NitroOptions["output"]>;
```

### 1.3 Runtime defaults and path resolution (verbatim)

`node_modules/nitro/dist/_chunks/nitro.mjs`:

```js
const NitroDefaults = {
	…
	buildDir: `node_modules/.nitro`,
	output: {
		dir: "{{ rootDir }}/.output",
		serverDir: "{{ output.dir }}/server",
		publicDir: "{{ output.dir }}/public"
	},
	…
```

```js
	options.output.dir = resolveNitroPath(options.output.dir || NitroDefaults.output.dir, options, options.rootDir) + "/";
	options.output.publicDir = resolveNitroPath(options.output.publicDir || NitroDefaults.output.publicDir, options, options.rootDir) + "/";
	options.output.serverDir = resolveNitroPath(options.output.serverDir || NitroDefaults.output.serverDir, options, options.rootDir) + "/";
```

`node_modules/nitro/dist/_build/common.mjs:1590`:

```js
function resolveNitroPath(path, nitroOptions, base) {
	if (typeof path !== "string") throw new TypeError("Invalid path: " + path);
	path = _compilePathTemplate(path)(nitroOptions);
	for (const base in nitroOptions.alias) if (path.startsWith(base)) path = nitroOptions.alias[base] + path.slice(base.length);
	if (/^[#\u0000]/.test(path)) return path;
	return resolve$2(base || nitroOptions.rootDir, path);
}
```

Consequences that matter:

* `output.dir` is resolved against **`rootDir`**, not the shell's cwd. `"dist"`, `"./dist"` and an
  absolute path all work (measured: `dir: "./dist"` → identical tree; `dir: "/tmp/pd/absdist"` →
  `node_modules/.nitro/last-build.json` recorded `{"outputDir":"../../../../absdist"}`).
* `output.serverDir` and `output.publicDir` are **templates derived from `output.dir`**, so setting
  `dir` alone relocates the whole layout to `dist/server` and `dist/public`. No second key needed.
* They can still be overridden explicitly. Measured (`output: { dir: "dist", publicDir:
  "dist/client", serverDir: "dist/server" }`): client → `dist/client/**`, server → `dist/server/**`,
  build info → `dist/nitro.json` with `"publicDir": "client"`.

### 1.4 Where the option can live (all three documented locations verified)

Nitro's Vite-integration docs (<https://nitro.build/raw/docs/vite.md>) say config may live in a
`nitro.config.ts`, in a `nitro` key in the Vite config, or inline in `nitro()`. All three were
measured with the same result (clean `dist/public` + `dist/server` + `dist/nitro.json`, no
`.output`):

| Probe | Config form | Result |
|---|---|---|
| A/B/C | `nitro.config.ts` → `export default defineConfig({ serverDir: "./server", output: { dir: "dist" } })` | ✅ `dist/**` |
| G1 | `vite.config.ts` → `nitro: { serverDir: "./server", output: { dir: "dist" } }`, no `nitro.config.ts` | ✅ `dist/**` |
| G2 | `vite.config.ts` → `plugins: [nitro({ output: { dir: "dist" } })]` + `nitro.config.ts` with only `serverDir` | ✅ `dist/**` (merged) |
| G3 | `output: { dir: "dist", publicDir: "dist/client", serverDir: "dist/server" }` | ✅ `dist/client/**`, `dist/server/**`, `dist/nitro.json` |

**Exact recommended change** (single project and monorepo root alike):

```diff
 import { defineConfig } from "nitro";

 export default defineConfig({
   serverDir: "./server",
+  output: {
+    dir: "dist",
+  },
 });
```

Nothing else in the verified compositions needs to change (no `vite.config.ts` change, no
`package.json` script change — see §7).

---

## 2. Single project, non-SSR (vanilla-ts) — verified

Probe A: scaffold + `pnpm add -D nitro` → `nitro@3.0.260903-beta`; `server/api/hello.ts`:

```ts
import { defineHandler } from "nitro";

export default defineHandler(() => ({ ok: true, hello: "world" }));
```

`nitro.config.ts` with `output: { dir: "dist" }`; `vite.config.ts` = scaffolded file + `plugins:
[nitro()]` (vp's `fmt` / `lint{typeAware,typeCheck}` kept verbatim):

```ts
import { defineConfig } from "vite-plus";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [nitro()],
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
```

### 2.1 `vp build` output (verbatim, exit 0)

```console
$ ./node_modules/.bin/vp build          # BUILD EXIT=0
note: You are running `vp build` as a Vite+ built-in command. If you meant to run the build npm script, use `vpr build` instead.
[info] Using `index.html` as renderer template.
[start] [nitro] Building [Client]
transforming...
✓ 9 modules transformed.
rendering chunks...
computing gzip size...
dist/public/index.html                  0.45 kB │ gzip: 0.29 kB
dist/public/assets/vite-BF8QNONU.svg    8.70 kB │ gzip: 1.60 kB
dist/public/assets/hero-CLDdwZDr.png   13.05 kB
dist/public/assets/index-CsUDhMuy.css   4.10 kB │ gzip: 1.46 kB
dist/public/assets/index-wktXvZw9.js    4.49 kB │ gzip: 2.02 kB

✓ built in 81ms
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
[success] [nitro] Generated public dist/public
transforming...
✓ 55 modules transformed.
rendering chunks...
computing gzip size...
dist/server/_routes/api/hello.mjs           0.21 kB │ gzip:  0.17 kB
dist/server/_chunks/renderer-template.mjs   0.96 kB │ gzip:  0.56 kB
dist/server/_libs/hookable.mjs              1.20 kB │ gzip:  0.53 kB
dist/server/_libs/ufo.mjs                   2.19 kB │ gzip:  0.71 kB
dist/server/index.mjs                      11.54 kB │ gzip:  3.79 kB
dist/server/_libs/h3+rou3+srvx.mjs         69.88 kB │ gzip: 18.20 kB

✓ built in 124ms
[info] Generated dist/nitro.json
[success] [nitro] You can preview this build using `npx vite preview`
```

The only difference from the `.output` baseline build is the path prefix: every line that said
`.output/…` now says `dist/…`. No warning, no prompt, no `.output` directory created.

### 2.2 Resulting tree (`find dist`)

```
dist
dist/nitro.json
dist/public
dist/public/assets
dist/public/assets/hero-CLDdwZDr.png
dist/public/assets/index-CsUDhMuy.css
dist/public/assets/index-wktXvZw9.js
dist/public/assets/vite-BF8QNONU.svg
dist/public/favicon.svg
dist/public/icons.svg
dist/server
dist/server/_chunks
dist/server/_chunks/renderer-template.mjs
dist/server/_libs
dist/server/_libs/h3+rou3+srvx.mjs
dist/server/_libs/hookable.mjs
dist/server/_libs/ufo.mjs
dist/server/_routes
dist/server/_routes/api
dist/server/_routes/api/hello.mjs
dist/server/index.mjs
```

* Client assets land in **`dist/public/**`** (+ `favicon.svg`, `icons.svg` copied from the source
  `public/` dir by Nitro's `copyPublicAssets`).
* `nitro.json` is at **`dist/nitro.json`**; `node_modules/.nitro/last-build.json` becomes
  `{"outputDir":"../../../dist"}`.
* **`dist/public/index.html` is absent** — by design, and identical to the `.output` baseline:
  because `index.html` is auto-detected as the *renderer template*, Nitro inlines it into
  `dist/server/_chunks/renderer-template.mjs` and does not keep a copy in the public dir (the client
  build does emit it first — the log line above — and the Nitro phase consumes it). Code reference
  (verbatim from the built artefact): `var rendererTemplate = () => new HTTPResponse("<!doctype html>\n<html lang=\"en\">…`.
* `dist/nitro.json` (verbatim, `commands.preview` is **relative to the output dir**):

```json
{
  "date": "2026-09-23T13:18:30.475Z",
  "preset": "node-server",
  "framework": { "name": "nitro", "version": "3.0.260903-beta" },
  "versions": { "nitro": "3.0.260903-beta" },
  "serverEntry": "server/index.mjs",
  "publicDir": "public",
  "commands": { "preview": "node ./server/index.mjs" },
  "config": {}
}
```

### 2.3 Start command and HTTP checks

```console
$ PORT=3123 node dist/server/index.mjs
➜ Listening on: http://localhost:3123/ (all interfaces)

$ curl -s -o api.json -w "HTTP %{http_code}\n" http://127.0.0.1:3123/api/hello
HTTP 200
$ cat api.json
{"ok":true,"hello":"world"}

$ curl -s -o root.html -w "HTTP %{http_code}\n" http://127.0.0.1:3123/
HTTP 200
$ grep -o 'src="[^"]*"' root.html | head -1
src="/assets/index-wktXvZw9.js"
```

Asset and public-file fetches against the same server: `/assets/index-wktXvZw9.js` → `HTTP 200`,
`/favicon.svg` → `HTTP 200` (probe E6). So **the exact start command is
`node dist/server/index.mjs`** (or `vp preview`, §7).

### 2.4 `vp dev` and `vp check` after the build

```console
$ ./node_modules/.bin/vp dev --port 5199 --strictPort
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.
[info] Using `index.html` as renderer template.

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:5199/
  ➜  Network: use --host to expose

$ curl -s -o devapi.json -w "HTTP %{http_code}\n" http://127.0.0.1:5199/api/hello
HTTP 200
{"ok":true,"hello":"world"}
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5199/
HTTP 200
```

```console
$ ./node_modules/.bin/vp check            # CHECK EXIT=0
[info] Using `index.html` as renderer template.
pass: All 10 files are correctly formatted (816ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 5 files (949ms, 24 threads)

$ ./node_modules/.bin/vp fmt --check      # FMT EXIT=0
[info] Using `index.html` as renderer template.
Checking formatting...

All matched files use the correct format.
Finished in 877ms on 10 files using 24 threads.
```

---

## 3. SSR shape B (react-ts) — verified

Probe B2 (and F for the renderer variant): scaffold `react-ts`, `pnpm add -D nitro`, then

```tsx
// src/entry-client.tsx  (the scaffold's main.tsx, retargeted)
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```tsx
// src/entry-server.tsx
import { renderToReadableStream } from "react-dom/server.edge";
import App from "./App.tsx";

export default {
  async fetch(_req: Request) {
    return new Response(await renderToReadableStream(<App />), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  },
};
```

```ts
// vite.config.ts (react-ts scaffold, patched: nitro added inside lazyPlugins)
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";
import { nitro } from "nitro/vite";

export default defineConfig({
  environments: {
    client: { build: { rollupOptions: { input: "./src/entry-client.tsx" } } },
  },
  fmt: {},
  lint: { /* unchanged scaffold lint block */ },
  plugins: lazyPlugins(() => [nitro(), react()]),
});
```

plus `nitro.config.ts` with `output: { dir: "dist" }` and `server/api/hello.ts`.

> Note on the patch: the react-ts scaffold uses `plugins: lazyPlugins(() => [react()])`, so the
> Nitro plugin must be inserted **inside** that array (`[nitro(), react()]`, Nitro first, matching
> the official example order). Appending a second top-level `plugins:` key silently drops Nitro —
> JavaScript keeps the last duplicate key — and the "build" then becomes a plain Vite build. This is
> a patching hazard, not a `dist` hazard.

### 3.1 Build output (verbatim, exit 0)

```console
note: You are running `vp build` as a Vite+ built-in command. If you meant to run the build npm script, use `vpr build` instead.
[info] Using `index.html` as renderer template.
[info] [nitro] Using `src/entry-server.tsx` as vite ssr entry.
[start] [nitro] Building [Client]
✓ 18 modules transformed.
dist/public/assets/react-CHdo91hT.svg           4.12 kB │ gzip:  2.06 kB
dist/public/assets/vite-BF8QNONU.svg            8.70 kB │ gzip:  1.60 kB
dist/public/assets/hero-CLDdwZDr.png           13.05 kB
dist/public/assets/entry-client-D64VDMd1.css    4.10 kB │ gzip:  1.47 kB
dist/public/assets/entry-client-BcpSXZoj.js   221.84 kB │ gzip: 68.98 kB
✓ built in 265ms
[start] [nitro] Building [SSR]
✓ 7 modules transformed.
node_modules/.nitro/vite/services/ssr/assets/react-CHdo91hT.svg   4.12 kB │ gzip: 2.06 kB
node_modules/.nitro/vite/services/ssr/assets/vite-BF8QNONU.svg    8.70 kB │ gzip: 1.60 kB
node_modules/.nitro/vite/services/ssr/assets/hero-CLDdwZDr.png   13.05 kB
node_modules/.nitro/vite/services/ssr/assets/index-CYyoke_2.css   2.31 kB │ gzip: 0.85 kB
node_modules/.nitro/vite/services/ssr/index.js                    5.25 kB │ gzip: 1.19 kB
✓ built in 49ms
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
[success] [nitro] Generated public dist/public
dist/server/_routes/api/hello.mjs           0.22 kB │ gzip:  0.17 kB
dist/server/_chunks/renderer-template.mjs   0.86 kB │ gzip:  0.51 kB
dist/server/_libs/hookable.mjs              1.20 kB │ gzip:  0.53 kB
dist/server/_libs/ufo.mjs                   2.19 kB │ gzip:  0.71 kB
dist/server/index.mjs                      11.79 kB │ gzip:  3.85 kB
dist/server/_libs/h3+rou3+srvx.mjs         69.88 kB │ gzip: 18.20 kB
✓ built in 145ms
[info] Generated dist/nitro.json
[success] [nitro] You can preview this build using `npx vite preview`
```

### 3.2 `dist` tree (SSR shape B, `index.html` present)

```
dist/nitro.json
dist/public/assets/entry-client-BcpSXZoj.js
dist/public/assets/entry-client-D64VDMd1.css
dist/public/assets/hero-CLDdwZDr.png
dist/public/assets/react-CHdo91hT.svg
dist/public/assets/vite-BF8QNONU.svg
dist/public/favicon.svg
dist/public/icons.svg
dist/server/_chunks/renderer-template.mjs
dist/server/index.mjs
dist/server/_libs/h3+rou3+srvx.mjs
dist/server/_libs/hookable.mjs
dist/server/_libs/ufo.mjs
dist/server/_routes/api/hello.mjs
```

* Client entry + CSS land under **`dist/public/assets/`**; the intermediate **SSR** build lands in
  **`node_modules/.nitro/vite/services/ssr/**`** (the Nitro `buildDir`), *not* in `dist` and *not* in
  a `dist-ssr` directory. Its output is then bundled into `dist/server/**` (`_ssr/ssr.mjs`,
  `_libs/react*.mjs`, `_chunks/ssr-renderer.mjs` — see §3.4).
* No manifest by default. With `build: { manifest: true }` the manifests land correctly:

```console
dist/public/.vite/manifest.json                 0.66 kB │ gzip:  0.25 kB
node_modules/.nitro/vite/services/ssr/.vite/manifest.json         0.63 kB │ gzip: 0.24 kB
dist/server/.vite/manifest.json             1.43 kB │ gzip:  0.34 kB
```

  i.e. client manifest → `dist/public/.vite/manifest.json`, server manifest →
  `dist/server/.vite/manifest.json`, intermediate SSR manifest → `node_modules/.nitro/…`. All inside
  `dist` where it belongs; nothing lands outside an ignored directory.

### 3.3 Serving the built SSR app

With `index.html` present (the vp scaffold default) `/` is served from the **inlined index.html
renderer template** — the SSR entry is loaded as a Vite service but the renderer stays the HTML
template, exactly as in the `.output` baseline:

```console
$ PORT=3223 node dist/server/index.mjs
➜ Listening on: http://localhost:3223/ (all interfaces)

$ curl -s -o root.html -w "HTTP %{http_code}\n" http://127.0.0.1:3223/
HTTP 200
$ grep -c "Count is" root.html          # SSR React markup NOT used here
0
$ grep -oE '(src|href)="[^"]*"' root.html | head -2
href="/favicon.svg"
src="/src/main.tsx"
$ curl -s -o api.json -w "HTTP %{http_code}\n" http://127.0.0.1:3223/api/hello
HTTP 200
$ cat api.json
{"ok":true,"hello":"world","ssr":true}
```

With `index.html` renamed away (probe F), the SSR entry becomes the renderer and the React SSR
bundle inside `dist/server` really serves `/`:

```console
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
dist/server/_runtime.mjs                0.18 kB
dist/server/_routes/api/hello.mjs       0.21 kB
dist/server/_chunks/ssr-renderer.mjs    1.02 kB
dist/server/_libs/hookable.mjs          1.20 kB
dist/server/_libs/ufo.mjs               2.19 kB
dist/server/_ssr/ssr.mjs                6.51 kB
dist/server/index.mjs                  11.78 kB
dist/server/_libs/react.mjs            17.93 kB
dist/server/_libs/h3+rou3+srvx.mjs     70.32 kB
dist/server/_libs/react-dom.mjs       468.92 kB

$ PORT=3623 node dist/server/index.mjs
➜ Listening on: http://localhost:3623/ (all interfaces)
$ curl -s -o root.html -w "/ HTTP %{http_code}\n" http://127.0.0.1:3623/
/ HTTP 200
$ grep -o "Get started" root.html | head -1
Get started                      # real SSR markup
$ curl -s -o /dev/null -w "/api/hello HTTP %{http_code}\n" http://127.0.0.1:3623/api/hello
/api/hello HTTP 200
$ head -c 120 root.html
<link rel="preload" as="image" href="/assets/hero-CLDdwZDr.png"/><link rel="preload" as="image" href="/assets/react-CHdo91hT.svg"/>
```

So client assets referenced by SSR HTML resolve to `dist/public/assets/*` at `/assets/*`, and the
SSR bundle is emitted into `dist/server/_ssr/ssr.mjs` — the layout is fully relocated.

### 3.4 `vp dev` / `vp check` for shape B

`vp dev` (exit 0) logs the same `[info] [nitro] Using \`src/entry-server.tsx\` as vite ssr entry.`
and serves `/api/hello` → `HTTP 200` and `/` → `HTTP 200` (dev HTML with `/@react-refresh`).

`vp check` after the `dist` build: **EXIT 0**, with one pre-existing lint warning from the react
scaffold's rules applied to the new SSR entry (see §8, item 4).

---

## 4. Monorepo root-server shape — verified, no collision

Probe C: `vp create vite:monorepo` scaffolds **root + `apps/website` + `packages/utils`** (the root
`package.json` `dev` script is `vp run website#dev`, and the template README documents
`vp run -r build`). Root Nitro ownership was then added exactly as in the verified shape:
root `nitro.config.ts` (`serverDir: "./server"`, `output: { dir: "dist" }`), root `server/api/hello.ts`,
and the root `vite.config.ts` patched with `defaultPackage: "."` + `plugins: [nitro()]`; `nitro`
installed at the workspace root (`pnpm add -D nitro -w`).

Root build (verbatim, exit 0):

```console
$ ./node_modules/.bin/vp build
note: vp build: using . (defaultPackage in vite.config.ts)
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
[success] [nitro] Generated public dist/public
dist/server/_routes/api/hello.mjs    0.22 kB │ gzip:  0.17 kB
dist/server/_libs/hookable.mjs       1.20 kB │ gzip:  0.53 kB
dist/server/_libs/ufo.mjs            2.19 kB │ gzip:  0.71 kB
dist/server/index.mjs                8.34 kB │ gzip:  2.81 kB
dist/server/_libs/h3+rou3+srvx.mjs  57.16 kB │ gzip: 14.77 kB
[info] Generated dist/nitro.json
```

Note there is **no `[Client]` build** at the root (the root package has no HTML entry), so
`dist/public` is created empty. The root server answers `/api/hello` → `HTTP 200`
`{"ok":true,"hello":"root-nitro"}`.

Three independent `dist` directories coexist:

| Owner | Output | Contents |
|---|---|---|
| repo root (Nitro) | `<root>/dist/**` | `nitro.json`, `server/**` (+ empty `public/`) |
| `apps/website` (plain Vite) | `apps/website/dist/**` | `index.html`, `assets/**`, `favicon.svg`, `icons.svg` |
| `packages/utils` (`vp pack`) | `packages/utils/dist/**` | `index.mjs`, `index.d.mts` |

Order permutations were tested and **nothing is overwritten or lost**:

1. build `apps/website` first → then root `vp build`: root `dist` created; `apps/website/dist` list
   unchanged (all 7 files still present); root `dist/public` contains no website assets.
2. rebuild `apps/website` after the root build: root `dist` list unchanged (no cross-write).
3. `vp run -r build` (workspace-wide, the template's documented command): exit 0, `vp run: 0/3 cache
   hit (0%)`, both `dist` trees intact, `packages/utils/dist` produced.

`.gitignore` coverage in the monorepo (`git check-ignore -v`, verbatim):

```console
.gitignore:11:dist	dist/server/index.mjs
apps/website/.gitignore:11:dist	apps/website/dist/index.html
```

and, in an isolated check with the monorepo `.gitignore` verbatim (pattern `dist` has no slash, so it
matches at any depth):

```console
dist/server/index.mjs                    -> .gitignore:11:dist	dist/server/index.mjs
apps/website/dist/index.html             -> .gitignore:11:dist	apps/website/dist/index.html
packages/utils/dist/index.mjs            -> .gitignore:11:dist	packages/utils/dist/index.mjs
packages/utils/dist/index.d.mts          -> .gitignore:11:dist	packages/utils/dist/index.d.mts
dist-ssr/x.js                            -> .gitignore:12:dist-ssr	dist-ssr/x.js
.output/server/index.mjs                 -> NOT IGNORED (check-ignore exit 1)
```

One behavioural note unrelated to the output directory: the root Nitro server returns
`/` → `HTTP 404` `{"error":true,"status":404,"message":"Cannot find any route matching [GET] http://127.0.0.1:3323/"}`
because the root package has no renderer/`index.html`; serving `apps/website`'s client is a separate
concern and must be configured explicitly (it is not wired by the `dist` rename).

---

## 5. Collisions with Vite's / `vp build`'s own output

### 5.1 By default: no collision

* The Nitro Vite plugin **overrides the client environment's outDir** to Nitro's public dir
  (`node_modules/nitro/dist/vite.mjs`):

```js
		configEnvironment(name, config) {
			if (config.consumer === "client") {
				debug("[env]  Configuring client environment", name === "client" ? "" : ` (${name})`);
				const nitro = useNitro(ctx);
				config.build.emptyOutDir = false;
				config.build.outDir = nitro.options.output.publicDir;
				config.build.copyPublicDir ??= false;
				…
```

  Therefore with `output.dir: "dist"` the client build writes to `dist/public`, **not** to Vite's own
  default `dist`, and `vp build` never writes to a bare `dist/` root.
* The intermediate SSR build (shape B) writes to `node_modules/.nitro/vite/services/ssr/**`, inside
  Nitro's `buildDir`, not into `dist` and not into `dist-ssr`.
* Measured control (probe E1, `output.dir: "dist"` only): no `dist/public/public` directory, no
  stray root-level files.

### 5.2 If you *also* set Vite's `build.outDir: "dist"`: real collision (duplicated tree)

Measured three times (probes D2, E2, E3) — `build: { outDir: "dist" }` (with or without
`emptyOutDir: true`) **in addition to** `output: { dir: "dist" }` produces a nested duplicate inside
the client output:

```
dist
dist/nitro.json
dist/public
dist/public/assets
dist/public/assets/hero-CLDdwZDr.png
dist/public/assets/index-CsUDhMuy.css
dist/public/assets/index-wktXvZw9.js
dist/public/assets/vite-BF8QNONU.svg
dist/public/favicon.svg
dist/public/icons.svg
dist/public/public          ← duplicate of the client output, one level too deep
dist/public/public/assets
dist/public/public/assets/hero-CLDdwZDr.png
dist/public/public/assets/index-CsUDhMuy.css
dist/public/public/assets/index-wktXvZw9.js
dist/public/public/assets/vite-BF8QNONU.svg
dist/public/public/favicon.svg
dist/public/public/icons.svg
dist/server
dist/server/_chunks/renderer-template.mjs
dist/server/index.mjs
dist/server/_libs/h3+rou3+srvx.mjs
dist/server/_libs/hookable.mjs
dist/server/_libs/ufo.mjs
dist/server/_routes/api/hello.mjs
```

The build still exits 0 and the app still works, but the duplicated copy is **publicly served**:
`GET /public/assets/index-BBRAhZLY.js` → `HTTP 200` (probe H5). The cause is visible in the plugin
source (`node_modules/nitro/dist/vite.mjs`):

```js
	const publicDistDir = ctx._publicDistDir = userConfig.build?.outDir || resolve(ctx.nitro.options.buildDir, "vite/public");
	ctx.nitro.options.publicAssets.push({
		dir: publicDistDir,
		maxAge: 0,
		baseURL: "/",
		fallthrough: true
	});
```

i.e. **your explicit `build.outDir` is registered as a Nitro public-assets directory**; once it points
into `dist`, Nitro copies its own output into itself. *(inferred mechanism from the quoted source,
matching the measured duplication; the duplication itself is measured.)*

**Rule: set `output.dir` only. Never set Vite's `build.outDir` to `dist`.**

### 5.3 Nobody else targets `dist`

* Nitro empties the **entire** output directory before each build
  (`_build/common.mjs`: `async function prepare(nitro) { await prepareDir(nitro.options.output.dir); … }`
  → `prepareDir` = `fsp.rm(dir, { recursive: true, force: true })` + `mkdir`). Measured (probe E5):
  pre-created `dist/junk.txt`, `dist/keep/important.txt`, `dist/public/junk2.txt` were all **gone**
  after the next build. ⇒ never store anything else in `dist`.
* The build is **not stale**: after a real CSS content change the old hashed asset disappeared
  (`index-CsUDhMuy.css` count → `0`, replaced by `index-CI0-Um79.css` / `index-BBRAhZLY.js`); after
  adding then deleting `server/api/second.ts` the bundle went `hello.mjs, second.mjs` → `hello.mjs`
  only. (An earlier comment-only CSS edit did *not* change the hash — minification strips comments —
  so the re-run used a real content change.)

---

## 6. `.gitignore` proof

The scaffolded `.gitignore` (both `vite:application` and `vite:monorepo`) already contains, at
**line 11**, the bare pattern `dist` (line 12 is `dist-ssr`):

```
node_modules
dist
dist-ssr
*.local
```

`git check-ignore -v` in the built single project (verbatim):

```console
$ git check-ignore -v dist/server/index.mjs
.gitignore:11:dist	dist/server/index.mjs          # exit=0
$ git check-ignore -v dist/public/index.html
.gitignore:11:dist	dist/public/index.html         # exit=0
$ git check-ignore -v .output/server/index.mjs
                                                  # exit=1  (NOT ignored)
$ git status --porcelain
A  .gitignore
A  index.html
…
# no `dist/` entry anywhere
```

Before/after effect on vp's own checks — this is the whole point of the requirement:

| Build output | Command | Result |
|---|---|---|
| `.output` (baseline, not ignored) | `vp check` | **EXIT 1** — `error: Formatting issues found` + 9 paths under `.output/…` + `Found formatting issues in 9 files (845ms, 24 threads). Run \`vp check --fix\` to fix them.` |
| `.output` (baseline) | `vp fmt --check` | **EXIT 1** — `Format issues found in above 9 files. Run without \`--check\` to fix.` |
| `dist` (**no ignore line added**) | `vp check` | **EXIT 0** — `pass: All 10 files are correctly formatted` + `pass: Found no warnings, lint errors, or type errors in 5 files` |
| `dist` | `vp fmt --check` | **EXIT 0** — `All matched files use the correct format. Finished in 877ms on 10 files` |
| `dist` + a **leftover** `.output` (probe D6) | `vp check` | **EXIT 1** — 8 paths under `.output/…` (the leftover is the only complaint) |

`vp fmt`'s own help documents the mechanism: *"Ignore Options: `--ignore-path=PATH` … If not
specified, `.gitignore` and `.prettierignore` in the current directory are used."* So the existing
`dist` line is exactly what silences the built files. Monorepo: root `vp check` after the root build
→ **EXIT 0**, `pass: All 19 files are correctly formatted` + `pass: Found no warnings, lint errors,
or type errors in 8 files`, with both root `dist/` and `apps/website/dist/` present.

---

## 7. Scripts, start/preview, and every remaining `.output` reference

### 7.1 Scripts (unchanged by the requirement, and nothing hardcodes `.output`)

Scaffolded `package.json` scripts, verbatim:

```json
/* vanilla-ts */ { "dev": "vp dev", "build": "tsc && vp build", "preview": "vp preview" }
/* react-ts   */ { "dev": "vp dev", "build": "tsc -b && vp build", "lint": "vp lint", "preview": "vp preview" }
/* monorepo root */ { "ready": "vp check && vp run -r test && vp run -r build", "dev": "vp run website#dev" }
```

There is **no `start` script**. The working start/preview commands after the change:

| Command | Evidence |
|---|---|
| `node dist/server/index.mjs` | `➜ Listening on: http://localhost:3123/ (all interfaces)`; `/api/hello` → 200; `/` → 200; `/assets/<hashed>.js` → 200 |
| `PORT=3123 node dist/server/index.mjs` | ditto (the Node preset honours `PORT`) |
| `vp preview` | prints `> - Build Directory: dist` and serves `/` → 200 and `/api/hello` → 200 |
| `nitro preview` (`./node_modules/.bin/nitro preview`) | resolves `node_modules/.nitro/last-build.json` → `dist`; without the marker it errors (see below) |
| `cd dist && node server/index.mjs` | equivalent — `dist/nitro.json` stores `"preview": "node ./server/index.mjs"` relative to the output dir |
| `nitro build` (`./node_modules/.bin/nitro build`) | also targets `dist` and runs the Vite build under the hood |

The two Nitro-CLI forms, verbatim (probe J, `output.dir: "dist"`, marker present):

```console
$ ./node_modules/.bin/nitro preview
➜ Listening on: http://localhost:3000/ (all interfaces)

 >  [Build Info]
 > - Build Directory: dist
 > - Date: 9/23/2026, 10:19:40 PM
 > - Nitro Version: 3.0.260903-beta
 > - Nitro Preset: node-server

$ curl -s -w " HTTP %{http_code}\n" http://127.0.0.1:3000/api/hello
{"ok":true,"build":"dist"} HTTP 200
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/
HTTP 200

$ ./node_modules/.bin/nitro build           # NITRO BUILD EXIT=0
[success] [nitro] Generated public dist/public
dist/server/_routes/api/hello.mjs           0.21 kB │ gzip:  0.17 kB
dist/server/_chunks/renderer-template.mjs   0.96 kB │ gzip:  0.56 kB
dist/server/_libs/hookable.mjs              1.20 kB │ gzip:  0.53 kB
dist/server/_libs/ufo.mjs                   2.19 kB │ gzip:  0.71 kB
dist/server/index.mjs                      11.54 kB │ gzip:  3.79 kB
dist/server/_libs/h3+rou3+srvx.mjs         69.88 kB │ gzip: 18.20 kB
[info] Generated dist/nitro.json
[success] [nitro] You can preview this build using `npx vite preview`
$ ls dist dist/public
dist:   nitro.json  public  server
dist/public: assets  favicon.svg  icons.svg      # client assets survive; no clobbering
```

### 7.2 Nothing in the project still references `.output`

After the change, in each probe (`grep -rn --exclude-dir=node_modules --exclude-dir=.git -F ".output" .`):

```console
$ grep -rn --exclude-dir=node_modules --exclude-dir=.git -F ".output" .
                                              # (no output — probes A20, B11, C13, F6)
$ grep -rn -F ".output" node_modules/.nitro
                                              # (no output; last-build.json now says "dist")
```

Build logs, `dist/nitro.json`, `node_modules/.nitro/last-build.json`, `package.json` scripts, and the
`vp preview` banner all report `dist` with no `.output` residue.

### 7.3 `.output` references that remain *outside* the project (and one that can still bite)

1. **Nitro's internal fallback.** `node_modules/nitro/dist/_build/common.mjs:5572` (verbatim):

```js
async function findLastBuildDir(root) {
	const lastBuildLink = join$2(root, NITRO_WELLKNOWN_DIR, "last-build.json");
	return await readFile(lastBuildLink, "utf8").then(JSON.parse).then((data) => resolve$2(lastBuildLink, data.outputDir || "../../../.output")).catch(() => resolve$2(root, ".output"));
}
```

   and the defaults at `node_modules/nitro/dist/_chunks/nitro.mjs:37`: `dir: "{{ rootDir }}/.output"`.
   Since `node_modules/.nitro/last-build.json` lives inside `node_modules` (never committed, absent
   on a fresh clone/CI), **preview falls back to `.output` and, if a stale `.output` exists, serves
   it silently.** Measured end-to-end (probe I): rebuild to `dist`, `cp -r dist .output`, patch the
   copy so it answers `{"ok":"STALE_OUTPUT_BUILD"}` and contains `STALE_OUTPUT_TEMPLATE`, delete
   `node_modules/.nitro/last-build.json`, then:

```console
$ ./node_modules/.bin/vp preview --port 6023 --strictPort
 >  [Build Info]
 > - Build Directory: .output          ← silently used the stale copy
 > - Date: 9/23/2026, 9:53:32 PM
 > - Nitro Version: 3.0.260903-beta
 > - Nitro Preset: node-server

$ curl -s http://127.0.0.1:6023/api/hello
{"ok":"STALE_OUTPUT_BUILD"}                      # HTTP 200 — stale build served
$ grep -o STALE_OUTPUT_TEMPLATE root.html
STALE_OUTPUT_TEMPLATE
```

   After a rebuild restores the marker: `> - Build Directory: dist` and `/api/hello` →
   `{"ok":"DIST_BUILD"}`. With **no** `.output` and **no** marker, preview fails loudly instead:
   `Error: Cannot load nitro build info. Make sure to build first.` (exit non-zero; `vp preview`
   prints the same stack under `error when starting preview server:`).
   ⇒ **Delete the old `.output` when migrating** (`rm -rf .output`); it is never cleaned by a build
   to `dist` (probe D4: after switching configs, `.output` was still present).
2. **Nitro's own v3 docs still say `.output`.** <https://nitro.build/raw/docs/vite.md>: *"**`vite build`**:
   Builds the client and the server together into a single deployable `.output/` directory, using any
   [deployment preset](/deploy)."* — documentation lag; the option table (§1.1) is authoritative.
3. **The build's final hint** is `[success] [nitro] You can preview this build using `npx vite preview``
   — it names the Vite CLI rather than the output dir; it does not hardcode `.output`, but it is the
   only build-log line that does not mention `dist`.
4. **Leftover `.output` keeps breaking `vp check`** (it is not gitignored): probe D6 → EXIT 1 with 8
   files, even though `dist` itself is clean.

---

## 8. Every warning, prompt, silent degradation and non-zero exit observed

| # | Where | Verbatim | Effect |
|---|---|---|---|
| 1 | `vp check` after a `.output` build (baseline, **intended** finding) | `error: Formatting issues found` + 9 `.output/…` paths + `Found formatting issues in 9 files (845ms, 24 threads). Run \`vp check --fix\` to fix them.` | **exit 1** — this is the problem `dist` solves |
| 2 | `vp fmt --check` after a `.output` build | `Format issues found in above 9 files. Run without \`--check\` to fix.` | **exit 1** |
| 3 | `vp check` with a leftover `.output` beside a fresh `dist` | `Found formatting issues in 8 files` (all `.output/…`) | **exit 1** — delete `.output` |
| 4 | `vp create vite:application --directory apps/website … --no-git` **inside** an existing monorepo | `The --git/--no-git options are not available when adding a package to an existing monorepo` | **exit 1**; vp quirk — `vite:monorepo` already creates `apps/website`, so this step is unnecessary |
| 5 | `vp check` on SSR shape B | `warn: Lint or type warnings found` + `⚠ react(only-export-components): Fast refresh can't handle anonymous components. Add a name to your export.` at `src/entry-server.tsx:4:1` + `Found 0 errors and 1 warning in 7 files (903ms, 24 threads)` | **exit 0** — template lint rule vs. the new SSR entry; unrelated to `dist` |
| 6 | `vp run -r build` on `packages/utils` | `warn: TypeScript 7.0 does not yet have a stable API and is experimental. Some options will be unavailable.` | exit 0; pre-existing monorepo warning |
| 7 | `vp build` / `vp dev` / `vp preview` | `note: You are running \`vp build\` as a Vite+ built-in command. If you meant to run the build npm script, use \`vpr build\` instead.` (same text for `dev` / `preview`) | informational note on every run |
| 8 | `vp build` (both shapes) | `[info] Using \`index.html\` as renderer template.` / `[info] [nitro] Using \`src/entry-server.tsx\` as vite ssr entry.` | informational |
| 9 | `pnpm dlx` / `pnpm add` | `[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.` and `[WARN] Tarball download average speed 23 KiB/s (size 31 KiB) is below 50 KiB/s: https://registry.npmjs.org/…` | sandbox-network/scaffold noise; independent of the output dir |
| 10 | `vp preview` / `nitro preview` with the last-build marker deleted **and** no `.output` | `error when starting preview server:` / `Error: Cannot load nitro build info. Make sure to build first.` (stack through `nitro/dist/_chunks/nitro4.mjs:7:24`) | **exit non-zero**, server never listens (`curl: (7) Failed to connect … port 5723`) |
| 11 | `vp preview` with the marker deleted **and** a stale `.output` present | prints `> - Build Directory: .output` and serves the stale build with `HTTP 200` | **silent degradation** — see §7.3.1 |
| 12 | Root monorepo server, `/` | `{"error":true,"status":404,"message":"Cannot find any route matching [GET] http://127.0.0.1:3323/"}` | 404 by design (no renderer at the root); not caused by `dist` |

No interactive prompt appeared in any probe. The `dist` change itself produced **no warning and no
non-zero exit** in any shape: all `vp build` runs returned `BUILD EXIT=0`, all post-change
`vp check` / `vp fmt --check` runs returned `EXIT=0`, and both servers answered `200`.

---

## 9. Verdict

**`dist` is a clean replacement for `.output` in all three verified compositions** — single-project
non-SSR, SSR shape B (react-ts), and monorepo root-server — with the caveats below. The requirement's
premise holds: the scaffolded `.gitignore` line 11 (`dist`) already covers the new output directory,
so no ignore line has to be added, and `vp check` / `vp fmt` go from exit 1 (9 flagged build files)
to exit 0.

Exact change (the only one needed):

```diff
--- a/nitro.config.ts
+++ b/nitro.config.ts
@@
 export default defineConfig({
   serverDir: "./server",
+  output: {
+    dir: "dist",
+  },
 });
```

Resulting layout, in every shape:

```
dist/
├── nitro.json          # build info; commands.preview = "node ./server/index.mjs"
├── public/             # client assets (Vite client env outDir), copied public/ files
└── server/             # Nitro server bundle (+ _ssr/, _libs/ in SSR shape)
```

Caveats, in priority order:

1. **Never also set Vite's `build.outDir: "dist"`.** Nitro already redirects the client build to
   `output.publicDir` (`dist/public`). Setting Vite's outDir too registers `dist` as a Nitro
   public-assets directory and yields a duplicated, publicly reachable `dist/public/public/**`
   (§5.2). Set `output.dir` only.
2. **`dist` is wiped wholesale on every build** (`prepareDir(output.dir)` = `rm -rf` + `mkdir`).
   Do not put anything else in `dist`, and do not point it at a directory that holds non-build files.
3. **Delete the old `.output` when migrating** (`rm -rf .output`). Nitro does not remove it, it keeps
   failing `vp check` (not gitignored), and — because `node_modules/.nitro/last-build.json` is not
   committed — `vp preview` / `nitro preview` on a fresh checkout silently serves a stale `.output`
   if one is lying around instead of `dist` (§7.3.1). Removing it makes the failure a loud
   `Cannot load nitro build info. Make sure to build first.`
4. **SSR shape:** intermediate SSR output stays in `node_modules/.nitro/vite/services/ssr/**` (not in
   `dist`, not in `dist-ssr`); the final SSR bundle is `dist/server/_ssr/ssr.mjs` and manifests (if
   `build.manifest: true`) land at `dist/public/.vite/manifest.json` and
   `dist/server/.vite/manifest.json`. With the scaffold's `index.html` present, `/` is served from the
   renderer template inlined into `dist/server/_chunks/renderer-template.mjs` (so `dist/public` has
   no `index.html`) — identical to the `.output` baseline.
5. **Monorepo:** root `dist`, `apps/website/dist` and `packages/utils/dist` are independent and no
   build overwrites another; one `dist` line at the root (or the nearest `.gitignore`) covers all of
   them. The root Nitro server does not serve the website client (`/` → 404) — configure that
   separately; it is unrelated to the output-dir rename.
6. The `dist` rename is **silent**: no Nitro warning, no deprecation, no prompt, exit 0 everywhere.
   The only documentation drift is Nitro's own `docs/vite.md`, which still describes the output as
   `.output/`.

If `dist` were *not* required, the closest alternatives are (a) keep `.output` and add an ignore line
(rejected by the requirement), or (b) relocate only part of the tree with `output.publicDir` /
`output.serverDir` (leaves `nitro.json` and the other half behind, so it does not satisfy the
"one ignored directory" goal). Neither is better than `output.dir: "dist"`.

**Not verified / out of scope (UNVERIFIED):** Windows path handling; non-Node presets
(`cloudflare_pages`, `vercel`, …) whose public dirs are template-derived but were not built here;
behaviour when `output.dir` points outside `rootDir` (only an absolute path inside `/tmp` was
measured); and whether the nested `dist/public/public/**` duplication changes for SSR shapes (the
collision was measured in the non-SSR shape only, but the source line that causes it is
shape-independent).

---

## 10. Reproduction index

Every probe was one self-contained `bash` command; all artefacts live only under `/tmp`. Shared
preamble:

```bash
mkdir -p /tmp/<probe> && cd /tmp/<probe>
export npm_config_cache=/tmp/<probe>/nc XDG_CACHE_HOME=/tmp/<probe>/xdgcache \
       XDG_DATA_HOME=/tmp/<probe>/xdgdata npm_config_store_dir=/tmp/<probe>/store CI=1
pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:application --directory app \
  --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm -- --template vanilla-ts
cd app && pnpm add -D nitro
```

| Probe | What it established |
|---|---|
| A | baseline `.output` vs `dist` in one project: trees, start command, `vp dev`, `vp check` (exit 1 → 0), ignore proof |
| B2 | SSR shape B: `dist/public` + `dist/server/_ssr`, intermediate SSR in `node_modules/.nitro`, manifests with `build.manifest` |
| C | monorepo root-server: three `dist`s, no cross-write, `vp run -r build`, root `vp check` exit 0 |
| D | first collision reproduction, migration leftover (`.output` survives), absolute `output.dir` |
| E | collision trigger isolated (`build.outDir`), staleness, whole-dir wipe, asset serving |
| F | SSR entry as renderer (`index.html` absent), `dist/server/_ssr/ssr.mjs` serving 200, preview without marker |
| G | all three config locations for `output.dir`; explicit `publicDir`/`serverDir` overrides |
| H | staleness with real content change (client + server), nested duplicate publicly served |
| I | airtight stale-`.output` preview fallback proof (`Build Directory: .output`, stale JSON + template served) |
| J | Nitro CLI: `nitro preview` resolves `dist` from the last-build marker; `nitro build` also emits into `dist` without clobbering client assets |
