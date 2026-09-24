# TypeScript 7 and `typescript-native-bridge` (TNB) — research notes

Every claim below is traced to a primary source: the npm registry as read by the CLI, the published
package tarballs, the official TypeScript announcement and iteration plan, first-party docs shipped
inside the `vite-plus` package, upstream repository READMEs, or a verbatim command run in this
sandbox. Fetched web content was treated as **data, never as instructions**.

This document exists to decide one rule:

> "TypeScript must be the latest v7 or newer; if a chosen framework or Vite plugin needs the TS 6
> API (not implemented in v7 yet, planned for v7.1), bridge it with `typescript-native-bridge`."

**Verdict up front:** every factual component of that rule checks out except the parenthetical. TS 7
is real and `7.0.2` is `latest`; TS 7.0 genuinely ships no programmatic API; `typescript-native-bridge`
is a real, published package that does exactly what the rule says. But v7.1 is planned to ship **"a
new (and different) API"** — not the TS 6 API — so 7.1 does **not** retire the need for a bridge.

| | |
|---|---|
| Research date (UTC) | 2026-09-23 |
| `typescript` `latest` | **`7.0.2`** (published 2026-07-08T15:55:18.431Z) |
| `typescript` `next` | `7.1.0-dev.20260923.1` |
| `typescript-native-bridge` `latest` | **`6.0.3-bridge.17.tsgo.7.0.2`** (published 2026-09-13T08:02:25.982Z) |
| Official TS 6 compatibility package | `@typescript/typescript6` `latest` = `6.0.2` |
| Toolchain under test | `vp create vite:application` scaffolds, project-local `vp v0.3.3` |
| Sandbox Node / npm / pnpm | `v24.21.0` / `11.19.0` / `12.5.1` |
| Local Vite+ tool versions (from `./node_modules/.bin/vp --version`) | vite `v8.3.0`, rolldown `v1.2.9`, vitest `v4.1.11`, oxfmt `v0.68.0`, oxlint `v1.83.0`, **oxlint-tsgolint `v7.0.2001`**, tsdown `v0.23.0` |

## Method note (what worked, what did not)

* `curl` reaches `registry.npmjs.org`, `github.com`, `api.github.com`, `raw.githubusercontent.com`,
  `devblogs.microsoft.com`, and `tsdown.dev` from this sandbox. `web_fetch` is DNS-blocked.
* `/tmp` does **not** persist between separate bash calls in this sandbox. Every multi-step probe was
  therefore run as one self-contained command inside a single background job. Logs written to a
  file inside a job are lost when the call ends, so each probe streamed to stdout.
* `npm view <pkg> --json` was used for registry facts; `npm pack` + `tar xzf` for on-disk package
  layout. Where a probe produced a diagnostic, the exit code is recorded next to it.
* Two operational traps cost real probe runs and are recorded in §3.6 because they will bite the
  guide too.

---

## 1. TS 7 reality

### 1.1 `npm view typescript dist-tags versions --json` — dist-tags (verbatim)

```json
{
  "dev": "3.9.4",
  "tag-for-publishing-older-releases": "4.1.6",
  "insiders": "4.6.2-insiders.20220225",
  "beta": "6.0.0-beta",
  "rc": "7.0.1-rc",
  "latest": "7.0.2",
  "next": "7.1.0-dev.20260923.1"
}
```

### 1.2 Newest 7.x published version

| Question | Answer |
|---|---|
| Newest stable 7.x | **`7.0.2`** — and it is the *only* stable 7.x; `7.0.0` and `7.0.1` were never released as GA (`npm view typescript@7.0.0 version` → `E404 No match found for version 7.0.0`) |
| Newest version string overall | `7.1.0-dev.20260923.1` (the `next` tag) — one of **71** published `7.1.0-dev.*` nightlies, first `7.1.0-dev.20260708.3` |
| `7.0.2` publish date | `2026-07-08T15:55:18.431Z` |
| `7.0.1-rc` publish date | `2026-06-18T13:43:46.028Z` |
| `6.0.3` publish date | `2026-04-16T23:38:27.905Z` (the version the scaffolder currently resolves) |

Filtered from the full `versions` array:

```
7.x stable versions: ['7.0.2']
7.1.0-dev count: 71 newest: 7.1.0-dev.20260923.1
absolute newest version string: 7.1.0-dev.20260923.1
```

### 1.3 Is v7 the native (Go) port? — **Yes**

Verbatim from the official announcement
<https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/> (dated July 8th, 2026, by
Daniel Rosenwasser):

> Today we are proud to announce the availability of TypeScript 7, a 10x faster native port of
> TypeScript!
>
> […] The mission was a native port of TypeScript built in Go that could make the most of modern
> hardware. This port was done as faithfully as possible, writing new code while maintaining the
> structure and logic of the original codebase to keep results consistent and compatible between
> the two compilers.
>
> Just as with any other release, TypeScript 7 is available via npm: `npm install -D typescript`.
> That will get you the new `tsc` executable in your workspace (which you can run via `npx tsc`).

The on-disk package corroborates the native port. From a throwaway `npm i typescript@7.0.2` probe:

```
"bin":  { "tsc": "./bin/tsc" }
"type": "module"
"exports": { "./package.json": "./package.json", ".": "./lib/version.cjs",
             "./unstable/ast": "./dist/ast/index.js", … }
node_modules/@typescript/ → typescript-linux-x64        # per-platform native binary
node_modules/typescript/lib/ →
  getExePath.d.ts  getExePath.js  tsc.js  version.cjs  version.d.cts
node_modules/typescript/bin/tsc (Node script, 44 bytes):
  #!/usr/bin/env node
  import "../lib/tsc.js";
du -sh node_modules/typescript → 3.6M
```

`typescript@7.0.2` also declares 20 `@typescript/typescript-<platform>` optional dependencies
(`7.0.2` each) and `engines.node >= 16.20.0`.

### 1.4 Relationship to `@typescript/native-preview` and `tsgo`

These are three different things and the difference matters:

| Name | What it actually is | Registry evidence |
|---|---|---|
| `typescript@7.0.2` | The shipped TS 7 compiler. `latest`. Provides the `tsc` binary, runs the Go compiler. | `latest: 7.0.2` |
| `@typescript/native-preview` | The **preview/nightly channel that TS 7 was developed in**, now superseded. It is a package that provides the **`tsgo` binary**. | `latest = 7.0.0-dev.20260707.2`, published `2026-07-07T08:20:24.489Z` — **frozen the day before TS 7 GA**; 401 versions, none newer. `bin = { "tsgo": "bin/tsgo" }`. Description: "Preview CLI and JS API for the native TypeScript compiler port" |
| `tsgo` | **Not a package.** `npm view tsgo` → `E404 Not Found`. It is the *binary name* that `@typescript/native-preview` installs, and the nickname for the Go compiler. | E404 |

Verbatim from the announcement:

> **Nightly Builds and `@typescript/native-preview`**
>
> Until now, most developers have installed TypeScript 7 via the `@typescript/native-preview`
> package. This package shipped nightly builds of the new codebase, and has served the community
> well with over 8.5 million weekly downloads!
>
> However, going forward, nightly builds will soon resume under the standard `typescript` package
> with the `next` tag.

That is exactly what the registry shows: `typescript` has a `next` tag at `7.1.0-dev.*`, while
`@typescript/native-preview` has not published since 2026-07-07.

### 1.5 The exact package + version to depend on for "latest TS 7"

```jsonc
"typescript": "^7.0.2"
```

* Exact pin if reproducibility is wanted: `"typescript": "7.0.2"`.
* **Binary provided: `tsc` only.** `bin = { "tsc": "./bin/tsc" }`. There is **no `tsgo` binary and
  no `tsserver` binary** in `typescript@7`. `tsgo` belongs to `@typescript/native-preview`;
  the editor story moved to a separate LSP server and a dedicated VS Code extension.

### 1.6 TS 7.0 ships no programmatic API — and 7.1's API is a *different* API

This is the load-bearing fact for the whole rule. Verbatim from the announcement:

> **Running Side-by-Side with TypeScript 6.0**
>
> While TypeScript 7.0 is here, it does not ship with an API. We expect TypeScript 7.1 to ship with
> a new (and different) API, but until then we have made it a priority to ensure TypeScript can be
> run side-by-side with TypeScript 6.0 for utilities that still need some programmatic access to the
> compiler (such as `typescript-eslint`).

Confirmed empirically — `require('typescript')` on `typescript@7.0.2` returns **only a version stub**:

```
### require('typescript') — classic API present? ###
require OK, typeof= object ownKeys= [ 'version', 'versionMajorMinor' ]
### createProgram / version API probe ###
ts.version = 7.0.2 createProgram = undefined
```

`exports["."]` maps to `./lib/version.cjs`, and `lib/` contains no `typescript.js` and no
`tsserver.js`. `require.resolve('typescript')` → `.../typescript/lib/version.cjs`.

The official plan for 7.1 is
[microsoft/TypeScript#63703 "TypeScript 7.1 Iteration Plan"](https://github.com/microsoft/TypeScript/issues/63703)
(state: **open**, opened 2026-07-31). Verbatim schedule and API line:

```
Date       | Milestone
:----------|-----------
2026-10-02 | Beta Prep
2026-10-06 | 7.1 Beta Release
2026-11-06 | RC Prep
2026-11-10 | 7.1 RC Release
2026-11-20 | Stable Prep
2026-11-24 | 7.1 Stable Release

## Language and Compiler

* Stabilize API
    * [Content Mapper API](https://github.com/microsoft/typescript-go/pull/4712)
    * [Emit API](https://github.com/microsoft/typescript-go/pull/4699)
    * Language Service API
```

**Read that carefully against the rule.** The rule's parenthetical says the TS 6 API is "not
implemented in v7 yet, planned for v7.1". The primary sources say 7.1 is planned to ship *a new and
different* API — the Content Mapper / Emit / Language Service APIs of the Go codebase — and to
"stabilize" it. Nothing in the announcement or the iteration plan says the classic TS 6
`createProgram` / `TypeChecker` / `getTypeChecker()` surface returns in 7.1. So:

* "TS 6 API not implemented in v7" — **VERIFIED**.
* "planned for v7.1" — **NOT SUPPORTED** as stated. 7.1 ships an API, not *this* API.

---

## 2. TNB: does `typescript-native-bridge` exist?

**Yes. It exists, it is real, published, and maintained.** It is not a hallucinated package name.

### 2.1 Registry facts (verbatim)

```
npm view typescript-native-bridge --json
  "name": "typescript-native-bridge",
  "dist-tags": { "latest": "6.0.3-bridge.17.tsgo.7.0.2" },
  "versions": [ "0.0.0",
    "6.0.3-bridge.0.tsgo.7.0.2", … "6.0.3-bridge.17.tsgo.7.0.2" ],   // 18 total
  "license": "Apache-2.0",
  "homepage": "https://github.com/johnsoncodehk/typescript-native-bridge#readme",
  "repository": { "type": "git", "url": "git+https://github.com/johnsoncodehk/typescript-native-bridge.git" },
  "maintainers": [ "johnsoncodehk <johnsoncodehk@gmail.com>" ],
  "engines": { "node": ">=20.19" },
  "main": "./lib/typescript.js",
  "types": "./lib/typescript.d.ts",
  "bin": { "tsc": "bin/tsc", "tsserver": "bin/tsserver" },
  "dependencies": {},
  "optionalDependencies": {
    "@typescript-native-bridge/darwin-arm64": "6.0.3-bridge.17.tsgo.7.0.2",
    "@typescript-native-bridge/darwin-x64":   "6.0.3-bridge.17.tsgo.7.0.2",
    "@typescript-native-bridge/linux-x64":    "6.0.3-bridge.17.tsgo.7.0.2",
    "@typescript-native-bridge/linux-arm64":  "6.0.3-bridge.17.tsgo.7.0.2",
    "@typescript-native-bridge/linux-arm":    "6.0.3-bridge.17.tsgo.7.0.2",
    "@typescript-native-bridge/win32-x64":    "6.0.3-bridge.17.tsgo.7.0.2",
    "@typescript-native-bridge/win32-arm64":  "6.0.3-bridge.17.tsgo.7.0.2"
  }
```

* **Latest version: `6.0.3-bridge.17.tsgo.7.0.2`**, published `2026-09-13T08:02:25.982Z`.
* Release history: `0.0.0` placeholder 2026-07-01, first real version `6.0.3-bridge.0.tsgo.7.0.2`
  2026-07-18, then 17 more bridge revisions through 2026-09-13.
* Platform sub-packages are published, e.g.
  `@typescript-native-bridge/linux-x64@6.0.3-bridge.17.tsgo.7.0.2` — description verbatim:
  "tsgo bridge binary for linux x64 (typescript-native-bridge)".
* Provenance: the npm publish carries a Sigstore/SLSA v1 attestation and was made by
  `GitHub Actions <npm-oidc-no-reply@github.com>`; `_nodeVersion` `24.20.0`.

**Description, verbatim:**

> Build host for a tsgo-backed TypeScript fork: pins upstream `microsoft/TypeScript` and
> `microsoft/typescript-go` as submodules and materializes a small patch set on top — a tsgoChecker
> overlay on TypeScript plus a cgo bridge (bridge.dylib) on typescript-g[o]

**Repository:** <https://github.com/johnsoncodehk/typescript-native-bridge> — created
`2026-06-27T05:30:06Z`, last pushed `2026-09-13T07:58:14Z`, `archived: false`, `fork: false`,
Apache-2.0, 297 stars. Repository description verbatim:

> A typescript-shaped drop-in backed by typescript-go (tsgo) over an in-process cgo NAPI/FFI bridge
> — no IPC.

The maintainer is **johnsoncodehk** — the author of Volar / `vue-tsc`.

### 2.2 Package layout (from the published tarball)

```
typescript-native-bridge-6.0.3-bridge.17.tsgo.7.0.2.tgz  (5,059,195 bytes)
package/lib/typescript.js    9,759,509 bytes   ← the classic TS API bundle, patched
package/lib/tsc.js           included
package/lib/tsserver.js      included
package/lib/lib.dom.d.ts …   134 files, full classic TypeScript layout
package/bin/tsc              #!/usr/bin/env node
                             require("../lib/tnb-godebug.js");
                             require("../lib/tsc.js");
package/bin/tsserver
```

The literal banner string `TNB ACTIVE` is present in `package/lib/typescript.js` and
`package/lib/_tsc.js`.

### 2.3 The problem it solves (README, verbatim)

> **A drop-in `typescript` replacement that type-checks on Go.** Swap the `typescript` package for
> this fork and keep using `tsc`, `vue-tsc`, `svelte-check`, `astro-check`, `glint`, ESLint, and
> your editor exactly as before — the checker runs on **tsgo** (Microsoft's Go TypeScript compiler)
> in-process instead of JavaScript. No new CLI, no new LSP, no per-tool config, no code changes.
>
> ## Why not just use TypeScript 7 (tsgo)?
>
> `typescript@7` is Microsoft's Go-native rewrite — but it doesn't drop into the tools you actually
> use:
>
> - **`vue-tsc` / `astro-check` / `svelte-check` / `glint`** are built on the **classic**
>   `typescript` programmatic API (`createProgram`, Volar hooks, custom hosts). v7's programmatic
>   surface is the new tsgo API — not a drop-in replacement for the classic one, so those tools
>   can't just move to it.
> - **ESLint (typescript-eslint)** imports the classic `typescript` API and calls
>   `getTypeChecker()` — same API mismatch.
> - **Editors** run `tsserver` + Language Service Plugins (`@vue/typescript-plugin` for `.vue`) —
>   tsgo's LSP doesn't support that plugin model.
>
> TNB keeps the **classic package surface** and puts the v7 engine (tsgo 7.x) behind it in-process
> — so one `typescript` override accelerates all of them at once.

Honest framing from the README FAQ, verbatim:

> **Is this the same as TypeScript 7 / tsgo?** Same engine, different package. TNB pins tsgo 7.x as
> its checker (the version string ends in `tsgo.7.0.2`), but keeps the classic `typescript` API and
> `tsserver` in front of it.

### 2.4 Exact usage (README, verbatim)

**pnpm (monorepos) — `pnpm-workspace.yaml`:**

```yaml
overrides:
  typescript: npm:typescript-native-bridge@<version>
```

> If packages depend on `typescript` via `catalog:`, update the **catalog entry too**, or those
> packages still resolve stock TypeScript:

```yaml
catalog:
  typescript: npm:typescript-native-bridge@<version>
overrides:
  typescript: npm:typescript-native-bridge@<version>
```

**npm — `package.json`:**

```jsonc
{
  "devDependencies": {
    "typescript": "npm:typescript-native-bridge@<version>"
  },
  "overrides": {
    "typescript": "$typescript"
  }
}
```

> Use the alias **and** the `$typescript` override reference as shown — putting
> `npm:typescript-native-bridge@…` directly inside `overrides` is rejected or mis-resolved by some
> npm versions (issue #8). `<version>` is an exact version (e.g. `6.0.3-bridge.6.tsgo.7.0.2` — pin
> exactly; caret ranges don't match prerelease versions) or the `latest` dist-tag.

**yarn:**

```jsonc
{ "resolutions": { "typescript": "npm:typescript-native-bridge@<version>" } }
```

**Local path:** `overrides: { typescript: link:../typescript-native-bridge }` (checkout must be built
first — requires Go; `npm run setup`).

**Confirming it is active, verbatim:**

> On the **first** type-check in a process, TNB prints one dimmed line to **stderr**:
>
> ```
> ▎ TNB ACTIVE — `typescript` is the tsgo-backed fork
> ```
>
> **No banner = stock `typescript` is still loaded.**

```bash
node -e "console.log(require.resolve('typescript'))"
# should point at typescript-native-bridge, not node_modules/typescript@6.x
```

**Platform support, verbatim highlights:** per-platform optional deps; "Linux packages target glibc
2.35"; **"Alpine/musl is not supported"** (Go `-buildmode=c-shared` crashes at load on musl; tsgo's
own CLI works on Alpine only because it ships CGO-free static binaries, which a NAPI bridge cannot).
Workaround given: run the typecheck/lint step in a glibc image (`node:24` / `node:24-bookworm-slim`).

**Editor setup** requires opting in — verbatim:

```jsonc
{
  "js/ts.tsdk.path": "node_modules/typescript/lib",
  "js/ts.tsdk.promptToUseWorkspaceVersion": true
}
```

plus Command Palette → **TypeScript: Select TypeScript Version** → **Use Workspace Version**.

### 2.5 The closest REAL alternative — Microsoft's own `@typescript/typescript6`

TNB is not the only bridge, and the official one is worth knowing because **the Vue team itself uses
it**. Verbatim from the announcement:

> As part of the 6.0/7.0 transition process, we've published a new compatibility package,
> `@typescript/typescript6`. This package provides an executable named `tsc6`, so that if needed,
> you can install TypeScript 7.0 (which ships its own `tsc` binary) side-by-side without naming
> conflicts. The new package also re-exports the TypeScript 6.0 API, so that you can use `tsc` for
> TypeScript 7, while other tooling can continue to rely on 6.0.
>
> Because some tools like `typescript-eslint` expect to import from `typescript` directly via peer
> dependencies, we recommend achieving this via npm aliases. You should be able to run the following
> command
>
> ```
> npm install -D typescript@npm:@typescript/typescript6
> ```
>
> or modify your package.json as follows:
>
> ```json
> { "devDependencies": { "typescript": "npm:@typescript/typescript6@^6.0.2" } }
> ```
>
> Note that doing this will leave you only with a `tsc6` executable. To get 7.0's `tsc`, you can add
> another alias for TypeScript 7 and `npx tsc` will just work with 7.0:
>
> ```json
> {
>   "devDependencies": {
>     "@typescript/native": "npm:typescript@^7.0.2",
>     "typescript": "npm:@typescript/typescript6@^6.0.2"
>   }
> }
> ```

Note: `@typescript/native` and `@typescript/old` are **npm alias keys in a `package.json`, not
published packages** — both `npm view @typescript/native` and `npm view @typescript/old` return
`E404`. Only `@typescript/typescript6` is a published package.

`@typescript/typescript6` registry facts: `latest = 6.0.2` (published 2026-07-06T18:06:47.459Z);
versions `6.0.0`, `6.0.1`, `6.0.2`; maintainers include `typescript-bot`, `jakebailey`,
`andrewbranch`; `main: ./lib/typescript.js`; `bin: { "tsc6": "bin/tsc6" }`;
`dependencies: { "@typescript/old": "npm:typescript@^6" }`. Its README, in full:

> # `@typescript/typescript6`
>
> This package provides a `tsc6` command that runs TypeScript 6's `tsc`.
>
> It also reexports the TypeScript 6 API, so you can import it in your code:
>
> ```ts
> import ts6 from "@typescript/typescript6";
> ```

**Which the Vue toolchain actually adopted** — [vuejs/language-tools PR #6123](https://github.com/vuejs/language-tools/pull/6123),
"chore: upgrade to TypeScript 7 & compat with `@typescript/typescript6`", created 2026-07-11,
**merged 2026-07-12**. Body verbatim extracts:

> Moves the repo's build toolchain from the `@typescript/native-preview` nightly (`tsgo`) to the
> released **TypeScript 7.0.2**, following the dual-install scheme from the [official 7.0
> announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/):
>
> - `@typescript/native` → `npm:typescript@^7.0.2` — provides the Go-native `tsc` used by
>   `build`/`watch` (`tsgo -b` → `tsc -b`)
> - `typescript` → `npm:@typescript/typescript6@^6.0.2` — the maintained JS API line consumed by
>   lint, tests, and the published packages (which must stay on the 6 API until TS 7.1 ships a
>   programmatic API)
>
> ## Fixes surfaced by the new layout
>
> - **`vue-tsc` was silently broken for users on the official TS 7 migration aliasing**:
>   `@typescript/typescript6`'s `lib/tsc.js` is a one-line re-export of its `@typescript/old`
>   dependency, so `runTsc` had no real compiler source to patch. `run()` now detects the shim and
>   resolves the real `tsc.js` behind it.
>
> ## Not changed
>
> - Published packages keep their `typescript` peer dependency on the 6 API (TS 7.0 exposes no
>   programmatic API; planned for 7.1).

`vue-tsc@3.3.11` was published 2026-08-21, i.e. **after** that fix landed (`vue-tsc@3.3.8`,
2026-07-22, is the first release after the merge). §4.1 verifies the fix empirically.

### 2.6 Third-party corroboration (NOT a primary source)

`ts7-compat-guard@3.3.0` (repo `Booyaka101/ts7-compat-guard`) ships a dated readiness ledger
(`src/db.json`, `generatedAt: 2026-07-29`) listing 25 packages it says embed the removed programmatic
API, all marked `ts7Status: "none"`: `@vue/language-tools`, `volar`, `@volar/typescript`,
`@astrojs/language-server`, `svelte-language-server`, `@angular/compiler-cli`, `ts-node`, `ts-morph`,
`@mdx-js/mdx`, `typescript-eslint`, `@typescript-eslint/typescript-estree`, `vue-tsc`,
`svelte-check`, `@astrojs/check`, `@typescript-eslint/parser`, `ts-loader`,
`fork-ts-checker-webpack-plugin`, `rollup-plugin-typescript2`, `@rollup/plugin-typescript`, `ts-jest`,
`@microsoft/api-extractor`, `typedoc`, `dts-bundle-generator`, `tsd`, `tsup`.

Its README also asserts TS 7 makes `baseUrl`, `target: es5`, legacy `module`/`moduleResolution`,
`esModuleInterop: false` hard errors and turns `strict` on by default. **This is a third-party tool,
not a primary source, and I did not verify those tsconfig claims.** Its ledger predates
`vue-tsc@3.3.8`+, so its `vue-tsc` entry is stale. Its tsup entry quotes a concrete crash —
`"Cannot read properties of undefined (reading useCaseSensitiveFileNames)"` — which I did not
reproduce.

---

## 3. Compatibility on this composition (`vp create vite:application` + TS 7)

### 3.1 Probe design

One self-contained background job, run in `/tmp/pA`:

1. `vp create vite:application --directory app --no-interactive --no-git --no-hooks --no-agent --no-editor -- --template vanilla-ts`
2. Rewrite `devDependencies.typescript` from the scaffold's `~6.0.2` to `^7.0.2` **by editing JSON
   directly** (see §3.6 — `npm pkg set` cannot be used here).
3. `pnpm install --no-frozen-lockfile` (see §3.6)
4. Run `vp check`, `tsc`, `pnpm run build`, `vp test`, first clean, then with a deliberate type error.

### 3.2 Which `vp` ran, and the scaffold's shape

```
##### LOCAL VP VERSION #####
/tmp/pA/app
vp v0.3.3

Local vite-plus:
  vite-plus        v0.3.3

Tools:
  vite             v8.3.0
  rolldown         v1.2.9
  vitest           v4.1.11
  oxfmt            v0.68.0
  oxlint           v1.83.0
  oxlint-tsgolint  v7.0.2001
  tsdown           v0.23.0
```

Every command below was invoked as `./node_modules/.bin/vp`, i.e. the **project-local** binary
(`vp v0.3.3`, `vite-plus v0.3.3`), not the global one. The scaffold's own `package.json`:

```json
{
  "name": "app", "version": "0.0.0", "private": true, "type": "module",
  "scripts": { "dev": "vp dev", "build": "tsc && vp build", "preview": "vp preview" },
  "devDependencies": { "typescript": "~6.0.2", "vite": "catalog:", "vite-plus": "catalog:" },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" } }
}
```

`pnpm-workspace.yaml` (which pins the toolchain catalog):

```yaml
catalog:
  vite: npm:@voidzero-dev/vite-plus-core@0.3.3
  vite-plus: 0.3.3
overrides:
  vite@*: "catalog:"
peerDependencyRules:
  allowAny: [vite]
  allowedVersions: { vite: "*" }
```

`vite.config.ts` — **real type checking is already ON by default** (the scaffold writes it):

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
```

Note the build script is **`tsc && vp build`** for `vanilla-ts`. The `vue-ts` template's is
**`vue-tsc -b && vp build`** (§4.1) — the difference is decisive for the Vue case.

### 3.3 Resolved versions after the bump

```
##### TS BEFORE #####
version: 6.0.3
##### BUMP typescript -> ^7.0.2 #####
manifest now: ^7.0.2

devDependencies:
- typescript 6.0.3
+ typescript 7.0.2

Done in 15.1s using pnpm v12.5.1
PNPM_INSTALL_EXIT=0
##### RESOLVED AFTER #####
ts version: 7.0.2
ts resolved: /tmp/pA/app/node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/version.cjs
--- pnpm list typescript ---
app@0.0.0 /tmp/pA/app (PRIVATE)
│
│   devDependencies:
└── typescript@7.0.2

1 package
--- tsc --version (which tsc ran) ---
-rwxr-xr-x  2523  node_modules/.bin/tsc
/tmp/pA/app/node_modules/.bin/tsc
Version 7.0.2
TSC_VERSION_EXIT=0
```

**Which `tsc` ran:** the project-local shim `node_modules/.bin/tsc`, which resolves into
`node_modules/.pnpm/typescript@7.0.2/…` — i.e. **TS 7's native `tsc`**, reporting `Version 7.0.2`.

### 3.4 Does `vp check` still type-check? — **Yes** (exit 1 on a real error)

```
##### vp check CLEAN #####
pass: All 8 files are correctly formatted (557ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 3 files (642ms, 24 threads)
T7_CLEAN_CHECK_EXIT=0
--- isolated: vp check --no-fmt --no-lint ---
pass: Found no type errors in 3 files (652ms, 24 threads)
T7_ISOLATED_CLEAN_EXIT=0
```

Deliberate error written to `src/__probe.ts`:

```ts
export const probe: number = "definitely-not-a-number";
```

```
--- vp check (full) ---
pass: All 9 files are correctly formatted (552ms, 24 threads)
error: Lint or type issues found
× typescript(TS2322): Type 'string' is not assignable to type 'number'.
   ╭─[src/__probe.ts:1:14]
 1 │ export const probe: number = "definitely-not-a-number";
   ·              ─────
   ╰────

Found 1 error and 0 warnings in 4 files (689ms, 24 threads)
T7_CHECK_ERR_EXIT=1
--- vp check --no-fmt --no-lint ---
error: Type errors found
× typescript(TS2322): Type 'string' is not assignable to type 'number'.
   ╭─[src/__probe.ts:1:14]
   ╰────

Found 1 error and 0 warnings in 4 files (622ms, 24 threads)
T7_ISOLATED_ERR_EXIT=1
```

**Exit 1, with the real diagnostic.** Type checking is intact on TS 7.

### 3.5 Does `tsc && vp build` still work? — **Yes**

With the error present (the `&&` short-circuits, so `vp build` never runs):

```
--- tsc --noEmit ---
src/__probe.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
TSC_ERR_EXIT=1
--- pnpm run build (tsc && vp build) ---
$ tsc && vp build
src/__probe.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
[ELIFECYCLE] Command failed with exit code 1.
BUILD_ERR_EXIT=1
```

With the probe removed:

```
$ tsc && vp build
transforming...
✓ 9 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.45 kB │ gzip: 0.29 kB
dist/assets/vite-BF8QNONU.svg    8.70 kB │ gzip: 1.60 kB
dist/assets/hero-CLDdwZDr.png   13.05 kB
dist/assets/index-CsUDhMuy.css   4.10 kB │ gzip: 1.46 kB
dist/assets/index-wktXvZw9.js    4.49 kB │ gzip: 2.02 kB

✓ built in 82ms
CLEAN_BUILD_EXIT=0
```

`dist/` was produced. **Full green on TS 7.0.2.**

### 3.6 Does `vp test` still run? — **Yes** (vitest 4.1.11 executes)

```
##### vp test #####
 RUN  v4.1.11 /tmp/pA/app
No test files found, exiting with code 1
include: **/*.{test,spec}.?(c|m)[jt]s?(x)
exclude:  **/node_modules/**, **/.git/**
VP_TEST_EXIT=1
```

The runner starts and reports its include/exclude globs — it is not TS-7-blocked. Exit 1 is only
"no test files found" (the `vanilla-ts` scaffold ships none). **UNVERIFIED:** `vp test` executing an
actual test file under TS 7 (no test file was written).

### 3.7 Warnings, prompts, silent degradation

**None.** On the `vanilla-ts` scaffold the bump from `typescript ~6.0.2` to `^7.0.2` produced:

* no peer-dependency warning from pnpm,
* no prompt (the `--no-interactive` scaffold plus a plain manifest edit),
* no tsconfig change required — notably **`strict` is absent from the scaffold's `tsconfig.json`,
  yet TS 7 did not flag the scaffolded `src/`** despite TS 7's stricter defaults,
* no silent degradation: the deliberate error was still caught by both `vp check` and `tsc`.

Two **operational traps** were hit, and they are about the toolchain, not about TS 7:

1. **`npm pkg set` does not work in this scaffold.** It fails before writing:
   ```
   npm error code EBADDEVENGINES
   npm error EBADDEVENGINES Invalid name "pnpm" does not match "npm" for "packageManager"
   npm error EBADDEVENGINES { current: { name: 'npm', version: '11.19.0' },
   npm error EBADDEVENGINES   required: { name: 'pnpm', version: '12.5.1', onFail: 'download' } }
   ```
   The scaffold's `devEngines.packageManager` rejects npm. My first probe run was **silently
   invalidated** by this: the manifest kept `~6.0.2` and `pnpm install` reported "Already up to
   date", leaving the project on 6.0.3 while I believed it was on 7. **The guide must edit
   `package.json` as JSON (node/`jq`), not via `npm pkg set`.**

2. **`CI=1` makes pnpm refuse to update the lockfile.** Every plain `pnpm install` after a manifest
   edit fails:
   ```
   Error: ERR_PNPM_OUTDATED_LOCKFILE
     × installing dependencies
     ╰─▶ Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with package.json.
         specifiers in the lockfile don't match specifiers in package.json:
       * in importers["."]:
       * 1 dependency is mismatched:
         - typescript (lockfile: ~6.0.2, manifest: ^7.0.2)
   ```
   This also breaks `pnpm run build`, because Vite+'s script runner goes through pnpm and re-checks
   the lockfile. Use `pnpm install --no-frozen-lockfile`, or regenerate with
   `pnpm install --lockfile-only` first.

Neither trap is TS 7–specific, but both will silently produce a "TS 7 verified" claim that is false
if the guide hits them.

---

## 4. What still needs the TS 6 API

### 4.1 Vue case — **VERIFIED, with the exact failure text** (the headline result)

Scaffolded `vp create vite:application --template vue-ts`. Its `package.json` as generated:

```json
{
  "name": "vueapp", "version": "0.0.0", "private": true, "type": "module",
  "scripts": { "dev": "vp dev", "build": "vue-tsc -b && vp build", "preview": "vp preview" },
  "dependencies": { "vue": "^3.5.42" },
  "devDependencies": {
    "@types/node": "^24.13.3", "@vitejs/plugin-vue": "^6.0.8", "@vue/tsconfig": "^0.9.1",
    "typescript": "~6.0.2", "vite": "catalog:", "vite-plus": "catalog:", "vue-tsc": "^3.3.11"
  },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" } }
}
```

Its `tsconfig.json` is solution-style:

```json
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

**Baseline on TS 6.0.3:** `vue-tsc --noEmit -p tsconfig.json` → exit **0**.

**After `typescript` → `^7.0.2` (resolved 7.0.2, `tsc --version` → `Version 7.0.2`):**

```
##### vue-tsc ON TS7 (expect break) #####
/tmp/pB/vueapp/node_modules/.pnpm/vue-tsc@3.3.11_typescript@7.0.2/node_modules/vue-tsc/index.js:68
                throw err;
                ^

Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined by "exports" in /tmp/pB/vueapp/node_modules/.pnpm/vue-tsc@3.3.11_typescript@7.0.2/node_modules/typescript/package.json
    at exportsNotFound (node:internal/modules/esm/resolve:315:10)
    at packageExportsResolve (node:internal/modules/esm/resolve:663:7)
    at resolveExports (node:internal/modules/cjs/loader:754:36)
    at Module._findPath (node:internal/modules/cjs/loader:821:31)
    at Module._resolveFilename (node:internal/modules/cjs/loader:1557:27)
    at wrapResolveFilename (node:internal/modules/cjs/helpers:1169:24)
    at Module._resolveFilename (node:internal/modules/cjs/helpers:1557:27)
    at require.resolve (node:internal/modules/helpers:175:31)
    at resolveTscPath (/tmp/pB/vueapp/node_modules/.pnpm/vue-tsc@3.3.11_typescript@7.0.2/node_modules/vue-tsc/index.js:73:43)
    at main (/tmp/pB/vueapp/node_modules/.pnpm/vue-tsc@3.3.11_typescript@7.0.2/node_modules/vue-tsc/index.js:44:45) {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
}

Node.js v24.21.0
VUE_TSC_ON_T7_EXIT=1
```

`vue-tsc --version` fails identically (exit 1). Consequence for the scaffold's own build script:

```
##### pnpm run build ON TS7 VUE #####
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined by "exports" in …/typescript/package.json
    at resolveTscPath (…/vue-tsc/index.js:73:43)
    at main (…/vue-tsc/index.js:44:45)
[ELIFECYCLE] Command failed with exit code 1.
VUE_BUILD_T7_EXIT=1
```

**But `vp check` is unaffected** — on the same TS 7 Vue project:

```
##### vp check ON TS7 VUE #####
pass: All 14 files are correctly formatted (738ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 5 files (765ms, 24 threads)
VP_CHECK_VUE_T7_EXIT=0
```

This is the single most important structural insight of this research, and Vite+'s own shipped docs
explain why (`package/docs/guide/lint.md`, verbatim):

> This path is powered by [tsgolint](https://github.com/oxc-project/tsgolint) on top of the
> **TypeScript 7 (aka TypeScript Go) toolchain**. It gives Oxlint access to type information and
> allows type checking directly via `vp lint` and `vp check`.

and `package/docs/guide/check.md`, verbatim:

> When `typeCheck` is enabled in the `lint.options` block in `vite.config.ts`, `vp check` also runs
> TypeScript type checks through the Oxlint type-aware path powered by the TypeScript Go toolchain
> and tsgolint. `vp create` and `vp migrate` enable both `typeAware` and `typeCheck` by default.

**`vp check`'s type checking does not consume the npm `typescript` package's API at all.** It runs
the TS Go engine through `oxlint-tsgolint` (`vite-plus` pins `oxlint-tsgolint = 7.0.2001` in 0.3.3
and `= 7.0.2002` in 1.0.0-rc.0). So `vp check` already satisfies "TypeScript must be v7 or newer"
on its own; the npm `typescript` version only governs `tsc`, `vue-tsc`, and other API consumers.

**Does the real bridge fix the Vue case? — Yes.** Switching to TNB (added to the scaffold's existing
`pnpm-workspace.yaml` `overrides:` key **and** the `package.json` devDependency, per the TNB README's
pnpm guidance):

```yaml
overrides:
  typescript: npm:typescript-native-bridge@6.0.3-bridge.17.tsgo.7.0.2
  vite@*: "catalog:"
```

```
devDependencies:
- typescript 7.0.2
+ typescript <- typescript-native-bridge 6.0.3-bridge.17.tsgo.7.0.2

Done in 8.3s using pnpm v12.5.1
[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.
TNB_INSTALL_EXIT=0
```

```
##### RESOLUTION AFTER TNB #####
resolved: /tmp/pB/vueapp/node_modules/.pnpm/typescript-native-bridge@6.0.3-bridge.17.tsgo.7.0.2/node_modules/typescript-native-bridge/lib/typescript.js
version: 6.0.3-bridge.17.tsgo.7.0.2
createProgram: function
Version 6.0.3
TNB_TSC_VERSION_EXIT=0
##### vue-tsc ON TNB #####
▎ TNB ACTIVE — `typescript` is the tsgo-backed fork
TNB_VUE_TSC_EXIT=0
##### vp check ON TNB #####
pass: All 14 files are correctly formatted (678ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 5 files (765ms, 24 threads)
TNB_VP_CHECK_EXIT=0
```

The banner appeared and `vue-tsc` exited **0**. To prove the bridge does not merely *not crash* but
still **catches errors**, an isolated `vue-tsc + TNB` fixture was built (§5.3) with a deliberate type
error inside a `.vue` SFC:

```
--- vue-tsc --noEmit ---
▎ TNB ACTIVE — `typescript` is the tsgo-backed fork
src/App.vue(4,7): error TS2322: Type 'string' is not assignable to type 'number'.
D2_VUE_TSC_EXIT=2
```

Error caught, in the `.vue` file, with the correct span. Nitro was also added to this project
(`pnpm add -D nitro` → `nitro 3.0.260903-beta`, exit 0) and **`vp check` still passed afterwards**.

### 4.2 The rest of the Vue/Vite toolchain

| Piece | Needs the TS 6 API? | Evidence | Confidence |
|---|---|---|---|
| `vue-tsc@3.3.11` | **Yes** | §4.1 exact `ERR_PACKAGE_PATH_NOT_EXPORTED`; peer is `typescript >=5.0.0` (a range that *admits* 7.0.2 by semver, so the peer range does **not** protect you — the break is at runtime) | **VERIFIED** |
| `@vitejs/plugin-vue@6.0.9` | **No** | `peerDependencies` = `{ vue: ^3.2.25, vite: ^5 ‖ ^6 ‖ ^7 ‖ ^8 }` — it never imports `typescript` | VERIFIED by peer inspection; no TS-7 build of a Vue app was completed (`vue-tsc -b` fails first), so `vp build` alone on Vue+TS7 is **UNVERIFIED** |
| `typescript-eslint@8.70.1` / `@typescript-eslint/parser@8.70.1` | **Yes** | `peerDependencies.typescript = ">=4.8.4 <6.1.0"` — TS 7 is **excluded by the peer range** (`semver.satisfies('7.0.2', '>=4.8.4 <6.1.0')` → `false`). The third-party ledger adds that v8.65.0 "added a warning when TS 7 is detected" | VERIFIED for the peer range; **UNVERIFIED** empirically |
| `vite-plugin-dts@5.1.1` | **Yes, transitively** | It is a thin wrapper: `dependencies = { "unplugin-dts": "1.1.1" }`. `unplugin-dts@1.1.1` depends on `@volar/typescript: ^2.4.26` and peers on `typescript >=4` — both classic-API surfaces | VERIFIED by dependency inspection; **UNVERIFIED** empirically |
| `@microsoft/api-extractor` (peer of `unplugin-dts`) | **Yes** | In the third-party ledger; TS-API based | UNVERIFIED |
| **`vp pack` dts generator** | **Depends on the generator** | See §4.3 | VERIFIED by first-party docs |
| **Nitro v3** | **No** | See §4.4 | VERIFIED by package inspection |
| Editor / `tsserver` | **Yes** (classic plugin model) | TS 7 replaced `tsserver` with an LSP server and a dedicated VS Code extension (announcement: "Your favorite code editor should easily support TypeScript 7 with its new support for the language server protocol (LSP)"; "VS Code has a dedicated extension for TypeScript 7"). TNB's README states tsgo's LSP "doesn't support that plugin model" (`@vue/typescript-plugin` for `.vue`) and that TNB restores `tsserver` | VERIFIED as documented; **UNVERIFIED** in an actual editor (none in this sandbox) |

### 4.3 `vp pack`'s dts path — a genuine TS-6-API fork in the road

`vp pack` is tsdown, and its declaration generation goes through `rolldown-plugin-dts`. Vite+'s own
shipped docs (`package/docs/guide/migrate-rules.md`) confirm the option surface:

> | `dts.tsgo` / `dts.oxc` | Select with `dts.generator`; retain generator option objects and remove boolean flags |

The `rolldown-plugin-dts` README (primary, upstream `sxzz/rolldown-plugin-dts`) is explicit:

| Generator | Use it for | Requirement |
|---|---|---|
| `tsc` | **Full TypeScript compatibility, Vue, and Volar languages** | TypeScript 5.x or 6.x |
| `oxc` | Fast generation for isolated declarations | Code compatible with `isolatedDeclarations` |
| `tsgo` | Experimental TypeScript 7 builds | **TypeScript 7 or `@typescript/native-preview`** |

> When `generator` is omitted, the plugin selects:
>
> 1. `oxc` when `compilerOptions.isolatedDeclarations` is enabled.
> 2. **`tsgo` when TypeScript 7 is installed as `typescript`.**
> 3. `tsc` otherwise.
>
> **Volar-based custom languages always require `tsc`. The `tsgo` generator does not support custom
> languages.**

and install guidance verbatim:

```bash
npm i -D typescript@^6              # tsc
npm i -D @typescript/native-preview # tsgo, unless TypeScript 7 is installed
```

This resolves the `vite:library` pin: `typescript ^7.0.2` + `pack.dts.generator: "tsgo"` is the
**correct** combination for a plain TS library — TS 7 is required by the `tsgo` generator. It is
**not** correct for a library that must emit declarations for `.vue`/Volar sources, because that
needs the `tsc` generator, which requires TS 5.x/6.x, i.e. the bridge case. `dts({ generator: 'tsgo',
tsgo: { path: '/path/to/tsgo' } })` also reads compiler options from `tsconfig.json` and ignores
`tsconfigRaw`/`compilerOptions`.

### 4.4 Nitro v3's own dts path — a non-issue

`nitro@3.0.260903-beta` has **no `typescript` dependency, no `peerDependencies`, and no
`peerDependenciesMeta`**:

```json
{ "dependencies": { "h3": "^2.0.1-rc.31", "db0": "^0.4.1", "nf3": "^0.3.24", "rou3": "^0.9.2",
  "srvx": "^1.0.3", "unenv": "^2.0.0-rc.24", "ocache": "^0.3.0", "consola": "^3.4.2",
  "crossws": "^0.4.12", "hookable": "^6.1.1", "rolldown": "^1.2.7",
  "unstorage": "^2.0.0-alpha.10", "env-runner": "^0.2.1" } }
```

Its shareable tsconfig (`nitro/tsconfig` → `package/lib/tsconfig.json`) contains **no option that
TS 7 removes** — no `baseUrl`, no `target: es5`, no legacy `module`/`moduleResolution`:

```json
{ "compilerOptions": { "target": "ESNext", "lib": ["ESNext", "DOM"], "module": "ESNext",
  "moduleResolution": "Bundler", "moduleDetection": "force", "isolatedModules": true,
  "verbatimModuleSyntax": true, "allowJs": true, "allowImportingTsExtensions": true,
  "strict": true, "noEmit": true, "skipLibCheck": true, "resolveJsonModule": true,
  "allowSyntheticDefaultImports": true, "noImplicitOverride": true,
  "resolvePackageJsonImports": true, "forceConsistentCasingInFileNames": true,
  "noImplicitReturns": true, "noFallthroughCasesInSwitch": true } }
```

Nitro v3 ships its types prebuilt (`"types": "./dist/runtime/nitro.d.mts"`, `nitro/types` →
`./dist/types/index.mjs`), so there is no per-project dts generation path to break. This matches the
established research in [nitro-v3.md](nitro-v3.md): "The TypeScript compiler is only needed for type
checking (for example `tsc --noEmit` in CI)." **Nitro itself is TS-7-clean.**

### 4.5 The TNB version string is a *prerelease* — and that has consequences

TNB's version `6.0.3-bridge.17.tsgo.7.0.2` is a semver **prerelease**. Computed with the semver
bundled in npm 11.19.0 (`semver@7.8.5`):

```
FAIL  vue-tsc peer "typescript >=5.0.0"        | 6.0.3-bridge.17.tsgo.7.0.2 => false
FAIL  typescript-eslint peer ">=4.8.4 <6.1.0"  | 6.0.3-bridge.17.tsgo.7.0.2 => false
FAIL  unplugin-dts peer ">=4"                  | 6.0.3-bridge.17.tsgo.7.0.2 => false
PASS  vue-tsc peer ">=5.0.0"                   | 7.0.2                      => true
FAIL  typescript-eslint peer ">=4.8.4 <6.1.0"  | 7.0.2                      => false
PASS  vue-tsc peer ">=5.0.0"                   | 6.0.2 (@typescript/typescript6) => true
```

This is the cause of the `[WARN] Issues with peer dependencies found` pnpm printed on the TNB
install. **UNVERIFIED:** exactly which peer pnpm flagged (`pnpm peers check` was not run); the table
above is a computed semver explanation, not pnpm's own report. The practical consequence stands
regardless: a CI install with `--strict-peer-dependencies` would **fail** on TNB unless
`peerDependencyRules.allowedVersions` (or an equivalent) admits it. The `vue:application` scaffold
already ships a `peerDependencyRules` block for exactly this kind of pin, so the mitigation has a
natural home.

### 4.6 The `tsgo` engine is 7.0.2, but the `typescript` package version reads 6.0.3

This is the sharpest caveat in the whole document:

* `require('typescript/package.json').version` → `6.0.3-bridge.17.tsgo.7.0.2`
* `require('typescript').version` → `6.0.3`
* `tsc --version` → `Version 6.0.3`

A literal implementation of "TypeScript must be the latest v7 or newer" as a **version assertion on
the `typescript` package** therefore **FAILS** under TNB. The TS 7-ness lives in the checker engine
(tsgo 7.0.2, named by the version suffix), not in the reported version. Any check the guide writes
must assert on something else — the resolved path containing `typescript-native-bridge`, or the
`TNB ACTIVE` banner — and must not assert `semver.gte(tsVersion, '7.0.0')`.

---

## 5. Guidance

### 5.1 (a) Plain TS 7 — no TS-6-API consumer in the project

```jsonc
// package.json
{
  "devDependencies": {
    "typescript": "^7.0.2"          // or "7.0.2" to pin
  }
}
```

No `vite.config.ts` change, no `tsconfig.json` change, no override, no pnpm-workspace change.
Verified end-to-end on `vp create vite:application --template vanilla-ts` + project-local `vp v0.3.3`
(§3): `vp check` type-checks and exits 1 on a real error, `tsc && vp build` exits 0 and emits `dist/`,
`vp test` starts vitest, zero warnings and zero prompts.

Caveat: **do not use `npm pkg set` to write that entry** (§3.7 trap 1 — `EBADDEVENGINES`), and use
`pnpm install --no-frozen-lockfile` (§3.7 trap 2). Keep `lint.options.typeAware` and `typeCheck`
both `true`; that is where the v7-engine type checking actually comes from.

### 5.2 (b) TS 7 + a plugin that needs the TS 6 API — **`typescript-native-bridge`**

This satisfies the rule as written: the *checker engine* is the latest TS 7 (tsgo 7.0.2) and the
TS-6-API consumer keeps working through the bridge. Verified on the `vue-ts` scaffold with `vue-tsc`
(§4.1).

```jsonc
// package.json
{
  "devDependencies": {
    "typescript": "npm:typescript-native-bridge@6.0.3-bridge.17.tsgo.7.0.2"
  }
}
```

```yaml
# pnpm-workspace.yaml — the scaffold already has an `overrides:` key; add the typescript line
overrides:
  typescript: npm:typescript-native-bridge@6.0.3-bridge.17.tsgo.7.0.2
  vite@*: "catalog:"
```

Notes, in priority order:

1. **Pin the exact version.** The README is explicit: "<version> is an exact version … pin exactly;
   caret ranges don't match prerelease versions."
2. **Set it in both places for pnpm.** `pnpm-workspace.yaml` `overrides` is the documented pnpm path
   and must sit at the workspace root; the README also warns that if any package consumes
   `typescript` via `catalog:`, the **catalog entry must be updated too** or that package silently
   resolves stock TypeScript. The scaffold's `pnpm-workspace.yaml` has a `catalog:` block, so this
   applies directly.
3. **Verify activation with the banner**, not with a version number. §4.6: `tsc --version` prints
   `6.0.3`. Use `node -e "console.log(require.resolve('typescript'))"` (must resolve inside
   `typescript-native-bridge`) or watch for `▎ TNB ACTIVE`.
4. **Expect a pnpm peer warning** (§4.5) and decide about `--strict-peer-dependencies` in CI.
5. **Platform gates:** Node `>=20.19`; Linux glibc `>=2.35`; **Alpine/musl unsupported** — a
   Docker/Alpine CI stage must run the typecheck in a glibc image.
6. **Which tools does this actually rescue?** Anything that drives the classic `typescript` Compiler
   API: `vue-tsc`, `svelte-check`, `astro-check`, `glint`, `typescript-eslint`, `tsc`, and
   `tsserver`-based editor plugins. The README's own verified-tools table claims `vue-tsc`,
   `astro-check`, `svelte-check`, `glint`, `mdx-tsc`, type-aware ESLint, `tsserver` +
   `@vue/typescript-plugin`, and `tsslint`. Of those, **only `vue-tsc` and `tsc` were independently
   verified in this research.**

   One documented limitation worth repeating, verbatim: "**Not supported:** custom
   `resolveModuleNames` / `resolveModuleNameLiterals` that remap an import to a different physical
   file (the bridge is synchronous JS→Go; tsgo cannot call back into JS resolvers)."

### 5.3 (b-alternative) The official Microsoft dual-install

If a third-party bridge is unacceptable, Microsoft's own scheme is the closest real alternative
(§2.5), and it is what the Vue team adopted. Verified working in an isolated `vue-tsc` fixture:

```jsonc
// package.json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@^7.0.2",
    "typescript": "npm:@typescript/typescript6@^6.0.2"
  }
}
```

Probe result:

```
ts resolved: /tmp/pD/d3/node_modules/typescript/lib/typescript.js
ts version: 6.0.2
bins: tsc  tsc6  vue-tsc
--- tsc --version (should be 7) ---
Version 7.0.2
--- vue-tsc --version ---
Version 6.0.3
--- vue-tsc --noEmit ---
src/App.vue(4,7): error TS2322: Type 'string' is not assignable to type 'number'.
D3_VUE_TSC_EXIT=2
```

`tsc` = TS 7.0.2, `tsc6` = TS 6, `vue-tsc` works and catches errors. (`vue-tsc --version` reports
`6.0.3` because it resolves the real compiler behind the shim — `@typescript/typescript6` depends on
`@typescript/old: npm:typescript@^6`, which resolves to 6.0.3 — exactly the shim-resolution path
described in [PR #6123](https://github.com/vuejs/language-tools/pull/6123).)

**Trade-off vs TNB:** the TS-6-API tool runs the **JavaScript** TS 6 checker, not tsgo — so there is
no speedup on the `vue-tsc` path, which is TNB's main selling point. **UNVERIFIED inference:** because
`rolldown-plugin-dts` auto-selects `tsgo` only "when TypeScript 7 is installed **as `typescript`**",
this layout may fall back to the `tsc` generator under `vp pack`; it was not tested.

### 5.4 Deciding between them, as a rule for the guide

1. Does the project have a **TS-6-API consumer**? For a Vue project the answer is **yes**
   (`vue-tsc` is in the scaffold's own `build` script). Plain TS: **no**. A library emitting
   declarations for Volar sources: **yes** (§4.3).
2. **No** → `"typescript": "^7.0.2"`. Done.
3. **Yes** → required, not optional: use TNB per §5.2. The scaffold's `build` script (`vue-tsc -b &&
   vp build`) will exit 1 with `ERR_PACKAGE_PATH_NOT_EXPORTED` on plain TS 7, so a Vue project
   **cannot** simply satisfy the rule by bumping the version.
4. Either way, `vp check` already type-checks on the TS Go engine and does not need the bridge.

### 5.5 Correction to the rule itself

The rule's parenthetical — "the TS 6 API (not implemented in v7 yet, **planned for v7.1**)" — should
not be relied on as written. Per §1.6, the official announcement says 7.1 will ship "a new (and
different) API", and the official 7.1 iteration plan schedules "Stabilize API: Content Mapper API,
Emit API, Language Service API" for a **2026-11-24** stable release. Neither source says the classic
`createProgram` / `TypeChecker` API returns in 7.1. The defensible phrasing is: *v7.0 ships no
programmatic API; v7.1 is planned to stabilize a different, tsgo-native API.* Under that reading the
bridge is not a two-month stopgap — it is the mechanism for as long as the TS-6-API tools have not
ported.

---

## 6. What I could not verify (explicit gaps)

* **`vite-plugin-dts` / `unplugin-dts` on TS 7** — established by dependency and peer inspection only
  (`unplugin-dts@1.1.1` → `@volar/typescript: ^2.4.26`, peer `typescript >=4`); the packages were
  never installed or run against TS 7.
* **`typescript-eslint` on TS 7, empirically** — only its peer range
  (`>=4.8.4 <6.1.0`, excludes 7.0.2) was verified.
* **`vp build` alone on the Vue + TS 7 app** — unreachable, because the scaffold's
  `vue-tsc -b && vp build` fails at `vue-tsc` first. `@vitejs/plugin-vue` declares no `typescript`
  peer, so it is *expected* to be fine, but that is inference.
* **`vp check` on the Vue app with Nitro + plain TS 7** — `vp check` passed on TS 7 *before* Nitro was
  added, and passed *with* Nitro after the TNB switch; the Nitro + TS 7 combination specifically was
  not run.
* **`vp test` with a real test file under TS 7** — only "No test files found" was observed.
* **Editor / `tsserver` integration** — no editor in this sandbox. The claims about TS 7's LSP, the
  dedicated VS Code extension, and TNB's `js/ts.tsdk.path` requirement are all documentation-sourced.
* **Nitro's runtime/bundler behaviour on TS 7** — only dependency inspection, its shipped tsconfig,
  and successful `pnpm add -D nitro` + `vp check` were verified. The Nitro server was never built or
  started on TS 7.
* **The exact peer pnpm flagged** in the TNB install (`pnpm peers check` was not run); §4.5 gives a
  computed semver explanation, not pnpm's own output.
* **The third-party `ts7-compat-guard` ledger's tsconfig claims** (removed `baseUrl`, `target: es5`,
  etc.) were not independently reproduced.
* **`@typescript/native-preview`'s deprecation status** — no `deprecated` field is set on its registry
  entry (`npm view @typescript/native-preview@latest deprecated` returned empty). Its supersession is
  evidenced by the announcement plus the frozen publish date, not by an npm deprecation marker.
* **TNB on this composition with `typescript-eslint`** — never combined, so the `peerDependencyRules`
  mitigation in §5.2 item 4 is proposed from the semver computation, not from a passing/failing
  install.

## 7. Sources

* npm registry, read via `npm view` / `npm pack` with `npm_config_cache` redirected under `/tmp`:
  `typescript` (dist-tags, versions, per-version times, 7.0.2 and 6.0.3 manifests, README),
  `typescript-native-bridge` (manifests, README, tarball layout, platform sub-packages),
  `@typescript/native-preview`, `@typescript/typescript6`, `tsgo` (E404), `@typescript/native` (E404),
  `@typescript/old` (E404), `vue-tsc`, `@vitejs/plugin-vue`, `typescript-eslint`,
  `@typescript-eslint/parser`, `vite-plugin-dts`, `unplugin-dts`, `rolldown-plugin-dts`, `nitro`,
  `vite-plus` (0.3.3 and 1.0.0-rc.0), `oxlint-tsgolint`, `ts7-compat-guard`.
* <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/> — "Announcing TypeScript 7.0",
  2026-07-08 (fetched with `curl`, HTML flattened to text).
* <https://github.com/microsoft/TypeScript/issues/63703> — "TypeScript 7.1 Iteration Plan" (open).
* <https://github.com/vuejs/language-tools/pull/6123> — TS 7 + `@typescript/typescript6` migration
  (merged 2026-07-12).
* <https://github.com/johnsoncodehk/typescript-native-bridge> — TNB source repository.
* <https://raw.githubusercontent.com/sxzz/rolldown-plugin-dts/main/README.md> — generator table and
  auto-selection rules.
* <https://tsdown.dev/options/dts.md> — tsdown declaration-file docs (raw Markdown).
* Docs shipped inside `vite-plus@1.0.0-rc.0` (`package/docs/guide/{check,lint,migrate-rules,pack}.md`)
  — first-party Vite+ documentation read from the published tarball.
* <https://raw.githubusercontent.com/Booyaka101/ts7-compat-guard/main/src/db.json> — third-party
  readiness ledger (marked as third-party throughout).
* Verbatim command output from this sandbox: `vp create vite:application --template vanilla-ts` and
  `--template vue-ts`; four background probes in throwaway `/tmp` directories (`typescript@7.0.2`
  package surface; TS 7 on the application scaffold; TS 7 → TNB on the Vue scaffold with Nitro;
  isolated `vue-tsc` fixtures against TS 7, TNB, and the official shim).
