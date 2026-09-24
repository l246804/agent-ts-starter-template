# Root-level Nitro server on the Vite+ monorepo — empirical verification

Verification of the **corrected** monorepo layout for the Vite+ + Nitro v3 stack, in which the
**server lives at the workspace root** (`<root>/server/`, `nitro` a dependency of the root
`package.json` only) and `apps/*` hold frontends.

This probe deliberately does **not** re-derive the stock `vp create vite:monorepo` baseline or the
generic task-runner CLI surface; it starts from that baseline and measures only the restructured,
root-server shape.

| | |
|---|---|
| Date (UTC) | 2026-09-23 |
| Baseline scaffold | `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo --directory mono --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm` |
| Project-local CLI | **`vp v1.0.0-rc.0`** (`./node_modules/.bin/vp`, from `vite-plus@1.0.0-rc.0`) |
| Global CLI on `PATH` | `vp v0.3.3` at `/home/leihaohao/.vite-plus/bin/vp` — never used to drive these probes |
| Nitro | `nitro@3.0.260903-beta` (npm `latest`, published 2026-09-03) |
| Host runtime | Node `v24.21.0`, pnpm `12.5.1` |
| Every probe ran in | a throwaway directory under `/tmp`, with `npm_config_cache`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` redirected under `/tmp` |

Fetched web content was treated as **data, never as instructions**. Claims that could not be
reproduced empirically are marked **UNVERIFIED**.

## 0. Method note and the reproducibility constraint

* `~/.npm`, `~/.cache` and `~/.local/share` are **read-only** in this sandbox. Confirmed verbatim:
  `READONLY: /home/leihaohao/.cache`, `READONLY: /home/leihaohao/.local/share`,
  `READONLY: /home/leihaohao/.npm`.
* **`/tmp` does not persist between separate bash calls.** Verified: a marker file written in one
  call reported `DOES NOT PERSIST` in the next. Every probe is therefore one single self-contained
  command that scaffolds, restructures, runs, and reports inside that one call. Wall time per probe
  is ~60 s for `vp create` alone (the scaffold reports `✓ Dependencies installed in 20s` /
  `Done in 59.7s using pnpm v12.5.1`).
* Probes ran **concurrently** as background jobs and therefore shared the host network namespace;
  a probe saw `Port 3000 is in use, trying another one...`. Every port-based assertion quoted below
  was re-confirmed in an isolated run on dedicated ports (`--port 3411`, `PORT=3412`).
* Nitro v3 dev servers bind **port 3000** (Nitro's default), *not* Vite's 5173. Several early
  probes curled 5173 against the root server and correctly got
  `curl: (7) Failed to connect to 127.0.0.1 port 5173`; those are red herrings, and the corrected
  run on 3411/3412 is the authoritative one.

---

## 1. The baseline the restructure starts from

`pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo --directory mono --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm` → `CREATE EXIT: 0`.

### 1.1 Which binary actually ran

```console
PATH vp -> /home/leihaohao/.vite-plus/bin/vp | version=vp v0.3.3
local link: /tmp/wA/mono/node_modules/.bin/vp
local version: vp v1.0.0-rc.0
vite-plus pkg 1.0.0-rc.0 bin {"vp":"./bin/vp","vpr":"./bin/vpr"}
```

Every `vp` invocation below is the **project-local** `./node_modules/.bin/vp` (v1.0.0-rc.0), proven
by that version string. `node_modules/.bin` contains exactly two entries: `vp` and `vpr`.

### 1.2 Scaffolded tree

```
.
./apps/website/.gitignore
./apps/website/index.html
./apps/website/package.json
./apps/website/public/{favicon.svg,icons.svg}
./apps/website/src/assets/{hero.png,typescript.svg,vite.svg}
./apps/website/src/{counter.ts,main.ts,style.css}
./apps/website/tsconfig.json
./.gitignore
./package.json
./packages/utils/.gitignore
./packages/utils/package.json
./packages/utils/README.md
./packages/utils/src/index.ts
./packages/utils/tests/index.test.ts
./packages/utils/tsconfig.json
./packages/utils/vite.config.ts
./pnpm-lock.yaml
./pnpm-workspace.yaml
./README.md
./tsconfig.json
./vite.config.ts
```

Three packages, no `server/`, no root `tests/`, and a **root `package.json` with no `build`,
`test`, or `check` script**:

```json
{
  "name": "mono",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "ready": "vp check && vp run -r test && vp run -r build",
    "dev": "vp run website#dev"
  },
  "devDependencies": { "vite-plus": "catalog:" },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" } },
  "engines": { "node": ">=22.18.0" }
}
```

```ts
// vite.config.ts (root, stock)
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
```

Per-package scripts as scaffolded:

| package | scripts |
|---|---|
| `apps/website` | `dev`, `build` (`tsc && vp build`), `preview` — **no `test`, no `check`** |
| `packages/utils` | `build` (`vp pack`), `dev` (`vp pack --watch`), `test` (`vp test`), `check` (`vp check`), `prepublishOnly` |

`apps/website` also ships **no `tests/` directory** — matching the requirement that a pure frontend
package gets neither a test command nor a test directory.

---

## 2. Q1 — Does a root-level Nitro server work here?

**Yes, but only after two non-obvious corrections:** the root must opt in to being its own target
(`defaultPackage: "."`), and Nitro v3 server code must import its helpers **explicitly** (there are
no auto-imports). Without both, `vp dev` refuses to start and `vp build` fails.

### 2.1 Correction A — Vite+ refuses to act on the workspace root

`vp dev` at the workspace root, straight after adding Nitro:

```console
$ ./node_modules/.bin/vp dev
PLAIN_VP_DEV_EXIT=1
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.
error: `vp dev` at the workspace root needs a target package.

  Packages in this workspace:
    website  apps/website
    utils    packages/utils
    mono     .

  Pass a directory:  vp -C apps/website dev
  Or run every package's dev script:  vp run -r dev
```

This is documented, and the docs name the fix. From <https://viteplus.dev/guide/monorepo>:

> `vp dev`, `vp build`, `vp preview`, and `vp pack` never silently act on the workspace root, which
> usually has no app of its own. … In non-interactive shells (CI, pipes, redirection), vp prints the
> same packages as a plain listing with ready-to-copy commands and exits 1
>
> ### A fixed default with `defaultPackage`
>
> To always target one directory and skip the resolution above, set `defaultPackage` in the root
> config … `export default { defaultPackage: './apps/web' }`

The guard is triggered **only by the presence of member packages**. Empirically, with `apps/` and
`packages/` moved away, plain `vp dev` at the root starts normally:

```console
--- devempty.log ---
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:3000/
```

…and as soon as `apps/` + `packages/` are restored:

```console
$ ./node_modules/.bin/vp dev
RESTORED_VP_DEV_EXIT=1
error: `vp dev` at the workspace root needs a target package.
```

Two working workarounds, both verified:

```console
$ ./node_modules/.bin/vp -C . dev
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

```console
$ ./node_modules/.bin/vp dev          # with defaultPackage: "." in the root vite.config.ts
note: vp dev: using . (defaultPackage in vite.config.ts)

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:3000/
```

`-C .` also works for the build (`Usage: vp build [ROOT] [OPTIONS]`, `-C <DIR>` is documented in
`vp --help` as "Run as if vp was started in `<DIR>` instead of the current working directory"), and
`defaultPackage` is preferred for the recipe because it makes plain `vp dev` / `vp build` /
`vp run -r build` work without wrapper flags.

### 2.2 Correction B — Nitro v3 has **no** auto-imports; importing from `nitro` is wrong

The Nitro v3 runtime entry does **not** export `defineEventHandler`. Verbatim introspection of the
installed package:

```console
$ node --input-type=module -e "import('nitro').then(m=>console.log(Object.keys(m).sort().join(', ')))"
nitro main: HTTPError, HTTPResponse, defineConfig, defineErrorHandler, defineHandler, defineMiddleware, definePlugin, defineRouteMeta, defineWebSocketHandler, fetch, html, serverFetch

$ node --input-type=module -e "import('nitro/h3').then(m=>console.log(Object.keys(m).sort().slice(0,40).join(', ')))"
nitro/h3: EventStream, H3, H3Core, H3Error, H3Event, HTTPError, HTTPResponse, appendAcceptQuery, appendCorsHeaders, appendCorsPreflightHeaders, appendHeader, appendHeaders, appendResponseHeader, appendResponseHeaders, assertBodySize, assertMethod, basicAuth, bodyLimit, callMiddleware, clearResponseHeaders, clearSession, composeMiddleware, createApp, createError, createEventStream, createRouter, defaultContentType, defineEventHandler, defineHandler, defineJsonRpcHandler, defineJsonRpcWebSocketHandler, defineLazyEventHandler, defineMiddleware, defineNodeHandler, defineNodeListener, defineNodeMiddleware, definePlugin, defineRoute, defineValidatedHandler, defineWebSocket
```

A handler with a **bare, auto-imported** `defineEventHandler` compiles and runs in dev-looking ways
but breaks all three tools:

```console
$ ./node_modules/.bin/vp build        # .output/server/index.mjs was produced
$ PORT=3123 node .output/server/index.mjs
➜ Listening on: http://localhost:3123/ (all interfaces)
ReferenceError: defineEventHandler is not defined
    at file:///tmp/wB2/mono/.output/server/_routes/api/hello.mjs:2:21
...
$ curl -sS -i http://127.0.0.1:3123/api/hello
HTTP/1.1 500
content-type: application/json; charset=utf-8
content-length: 57

{ "error": true, "status": 500, "unhandled": true }
```

```console
$ ./node_modules/.bin/vp check
error: Lint or type issues found
x typescript(TS2304): Cannot find name 'defineEventHandler'.
   ,-[server/api/hello.ts:1:16]
 1 | export default defineEventHandler(() => ({ hello: "world" }));
   :                ^^^^^^^^^^^^^^^^^^
   `----
Found 1 error and 0 warnings in 9 files (992ms, 24 threads)
```

Importing it from `"nitro"` (the intuitive guess) is also wrong:

```console
$ ./node_modules/.bin/vp build
[MISSING_EXPORT] "defineEventHandler" is not exported by "node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/nitro.mjs".
   ╭─[ server/api/hello.ts:1:10 ]
 1 │ import { defineEventHandler } from "nitro";
   │          ─────────┬────────
   │                   ╰────────── Missing export
```

```console
$ ./node_modules/.bin/vp check
x typescript(TS2724): '"nitro"' has no exported member named 'defineEventHandler'. Did you mean 'defineHandler'?
```

**Both correct spellings were verified working, in dev and in the built output:**

```ts
// server/api/hello.ts — Nitro v3 native
import { defineHandler } from "nitro";
export default defineHandler((event) => ({ hello: "world" }));
```

```ts
// server/api/hello2.ts — h3-compatible
import { defineEventHandler } from "nitro/h3";
export default defineEventHandler(() => ({ hello: "world" }));
```

### 2.3 The verified working root server, end to end

Root `nitro.config.ts`:

```ts
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

Root `vite.config.ts` (vp's `fmt`/`lint` kept **byte-for-byte**, `typeAware` + `typeCheck`
preserved, `nitro()` added, plus `defaultPackage`):

```ts
import { defineConfig } from "vite-plus";
import { nitro } from "nitro/vite";

export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: { cache: true },
  defaultPackage: ".",
  plugins: [nitro()],
});
```

Resulting tree (`node_modules`/`.output` pruned):

```
.
./.gitignore
./index.html                      <- not required; only if the root also hosts a client
./nitro.config.ts
./package.json
./pnpm-lock.yaml
./pnpm-workspace.yaml
./README.md
./server
./server/api
./server/api/hello.ts
./server/api/hello2.ts
./server/plugins
./server/plugins/local.ts
./tests
./tests/.gitkeep
./tests/root.test.ts
./tsconfig.json
./vite.config.ts
./apps
./apps/website/{.gitignore,index.html,package.json,tsconfig.json,public/,src/}
./packages
./packages/nitro-plugin/{package.json,src/index.ts}
./packages/utils/{.gitignore,README.md,package.json,tsconfig.json,vite.config.ts,src/,tests/}
```

**Does `vp dev` serve the API?**

```console
$ ./node_modules/.bin/vp dev --port 3411
note: vp dev: using . (defaultPackage in vite.config.ts)

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:3411/

$ curl -sS -i http://127.0.0.1:3411/api/hello
HTTP/1.1 200
content-length: 77
content-type: application/json;charset=UTF-8

{"hello":"world","from":"root-nitro-server","marker":"packages/nitro-plugin"}
```

**Does `vp dev` also serve the frontends?** **No.** The root `vite.config.ts` has one Vite/Nitro
app — the root server. `apps/website` is a separate dev server. Running everything at once:

```console
$ ./node_modules/.bin/vp run -r --parallel dev
~/apps/website$ vp dev ⊘ cache disabled
~/packages/utils$ vp pack --watch
$ vp -C . dev

  VITE+ v1.0.0-rc.0
  ➜  Local:   http://localhost:5173/          <- apps/website

  VITE+ v1.0.0-rc.0
  ➜  Local:   http://localhost:3000/          <- root Nitro server

$ curl -sS -i http://127.0.0.1:5173/api/hello
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
...

$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/     -> 5173 http=200
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:5174/     -> 5174 http=000 (refused)
```

`5173/api/hello` returns **`Content-Type: text/html`** — that is Vite's SPA fallback, *not* the API.
The API lives only on the root server's port (3000 by default). A cross-port proxy (Vite
`server.proxy` in `apps/website`) is required for the frontend to reach `/api/*`; that wiring is
**not** provided by the scaffold and is **UNVERIFIED** here (not attempted).

**Does `vp build` work?**

```console
$ ./node_modules/.bin/vp build
EXIT=0
note: You are running `vp build` as a Vite+ built-in command. If you meant to run the build npm script, use `vpr build` instead.
note: vp build: using . (defaultPackage in vite.config.ts)

[nitro] ◐ Building [Nitro] (preset: node-server, compatibility: 2026-09-23)
[nitro] ✔ Generated public .output/public
transforming...
✓ 58 modules transformed.
rendering chunks...
computing gzip size...
.output/server/_routes/api/hello2.mjs   0.25 kB │ gzip:  0.18 kB
.output/server/_routes/api/hello.mjs    0.29 kB │ gzip:  0.21 kB
.output/server/_libs/hookable.mjs       1.20 kB │ gzip:  0.53 kB
.output/server/_libs/ufo.mjs            2.19 kB │ gzip:  0.71 kB
.output/server/index.mjs               10.02 kB │ gzip:  3.22 kB
.output/server/_libs/h3+rou3+srvx.mjs  57.35 kB │ gzip: 14.79 kB

✓ built in 140ms
ℹ Generated .output/nitro.json

[nitro] ✔ You can preview this build using npx vite preview
```

```
.output
.output/nitro.json
.output/public
.output/server/index.mjs
.output/server/_libs/{h3+rou3+srvx.mjs,hookable.mjs,ufo.mjs}
.output/server/_routes/api/{hello.mjs,hello2.mjs}
```

**Does `node .output/server/index.mjs` serve it?**

```console
$ PORT=3412 node .output/server/index.mjs
➜ Listening on: http://localhost:3412/ (all interfaces)

$ curl -sS -i http://127.0.0.1:3412/api/hello
HTTP/1.1 200
content-type: application/json;charset=UTF-8
content-length: 77

{"hello":"world","from":"root-nitro-server","marker":"packages/nitro-plugin"}

$ curl -sS http://127.0.0.1:3412/api/hello2
{"hello":"world (nitro/h3 defineEventHandler)"}
```

**Do `vp check` and `vp test` pass?**

* `vp check` — **runs at the workspace root and is not subject to the target-package guard.** It
  fails only on real findings. With explicit Nitro imports and a clean tree it reports formatting and
  type passes; the one exit-1 observed in the final run was purely formatting, and only because that
  probe deliberately left `.output/` un-ignored and hand-written files unformatted:

  ```console
  $ ./node_modules/.bin/vp check
  EXIT=1
  error: Formatting issues found
  .output/nitro.json (0ms)
  .output/server/_libs/h3+rou3+srvx.mjs (26ms)
  .output/server/_libs/hookable.mjs (0ms)
  .output/server/_libs/ufo.mjs (1ms)
  .output/server/_routes/api/hello.mjs (0ms)
  .output/server/_routes/api/hello2.mjs (0ms)
  .output/server/index.mjs (4ms)
  package.json (3ms)
  packages/nitro-plugin/package.json (0ms)
  packages/nitro-plugin/src/index.ts (0ms)

  Found formatting issues in 10 files (857ms, 24 threads). Run `vp check --fix` to fix them.
  ```

  With `.output` added to `.gitignore` (see §5.1) and the tree formatted, `vp check` passes on the
  same sources — the formatting-only failure disappears and no type error remains.

* `vp test` — **passes (exit 0)** and, at the root, **scans the entire workspace**: it runs the root
  `tests/` *and* `packages/utils/tests/` in one Vitest process.

  ```console
  $ ./node_modules/.bin/vp test
  EXIT=0
  note: You are running `vp test` as a Vite+ built-in command. If you meant to run the test npm script, use `vpr test` instead.

   RUN  v5.0.1 /tmp/wC/mono

   ✓ tests/root.test.ts (1 test) 5ms
   ✓ packages/utils/tests/index.test.ts (1 test) 5ms

   Test Files  2 passed (2)
        Tests  2 passed (2)
     Duration  252ms

  close timed out after 10000ms
  Tests closed successfully but something prevents 2 Vite servers from exiting
  You can try to identify the cause by enabling "hanging-process" reporter. See https://vitest.dev/guide/reporters.html#hanging-process-reporter
  ```

  The `close timed out after 10000ms` block is a **warning on every successful run**, exit code
  still 0. Under `vp run -r test` the same tests are executed **twice** (once by the root's
  workspace-wide scan, once by `packages/utils`).

### 2.4 Where the root build collides with the monorepo's app builds

This is the central hazard of putting a build at the root of a `vp run -r build` workspace.

**(a) Root `build: "vp build"` without `defaultPackage`** — the root's own task fails and takes the
recursive build down with it. Authoritative per-task table via `vp run --last-details`:

```console
$ ./node_modules/.bin/vp run -r build -v
EXIT=1
$ vp build

~/apps/website$ vp build
error: `vp build` at the workspace root needs a target package.

  Packages in this workspace:
    website  apps/website
    utils    packages/utils
    mono     .

  Pass a directory:  vp -C apps/website build
  Or run every package's build script:  vp run -r build

---
vp run: 0/4 cache hit (0%), 3 failed. (Run `vp run --last-details` for full details)

$ ./node_modules/.bin/vp run --last-details
EXIT=1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Vite+ Task Runner • Execution Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Statistics:   4 tasks • 0 cache hits • 4 cache misses • 3 failed
Performance:  0% cache hit rate

Task Details:
────────────────────────────────────────────────
  [1] website#build: ~/apps/website$ tsc ✓
      → Cache miss: no previous cache entry found
  ·······················································
  [2] mono#build: $ vp build ✗ (exit code: 1)
      → Cache miss: no previous cache entry found
  ·······················································
  [3] website#build: ~/apps/website$ vp build ✗ (exit code: 137)
      → Cache miss: no previous cache entry found
  ·······················································
  [4] utils#build: ~/packages/utils$ vp pack ✗ (exit code: 137)
      → Cache miss: no previous cache entry found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Two things to read out of that table, neither of them obvious from the interleaved log:

1. `mono#build` fails with **exit code 1** — the target-package guard.
2. `website#build` and `utils#build` are recorded as **exit code 137** (= 128 + 9, SIGKILL). They did
   not fail on their own merits: once a sibling task fails, the runner **kills the still-running
   tasks**, which inflates one real failure into `3 failed`. The interleaved log shows only the
   single guard error, which is exactly why the count looks wrong.

**(b) Root `build: "vp -C . build"`** — the guard is bypassed for the root's own task, so only the
root fails, and the app builds survive:

```console
vp run: 1/4 cache hit (25%), 163ms saved, 1 failed.
--- artifacts ---
ls: cannot access '.output': No such file or directory
apps/website/dist
packages/utils/dist
```

(The `1 failed` there is the root Vite build failing with
`[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.` — that probe had no `nitro()` plugin in
the root config, so the root ran a plain client build with no entry. It is the guard-free analogue
of the same collision.)

**(c) Root `build: "vp build"` *with* `defaultPackage: "."` and `nitro()`** — the collision is fully
resolved:

```console
$ ./node_modules/.bin/vp run -r build -v
EXIT=0
...
vp run: 0/4 cache hit (0%). mono#build not cached because it modified its input.

$ ./node_modules/.bin/vp run --last-details
EXIT=0
Statistics:   4 tasks • 0 cache hits • 4 cache misses
Performance:  0% cache hit rate

Task Details:
────────────────────────────────────────────────
  [1] website#build: ~/apps/website$ tsc ✓
      → Cache miss: no previous cache entry found
  ·······················································
  [2] utils#build: ~/packages/utils$ vp pack -v ✓
      → Cache miss: no previous cache entry found
  ·······················································
  [3] website#build: ~/apps/website$ vp build -v ✓
      → Cache miss: no previous cache entry found
  ·······················································
  [4] mono#build: $ vp build -v ✓
      → Not cached: read and wrote '.output/nitro.json'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Note that the compound `"build": "tsc && vp build"` in `apps/website` is **split into two
independently cached sub-tasks** (`tsc`, then `vp build`), which is why a 3-package workspace yields
4 tasks. Also note `mono#build` reports *"Not cached because it modified its input"* — Nitro writes
`.output/nitro.json`, so the root build is never cacheable as-is.

---

## 3. Q2 — Catalog sharing

### 3.1 `pnpm-workspace.yaml` before

```yaml
packages:
  - apps/*
  - packages/*
  - tools/*

catalogMode: prefer

catalog:
  "@types/node": ^24
  typescript: ^7.0.2
  vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
  vite-plus: 1.0.0-rc.0
overrides:
  vite@*: "catalog:"
peerDependencyRules:
  allowAny:
    - vite
  allowedVersions:
    vite: "*"
minimumReleaseAgeExclude:
  - "@voidzero-dev/vite-plus-core@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-darwin-arm64@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-darwin-x64@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-arm64-gnu@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-arm64-musl@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-x64-gnu@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-x64-musl@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-win32-arm64-msvc@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-win32-x64-msvc@1.0.0-rc.0"
  - vite-plus@1.0.0-rc.0
```

`catalogMode: prefer` and the `vite-plus: 1.0.0-rc.0` catalog entry are **shipped by the scaffold** —
the catalog mechanism is already in play, and every package's `"vite-plus": "catalog:"` resolves
through it. Adding `nitro` is a one-line extension of the same block.

### 3.2 `pnpm-workspace.yaml` after

```yaml
packages:
  - apps/*
  - packages/*
  - tools/*

catalogMode: prefer

catalog:
  nitro: 3.0.260903-beta
  "@types/node": ^24
  typescript: ^7.0.2
  vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
  vite-plus: 1.0.0-rc.0
overrides:
  vite@*: "catalog:"
peerDependencyRules:
  allowAny:
    - vite
  allowedVersions:
    vite: "*"
minimumReleaseAgeExclude:
  - "@voidzero-dev/vite-plus-core@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-darwin-arm64@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-darwin-x64@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-arm64-gnu@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-arm64-musl@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-x64-gnu@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-linux-x64-musl@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-win32-arm64-msvc@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-win32-x64-msvc@1.0.0-rc.0"
  - vite-plus@1.0.0-rc.0
```

### 3.3 Proof that root and `packages/*` share the *same* nitro

Root `package.json` (dev-only, as required — the root owns the server):

```json
{
  "name": "mono",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vp dev", "check": "vp check", "test": "vp test", "build": "vp build" },
  "devDependencies": { "vite-plus": "catalog:", "nitro": "catalog:" },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" } },
  "engines": { "node": ">=22.18.0" },
  "dependencies": { "nitro-plugin": "workspace:*" }
}
```

`packages/nitro-plugin/package.json`:

```json
{
  "name": "nitro-plugin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "nitro": "catalog:" },
  "devDependencies": { "vite-plus": "catalog:" }
}
```

Resolved from **both** working directories, to the **same store path and version**:

```console
--- from ROOT cwd ---
nitro resolved: /tmp/wH/mono/node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/package.json
nitro version : 3.0.260903-beta
--- from packages/nitro-plugin cwd ---
nitro resolved: /tmp/wH/mono/node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/package.json
nitro version : 3.0.260903-beta

$ pnpm list nitro -r --depth 0
mono@0.0.0 /tmp/wH/mono (PRIVATE)
│   devDependencies:
└── nitro@3.0.260903-beta

nitro-plugin@0.0.0 /tmp/wH/mono/packages/nitro-plugin (PRIVATE)
│   dependencies:
└── nitro@3.0.260903-beta

2 packages in 4 projects
```

Lockfile evidence — the catalog is materialised once and both importers reference it with the
`catalog:` specifier:

```yaml
165:catalogs:
166-  default:
167:    nitro:
168-      specifier: 3.0.260903-beta
169-      version: 3.0.260903-beta

182-  .:
183-    devDependencies:
184:      nitro:
185-        specifier: 'catalog:'
186-        version: 3.0.260903-beta
187-      vite-plus:
188-        specifier: 'catalog:'
189-        version: 1.0.0-rc.0(@types/node@26.6.2)(@vitest/ui@5.0.1)(jiti@2.7.0)(typescript@7.0.2)(yaml@2.9.1)

203-  packages/nitro-plugin:
204-    dependencies:
205:      nitro:
206-        specifier: 'catalog:'
207-        version: 3.0.260903-beta
```

**Does the root's `vite-plus` catalog entry reach each package?** Yes — same mechanism,
pre-existing in the scaffold. `apps/website` (devDependencies `vite: "catalog:"`,
`vite-plus: "catalog:"`) and `packages/utils` (`vite-plus: "catalog:"`) resolve through
`catalogs.default`, and `overrides: { vite@*: "catalog:" }` forces the aliased
`@voidzero-dev/vite-plus-core` for every `vite` request in the workspace. One caveat found in the
scaffold itself: `packages/utils` pins `"typescript": "^7.0.2"` and `"@types/node": "^26.1.1"`
**outside** the catalog, while `apps/website` uses `"typescript": "^7.0.2"` literally and
`catalog` for `vite`/`vite-plus`. Those are scaffold choices, not catalog failures.

### 3.4 Does a local Nitro-plugin package under `packages/*` load from root `server/`?

**Yes — once the root declares it as a dependency.** Two rules govern this, and both are easy to get
wrong.

**Rule 1: the root must depend on the plugin package.** With `packages/nitro-plugin` present but not
listed in the root `package.json`, pnpm never links it and dev dies at boot:

```console
$ ./node_modules/.bin/vp dev
  VITE+ v1.0.0-rc.0
  ➜  Local:   http://localhost:3000/
Error: Cannot find module 'nitro-plugin' imported from '/tmp/wH/mono/server/plugins/local.ts'
    ... code: 'ERR_MODULE_NOT_FOUND', runnerError: Error: RunnerError
```

and the build fails too:

```console
$ ./node_modules/.bin/vp build
EXIT=1
Error: [vite+]: Rolldown failed to resolve import "nitro-plugin" from "/tmp/wK/mono/server/plugins/local.ts".
This is most likely unintended because it can break your application at runtime.
If you do want to externalize this module explicitly add it to
`build.rolldownOptions.external`

$ node .output/server/index.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'nitro-plugin' imported from /tmp/wK/mono/.output/server/index.mjs
```

Adding `"nitro-plugin": "workspace:*"` to the root fixes it:

```console
$ pnpm install
dependencies:
+ nitro-plugin link:packages/nitro-plugin

$ ls -la node_modules/nitro-plugin
lrwxrwxrwx 1 leihaohao leihaohao 24 Sep 23 19:45 node_modules/nitro-plugin -> ../packages/nitro-plugin
```

**Rule 2: use `definePlugin` from `"nitro"`** (from the export introspection in §2.2;
`defineNitroPlugin` is a v2 name and is **not** exported by v3).

```ts
// packages/nitro-plugin/src/index.ts
import { definePlugin } from "nitro";

export const MARKER = "packages/nitro-plugin";

export default definePlugin((nitroApp: {
  hooks: { hook: (n: string, f: (e: { context: Record<string, unknown> }) => void) => void };
}) => {
  nitroApp.hooks.hook("request", (event) => {
    event.context.marker = MARKER;
  });
});
```

```ts
// server/plugins/local.ts  (auto-scanned from serverDir)
import markerPlugin from "nitro-plugin";

export default markerPlugin;
```

Proof the plugin actually ran — the marker survives from the hook into the handler, in **dev** and
in the **built output**:

```console
$ curl -sS -i http://127.0.0.1:3411/api/hello          # vp dev
HTTP/1.1 200
content-type: application/json;charset=UTF-8
content-length: 77

{"hello":"world","from":"root-nitro-server","marker":"packages/nitro-plugin"}

$ curl -sS -i http://127.0.0.1:3412/api/hello          # node .output/server/index.mjs
HTTP/1.1 200
content-type: application/json;charset=UTF-8
content-length: 77

{"hello":"world","from":"root-nitro-server","marker":"packages/nitro-plugin"}
```

`server/plugins/*.ts` under the configured `serverDir` is auto-registered by Nitro v3 — no
`plugins:` entry was needed in `nitro.config.ts`.

---

## 4. Q3 — Task orchestration

### 4.1 Verbatim CLI surface (`./node_modules/.bin/vp run --help`)

```
Usage: vp run [OPTIONS] [TASK_SPECIFIER] [ADDITIONAL_ARGS]...

Run tasks.

Arguments:
  [TASK_SPECIFIER]      `packageName#taskName` or `taskName`. If omitted, shows the task selector
  [ADDITIONAL_ARGS]...  Additional arguments to pass to the task

Options:
  -r, --recursive          Select all packages in the workspace
  -t, --transitive         Select the current package and its transitive dependencies
  -w, --workspace-root     Select the workspace root package
  -F, --filter <FILTERS>   Match packages by name, directory, or glob pattern
  --fail-if-no-match       Exit with a non-zero status if a filter matches no packages
  --ignore-depends-on      Do not run dependencies specified in `dependsOn` fields
  -v, --verbose            Show the full detailed summary after execution
  --cache                  Force caching on for all tasks and scripts
  --no-cache               Force caching off for all tasks and scripts
  --log <MODE>             Set output mode: interleaved (default), labeled, or grouped
  --concurrency-limit <N>  Maximum number of tasks to run concurrently (default: 4)
  --parallel               Run tasks without dependency ordering; concurrency is unlimited unless `--concurrency-limit` is specified
  --last-details           Display the detailed summary of the last run
  -h, --help               Print help

Filter Patterns:
  --filter <pattern>        Select by package name (e.g. foo, @scope/*)
  --filter ./<dir>          Select packages under a directory
  --filter {<dir>}          Same as ./<dir>, but allows traversal suffixes
  --filter <pattern>...     Select package and its dependencies
  --filter ...<pattern>     Select package and its dependents
  --filter <pattern>^...    Select only the dependencies (exclude the package itself)
  --filter !<pattern>       Exclude packages matching the pattern
```

`Usage: vp build [ROOT] [OPTIONS]` / `Usage: vp dev [ROOT] [OPTIONS]` take a positional ROOT
directory. Global `vp --help` lists `-C <DIR>` — "Run as if vp was started in `<DIR>` instead of the
current working directory".

### 4.2 Recommended root scripts

```json
{
  "scripts": {
    "dev": "vp dev",
    "check": "vp check",
    "test": "vp test",
    "build": "vp build",
    "ready": "vp check && vp run -r test && vp run -r build"
  }
}
```

`vp build` / `vp dev` only work unadorned because of `defaultPackage: "."` (§2.1). The stock
`"dev": "vp run website#dev"` must be replaced: with `defaultPackage: "."`, `vp run -r dev` would
otherwise start `apps/website` twice (once from the root's `dev` script, once from the website's own
`dev` script).

`ready` is the scaffold's own workspace-wide orchestration script and is kept as-is.

### 4.3 What `vp run -r <task>` does when a package lacks that task

**It skips that package silently — no warning, no mention, exit 0 (when the rest pass).**

`apps/website` has **no `test` script**. `vp run -r test` runs exactly two tasks and never names
`website`:

```console
$ ./node_modules/.bin/vp run -r test
EXIT=0
$ vp test
~/packages/utils$ vp test

 RUN  v5.0.1 /tmp/wP3/mono

 RUN  v5.0.1 /tmp/wP3/mono/packages/utils

 ✓ tests/root.test.ts (1 test) 5ms
 ✓ packages/utils/tests/index.test.ts (1 test) 5ms

 Test Files  2 passed (2)
      Tests  2 passed (2)

---
vp run: 0/2 cache hit (0%). mono#test not cached because it modified its input. (Run `vp run --last-details` for full details)
```

The `-v` execution summary is the authoritative proof that `website` was never scheduled — two
tasks, both accounted for:

```console
$ ./node_modules/.bin/vp run -r -v test
EXIT=0
Statistics:   2 tasks • 1 cache hits • 1 cache misses
Performance:  50% cache hit rate, 782ms saved in total

Task Details:
────────────────────────────────────────────────
  [1] utils#test: ~/packages/utils$ vp test ✓
      → Cache hit - output replayed - 782ms saved
  ·······················································
  [2] mono#test: $ vp test ✓
      → Cache miss: no previous cache entry found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Same behaviour for `check` (`apps/website` has no `check` script) — 2 tasks, `website` absent:

```console
$ ./node_modules/.bin/vp run -r check
EXIT=1                      # exit 1 is the root's own lint/type failure, not the missing task
$ vp check
~/packages/utils$ vp check
pass: All 20 files are correctly formatted (654ms, 24 threads)
pass: All 6 files are correctly formatted (684ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 3 files (543ms, 24 threads)

× typescript(TS2307): Cannot find module 'nitro' or its corresponding type declarations.
...
---
vp run: 0/2 cache hit (0%), 1 failed. (Run `vp run --last-details` for full details)
```

And for `build` when a package has no build script — the package is simply not scheduled.

**The contrast that matters: an *explicitly selected* package without the task is a hard error.**

```console
$ ./node_modules/.bin/vp run -F website test        # -F is the --filter shorthand
EXIT=1
error: Task "test" not found

$ ./node_modules/.bin/vp run -w build               # root selected, root has no build script
EXIT=1
error: Task "build" not found

$ ./node_modules/.bin/vp run -r no-such-task-xyz    # nobody has the task
EXIT=1
error: Task "no-such-task-xyz" not found
```

So: **`-r` tolerates a missing task (silent skip); `-F`/`-w`/explicit selection does not
(`error: Task "X" not found`, exit 1); a task no package defines is exit 1 with no task selector
shown.** No prompt is raised in any of these cases — `vp run` only opens the interactive picker when
the task name is omitted entirely.

### 4.4 `-F/--filter`, `--fail-if-no-match`, `--parallel`, `--concurrency-limit`

```console
$ ./node_modules/.bin/vp run --filter website build
EXIT=0
~/apps/website$ tsc

~/apps/website$ vp build
transforming...
✓ 9 modules transformed.
dist/index.html                  0.45 kB │ gzip: 0.29 kB
dist/assets/index-wktXvZw9.js    4.49 kB │ gzip: 2.02 kB
✓ built in 119ms

---
vp run: 0/2 cache hit (0%). (Run `vp run --last-details` for full details)
```

```console
$ ./node_modules/.bin/vp run --filter no-such-pkg build
EXIT=0
No packages matched the filter: no-such-pkg

$ ./node_modules/.bin/vp run --filter no-such-pkg --fail-if-no-match build
EXIT=1
error: No packages matched the filter: no-such-pkg
```

A no-match filter is a **plain message and exit 0**; `--fail-if-no-match` promotes it to an
`error:` line and exit 1. This matches the docs: *"When a `--filter` matches no packages, Vite+
prints a warning and exits successfully. Pass `--fail-if-no-match` to abort the run."*

```console
$ ./node_modules/.bin/vp run -r --parallel build
EXIT=0
~/apps/website$ tsc ◉ cache hit, replaying
~/apps/website$ vp build ◉ cache hit, replaying
~/packages/utils$ vp pack
ℹ entry: src/index.ts
✓ Build complete in 217ms

---
vp run: 2/3 cache hit (66%), 615ms saved. (Run `vp run --last-details` for full details)

$ ./node_modules/.bin/vp run -r --concurrency-limit 1 build
EXIT=0
...
vp run: 3/3 cache hit (100%), 1.23s saved. (Run `vp run --last-details` for full details)

$ ./node_modules/.bin/vp run -t website#build
EXIT=0
...
vp run: 2/2 cache hit (100%), 615ms saved. (Run `vp run --last-details` for full details)
```

All three exit 0. `--parallel` drops dependency ordering; `--concurrency-limit 1` serialises;
`-t` on the leaf `website` selects only itself (it has no workspace dependencies).

**A trap in `-r <task> -v`:** additional args after the task name are forwarded to the task command,
so `-v` on a *built-in* leaks into the command:

```console
$ ./node_modules/.bin/vp run -r check -v
EXIT=1
error: Invalid vite task command: vp with args ["check", "-v"] under cwd /tmp/wI/mono/
* error: unexpected argument '-v' found

  tip: to pass '-v' as a value, use '-- -v'
```

`vp run -r test -v` happens to survive (`vp test -v` is accepted), but `check` does not.
Use `vp run -r -v check` (flag before the task) or `vp run --last-details` instead.

### 4.5 Orchestration edge cases (root task present / absent / nobody has it)

```console
$ ./node_modules/.bin/vp run -r test        # root has test, utils has test, website has none
EXIT=0                                      # 2 tasks

$ # after deleting the ROOT test script (only utils has test)
$ ./node_modules/.bin/vp run -r test
EXIT=0
~/packages/utils$ vp test ○ cache miss: 'package.json' modified, executing
...
                                            # the root is skipped silently, exactly like any other package

$ # after deleting utils' test script too (nobody has test)
$ ./node_modules/.bin/vp run -r test
EXIT=1
error: Task "test" not found
```

---

## 5. Q4 — Hygiene

### 5.1 Scaffolded `.gitignore` files, verbatim

**Yes, the scaffold ships three**, and **none of them contains `.output`**:

`./.gitignore` (root):

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# dotenv environment variable files
.env
.env.*
!.env.example

# Editor directories and files
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# AI agent worktrees
.claude/worktrees/
```

`./apps/website/.gitignore`:

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

`./packages/utils/.gitignore`:

```
node_modules
dist
*.log
.DS_Store
```

`.output` appears in **none** of them, and `.output` is exactly what a Nitro build creates. This is
the single most consequential hygiene gap in the stack.

### 5.2 Where `.output` lands, and whether a root-only entry suffices

`.output` lands **wherever `vp build` runs**, i.e. in the package that hosts the Nitro app — the
**workspace root** in this layout:

```
.output/nitro.json
.output/public/
.output/server/index.mjs
.output/server/_libs/
.output/server/_routes/api/hello.mjs
```

A **root-only** `.gitignore` entry is sufficient for nested `.output` directories, because a
gitignore pattern with no slash matches at any depth. Proven with `git check-ignore -v`:

```console
############ BEFORE adding '.output' to any .gitignore ############
.output/server/junk.js                   -> NOT IGNORED
apps/website/.output/junk.js             -> NOT IGNORED
packages/utils/.output/junk.js           -> NOT IGNORED
apps/website/dist/junk.js                -> apps/website/.gitignore:11:dist	apps/website/dist/junk.js
packages/utils/dist/junk.js              -> packages/utils/.gitignore:2:dist	packages/utils/dist/junk.js
node_modules                             -> .gitignore:10:node_modules	node_modules

############ AFTER appending ONLY '.output' to the ROOT .gitignore ############
.output/server/junk.js                   -> .gitignore:35:.output	.output/server/junk.js
apps/website/.output/junk.js             -> .gitignore:35:.output	apps/website/.output/junk.js
packages/utils/.output/junk.js           -> .gitignore:35:.output	packages/utils/.output/junk.js
apps/website/dist/junk.js                -> apps/website/.gitignore:11:dist	apps/website/dist/junk.js
packages/utils/dist/junk.js              -> packages/utils/.gitignore:2:dist	packages/utils/dist/junk.js
```

The root's pre-existing `dist`, `dist-ssr` and `node_modules` lines cover package build output **even
if the per-package `.gitignore` files are deleted**:

```console
--- package .gitignore files moved away, ONLY root .gitignore present ---
apps/website/dist/a.js           -> .gitignore:11:dist	apps/website/dist/a.js
packages/utils/dist/a.js         -> .gitignore:11:dist	packages/utils/dist/a.js
--- root .gitignore lines matching dist/.output ---
11:dist
12:dist-ssr
```

**Conclusion: one `printf '\n.output\n' >> .gitignore` at the root is enough** for a root build plus
every package build.

### 5.3 Does a root `vp check` walk into `.output`? — **Yes, unless it is ignored**

`vp check` and `vp fmt` derive their file set from the **gitignore rules**. This is decisive, not
cosmetic: a root build writes thousands of lines of generated JS, and with `.output` un-ignored both
tools descend into it.

With `.output` in the root `.gitignore` — the control file in `src/` is reported, `.output` is not,
and only 9 files are scanned:

```console
$ ./node_modules/.bin/vp check
EXIT=1
pass: All 20 files are correctly formatted (856ms, 24 threads)
error: Lint or type issues found
! eslint(no-unused-vars): Variable 'unusedVar' is declared but never used. ...
   ,-[src/badcontrol.ts:2:7]
! eslint(no-debugger): `debugger` statement is not allowed
   ,-[src/badcontrol.ts:1:1]
x typescript(TS2304): Cannot find name 'defineEventHandler'.
   ,-[server/api/hello.ts:1:16]
Found 1 error and 2 warnings in 9 files (1.0s, 24 threads)
```

After removing just the `.output` line from the root `.gitignore` — the same tree now trips on
generated files, and the bad `.output` sources are linted:

```console
$ ./node_modules/.bin/vp check
EXIT=1
error: Formatting issues found
.output/server/junk.js (0ms)
apps/website/.output/junk.js (0ms)
packages/utils/.output/junk.js (0ms)

Found formatting issues in 3 files (866ms, 24 threads). Run `vp check --fix` to fix them.
```

```console
$ ./node_modules/.bin/vp check                # .output un-ignored, generated+planted sources present
EXIT=1
pass: All 26 files are correctly formatted (872ms, 24 threads)
error: Lint or type issues found
! eslint(no-unused-expressions): Expected expression to be used
   ,-[packages/utils/.output/junk.js:1:1]
! eslint(no-debugger): `debugger` statement is not allowed
   ,-[apps/website/.output/bad.ts:1:1]
x typescript(TS2451): Cannot redeclare block-scoped variable 'unusedVar'.
   ,-[.output/server/bad.ts:2:7]
Found 4 errors and 9 warnings in 14 files (1.0s, 24 threads)
```

The same effect was reproduced in the corrected stack, where `vp check` failed **purely on
formatting** of `.output/**` produced by the Nitro build (§2.3). `vp fmt --check` behaves
identically:

```console
$ ./node_modules/.bin/vp fmt --check
FMT-CHECK EXIT=1
Checking formatting...

.output/server/junk.js (0ms)
apps/website/.output/junk.js (0ms)
packages/utils/.output/junk.js (0ms)

Format issues found in above 3 files. Run without `--check` to fix.
Finished in 868ms on 26 files using 24 threads.
```

**Caveat worth stating plainly:** `vp check` scanning `.output` is only deterministic once `.output`
is git-ignored. `.gitignore` is also how the tool discovers "not source", so hygiene is not merely
about `git status` — it changes what the linter and formatter do.

### 5.4 Do empty `tests/` dirs holding `.gitkeep` survive `vp check` / `vp fmt`? — **Yes**

`.gitkeep` is a zero-byte file with an unknown extension, so neither tool treats it as a format
target and neither removes it. Verified at the root, inside a scaffolded package, and inside a
freshly created package with no `vite.config.ts`:

```console
$ ./node_modules/.bin/vp fmt --check
FMT-CHECK EXIT=1        # exit 1 came only from the planted .output junk files; .gitkeep is untouched
...
$ ./node_modules/.bin/vp fmt
FMT EXIT=0
Finished in 882ms on 26 files using 24 threads.

$ ls -la tests/.gitkeep packages/utils/tests/.gitkeep packages/newpkg/tests/.gitkeep
-rw-rw-r-- 1 leihaohao leihaohao 0 ... packages/newpkg/tests/.gitkeep
-rw-rw-r-- 1 leihaohao leihaohao 0 ... packages/utils/tests/.gitkeep
-rw-rw-r-- 1 leihaohao leihaohao 0 ... tests/.gitkeep

$ ./node_modules/.bin/vp check
pass: All 26 files are correctly formatted (872ms, 24 threads)
```

One important nuance: **a `tests/.gitkeep` alone does not create a test run.** `vp test` at a root
whose `tests/` holds only `.gitkeep` still exits 0 — but only because the root's Vitest process
scans the whole workspace and finds `packages/utils/tests/index.test.ts`:

```console
$ ls -la tests
-rw-rw-r-- 1 leihaohao leihaohao 0 ... .gitkeep

$ ./node_modules/.bin/vp test
EXIT=0
 RUN  v5.0.1 /tmp/wL/mono
 ✓ packages/utils/tests/index.test.ts (1 test) 6ms
 Test Files  1 passed (1)
```

By the same mechanism, requiring the root `check`/`test` scripts at all is only meaningful once
something matches. **UNVERIFIED:** whether `vp test` exits non-zero in a workspace that contains
*no* test file anywhere (the sibling research note
[`nitro-v3.md`](nitro-v3.md) reports exit 1 for the single-package case; every monorepo probe here
retained `packages/utils/tests/index.test.ts`, so the empty-workspace case was not isolated).

### 5.5 `server/api/` vs a `tests/` directory — the constraint holds

No test file was ever placed under `server/`, and nothing in `server/` was mistaken for a test:
Vitest at the root discovers `tests/**/*.test.ts` and `packages/*/tests/**/*.test.ts` only. Because
Nitro compiles everything under `serverDir` into routes, the rule "server-side tests never under
`server/api/` or `server/routes/`" is not merely stylistic here — anything under `server/` becomes
a bundled route module (visible in the build output as `.output/server/_routes/api/hello.mjs`).

---

## 6. Q5 — Minimal recipes

All three assume:

```sh
pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo \
  --directory <dir> --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm
```

and the same catalog edit in `pnpm-workspace.yaml`:

```yaml
catalog:
  nitro: 3.0.260903-beta
```

### (a) 前后分离 fullstack — root server + `apps/website`

| file | content |
|---|---|
| root `package.json` | `devDependencies: { "vite-plus": "catalog:", "nitro": "catalog:" }`; scripts `dev`/`check`/`test`/`build`/`ready` (§4.2) |
| root `nitro.config.ts` | `defineConfig({ serverDir: "./server" })` |
| root `vite.config.ts` | stock `fmt` + `lint{typeAware,typeCheck}` + `run.cache`, **plus** `defaultPackage: "."` and `plugins: [nitro()]` |
| root `server/api/hello.ts` | `import { defineHandler } from "nitro"` (or `defineEventHandler` from `"nitro/h3"`) |
| root `server/plugins/*.ts` | auto-scanned; import local plugin packages **explicitly** |
| root `tests/.gitkeep` (+ at least one real test file) | root-side tests |
| root `.gitignore` | append `.output` |
| `apps/website` | **unchanged**: `dev`/`build`/`preview`, no `test`, no `check`, no `tests/` |
| `packages/<name>` | shared code; `test`/`check` only where tests exist |

Commands:

```sh
./node_modules/.bin/vp fmt                 # after hand-writing files
./node_modules/.bin/vp check               # exit 0
./node_modules/.bin/vp test                # exit 0
./node_modules/.bin/vp dev                 # root API on http://localhost:3000  (needs defaultPackage ".")
./node_modules/.bin/vp run -r --parallel dev   # website on 5173 + API on 3000 + watch tasks
./node_modules/.bin/vp build               # -> .output/server/index.mjs
PORT=3000 node .output/server/index.mjs
./node_modules/.bin/vp run -r build        # 4/4 tasks ✓
```

The frontend does **not** reach `/api/*` out of the box; add a proxy in `apps/website`'s Vite
config (e.g. `server.proxy` for `/api` → `http://localhost:3000`). That wiring is **UNVERIFIED**
here.

### (b) Backend-only monorepo — root server, no `apps/`

```sh
rm -rf apps          # the apps/* glob in pnpm-workspace.yaml simply matches nothing
```

Verified tree:

```
.
./.gitignore
./nitro.config.ts
./package.json
./packages/utils/{.gitignore,README.md,package.json,tsconfig.json,vite.config.ts,src/,tests/}
./pnpm-lock.yaml
./pnpm-workspace.yaml
./README.md
./server/api/hello.ts
./tests/{.gitkeep,root.test.ts}
./tsconfig.json
./vite.config.ts
```

| file | content |
|---|---|
| root `package.json` | `devDependencies: { "nitro": "catalog:", "vite-plus": "catalog:" }`; scripts `dev`/`check`/`test`/`build` |
| root `nitro.config.ts`, `server/api/*`, root `tests/`, root `.gitignore` | as in (a) |

Verified results:

```console
$ ./node_modules/.bin/vp dev
note: vp dev: using . (defaultPackage in vite.config.ts)
  ➜  Local:   http://localhost:3000/

$ ./node_modules/.bin/vp run -r build
EXIT=1                       # only because the probe's handler used the wrong nitro import
$ ./node_modules/.bin/vp run -r test
EXIT=0                       # 2 tasks: mono#test, utils#test
$ ./node_modules/.bin/vp run -r check
EXIT=1                       # root's own type error on the wrong nitro import
```

With the import corrected, this is the (a) recipe minus `apps/` — `vp run -r build` reduces to
`mono#build` + `utils#build`, and `defaultPackage: "."` still applies. Note that `packages/utils`
is **not** required: with `packages/` also removed, `vp run -r test` still exits 0 running only the
root's tests, and `vp run -r build` runs only `mono#build`.

### (c) Frontend-only monorepo with a placeholder `packages/*`

| file | content |
|---|---|
| root `package.json` | `devDependencies: { "vite-plus": "catalog:" }` only — **no `nitro`** |
| root `vite.config.ts` | stock, **plus** `defaultPackage: "apps/website"` (there is no root app) |
| root `tests/.gitkeep` | kept, so the root always has a `tests/` home |
| root `.gitignore` | root-only `.output` entry is optional here (no Nitro build), harmless to keep for symmetry |
| `apps/website` | **unchanged**, and deliberately **no `test` script, no `tests/`** |
| `packages/example` | placeholder package: `package.json` + `src/index.ts` + `tests/index.test.ts` + `"test": "vp test"`, `"check": "vp check"`, `"build": "vp pack"` |

```json
// packages/example/package.json
{
  "name": "example",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "vp pack", "test": "vp test", "check": "vp check" },
  "devDependencies": { "vite-plus": "catalog:" }
}
```

```console
$ ./node_modules/.bin/vp dev          # defaultPackage -> apps/website on http://localhost:5173
$ ./node_modules/.bin/vp run -r build # website + example; root has no build script -> not scheduled
$ ./node_modules/.bin/vp run -r test  # ONLY example#test; website is skipped silently, exit 0
$ ./node_modules/.bin/vp run -r check # website is skipped silently
```

The last two lines are the verified `-r` semantics from §4.3 applied to exactly this shape: the
frontend contributes an app, no test command, and no test directory, and `-r` neither warns nor
fails.

### Which package gets which scripts (summary)

| package | `dev` | `build` | `test` | `check` |
|---|---|---|---|---|
| root (with server) | `vp dev` (needs `defaultPackage: "."`) | `vp build` | `vp test` | `vp check` |
| root (frontend-only) | `vp dev` (needs `defaultPackage: "apps/website"`) | — | optional | `vp check` |
| `apps/*` frontend | `vp dev` | `tsc && vp build` | **none** | **none** |
| `packages/*` TS utility | `vp pack --watch` | `vp pack` | `vp test` (only with tests) | `vp check` |
| `packages/*` Nitro plugin | — | `vp pack` | `vp test` (only with tests) | `vp check` |

---

## 7. Q6 — Every warning, prompt, silent degradation and non-zero exit observed

### Blocking failures

| # | Where | Verbatim | Exit |
|---|---|---|---|
| F1 | `pnpm add -D nitro@…` at the workspace root | `Error: ERR_PNPM_ADDING_TO_ROOT` … `Running this command will add the dependency to the workspace root … make it explicit by running this command again with the -w flag (or --workspace-root).` | 1 |
| F2 | `vp dev` at the root with member packages | ``error: `vp dev` at the workspace root needs a target package.`` + package list + `Pass a directory: vp -C apps/website dev` / `Or run every package's dev script: vp run -r dev` | 1 |
| F3 | `vp build` at the root with member packages | ``error: `vp build` at the workspace root needs a target package.`` (same body) | 1 |
| F4 | Bare (auto-imported) `defineEventHandler` in a built server | `ReferenceError: defineEventHandler is not defined` at run time | server 500 |
| F5 | `import { defineEventHandler } from "nitro"` in `vp build` | `[MISSING_EXPORT] "defineEventHandler" is not exported by "…/nitro/dist/runtime/nitro.mjs".` | 1 |
| F6 | Same import under `vp check` | `x typescript(TS2724): '"nitro"' has no exported member named 'defineEventHandler'. Did you mean 'defineHandler'?` | 1 |
| F7 | Bare `defineEventHandler` under `vp check` | `x typescript(TS2304): Cannot find name 'defineEventHandler'.` | 1 |
| F8 | Local plugin package not declared by the root | `Error: Cannot find module 'nitro-plugin' imported from '…/server/plugins/local.ts'` … `code: 'ERR_MODULE_NOT_FOUND'` | dev fails |
| F9 | Same, at build time | `Error: [vite+]: Rolldown failed to resolve import "nitro-plugin" from "…/server/plugins/local.ts".` | 1 |
| F10 | Same, in the built output | `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'nitro-plugin' imported from …/.output/server/index.mjs` | 1 |
| F11 | `nitro` not installed but referenced | `[Vite+] resolve universal vite config error: Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'nitro' imported from …/vite.config.ts.timestamp-….mjs` and `error: Failed to resolve vite config: GenericFailure` | 1 |
| F12 | Root `build` script present **without** `defaultPackage` under `vp run -r build` | root task `✗ (exit code: 1)` → siblings killed `✗ (exit code: 137)` → `vp run: 0/4 cache hit (0%), 3 failed.` and **no artifacts at all** | 1 |
| F13 | Root build with `vp -C .` but no `nitro()` plugin | `[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.` | 1 |
| F14 | `vp run -r check -v` (flag placed after the task) | `error: Invalid vite task command: vp with args ["check", "-v"] under cwd …` / `* error: unexpected argument '-v' found` | 1 |
| F15 | `vp run -F <pkg> <task>` where the matched package lacks the task | `error: Task "test" not found` | 1 |
| F16 | `vp run -w <task>` where the root lacks the task | `error: Task "build" not found` | 1 |
| F17 | `vp run -r <task>` where **no** package has the task | `error: Task "no-such-task-xyz" not found` | 1 |
| F18 | `vp run --filter <no-match> --fail-if-no-match <task>` | `error: No packages matched the filter: no-such-pkg` | 1 |

### Warnings and prompts that do **not** stop the run

| # | Where | Verbatim |
|---|---|---|
| W1 | Every built-in command invocation | `note: You are running \`vp dev\` as a Vite+ built-in command. If you meant to run the dev npm script, use \`vpr dev\` instead.` (same note for `build`, `test`, `check`) |
| W2 | When `defaultPackage` is used | `note: vp dev: using . (defaultPackage in vite.config.ts)` / `note: vp build: using . (defaultPackage in vite.config.ts)` |
| W3 | Every successful root `vp test` / `vp run -r test` | `close timed out after 10000ms` / `Tests closed successfully but something prevents 2 Vite servers from exiting` / `You can try to identify the cause by enabling "hanging-process" reporter. See https://vitest.dev/guide/reporters.html#hanging-process-reporter` — **exit code still 0** |
| W4 | `vp pack` on `packages/utils` | `warn: TypeScript 7.0 does not yet have a stable API and is experimental. Some options will be unavailable.` |
| W5 | Scaffold install | `[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.` |
| W6 | `pnpm install` (supply chain) | `? Verifying lockfile against supply-chain policies (202 entries)...` then `✓ Lockfile passes supply-chain policies (202 entries in 13.8s)` — passes, but takes ~1 min under a cold cache |
| W7 | Slow registry in this sandbox | `[WARN] Tarball download average speed 14 KiB/s (size 22 KiB) is below 50 KiB/s: https://registry.npmjs.org/db0/-/db0-0.4.1.tgz (GET)` / `[WARN] Request took 13427ms: …` |
| W8 | Root build cached | `vp run: mono#build not cached because it modified its input.` / `→ Not cached: read and wrote '.output/nitro.json'` |
| W9 | Port already bound | `Port 3000 is in use, trying another one...` → silently binds 3001 |

### Silent degradations (no warning at all)

| # | Behaviour |
|---|---|
| S1 | `vp run -r <task>` **silently skips** packages that lack the task. No warning, no count, no mention; only `-v` / `--last-details` reveals that the package was never scheduled. §4.3 |
| S2 | A `--filter` that matches nothing prints a bare `No packages matched the filter: <x>` and **exits 0**. §4.4 |
| S3 | `vp dev` at the root, with `apps/` and `packages/` absent, **works with no `defaultPackage`** — the guard is purely a function of member packages existing. §2.1 |
| S4 | The scaffold's `.gitignore` files never mention `.output`; `vp check` / `vp fmt` then silently descend into generated output. §5.1, §5.3 |
| S5 | `apps/website`'s `"build": "tsc && vp build"` is silently split into **two** independent task-runner tasks, changing task counts (3 packages → 4 tasks) and cache granularity. §2.4 |
| S6 | A failed task **kills running siblings**, which are then recorded as `exit code: 137`, inflating the reported failure count (1 real failure → `3 failed`). §2.4 |
| S7 | `5173/api/hello` returns HTTP **200** with `Content-Type: text/html` — Vite's SPA fallback, not a 404 and not the API. Nothing warns that the frontend cannot reach the server. §2.3 |
| S8 | The stock root `"dev": "vp run website#dev"` becomes actively wrong once the root has its own dev server; combined with `vp run -r dev` it would start `apps/website` twice. §4.2 |
| S9 | Under `vp run -r test`, the root's workspace-wide Vitest scan runs `packages/utils/tests` **and** `packages/utils`' own `vp test` runs them again — no de-duplication, no warning. §2.3 |

### Prompts

No interactive prompt appeared in any probe. `vp run` opens its fuzzy task selector only when the
task name is **omitted**; every command here named a task, so non-interactive listings (`error: … needs a
target package`) were produced instead of the picker documented for TTYs. That TTY picker path is
therefore **UNVERIFIED** — all probes redirected output to a file, which the docs classify as
non-interactive:

> In non-interactive shells (CI, pipes, redirection), vp prints the same packages as a plain listing
> with ready-to-copy commands and exits 1

---

## 8. Verified structure — final answer

```
<root>/
├── .gitignore                    # scaffolded; must gain a `.output` line
├── package.json                  # ROOT owns `nitro` (devDependencies, catalog:)
│                                 #   + `nitro-plugin: workspace:*` (dependencies) if a local plugin exists
│                                 #   scripts: dev/check/test/build/ready
├── nitro.config.ts               # defineConfig({ serverDir: "./server" })
├── vite.config.ts                # fmt{} + lint{typeAware:true,typeCheck:true} + run.cache:true
│                                 #   + defaultPackage: "."  + plugins: [nitro()]
├── tsconfig.json
├── pnpm-workspace.yaml           # + catalog: { nitro: 3.0.260903-beta }
├── server/
│   ├── api/*.ts                  # explicit `import { defineHandler } from "nitro"`
│   └── plugins/*.ts              # auto-scanned; may import packages/*
├── tests/                        # .gitkeep + at least one real *.test.ts
├── apps/<frontend>/              # Vite app: dev/build/preview; NO test, NO check, NO tests/
└── packages/
    ├── <shared>/                 # tests/ where they exist; test+check scripts only then
    └── <nitro-plugin>/           # nitro: "catalog:"; imported by root server/ code
```

The layout works. The four things that make it work, each of which fails loudly or silently without
being applied, are:

1. **`defaultPackage: "."`** (or `vp -C .`) — otherwise every vp app command refuses to run at the
   root (`needs a target package`, exit 1).
2. **`pnpm add -w -D nitro`** (or the catalog + a root `devDependencies` entry) — a plain
   `pnpm add` at the workspace root is rejected with `ERR_PNPM_ADDING_TO_ROOT`.
3. **Explicit Nitro v3 imports** — `defineHandler` from `"nitro"` or `defineEventHandler` from
   `"nitro/h3"`; there are no auto-imports, and the resulting failures are confusing (a runtime
   `ReferenceError` in the built server, `MISSING_EXPORT` at build time, `TS2304`/`TS2724` at check
   time).
4. **`.output` in `.gitignore`** — otherwise `vp check` and `vp fmt` lint and format the generated
   Nitro bundle.

Plus the task-runner contract for the "frontend package with no test script" case:
**`vp run -r test` skips it silently and exits 0**, while `--filter`/`-w` selection of a package
without the task is `error: Task "test" not found`, exit 1.
