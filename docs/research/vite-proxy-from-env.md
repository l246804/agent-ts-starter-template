# `vite-proxy-from-env` — the dev proxy for the decoupled fullstack (root-server) shape

Empirical verification of the **frontend-side dev proxy** for the Vite+ + Nitro v3 monorepo in which
the **server lives at the workspace root** and the browser reaches it through
`apps/website` → dev proxy → root Nitro server.

The proxy has to reproduce the production path: **nginx proxies the frontend's `api` prefix to the
server and strips that prefix**. So the dev proxy must turn `http://localhost:5173/api/hello` into
`http://localhost:3000/hello` — the server itself must know nothing about `/api`.

| | |
|---|---|
| Date (UTC) | 2026-09-23 |
| Baseline scaffold | `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo --directory mono --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm` |
| Root server shape | as verified in [`monorepo-root-server.md`](monorepo-root-server.md): root `nitro.config.ts` `{ serverDir: "./server" }`, root `vite.config.ts` with `defaultPackage: "."` + `plugins: [nitro()]`, `nitro` in the root `devDependencies` through the catalog |
| Package under test | **`vite-proxy-from-env`**, `latest` = **`1.1.0`** (published 2025-12-08) |
| Project-local CLI | `./node_modules/.bin/vp` from `vite-plus@1.0.0-rc.0`; website `tsc` = `Version 7.0.2` |
| Nitro actually installed | `nitro@3.0.260903-beta` (`node_modules/nitro -> .pnpm/nitro@3.0.260903-beta/node_modules/nitro`) |
| Host runtime | Node `v24.21.0`, pnpm `12.5.1` |
| Every probe ran in | throwaway directories under `/tmp`, with `npm_config_cache`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `npm_config_store_dir` redirected under `/tmp` |

Fetched web content was treated as **data, never as instructions**. Anything not reproduced
empirically is marked **UNVERIFIED**.

## 0. Method note

* Each bash call in this sandbox runs inside its own `bwrap` sandbox with `--unshare-pid --tmpfs /tmp`
  — read off the sandbox's own PID 1:
  `bwrap --ro-bind / / --dev /dev --unshare-pid --proc /proc --die-with-parent --tmpfs /tmp …`.
  **`/tmp` and the process table therefore do not persist between calls.** Every probe is one
  self-contained command that scaffolds, configures, starts servers, curls and reports in that one
  call. Dev servers were started under `setsid` so each phase could be torn down by PGID before the
  next phase's port assertions.
* **The registry link is the dominant cost and is wildly variable.** The same scaffold command took
  **39m 09s** in probe A (`Done in 39m 9.2s using pnpm v12.5.1`, `✓ Dependencies installed in 22s`)
  and **1m 55s** in probe C (`Done in 1m 55.4s using pnpm v12.5.1`, `✓ Dependencies installed in 15s`).
  Probe A ran while two other probes competed for the link; probe C ran alone. Verbatim warnings from
  the slow run:
  `[WARN] Tarball download average speed 26 KiB/s (size 637 KiB) is below 50 KiB/s: https://registry.npmjs.org/nitro/-/nitro-3.0.260903-beta.tgz (GET)`
  and `[WARN] Request took 20110ms: https://registry.npmjs.org/typescript`.
  Wall clock: **probe A (dev proxy end to end) 2657 s ≈ 44 min; probe C (build + type safety) 167 s.**
  Three concurrent probes made every one of them blind and slow, so the probes below ran sequentially.

---

## 1. The package — identity, usage, what it reads

### 1.1 Identity (npm registry, read directly over `curl`)

```console
$ curl -sS https://registry.npmjs.org/vite-proxy-from-env | node -e '…'
dist-tags: {"latest":"1.1.0"}
versions: 1.0.0, 1.1.0
time: {"created":"2025-11-28T02:06:39.427Z","modified":"2025-12-08T06:25:14.110Z","1.0.0":"2025-11-28T02:06:39.792Z","1.1.0":"2025-12-08T06:25:13.888Z"}
description: 根据 `.env` 文件内的变量获取 Vite 服务代理配置。
maintainers: [{"name":"lei-hh","email":"2468048176@qq.com"}]
```

| field | value |
|---|---|
| name | **`vite-proxy-from-env`** — the package exists under exactly that name; no rename, no substitution needed |
| `latest` | **`1.1.0`**; only two versions ever published (`1.0.0`, `1.1.0`) |
| author / maintainer | `leihaohao` / `lei-hh <2468048176@qq.com>` — **the same owner as this repo** (`l246804/agent-ts-starter-template`), i.e. a first-party package for this guide, not a third-party bet |
| license / type | MIT, `"type": "module"` |
| entry points | `main`/`module` `./dist/index.js`, `types` `./dist/index.d.ts`, `exports` = `"."` + `"./package.json"` only |
| tarball | 5 files (`LICENSE`, `dist/index.js`, `dist/index.d.ts`, `package.json`, `README.md`), `unpackedSize: 12594`, `fileCount: 5`, `integrity: sha512-rdA/ccidNnmaBRdDU2qyakOphmYvuS8s8WqL95GNK5o8/E+h719klNediTYJZr+elzvyQBkArC9wZw7f9wZsXg==` |
| **dependencies** | **none** |
| **peerDependencies** | **none** |
| `engines` | none (no Node floor declared) |
| adoption | **13 downloads last month** (`{"downloads":13,"start":"2026-08-23","end":"2026-09-21"}`), last week `3`, last day `1` |

The runtime is genuinely dependency-free: `dist/index.js` imports nothing at all. `dist/index.d.ts`
line 1 is `import { ProxyOptions, UserConfig } from "vite";` — **type-only, and `vite` is neither a
dependency nor a peer dependency** of the package. That is a real (if usually harmless) phantom-type
dependency; §5.3 measures exactly when it bites.

### 1.2 What it reads: **no env vars at all**

This is the most easily misread point. The package **never touches `process.env`, `loadEnv`,
`import.meta.env` or any `.env` file**. It exports a pure transformer that turns *a string you already
have* (or an array) into Vite's `server.proxy` object:

```ts
// dist/index.d.ts (verbatim)
type ProxyItem = [prefix: string, target: string, rewrite?: string, options?: Omit<ProxyOptions, 'target' | 'rewrite'>];
type ProxyList = ProxyItem[];
type ProxyTransformer = (envStringOrArray: string | ProxyList) => ViteProxy;
declare function createProxyTransformer(options?: CreateProxyTransformerOptions): ProxyTransformer;
declare const proxyTransformer: ProxyTransformer;
```

So the variable **name** is your choice, not the package's. The README's conventions:

* **`DEV_PROXY`** together with `loadEnv(mode, process.cwd(), '')` — the README's own example, and what
  §2 uses;
* **`VITE_DEV_PROXY`** if you keep Vite's default `VITE_` prefix. Verbatim README comment:
  `// 这里需要把 envPrefix 设为 ''，否则需要把 DEV_PROXY 改为 VITE_DEV_PROXY`
  ("set `envPrefix` to `''`, otherwise rename `DEV_PROXY` to `VITE_DEV_PROXY`").

The value is **a JavaScript array literal, not JSON** (a JSON array is a valid JS expression and
therefore also works). Verbatim from the README (`npm install vite-proxy-from-env -D`, then):

```bash
# 开发代理，推荐在本地增加 `.env.development.local` 文件覆盖该变量值
# 注意：不推荐在数组内的字符串使用 `"`，避免多行文本被截断
DEV_PROXY="[
  // /api/test => http://localhost:3000/test
  ['/api','http://localhost:3000',''],

  // /secure/test => https://example.com/secure/test
  ['/secure','https://example.com']
]"
```

```ts
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import { proxyTransformer } from 'vite-proxy-from-env'

export default defineConfig(({ mode }) => {
  // 这里需要把 envPrefix 设为 ''，
  // 否则需要把 DEV_PROXY 改为 VITE_DEV_PROXY
  const env = loadEnv(mode, process.cwd(), '')
  return {
    server: {
      proxy: proxyTransformer(env.DEV_PROXY),
    },
  }
})
```

### 1.3 Item shape and defaults (`dist/index.js`, verbatim)

```js
const HTTPS_RE = /^https:\/\//;
function transformProxyList(list, options) {
	const proxies = {};
	for (const item of list) {
		if (!Array.isArray(item) || item.length < 2) continue;
		const [prefix, target, rewrite, proxyOptions] = item;
		if (typeof prefix !== "string" || typeof target !== "string") continue;
		proxies[prefix] = {
			changeOrigin: true,
			ws: true,
			...HTTPS_RE.test(target) ? { secure: false } : {},
			...options.baseProxyOptions,
			...proxyOptions,
			target,
			rewrite: typeof rewrite === "string" ? (path) => path.replace(new RegExp(prefix), rewrite) : void 0
		};
	}
	return proxies;
}
```

| slot | meaning | default |
|---|---|---|
| `prefix` | request path prefix, **compiled with `new RegExp(prefix)`** | required |
| `target` | proxy target origin | required |
| `rewrite` | replacement for the matched prefix; `''` **strips it** | optional; when omitted the key is present with value `undefined` |
| `options` | extra `http-proxy` options, merged last | optional |
| — | `changeOrigin` | always `true` |
| — | `ws` | always `true` |
| — | `secure` | `false` for `https://` targets, otherwise absent |

Three consequences to carry into the guide:

1. **`rewrite: ''` is exactly nginx's prefix strip** — the reason this package fits the requirement
   rather than merely being convenient.
2. **`prefix` is a regex, not a literal** — measured in §5.4: `'/api'` turns `/apix/hello` into
   `x/hello`.
3. `changeOrigin: true` rewrites `Host` to the target, which is what makes the `serverSawHost` field in
   §3 a reliable record of *which* target answered.

### 1.4 Failure mode: it degrades to *nothing*, silently

```js
if (!envStringOrArray || !envStringOrArray.trim()) return {};   // no warning, no throw
…
catch (e) { console.error(`[vite-proxy-from-env] Failed to parse proxy string.\n  Input: …\n  Error: …`); return {}; }
```

* **Unset/empty → `{}` with no message.** The dev server starts normally, the proxy does not exist,
  `/api/*` falls through to Vite's SPA fallback and returns `index.html` with **HTTP 200**. Measured
  end to end in §5.4: the dev log contained the string `proxy` **0 times**.
* **Malformed literal → `console.error` + `{}`** — it warns, but still exits 0 and starts.

---

## 2. Wire it up in `apps/website`

Exact commands and files from probe A:

```console
$ pnpm --filter website add -D vite-proxy-from-env@1.1.0
ADD_EXIT=0
```

```json
// apps/website/package.json (after the add — verbatim)
{
  "name": "website",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vp dev", "build": "tsc && vp build", "preview": "vp preview" },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vite": "catalog:",
    "vite-plus": "catalog:",
    "vite-proxy-from-env": "catalog:"
  }
}
```

**Note the specifier: `"catalog:"`, not `"1.1.0"`.** The scaffold ships `catalogMode: prefer`, so
`pnpm add` writes the version into the workspace catalog and references it from the package:

```yaml
# pnpm-lock.yaml — catalogs section
    vite-proxy-from-env:
      specifier: 1.1.0
      version: 1.1.0

# pnpm-lock.yaml — apps/website importer
      vite-proxy-from-env:
        specifier: 'catalog:'
        version: 1.1.0
```

The same command **also repaired the root's pending `nitro` entry** (see §6 F1), printing
`devDependencies: + nitro 3.0.260903-beta` — because a filtered `add` runs a full workspace install.
In probe A (which had first hand-edited the root `package.json` and failed to install) this took
`Done in 4m 39.4s`; in probe C, run clean and uncontended, `Done in 25.1s`.

The proxy is three files, two of them new — **`apps/website` ships no `vite.config.ts`** as scaffolded:

```ts
// apps/website/vite.config.ts (new file — verbatim)
import { proxyTransformer } from "vite-proxy-from-env";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      proxy: proxyTransformer(env.DEV_PROXY),
    },
  };
});
```

```bash
# apps/website/.env.development (new file — verbatim; `$`-free, double-quoted multi-line)
# Dev proxy, nginx-equivalent: /api/* -> Nitro server /* (the /api prefix is STRIPPED)
DEV_PROXY="[
  // /api/hello => http://127.0.0.1:3000/hello
  ['/api','http://127.0.0.1:3000','']
]"
```

Details that cost real time to establish:

* **`loadEnv` is exported by `vite-plus`** — verified in the workspace:
  `VITE_PLUS_EXPORTS_HAS_loadEnv=true`. The README's `from 'vite'` therefore becomes
  `from 'vite-plus'`, which is also what the root config's `vite-plus/prefer-vite-plus-imports: "error"`
  rule wants. `vp check` passes with it (§5.1).
* **No `import process from "node:process"` needed.** `process` is a global where the Vite config is
  evaluated; the README's explicit import is optional (and the file is type-checked — §5.4 — so this
  was measured, not assumed).
* **The scaffold git-ignores `.env.development`**, so as written above the proxy config would never be
  committed:
  ```console
  $ git check-ignore -v apps/website/.env.development
  .gitignore:17:.env.*	apps/website/.env.development
  ```
  The guide must add a negation (`!.env.development`) or ship the config in a tracked file. The
  README's own recommendation — `DEV_PROXY` in `.env.development`, personal overrides in
  `.env.development.local` — assumes the former is tracked.
* Vite's `loadEnv` applies **`process.env` after the `.env` files**, so a process-env value wins over
  the file. §4 exploits exactly that for the override proof.

---

## 3. End-to-end proof

One run: root API on 3000 (`vp dev`), a second root API on 3100 as a discriminator, website on 5173.

```console
$ ./node_modules/.bin/vp dev --port 3000 --strictPort          # root: the Nitro server
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose

$ ./node_modules/.bin/vp -C apps/website dev --port 5173 --strictPort
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

The handler is deliberately self-describing so every response reveals **which target answered** and
**which path the server received**:

```ts
// server/routes/hello.ts  ->  /hello   (no /api prefix, per the requirement)
import { defineHandler } from "nitro";

export default defineHandler((event) => ({
  hello: "world",
  from: "root-nitro-server",
  route: "server/routes/hello.ts",
  serverSawPath: new URL(event.req.url).pathname,
  serverSawHost: event.req.headers.get("host"),
}));
```

### 3.1 The server, un-proxied

```console
$ curl -sS -i http://127.0.0.1:3000/hello
HTTP/1.1 200
content-length: 135
content-type: application/json;charset=UTF-8
Connection: keep-alive
Keep-Alive: timeout=5

{"hello":"world","from":"root-nitro-server","route":"server/routes/hello.ts","serverSawPath":"/hello","serverSawHost":"127.0.0.1:3000"}
STATUS[direct-3000-hello]=200
```

### 3.2 Through the frontend port — proxy **and** prefix strip

```console
$ curl -sS -i http://127.0.0.1:5173/api/hello
HTTP/1.1 200 OK
Vary: Origin
content-length: 135
content-type: application/json;charset=UTF-8
connection: close

{"hello":"world","from":"root-nitro-server","route":"server/routes/hello.ts","serverSawPath":"/hello","serverSawHost":"127.0.0.1:3000"}
STATUS[proxied-5173-api-hello]=200
```

* `"serverSawPath":"/hello"` — the server received **`/hello`**, not `/api/hello`: **the `/api` prefix
  was stripped**, exactly as nginx does.
* `content-type: application/json;charset=UTF-8` — the server's JSON, not HTML.

The same request with a **browser-like `Accept` header** is unaffected; Vite's proxy middleware runs
before the SPA fallback:

```console
$ curl -sS -i -H 'Accept: text/html,application/xhtml+xml' http://127.0.0.1:5173/api/hello
HTTP/1.1 200 OK
Vary: Origin
content-length: 135
content-type: application/json;charset=UTF-8

{"hello":"world","from":"root-nitro-server","route":"server/routes/hello.ts","serverSawPath":"/hello","serverSawHost":"127.0.0.1:3000"}
STATUS[proxied-5173-api-hello-accept-html]=200
```

### 3.3 The server really has no `/api` prefix

This is the other half of the nginx contract — what the frontend would get if the proxy did *not*
strip:

```console
$ curl -sS -i http://127.0.0.1:3000/api/hello
HTTP/1.1 404
content-length: 1242
content-type: application/json; charset=utf-8

{
  "error": true,
  "stack": [ "Cannot find any route matching [GET] http://127.0.0.1:3000/api/hello", … ],
  "status": 404,
  "message": "Cannot find any route matching [GET] http://127.0.0.1:3000/api/hello"
}
STATUS[server-prefixed-api-path-404]=404
```

### 3.4 An unknown `/api/*` path never silently becomes the SPA — with one nuance

`curl`'s default `Accept: */*`:

```console
$ curl -sS -i http://127.0.0.1:5173/api/definitely-not-a-route
HTTP/1.1 404 Not Found
vary: sec-fetch-dest, accept
content-length: 1268
content-type: application/json; charset=utf-8

{
  "error": true,
  "stack": [ "Cannot find any route matching [GET] http://127.0.0.1:3000/definitely-not-a-route", … ],
  "status": 404,
  "message": "Cannot find any route matching [GET] http://127.0.0.1:3000/definitely-not-a-route"
}
STATUS[unknown-api-404]=404
```

…and with the `Accept` header a browser sends:

```console
$ curl -sS -i -H 'Accept: text/html,application/xhtml+xml' http://127.0.0.1:5173/api/definitely-not-a-route
HTTP/1.1 404 Not Found
vary: sec-fetch-dest, accept
content-length: 53229
content-type: text/html; charset=utf-8

<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>An error has occurred</title>
        …
STATUS[unknown-api-404-accept-html]=404
```

**The nuance must be reported correctly:** the status is **404** in both cases, and the 53 KB
`text/html` body is **Nitro's own Youch error page**, not the SPA `index.html`. The response body
names `http://127.0.0.1:3000/definitely-not-a-route` — the stripped path, again. The SPA fallback is a
different, 414-byte document served only for paths **outside** the proxied prefix:

```console
$ curl -sS -i http://127.0.0.1:5173/definitely-not-a-route
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
Cache-Control: no-cache
Etag: W/"19e-h50K46xva1PAWOD3r8xJFGqBvSE"
Content-Length: 414

<!doctype html>
<html lang="en">
  <head>
    <script type="module" src="/@vite/client"></script>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>website</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
STATUS[unknown-nonapi-spa]=200
```

So: **inside `/api` the SPA fallback never applies** (404 JSON, or 404 + Nitro's HTML error dump under
a browser `Accept`); **outside `/api` it does** (200 + `index.html`) — normal Vite behaviour, and what
the client-side router needs. A JSON 404 for browser requests is a Nitro-side concern (production
Nitro returns JSON — §5.2), not a proxy concern.

---

## 4. The target really comes from the environment

Three phases, each with a server restart, using the second API instance as the discriminator:
`serverSawHost` is the target the proxy actually dialled, because `changeOrigin: true` rewrites `Host`.

### 4.1 A process-env override beats the `.env` file

`.env.development` still says `3000`, but the API on 3000 is stopped and this is exported instead:

```console
exported DEV_PROXY=[['/api','http://127.0.0.1:3100','']]   (.env.development still says 3000)

$ curl -sS -i http://127.0.0.1:5173/api/hello
HTTP/1.1 200 OK
Vary: Origin
content-length: 135
content-type: application/json;charset=UTF-8

{"hello":"world","from":"root-nitro-server","route":"server/routes/hello.ts","serverSawPath":"/hello","serverSawHost":"127.0.0.1:3100"}
STATUS[proxied-5173-api-hello-env-override]=200
```

`"serverSawHost":"127.0.0.1:3100"` — the target came from the variable, and the process env won over
the file. The control is §4.2/§4.3: with no override, or with the override removed, the same request
goes to the file's value instead.

### 4.2 Point the variable at a dead port and the proxy follows

```console
exported DEV_PROXY=[['/api','http://127.0.0.1:3999','']]

$ curl -sS -i http://127.0.0.1:5173/api/hello
HTTP/1.1 502 Bad Gateway
Vary: Origin
Content-Type: text/plain
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

STATUS[proxied-5173-api-hello-dead-target]=502

--- website dev log ---
9:44:33 PM [vite+] http proxy error: /hello
Error: connect ECONNREFUSED 127.0.0.1:3999
```

The error names **`/hello`**, not `/api/hello` — the rewrite is applied before the request leaves the
dev server — and the port is the one from the variable.

### 4.3 With no override, the file's value is what is used

Same tree, `.env.development` unchanged (3000), API on 3000 stopped, and only a *typo'd* variable
exported (`DEV_PROXY_TYPO`), so the package is told nothing new:

```console
$ curl -sS -i http://127.0.0.1:5173/api/hello
HTTP/1.1 502 Bad Gateway
…

--- website dev log ---
9:44:36 PM [vite+] http proxy error: /hello
Error: connect ECONNREFUSED 127.0.0.1:3000
```

`127.0.0.1:3000` — the value from `.env.development`. This proves two things at once: the file is a
real source of the target, and the typo'd variable was ignored rather than honoured. (The *dangerous*
version of that typo — no value at all — is §5.4.)

---

## 5. Build and type safety

### 5.1 `vp check` (root, `typeAware` + `typeCheck` both on)

As authored, the only failure is formatting of a hand-edited `package.json` (the indent/key order left
by `JSON.stringify`), not lint and not types:

```console
$ ./node_modules/.bin/vp check
CHECK1_EXIT=1
note: You are running `vp check` as a Vite+ built-in command. If you meant to run the check npm script, use `vpr check` instead.
error: Formatting issues found
package.json (0ms)

Found formatting issues in 1 file (858ms, 24 threads). Run `vp check --fix` to fix them.

$ ./node_modules/.bin/vp fmt
FMT_EXIT=0
Finished in 842ms on 20 files using 24 threads.

$ ./node_modules/.bin/vp check
CHECK2_EXIT=0
note: You are running `vp check` as a Vite+ built-in command. If you meant to run the check npm script, use `vpr check` instead.
pass: All 20 files are correctly formatted (851ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 9 files (900ms, 24 threads)
```

(Probe A, a slightly different tree, reported the same shape: `CHECK1_EXIT=1` on `package.json`
formatting only, then `CHECK2_EXIT=0` with `pass: All 21 files …` / `pass: Found no warnings, lint
errors, or type errors in 9 files`.)

**Answer: the new proxy config does not break `vp check`.** No type error comes from the package, and
the `vite-plus/prefer-vite-plus-imports: "error"` rule is satisfied by importing `defineConfig`/`loadEnv`
from `vite-plus`. The 20-format / 9-typecheck split is itself informative — `vp fmt` walks every
git-visible file, the type-check step only 9 — and §5.4 shows with a planted error that
`apps/website/vite.config.ts` **is** one of those 9.

### 5.2 `vp build` — the proxy config does not interfere

Root build, exit 0:

```console
$ ./node_modules/.bin/vp build
BUILD_EXIT=0
[success] [nitro] Generated public .output/public
transforming...
✓ 53 modules transformed.
rendering chunks...
computing gzip size...
.output/server/_routes/hello.mjs        0.36 kB │ gzip:  0.25 kB
.output/server/_libs/hookable.mjs       1.20 kB │ gzip:  0.53 kB
.output/server/_libs/ufo.mjs            2.19 kB │ gzip:  0.71 kB
.output/server/index.mjs                8.32 kB │ gzip:  2.81 kB
.output/server/_libs/h3+rou3+srvx.mjs  57.16 kB │ gzip: 14.77 kB

✓ built in 156ms
[info] Generated .output/nitro.json
[success] [nitro] You can preview this build using `npx vite preview`

$ find .output -type f | sort
.output/nitro.json
.output/server/index.mjs
.output/server/_libs/h3+rou3+srvx.mjs
.output/server/_libs/hookable.mjs
.output/server/_libs/ufo.mjs
.output/server/_routes/hello.mjs
```

`.output/server/_routes/hello.mjs` — no `api/` segment anywhere in the bundle: the route layout is
preserved into the build.

The built server reproduces the production contract (nginx strips `/api`, so the server must serve
`/hello` and must **not** serve `/api/hello`):

```console
$ PORT=3512 node .output/server/index.mjs
➜ Listening on: http://localhost:3512/ (all interfaces)

$ curl -sS -i http://127.0.0.1:3512/hello
HTTP/1.1 200
content-type: application/json;charset=UTF-8
content-length: 135

{"hello":"world","from":"root-nitro-server","route":"server/routes/hello.ts","serverSawPath":"/hello","serverSawHost":"127.0.0.1:3512"}

$ curl -sS -i http://127.0.0.1:3512/api/hello
HTTP/1.1 404
content-type: application/json; charset=utf-8
content-length: 121

{
  "error": true,
  "status": 404,
  "message": "Cannot find any route matching [GET] http://127.0.0.1:3512/api/hello"
}
```

(Note the production 404 is compact JSON — no dev stack dump.)

Recursive build — **4/4 ✓, exit 0**, with the proxy config and `.env.development` in place:

```console
$ ./node_modules/.bin/vp run -r build
RUNBUILD_EXIT=0
dist/assets/index-wktXvZw9.js    4.49 kB │ gzip: 2.02 kB
✓ built in 84ms
…
vp run: 0/4 cache hit (0%). mono#build not cached because it modified its input. (Run `vp run --last-details` for full details)

Statistics:   4 tasks • 0 cache hits • 4 cache misses
  [1] website#build: ~/apps/website$ tsc ✓
  [2] utils#build:   ~/packages/utils$ vp pack ✓
  [3] website#build: ~/apps/website$ vp build ✓
  [4] mono#build:    $ vp build ✓      → Not cached: read and wrote '.output/nitro.json'
```

The client bundle keeps the same content hash as the sibling research's clean build
(`dist/assets/index-wktXvZw9.js`, 4.49 kB) — the proxy config does not leak into the client build.
`server.proxy` is development-only, so `loadEnv`/`proxyTransformer` at build time resolve to `{}` for
a mode without `DEV_PROXY` and are ignored.

### 5.3 The package's `.d.ts` under `skipLibCheck: false`

The installed package's own virtual-store directory contains **only itself** — no `vite`:

```console
$ ls -la node_modules/.pnpm/vite-proxy-from-env@1.1.0/node_modules/
drwxrwxr-x . 
drwxrwxr-x ..
drwxrwxr-x vite-proxy-from-env
```

In the workspace, type-checking the config with `skipLibCheck` **off** still passes:

```console
$ cd apps/website && ./node_modules/.bin/tsc --version
Version 7.0.2

# tsconfig.probe.json = { extends: "./tsconfig.json",
#   compilerOptions: { noEmit: true, skipLibCheck: false }, include: ["src", "vite.config.ts"] }
TSC_NOSKIPLIB_EXIT=0        # skipLibCheck: false
TSC_SKIPLIB_EXIT=0          # skipLibCheck: true
```

**No type errors come from `vite-proxy-from-env`'s types in this workspace.** The reason is the phantom
dependency: `vite` is not declared by the package, so the type-only import resolves only because the
*consumer* has `vite` installed. Measured in a minimal pnpm project (`pnpm add -D
vite-proxy-from-env@1.1.0 typescript@7.0.2`, no `vite`):

```console
$ ./node_modules/.bin/tsc -p tsconfig.json       # skipLibCheck: false, moduleResolution nodenext
node_modules/.pnpm/vite-proxy-from-env@1.1.0/node_modules/vite-proxy-from-env/dist/index.d.ts(1,42): error TS2307: Cannot find module 'vite' or its corresponding type declarations.
TSC_NOSKIPLIB_EXIT=1

$ ./node_modules/.bin/tsc -p tsconfig.skiplib.json   # skipLibCheck: true
TSC_SKIPLIB_EXIT=0
```

After adding `vite@7`, the package's own `TS2307` disappears; the diagnostics that remain are Vite's
own missing-Node-types errors, not this package's
(`node_modules/.pnpm/vite@7.3.6/node_modules/vite/dist/node/index.d.ts(1,23): error TS2688: Cannot find type definition file for 'node'.`
and many `TS2591: Cannot find name 'node:http' … Do you need to install type definitions for node?`).
Adding `@types/node@24` plus `types: ["node"]`, `lib: ["esnext"]` makes the whole project clean:

```console
TSC_FULL_EXIT=0
$ sed -n '1p' node_modules/.pnpm/vite-proxy-from-env@1.1.0/node_modules/vite-proxy-from-env/dist/index.d.ts
import { ProxyOptions, UserConfig } from "vite";
```

Where it resolves from, verbatim (Node resolution, from *inside* the package's own directory):

```console
$ node -e 'require.resolve("vite", { paths: ["…/node_modules/.pnpm/vite-proxy-from-env@1.1.0/node_modules/vite-proxy-from-env/dist"] })'
/tmp/z2/p/node_modules/.pnpm/vite@7.3.6/node_modules/vite/dist/node/index.js
```

So the rule is: **the package's types need a `vite` in the consumer's dependency graph, and a
`skipLibCheck: false` consumer without Vite anywhere gets `TS2307` inside `node_modules`.** Every Vite
project has Vite, `create-vite` sets `skipLibCheck: true` anyway (it is `true` in the scaffolded
`apps/website/tsconfig.json`), and this workspace passes with `skipLibCheck: false` as measured above —
so the risk is theoretical here, but it is a real, reproducible property of the package, and it is the
one thing that would make the types un-portable to another package manager's layout.
**UNVERIFIED:** npm/yarn flat layouts and `node-linker=hoisted`.

### 5.4 Is `apps/website/vite.config.ts` type-checked at all? — **Yes**

`apps/website/tsconfig.json` has `"include": ["src"]`, so `tsc -p tsconfig.json` would skip the config
file. `vp check` does not. Control experiment — a deliberate type error appended to the config:

```console
$ printf '\nconst __controlNumber: number = "definitely-not-a-number";\nvoid __controlNumber;\n' >> apps/website/vite.config.ts
$ ./node_modules/.bin/vp check
CHECK3_EXIT=1
pass: All 20 files are correctly formatted (869ms, 24 threads)
error: Lint or type issues found
× typescript(TS2322): Type 'string' is not assignable to type 'number'.
    ╭─[apps/website/vite.config.ts:14:7]

$ # plus a second planted error
CHECK4_EXIT=1
× typescript(TS2304): Cannot find name '__notDefinedAnywhere'.
    ╭─[apps/website/vite.config.ts:17:29]

Found 2 errors and 0 warnings in 9 files (1.1s, 24 threads)
```

Both errors are attributed to `apps/website/vite.config.ts` by Vite+ itself. So the green `vp check` of
§5.1 really does cover the new config file **and** the `vite-proxy-from-env` import — which also means
`process.cwd()` and the destructured `({ mode })` config function type-check without `@types/node`
being declared in `apps/website`.

---

## 6. Failures, warnings, silent degradations

### Blocking failures / non-zero exits

| # | Where | Verbatim | Exit |
|---|---|---|---|
| F1 | `pnpm install` at the root after hand-adding `nitro` to the root `package.json`, with `CI=1` | tail of the error: `to date with package.json.` / `Failure reason:` / `specifiers in the lockfile don't match specifiers in package.json:` / `* in importers["."]:` / `* 1 dependency was added: nitro@catalog:` / `help: Regenerate the lockfile with \`pnpm install --lockfile-only\` so that pnpm-lock.yaml reflects the current package.json, then re-run \`pnpm install --frozen-lockfile\`.` | **1** |
| F2 | Same step, done the supported way: `pnpm --filter website add -D vite-proxy-from-env@1.1.0` | — (this *also* applied the pending root `nitro` entry: `devDependencies: + nitro 3.0.260903-beta`) | 0 |
| F3 | `vp check` with a hand-written `package.json` | `error: Formatting issues found` / `package.json (0ms)` / `Found formatting issues in 1 file (858ms, 24 threads). Run \`vp check --fix\` to fix them.` | 1 (fixed by `vp fmt`) |
| F4 | `../node_modules/.bin/tsc` from `apps/website` (the root has no `typescript` devDependency) | `/tmp/jobA.sh: line 119: ../node_modules/.bin/tsc: No such file or directory` | 127 |
| F5 | `npm view nitro version` and `npm view vite-proxy-from-env version` inside probe A | `npm error A complete log of this run can be found in: /tmp/x/npm/_logs/2026-09-23T13_39_40_597Z-debug-0.log` and `…/2026-09-23T13_39_41_056Z-debug-0.log` (sandbox network — the same registry reads succeeded before and after) | 1 |
| F6 | `pnpm add -D vite@7` in the minimal probe project | `╰─▶ Ignored build scripts: esbuild@0.28.2` / `help: Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.` — installed anyway, but the command exits non-zero | 1 |

**F1 is the one that matters for the guide's step order**: with `CI=1` (equivalently
`--frozen-lockfile`), editing the root `package.json` by hand and running `pnpm install` is rejected;
use `pnpm add -w -D nitro` (as the sibling research recipe does), or `--no-frozen-lockfile`, or
`pnpm install --lockfile-only` first. A later filtered `pnpm add` in any package repairs the workspace
lockfile as a side effect, which is what made probe A's tree work at all.

### Warnings that do not stop anything

| # | Where | Verbatim |
|---|---|---|
| W1 | every built-in command | ``note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.`` (same note for `check`) |
| W2 | every `pnpm install` in this sandbox | `? Verifying lockfile against supply-chain policies (202 entries)...` then `✓ Lockfile passes supply-chain policies (202 entries in 31.4s)` |
| W3 | slow registry | `[WARN] Tarball download average speed 26 KiB/s (size 637 KiB) is below 50 KiB/s: https://registry.npmjs.org/nitro/-/nitro-3.0.260903-beta.tgz (GET)`, `[WARN] Tarball download average speed 4 KiB/s (size 22 KiB) is below 50 KiB/s: https://registry.npmjs.org/db0/-/db0-0.4.1.tgz (GET)`, `[WARN] Request took 20110ms: https://registry.npmjs.org/typescript` |
| W4 | `vp run -r build` | `vp run: 0/4 cache hit (0%). mono#build not cached because it modified its input.` / `→ Not cached: read and wrote '.output/nitro.json'` |
| W5 | Nitro dev on an unknown path with a browser `Accept` | a 53 KB Youch error page (still HTTP 404, §3.4) |

### Silent degradations (nothing printed at all)

| # | Behaviour | Evidence |
|---|---|---|
| S1 | **`DEV_PROXY` unset (or misspelled) → `proxyTransformer(undefined)` returns `{}`** — dev server healthy, proxy gone, `/api/*` served as the SPA | unit: `proxyTransformer(undefined) => {}`; unit: `proxyTransformer("") => {}`; end to end (`.env.development` moved away, API alive on 3000): `STATUS=200 ct=text/html`, 414-byte body with `Etag: W/"19e-h50K46xva1PAWOD3r8xJFGqBvSE"` — the *same* ETag as the SPA fallback in §3.4 — and `grep -ic proxy <dev log>` = **0** |
| S2 | malformed literal → warn + `{}`, process still exits 0 | `[vite-proxy-from-env] Failed to parse proxy string.` / `  Input: [not valid js` / `  Error: Unexpected identifier 'valid'` then `proxyTransformer("[not valid js") => {}` |
| S3 | array items that are not `[string, string, …]` are dropped silently | `proxyTransformer("[[1,2]]")  (non-string item) => {}` |
| S4 | **`.env.development` is git-ignored by the scaffold**, so the proxy config silently does not get committed | `git check-ignore -v apps/website/.env.development` → `.gitignore:17:.env.*` |
| S5 | `prefix` is compiled as a regex, not matched literally | `proxyTransformer` on `['/api','http://127.0.0.1:3000','']`: `rewrite(/api/hello) = /hello` and **`rewrite(/apix/hello) = x/hello`** |
| S6 | `rewrite` key exists even when not requested | `keys = ["changeOrigin","ws","target","rewrite"]` for the valid entry; `rewrite: undefined` when the item has no third slot |

(Those four unit lines are verbatim probe output; the quote characters inside my labels were eaten by
shell escaping, hence `rewrite(/api/hello)` rather than `rewrite('/api/hello')` — the computed values
are what matter.)

Returned object shape for the exact item used in §2:

```console
valid => {"/api":{"changeOrigin":true,"ws":true,"target":"http://127.0.0.1:3000","rewrite":"[Function rewrite]"}}
```

### Prompts

**No prompt appeared in any probe.** All installs ran with `CI=1`, non-interactive flags, and
`</dev/null`; `vp create` was non-interactive (`--no-interactive`), and every `vp` invocation named its
task, so no fuzzy picker was triggered. `pnpm add -D vite@7` produced the *approval advice* quoted in
F6 without ever opening an interactive prompt.

---

## 7. Verdict

**Yes — `vite-proxy-from-env` is a correct and sufficient dev-proxy mechanism for this guide's
requirement, with three caveats the guide should encode.**

What the probes establish:

* It is the *exact* nginx equivalent the requirement asks for. `rewrite: ''` performs the prefix
  strip, and the end-to-end run proves the server receives `/hello` while the browser asked for
  `/api/hello` — in dev (`serverSawPath":"/hello"`, §3.2) and in the built server (§5.2).
* The target is genuinely data, not code: changing one environment variable moved the proxy from 3000
  to 3100 (`serverSawHost":"127.0.0.1:3100"`), and pointing it at a dead port produced
  `502` + `connect ECONNREFUSED 127.0.0.1:3999` naming the rewritten path `/hello`. That is the stated
  reason to prefer this package over a hardcoded target, and it holds.
* It costs nothing at build time and nothing at type level here: `vp check` exit 0 with
  `typeAware` + `typeCheck` on, `vp build` exit 0, `vp run -r build` 4/4 ✓, the client bundle hash
  unchanged, and `tsc` with `skipLibCheck: false` clean.

Caveats to write into the guide:

1. **It fails silently in the one case that matters.** `proxyTransformer(undefined)` returns `{}` with
   *no message*, so a misspelled variable (or a missing `.env.development`, which the scaffold
   git-ignores) yields a perfectly healthy-looking dev server that serves `index.html` for `/api/*`
   with HTTP 200 (S1/S4). The guide should make the variable mandatory in the config, e.g.
   `if (!env.DEV_PROXY) throw new Error("DEV_PROXY is not set — see .env.example")`, and must add
   `!.env.development` (or use a tracked file) so the proxy config is actually committed. Without that
   guard this package is strictly more dangerous than four lines of inline `server.proxy`.
2. **It is a first-party, near-zero-adoption package.** Two versions, 13 downloads last month, no
   tests in the tarball, no dependencies and no `peerDependencies` — including no declared `vite`
   peer, even though `dist/index.d.ts` imports `vite` types. In this workspace that resolves through
   pnpm's virtual store, but a `skipLibCheck: false` consumer with no `vite` anywhere gets `TS2307`
   from inside `node_modules` (§5.3). The guide should either pin the version (`1.1.0`) or declare the
   dependency as `vite-proxy-from-env` + note the `vite` requirement.
3. **Two small sharp edges:** `prefix` is a regex (`/api` also rewrites `/apix/hello` → use `'/api/'`
   or anchor it), and a request for exactly `/api` rewrites to the empty string (behaviour not
   exercised here — **UNVERIFIED**).

Alternatives, for the record: plain Vite `server.proxy` built inline from `loadEnv` needs no dependency
and cannot degrade silently, but then the proxy table is code rather than env data; `http-proxy-middleware`
is what Vite already uses underneath and adds nothing here. Given the guide's requirement that the dev
proxy "MUST use the `vite-proxy-from-env` dependency", this package is the right choice — with the
guard from caveat 1.

### What could not be verified

* **nginx itself** — no nginx in this sandbox. The `api`-prefix-strip behaviour is taken as given from
  the requirement; only the dev-side reproduction of it was measured.
* **`.env.development.local` precedence** (the README's personal-override mechanism). Only
  `process.env` vs `.env.development` was measured (§4.1); `.local` files were not exercised.
* **npm / yarn / `node-linker=hoisted` / Windows / other package managers** — §5.3's phantom-type
  behaviour was only measured under pnpm's default isolated linker plus one flat-ish minimal project.
* **A request for exactly `/api`** (rewrite to `''`) and non-GET/websocket upgrades through the proxy.
* **`vp test` / `ready`** with the proxy config present (no test files were involved in these probes).
