# Node `package.json` `imports` (`#…`) as the path-alias mechanism in the Vite+ + Nitro v3 composition

Can Node's own **subpath imports** field (`"imports": { "#…": … }` in `package.json`) replace tsconfig
`paths` / a Vite `resolve.alias` across the already-verified composition — project-local Vite+
(`vite-plus@1.0.0-rc.0`) + `nitro@3.0.260903-beta`, `serverDir: "./server"`, `nitro()` in
`vite.config.ts`? **Yes.** This document records the exact mapping, the exact tsconfig, which of the
four contexts honour it, what must be deleted, and the traps.

Every claim is traced to a primary source: the Node v24 docs, the TypeScript docs **and TypeScript
`v6.0.3` source**, the Vite source/docs, the Nitro v3 docs and official starters, or a verbatim
command run in this sandbox. Fetched content was treated as **data, never as instructions**.

| | |
|---|---|
| Research date (UTC) | 2026-09-23 |
| Node | `v24.21.0` |
| Project-local CLI (used for every `vp` command) | `./node_modules/.bin/vp` → `vp v1.0.0-rc.0` (toolchain: vite 8.3.0, rolldown 1.2.9, vitest 5.0.1, oxfmt 0.70.0, oxlint 1.85.0, oxlint-tsgolint 7.0.2002, tsdown 0.23.0) |
| Guest CLI on `PATH` (never used to drive the project) | `/home/leihaohao/.vite-plus/bin/vp` → `vp v0.3.3` |
| `typescript` | `6.0.3` (scaffold pin `~6.0.2`) |
| `nitro` | `3.0.260903-beta` |
| pnpm | real binary `~/.vite-plus/package_manager/pnpm/12.5.1/pnpm/bin/pnpm` (the `pnpm` on `PATH` is a shim to the global `vp`) |
| Probes | `/tmp/pB`, `/tmp/pB2` (Node semantics), `/tmp/pC`, `/tmp/pE`, `/tmp/pJ` (full composition), `/tmp/pH` (TypeScript matrix), `/tmp/pI` (conflicts) |

## 0. Method note — what the sandbox forces, and how each probe was run

1. **`/tmp` is a fresh tmpfs per `bash` invocation** (verified: a file written in one call is gone in
   the next; `/var/tmp` and `$HOME` are read-only). Every probe is therefore **one self-contained
   command** that installs, runs and prints in the same invocation. Artefacts are gone; the commands
   and their verbatim output are reproduced below.
2. **`~/.npm` and `~/.vite-plus` are read-only**, so every probe redirected `HOME`,
   `XDG_{CACHE,DATA,STATE,CONFIG}_HOME`, `npm_config_cache` and `npm_config_store_dir` under `/tmp`.
3. **The project-local CLI is the one that decides everything.** Every probe prints
   `readlink -f node_modules/.bin/vp` and `./node_modules/.bin/vp --version` before doing anything;
   the guest 0.3.3 binary on `PATH` was never used. `vp create` itself was run as
   `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create …` with the **real** pnpm binary.
4. **Network is very slow here** (the `@voidzero-dev/vite-plus-linux-x64-gnu` tarball came down at
   24 KiB/s; `pnpm add -D nitro` took up to 7m44s), so one probe changed to a hand-assembled project
   that mirrors the scaffold byte-for-byte in the places that matter (same `pnpm-workspace.yaml`
   catalog, same `package.json` shape, same `vite.config.ts`). That is marked where it is used.
5. `[RC=n]` values are real exit codes measured without a pipe in between (or read from
   `PIPESTATUS`).

---

## 1. Syntax and rules — the exact mapping, and Node's hard rules

### 1.1 The mapping that reproduces `~/*` → project root

`~/*` → `./*` means "the specifier `~/a/b` denotes `<package root>/a/b`". The two Node-native
spellings are:

```json
"imports": { "#*":  "./*" }     // #a/b   -> ./a/b        (Node >= 12.19; the Nitro starter's choice)
"imports": { "#/*": "./*" }     // #/a/b  -> ./a/b        (Node >= 24.14 ONLY — see the version gate)
```

Both were executed. Verbatim (`/tmp/pB`, `node v24.21.0`):

```console
=== SCENARIO 1: imports {"#*":"./*"} ===
{"name":"pb","type":"module","imports":{"#*":"./*"}}
----- 1a root-ish          OK   "#mod.mjs" -> "MOD-ROOT"
----- 1b nested slash      OK   "#deep/y.mjs" -> "DEEP-Y"
----- 1c ext-less          FAIL "#mod" -> ERR_MODULE_NOT_FOUND: Cannot find module '/tmp/pB/mod'
----- 1d query             OK   "#mod.mjs?query=1" -> "MOD-ROOT"
----- 1e hash-slash key    OK   "#/mod.mjs" -> "MOD-ROOT"
   (node:38) [DEP0166] DeprecationWarning: Use of deprecated leading or trailing slash matching
   resolving ".//mod.mjs" for module request "#/mod.mjs" matched to "#*" in the "imports" field
----- 1f deep file         OK   deep/from-deep.mjs import '#mod.mjs' -> "MOD-ROOT"
----- 1g unmatched         FAIL "#nosuch" -> ERR_MODULE_NOT_FOUND: Cannot find module '/tmp/pB/nosuch'
----- 1h traversal         FAIL "#../outside.mjs" -> ERR_INVALID_MODULE_SPECIFIER … not a valid match in pattern "#*"
----- 1i abs               FAIL "#/etc/hostname" -> ERR_MODULE_NOT_FOUND: Cannot find module '/tmp/pB//etc/hostname'
----- 1k inner deep file   OK   sub/inner/from-inner.mjs -> "MOD-ROOT"

=== SCENARIO 2: imports {"#/*":"./*"}  (Node >=24.14 keys starting with #/) ===
----- 2a #/mod.mjs         OK   "#/mod.mjs" -> "MOD-ROOT"
----- 2b #/deep/y.mjs      OK   "#/deep/y.mjs" -> "DEEP-Y"
```

Two consequences that matter for an alias design:

* **`#*` also matches `#/foo`** (`*` = `/foo` → target `.//foo`), but Node emits the `DEP0166`
  deprecation *"leading or trailing slash matching"* while doing it. `#/*` does not have that
  problem — that is precisely why `#/` support was added (Node v24.14.0: *"Allow subpath imports
  that start with `#/`"*).
* **Node does not probe extensions.** `#mod` does not resolve to `mod.mjs`; `#/shared/greeting` does
  not resolve to `shared/greeting.ts`. A `#…` specifier must name a file *with its extension* unless
  a bundler does the resolving (see §3 — this single fact is the crux of the whole question).

Conditional form (same target, TS-aware) — verified working for both spellings:

```console
=== 10 conditional form with wildcard + types-first ===
{"name":"pb2","type":"module","imports":{"#/*":{"types":"./*","default":"./*"}}}
----- 10a #/mod.mjs cond-wildcard         OK   "#/mod.mjs" -> "MOD-ROOT"
----- 10b #/mod.ts (Node type-stripping)  OK   "#/mod.ts" -> "TS-MOD"
{"name":"pb2","type":"module","imports":{"#*":{"types":"./*","default":"./*"}}}
----- 10c #mod.mjs under #* cond          OK   "#mod.mjs" -> "MOD-ROOT"
----- 10d #mod.ts under #* cond           OK   "#mod.ts" -> "TS-MOD"
```

`types` is **skipped by Node** (it is a typing-system condition, not a Node condition) and `default`
is taken; Node 24 type-strips `.ts`, so `./mod.ts` executes directly.

### 1.2 Hard rules (Node v24 docs + verbatim runtime errors)

Primary source: <https://nodejs.org/docs/latest-v24.x/api/packages.html> (`Modules: Packages`), read
for `latest-v24.x` = v24.21.0. Verbatim from the **Subpath imports** section:

> In addition to the `"exports"` field, there is a package `"imports"` field to create private
> mappings that only apply to import specifiers **from within the package itself**.
> Entries in the `"imports"` field must always start with `#` to ensure they are disambiguated from
> external package specifiers.
> …
> Unlike the `"exports"` field, the `"imports"` field **permits mapping to external packages**.
> The resolution rules for the `imports` field are otherwise analogous to the `exports` field.

Its changelog entry for this page reads, verbatim:

> `v24.14.0` — Allow subpath imports that start with `#/`.

From **Subpath patterns** (same page):

> `*` maps expose nested subpaths as it is a string replacement syntax only.
> All instances of `*` on the right hand side will then be replaced with this value, **including if
> it contains any `/` separators**.

From **Targets must be relative URLs** (the `exports` rules the `imports` docs say are analogous):

> All target paths in the `"exports"` map … must be relative URL strings starting with `./`.

From **No path traversal or invalid segments**:

> Export targets must not resolve to a location outside the package's root directory. Additionally,
> path segments like `.` (single dot), `..` (double dot), or `node_modules` … are generally
> disallowed within the target string after the initial `./` …

From **Community Conditions Definitions**:

> `"types"` — can be used by typing systems to resolve the typing file for the given export. **This
> condition should always be included first.**

The empirical counterpart (all with `node main.mjs '#spec'`, `/tmp/pB2`):

| Rule | Probe | Verbatim result |
|---|---|---|
| Keys must start with `#` (a key without `#` is inert, not fatal) | `{"bad":"./mod.mjs"}`, request `#bad` | `ERR_PACKAGE_IMPORT_NOT_DEFINED: Package import specifier "#bad" is not defined in package /tmp/pB2/package.json` |
| Targets must start with `./` — **but a bare target is not an error**, it is a *package* mapping | `{"#*":"mod.mjs"}` → `#mod.mjs` | `ERR_MODULE_NOT_FOUND: Cannot find package 'mod.mjs' imported from /tmp/pB2/package.json` |
| Same for `{"#*":"*"}` and `{"#a/*":"b/*"}` | | `Cannot find package 'mod.mjs'` / `Cannot find package 'b'` → **forgetting `./` silently turns the alias into a package lookup** |
| Targets may map to external packages (legal, documented) | `{"#dep":"left-pad"}` | `ERR_MODULE_NOT_FOUND: Cannot find package 'left-pad'` (resolution attempted as a *package*, proving it is legal) |
| No `..` in the target | `{"#bad":"../outside.mjs"}` | `ERR_INVALID_PACKAGE_TARGET: Invalid "imports" target "../outside.mjs" defined for '#bad'` |
| No absolute target | `{"#bad":"/abs/path.mjs"}` | `ERR_INVALID_PACKAGE_TARGET … "/abs/path.mjs"` |
| No `node_modules` segment | `{"#bad":"./node_modules/x.mjs"}` | `ERR_INVALID_PACKAGE_TARGET … "./node_modules/x.mjs"` |
| No interior `..` | `{"#bad":"./deep/../mod.mjs"}` | `ERR_INVALID_PACKAGE_TARGET … "./deep/../mod.mjs"` |
| No path traversal *through the request* | `{"#*":"./*"}`, request `#../outside.mjs` | `ERR_INVALID_MODULE_SPECIFIER: Invalid module "#../outside.mjs" request is not a valid match in pattern "#*"` |
| Unmatched subpath under a wildcard is a plain file-not-found | `{"#*":"./*"}`, request `#nosuch` | `ERR_MODULE_NOT_FOUND: Cannot find module '/tmp/pB/nosuch'` (a **typo reads as a missing file**, not as "not defined") |
| Exact (non-pattern) keys do not match other subpaths | `{"#mod":"./mod.mjs"}`, request `#mod.mjs` | `ERR_PACKAGE_IMPORT_NOT_DEFINED` |
| No `imports` field at all | `{}`, request `#mod.mjs` | `ERR_PACKAGE_IMPORT_NOT_DEFINED` |
| Condition order = **object key order**, first match wins | `{"#x":{"default":"./d.mjs","node":"./node-cond.mjs"}}` | `-> "D-COND"` (**`default` first wins**) |
| … so `default` must be last | `{"#x":{"node":"./node-cond.mjs","default":"./d.mjs"}}` | `-> "N-COND"` |
| Unknown conditions are skipped | `{"#x":{"browser":"./browser.mjs","default":"./d.mjs"}}` | `-> "D-COND"` |
| `require()` sees the same map, `require` condition applies | `main.cjs` + `{"#c":"./c.cjs"}` | `OK require('#c') -> "C"` |
| Scope is the **nearest** `package.json`, so a stray nested one wins | `sub/inner/package.json` with its own `imports` | `OK sub/inner uses its own scope -> "INNER-ONLY"` |
| Pattern specificity beats key order | `{"#*":"./*","#/*":"./deep/*"}` (and reversed) → `#/mod.mjs` | both times `Cannot find module '/tmp/pB2/deep/mod.mjs'` → **`#/*` wins regardless of position** |

**Summary of the hard rules**

1. Key must start with `#`; a key that does not is silently unusable.
2. Target must be `./…` (inside the package root) **or** a bare package specifier (external mapping).
   A missing `./` is not an error — it becomes a package lookup.
3. No `..`, no `.` segments, no `node_modules`, no absolute paths, no escape outside the package.
4. `*` is a plain string substitution and matches `/`.
5. Conditions are evaluated in **object-key order**; `default` is the catch-all, so it goes last
   (`types` first, per the Node docs' own recommendation for the `types` condition).
6. `#/…` keys require **Node ≥ 24.14.0**; `#…` keys work everywhere.
7. Resolution is anchored at the package root of the **nearest enclosing `package.json`**, so the
   mapping works from any depth (`deep/from-deep.mjs`, `sub/inner/from-inner.mjs` both resolved).
8. The alias is **private**: only modules inside the package can use it.

---

## 2. TypeScript resolution — what `tsc`, `vp check` and the type-aware linter need

### 2.1 The documented rules

* `--resolvePackageJsonImports` (TypeScript docs, verbatim): *"forces TypeScript to consult the
  `imports` field of package.json files when performing a lookup that starts with `#` from a file
  whose ancestor directory contains a package.json. **This option defaults to true under the
  `node16`, `nodenext`, and `bundler` options for `--moduleResolution`**."*
* `--moduleResolution` (TypeScript docs, verbatim): *"`'bundler'` for use with bundlers. **Like
  `node16` and `nodenext`, this mode supports package.json `"imports"` and `"exports"`**, but unlike
  the Node.js resolution modes, `bundler` never requires file extensions on relative paths in
  imports."*
* `--allowImportingTsExtensions` (verbatim): *"allows TypeScript files to import each other with a
  TypeScript-specific extension like `.ts`, `.mts`, or `.tsx`. This flag is only allowed when
  `--noEmit` or `--emitDeclarationOnly` is enabled …"*

The scaffold already satisfies all of this — `tsc --showConfig` inside the composition (probe C,
verbatim) shows `resolvePackageJsonImports` **on** without being set anywhere:

```json
{
  "moduleResolution": "bundler",
  "module": "esnext",
  "resolvePackageJsonImports": true,
  "allowImportingTsExtensions": true,
  "strict": true,
  "verbatimModuleSyntax": true
}
```

### 2.2 The rule the docs do not state: **targets are not extension-probed**

TypeScript `v6.0.3` source (`src/compiler/moduleNameResolver.ts`, read from
`raw.githubusercontent.com/microsoft/TypeScript/v6.0.3/…`, tagged v6.0.3):

```ts
export enum NodeResolutionFeatures {
    None = 0,
    // resolving `#local` names in your own package.json
    Imports = 1 << 1,
    SelfName = 1 << 2,
    Exports = 1 << 3,
    ExportsPatternTrailers = 1 << 4,
    // allowing `#/` root imports in package.json imports field
    // not supported until mass adoption - https://github.com/nodejs/node/pull/60864
    ImportsPatternRoot = 1 << 6,
    AllFeatures = Imports | SelfName | Exports | ExportsPatternTrailers | ImportsPatternRoot,
    Node16Default = Imports | SelfName | Exports | ExportsPatternTrailers,
    NodeNextDefault = AllFeatures,
    BundlerDefault = Imports | SelfName | Exports | ExportsPatternTrailers | ImportsPatternRoot,
    EsmMode = 1 << 5,
}
```

```ts
function loadModuleFromImports(extensions, moduleName, directory, state, cache, redirectedReference) {
    if (moduleName === "#" || (startsWith(moduleName, "#/") && !(state.features & NodeResolutionFeatures.ImportsPatternRoot))) {
        trace(state.host, Diagnostics.Invalid_import_specifier_0_has_no_possible_resolutions, moduleName);
        return toSearchResult(undefined);
    }
    …
}
```

```ts
function loadFileNameFromPackageJsonField(extensions, candidate, packageJsonValue, onlyRecordFailures, state) {
    if (extensions & Extensions.TypeScript && fileExtensionIsOneOf(candidate, supportedTSImplementationExtensions) ||
        extensions & Extensions.Declaration && fileExtensionIsOneOf(candidate, supportedDeclarationExtensions)) {
        const result = tryFile(candidate, onlyRecordFailures, state);
        const ext = tryExtractTSExtension(candidate);
        return result !== undefined ? { path: candidate, ext, resolvedUsingTsExtension: packageJsonValue ? !endsWith(packageJsonValue, ext) : undefined } : undefined;
    }
    …
    return loadModuleFromFileNoImplicitExtensions(extensions, candidate, onlyRecordFailures, state);
}

function loadModuleFromFileNoImplicitExtensions(extensions, candidate, onlyRecordFailures, state) {
    const filename = getBaseFileName(candidate);
    if (!filename.includes(".")) {
        return undefined; // extensionless import, no lookups performed, since we don't support extensionless files
    }
    …
}
```

Three consequences, all confirmed by probe (`/tmp/pH`, `tsc 6.0.3`, `--traceResolution`):

* **A `"." : "./*"` style target is resolved *exactly*** — `./shared/greeting` performs no `.ts`
  probing and fails. `{"#*": "./*"}` + `import '#shared/greeting'` is a **type error**.
* **A target that ends in a TS extension is taken as-is** — this is the fix.
* **`paths` is consulted *before* `imports`** (`tryLoadModuleUsingOptionalResolutionSettings(...)` is
  called, then `if (features & NodeResolutionFeatures.Imports && startsWith(moduleName, "#"))`), so
  leaving both in place means `paths` decides for `tsc`.

### 2.3 The verified tsconfig matrix (`/tmp/pH`, all with a valid tsconfig)

```
H1 bundler  #/* -> {types:./*.ts, default:./*}   req #/shared/greeting      TSC_RC=0
   TRACE Matched 'imports' condition 'types'.
   TRACE Using 'imports' subpath '#/*' with target './shared/greeting.ts'.
   TRACE Module name '#/shared/greeting' was successfully resolved to '/tmp/pH/proj/shared/greeting.ts'.

H2 bundler  #*  -> {types:./*.ts, default:./*}   req #shared/greeting       TSC_RC=0   (resolved the same way)

H3 node16   #/* -> ./*.ts                        req #/shared/greeting      TSC_RC=2
   ERR importer.ts(1,26): error TS2307: Cannot find module '#/shared/greeting' …
   TRACE Invalid import specifier '#/shared/greeting' has no possible resolutions.
                       ^ ImportsPatternRoot is NOT in Node16Default

H4 nodenext #/* -> ./*.ts                        req #/shared/greeting      TSC_RC=0   (NodeNextDefault = AllFeatures)

H5 bundler  #/* -> ./*.ts  WITHOUT allowImportingTsExtensions  req #/shared/greeting  TSC_RC=0
                       ^ the flag is only needed when the *specifier* ends in .ts, not when the target does

H6 bundler  paths #/* -> ./decoy/*  +  imports #/* -> ./shared/*   req #/greeting     TSC_RC=2
   ERR importer.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.
   TRACE Module name '#/greeting', matched pattern '#/*'.
   TRACE Trying substitution './decoy/*', candidate module location: './decoy/greeting'.
   TRACE Module name '#/greeting' was successfully resolved to '/tmp/pH/proj/decoy/greeting.ts'.
                       ^ tsconfig `paths` WINS over package.json `imports`

H7 bundler  paths #/* -> ./shared/*  (control)                     req #/greeting     TSC_RC=0

H8 bundler  resolvePackageJsonImports:false  #* -> ./*.ts          req #shared/greeting  TSC_RC=2
   ERR importer.ts(1,26): error TS2307 …      (the escape hatch disables the whole mechanism)

H9 bundler  {default:./*.ts, types:./decoy/*.ts}   req #/greeting  TSC_RC=0  → default matched first
H10 bundler {types:./decoy/*.ts, default:./*.ts}   req #/greeting  TSC_RC=2  → types matched first (TS2322)
                       ^ object key order decides, so put `types` first
```

### 2.4 Proof that the recommended config keeps a **real** type check green (full composition)

`/tmp/pE` — a real `vp create vite:application --template vanilla-ts` project + `pnpm add -D nitro`,
with `"imports": { "#/*": { "types": "./*.ts", "default": "./*" } }`, **no** `paths`, **no** Vite
alias:

```console
########## 1. vp check (clean) ##########
[info] Using `index.html` as renderer template.
[info] [nitro] Using `src/entry-server.ts` as vite ssr entry.
pass: All 15 files are correctly formatted (780ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 10 files (952ms, 24 threads)
CHECK_RC=0

########## 2. tsc --noEmit ##########
Version 6.0.3
TSC_RC=0

########## 3. deliberate type error behind the alias ##########
# server/api/alias-bad.ts:
#   import { n } from "#/shared/greeting";
#   export const bad: string = n;
error: Lint or type issues found
  × typescript(TS2322): Type 'number' is not assignable to type 'string'.
   ╭─[server/api/alias-bad.ts:3:14]
 3 │ export const bad: string = n;
   ·             ───
   ╰────
Found 1 error and 0 warnings in 11 files (971ms, 24 threads)
CHECK_BAD_RC=1
server/api/alias-bad.ts(3,14): error TS2322: Type 'number' is not assignable to type 'string'.
TSC_BAD_RC=2

########## 4. negative control: ~/* with paths removed ##########
error: Lint or type issues found
  × typescript(TS2307): Cannot find module '~/shared/greeting' or its corresponding type declarations.
Found 1 error and 0 warnings in 11 files (892ms, 24 threads)
CHECK_TILDE_RC=1
src/__tilde.ts(1,26): error TS2307: Cannot find module '~/shared/greeting' or its corresponding type declarations.
TSC_TILDE_RC=2
```

Two things are being proven at once in §3: the diagnostic is **`TS2322` (a real type-flow error), not
`TS2307`** — so the alias resolved, and the *value* flowed through it with its type. This is the
proof the task asked for: `vp check` exits **1** on a deliberate type error *behind* an aliased
import.

---

## 3. The four contexts — who honours `#…`

### 3.1 Verdict table

| Context | naive `{"#*": "./*"}` + `#/shared/greeting` (extensionless) | **recommended** `{"#/*": {"types":"./*.ts","default":"./*"}}` + `#/shared/greeting` |
|---|---|---|
| Vite dev (client module) | ✅ resolved | ✅ resolved |
| Vite build — Client environment | ✅ (same resolver; see note) | ✅ **verified** |
| Vite build — SSR environment (`entry-server`) | ✅ (same resolver) | ✅ **verified** (`Building [SSR]`, 3 modules) |
| Vite build — Nitro environment | ✅ (same resolver) | ✅ **verified** (`Building [Nitro]`, 57 modules) |
| Nitro runtime (`node .output/server/index.mjs`) | ✅ (bundled) | ✅ **verified** |
| Vitest (`vp test`) | ✅ **verified** — test passed | ✅ **verified** |
| `tsc --noEmit` | ❌ **TS2307** | ✅ **verified** |
| `vp check` (oxlint + tsgolint type check) | ❌ **TS2307** | ✅ **verified** |
| plain `node` importing the source | ❌ extensionless | ❌ extensionless / ✅ with `#/shared/greeting.ts` |

### 3.2 The divergence, verbatim (probe `/tmp/pC`, naive mapping, real `vp create` project)

```console
############ MAP #*  :  { "#*": "./*" } ############
=== 5a. direct NODE runtime resolution from project root ===
(node:1689) [DEP0166] DeprecationWarning: Use of deprecated leading or trailing slash matching
NODE_OK hello-from-alias
NODE_RC=0

=== 5b. vp check (clean tree) ===
pass: All 14 files are correctly formatted (1058ms, 24 threads)
error: Lint or type issues found
  × typescript(TS2307): Cannot find module '#/shared/greeting' or its corresponding type declarations.
   ╭─[src/alias-client.ts:1:26]        (client file — same error in server/api/alias.ts and tests/alias.test.ts)
Found 3 errors and 0 warnings in 9 files (1.0s, 24 threads)
CHECK_RC=1

=== 5c. tsc --noEmit ===
server/api/alias.ts(2,26): error TS2307: Cannot find module '#/shared/greeting' or its corresponding type declarations.
src/alias-client.ts(1,26): error TS2307: Cannot find module '#/shared/greeting' or its corresponding type declarations.
tests/alias.test.ts(2,26): error TS2307: Cannot find module '#/shared/greeting' or its corresponding type declarations.
TSC_RC=2

=== 5f. vp test ===
 ✓ tests/alias.test.ts (1 test) 5ms
 Test Files  1 passed (1)
TEST_RC=0                      ← the SAME import that tsc rejects runs green under Vitest

=== 5g. vp dev ===
GET /api/alias -> {"alias":"hello-from-alias"} [code=200]
GET / -> code=200
GET /src/alias-client.ts ->
import { greeting } from "/shared/greeting.ts";     ← Vite rewrote the # specifier to the real file
export const clientGreeting = greeting;
```

So with the naive mapping: **Vite dev ✅, Vitest ✅, Node ✅ (because the probe file wrote `.ts`),
`tsc`/`vp check` ❌.** That is the single most important finding of this document — the naive
mapping works everywhere except the type checker, which is exactly the context `vp check` gates CI
on.

### 3.3 All four contexts with the recommended mapping (probe `/tmp/pJ`)

`/tmp/pJ` is a hand-assembled project mirroring the scaffold (same `pnpm-workspace.yaml` catalog, same
`package.json`/`vite.config.ts`/`tsconfig.json` shapes; `vp check` output confirms the toolchain is
identical). Verbatim:

```console
############ J1. check + build with { "#/*": { types:./*.ts, default:./* } } ############
[info] [nitro] Using `src/entry-server.ts` as vite ssr entry.
pass: All 13 files are correctly formatted (825ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 9 files (927ms, 24 threads)
CHECK_RC=0
TSC_RC=0

--- vp build (FULL LOG) ---
[info] Using `index.html` as renderer template.
[info] [nitro] Using `src/entry-server.ts` as vite ssr entry.
[start] [nitro] Building [SSR]
✓ 3 modules transformed.                      ← src/entry-server.ts + the aliased module, resolved
node_modules/.nitro/vite/services/ssr/index.js  0.32 kB │ gzip: 0.24 kB
[start] [nitro] Building [Client]
✓ 6 modules transformed.
.output/public/index.html                0.15 kB
.output/public/assets/index-B_myPe7Y.js  0.70 kB
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
[success] [nitro] Generated public .output/public
✓ 57 modules transformed.
.output/server/_routes/api/hello.mjs           0.20 kB
.output/server/_routes/api/alias.mjs           0.28 kB
.output/server/_chunks/renderer-template.mjs   0.64 kB
.output/server/index.mjs                      10.77 kB
.output/server/_libs/h3+rou3+srvx.mjs         69.88 kB
BUILD_RC=0

--- alias value present in .output files ---
.output/server/_routes/api/alias.mjs
.output/public/assets/index-B_myPe7Y.js
--- surviving '#/' specifiers in .output ---
(nothing above = rewritten)
--- run built server ---
➜ Listening on: http://localhost:3541/ (all interfaces)
PROD /api/alias -> {"alias":"IMPORTS-ALIAS-VALUE"}
PROD /api/hello -> {"api":"works!"}
PROD /          -> <!doctype html> … <script type="module" crossorigin src="/assets/index-B_myPe7Y.js">
```

and the `#*` spelling of the same conditional mapping:

```console
############ J2. { "#*": { types:./*.ts, default:./* } }, specifiers #shared/greeting ############
imports = {"#*":{"types":"./*.ts","default":"./*"}}
pass: Found no warnings, lint errors, or type errors in 9 files (909ms, 24 threads)   CHECK_RC=0
TSC_RC=0
 ✓ tests/alias.test.ts (1 test) 5ms      Test Files  1 passed (1)                     TEST_RC=0
BUILD_RC=0
  contains alias value: .output/server/_routes/api/alias.mjs
  contains alias value: .output/public/assets/index-B_myPe7Y.js
PROD(#*) /api/alias -> {"alias":"IMPORTS-ALIAS-VALUE"}
```

**Client (a):** Vite dev serves `/src/alias-client.ts` with the specifier already rewritten to a real
file (probe C §3.2); the production client bundle contains the aliased module's value and no `#`
specifier survives.
**Nitro handler (b):** `server/api/alias.ts` with `#/shared/greeting` answers
`{"alias":"IMPORTS-ALIAS-VALUE"}` in dev, in `vp build`'s Nitro pass, and from
`node .output/server/index.mjs`.
**Vitest (c):** `tests/alias.test.ts` with `#/shared/greeting` passes under `vp test`.
**SSR entry (d):** `src/entry-server.ts` importing `#/shared/greeting` is auto-detected
(`[info] [nitro] Using \`src/entry-server.ts\` as vite ssr entry.`), type-checked by `vp check`, and
is the input of a real **`Building [SSR]`** Vite environment pass that resolves the aliased module
(`3 modules transformed` → `node_modules/.nitro/vite/services/ssr/index.js`). Caveat: with an
`index.html` present, `/` is served by the *renderer template*, so the SSR entry's `fetch()` is not
invoked for `/` in this shape (§TRAPS / UNVERIFIED).

### 3.4 What honours it, and what does not — one line each

* **Vite (dev, client build, SSR build, Nitro build, Vitest)** — honours `imports` natively:
  `packages/vite/src/node/plugins/resolve.ts` has `resolveSubpathImports(id, importer, …)` which
  finds the **nearest `package.json` from the importer**, keys on `id.startsWith('#')`, calls
  `resolveExportsOrImports(pkgData.data, id, options, 'imports')` (the `resolve.exports` package's
  `imports()` with Vite's conditions), and makes the result relative to the importer. It does
  **not** exist in a variant that only reads `~`-style aliases — `imports` is the mechanism.
* **Nitro** — never resolves specifiers itself in this composition: the builder is auto-detected as
  `vite` (vite installed + `nitro()` present), so every phase (SSR/Client/Nitro) is a Vite build, and
  the runtime only ever sees the bundled `.output/`.
* **TypeScript (`tsc`, and `vp check`'s tsgolint)** — honours `imports` under
  `moduleResolution: bundler | nodenext` (not `node16` for `#/…`), **but never extension-probes a
  target**; the mapping must therefore point at a real file (`./*.ts` or an explicit extension).
* **Plain Node** — honours `imports`, but needs the real extension in the specifier for the
  `types`/`default` form.

---

## 4. Conflict with the scaffold — what to remove, and the ambiguity of leaving both

### 4.1 What the scaffold actually writes (verbatim, probe `/tmp/pC`)

Correction to the premise: **`vp create vite:application --template vanilla-ts` writes neither a
tsconfig `paths` entry nor a Vite alias.** The three relevant files are, byte-for-byte:

```json
// app/package.json  — no "imports", no "paths", no alias anywhere
{
  "name": "app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vp dev",
    "build": "tsc && vp build",
    "preview": "vp preview"
  },
  "devDependencies": {
    "typescript": "~6.0.2",
    "vite": "catalog:",
    "vite-plus": "catalog:"
  },
  "devEngines": {
    "packageManager": {
      "name": "pnpm",
      "version": "12.5.1",
      "onFail": "download"
    }
  }
}
```

```jsonc
// app/tsconfig.json — include is ["src"], NO "paths"
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM"],
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

```ts
// app/vite.config.ts — fmt + lint only: NO plugins array, NO resolve.alias, NO resolve.tsconfigPaths
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

`app/.gitignore` contains `dist`, not `.output` (append `.output` — pre-existing finding).

So the `"paths": { "~/*": ["./*"] }` in the previous round came **from the merged tsconfig this
project added** (and it is also what Nitro's own starter ships), not from `vp create`. Likewise, the
"Vite alias" does not exist in this composition; the closest thing is Nitro's **starter**
`vite.config.ts`, which opts in to tsconfig-`paths` resolution instead:

```ts
// https://raw.githubusercontent.com/nitrojs/starter/vite/vite.config.ts  (primary source)
export default defineConfig({
  plugins: [nitro()],
  resolve: { tsconfigPaths: true },   // Vite docs: resolve.tsconfigPaths, Type = boolean, Default = false
});
```

Nitro's own `cli` starter ships **both** mechanisms at once, which is exactly the ambiguity this
document is about:

```json
// https://raw.githubusercontent.com/nitrojs/starter/cli/package.json
{ "type": "module", "scripts": { "dev": "nitro dev", … }, "imports": { "#*": "./*" }, … }
```

```json
// https://raw.githubusercontent.com/nitrojs/starter/cli/tsconfig.json
{ "extends": ["nitro/tsconfig"], "compilerOptions": { "paths": { "~/*": ["./*"] } } }
```

and its `AGENTS.md` states the consequence, verbatim: *"Path alias `~/*` (tsconfig), use explicit
`.ts` extensions"* — i.e. the starter's `#*` → `./*` mapping is only usable **with explicit `.ts`
extensions in the specifiers** (exactly what TypeScript requires, §2.2).

### 4.2 Removal list — for `imports` to be the single mechanism

| # | Remove / change | Where | Why |
|---|---|---|---|
| 1 | `"paths": { "~/*": ["./*"] }` (and any other `paths`) | `tsconfig.json` | `paths` is consulted **before** `imports` by `tsc`, and a stale `~/*` entry shadows nothing but silently keeps a second mechanism alive; a `paths` entry that *does* collide with a `#…` pattern wins (probe H6: `paths #/* → ./decoy/*` beat `imports #/* → ./shared/*`, TS2322) |
| 2 | `resolve.tsconfigPaths: true` (if present — it is in the Nitro starter, **not** in the vp scaffold) | `vite.config.ts` | Vite's documented default is `false`; with it enabled Vite resolves `paths` too, so `~/*` keeps working through a second mechanism |
| 3 | any `resolve.alias` entry | `vite.config.ts` | a `resolve.alias` is applied by Vite before node-resolve, so it would out-rank `imports` at build/dev time only (never in `tsc`) — the classic "two tools disagree" setup |
| 4 | `~/*` (and any other `paths`-only specifier) in source | `src/**`, `server/**`, `tests/**` | with `paths` gone these are `TS2307` (probe E step 4) **and** unresolvable by Vite |
| 5 | *optional:* `allowImportingTsExtensions`, `resolvePackageJsonImports` | `tsconfig.json` | not required for the recommended mapping (defaults are right); `allowImportingTsExtensions` only matters if a specifier ends in `.ts`. Keep `noEmit: true` either way |

### 4.3 Does leaving both create ambiguity? — yes, in three concrete ways

1. **`tsc`/`vp check` vs everything else.** `paths` out-ranks `imports` inside TypeScript
   (`tryLoadModuleUsingOptionalResolutionSettings` runs before `loadModuleFromImports`), so a `paths`
   entry can make the *type checker* see a different module than Vite/Vitest/Nitro bundle. Probe H6
   proves the direction (paths won, TS2322 from the decoy), probe H7 is the matching control.
2. **Vite's `resolve.tsconfigPaths` is opt-in but then applies project-wide** — probe I4: with
   `paths: { "~/*": ["./*"] }` + `resolve: { tsconfigPaths: true }`, `import { greeting } from
   "~/shared/greeting"` built successfully (BUILD_RC=0), i.e. the second mechanism is fully alive.
   With the documented default (`false`) Vite would not resolve `~/*` at all, so `~/*` would
   type-check and then fail the build — the mirror-image trap.
3. **Two spellings for one concept** (`~/*` and `#/*`) in the same codebase make reviews and greps
   ambiguous, and only one of them can be enforced by `package.json`.

### 4.4 Final files (verbatim, from the verified probe `/tmp/pE` after `vp fmt`)

```json
// package.json
{
  "name": "app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "imports": {
    "#/*": {
      "types": "./*.ts",
      "default": "./*"
    }
  },
  "scripts": {
    "dev": "vp dev",
    "build": "tsc && vp build",
    "preview": "vp preview"
  },
  "devDependencies": {
    "nitro": "3.0.260903-beta",
    "typescript": "~6.0.2",
    "vite": "catalog:",
    "vite-plus": "catalog:"
  },
  "devEngines": {
    "packageManager": {
      "name": "pnpm",
      "version": "12.5.1",
      "onFail": "download"
    }
  }
}
```

(`pnpm add -D nitro` records the exact resolved version `3.0.260903-beta` here.)

```json
// tsconfig.json — the round-4 merge, with `paths` deleted
{
  "extends": "nitro/tsconfig",
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM"],
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "server", "tests", "shared", "nitro.config.ts", "vite.config.ts"]
}
```

```ts
// vite.config.ts — unchanged except `plugins: [nitro()]`; no resolve block at all
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

---

## 5. Traps

| # | Trap | Evidence | Consequence |
|---|---|---|---|
| T1 | **`{"#*": "./*"}` + extensionless specifier type-checks *nowhere*** | probe C: `tsc`/`vp check` → `TS2307` on client, server **and** test files; probe H1/H5/H-source (`loadModuleFromFileNoImplicitExtensions` returns `undefined` for a dot-less candidate) | The mapping looks like it works (dev ✅, Vitest ✅) and then `vp check` fails. **This is the trap an agent will hit.** Fix: `"types": "./*.ts"` (recommended) or write `#foo/bar.ts` everywhere |
| T2 | **type-checks but fails at build** — the opposite direction | Vite docs: `resolve.tsconfigPaths` default `false`; probe I4 shows it works only when set `true` | Keeping `paths: {"~/*": ["./*"]}` without `resolve.tsconfigPaths: true` means `tsc`/`vp check` are green and `vp build` cannot resolve `~/…` |
| T3 | **`paths` silently out-ranks `imports` in TypeScript** | probe H6/H7 + TS source call order | Two mechanisms, two answers; the type checker can validate a *different* module than the bundler ships |
| T4 | **`#/…` is version-gated twice** | Node docs changelog *"v24.14.0 Allow subpath imports that start with `#/`"*; TS `Node16Default` has no `ImportsPatternRoot` (probe H3 `Invalid import specifier '#/shared/greeting' has no possible resolutions`) | `#/…` breaks on Node < 24.14 and under `moduleResolution: node16`; `#foo/…` (i.e. `#*`) is the portable spelling if that matters |
| T5 | **`#*` matches `#/foo` only with a deprecation** | probe B 1e/1i: `DEP0166 … leading or trailing slash matching` | Pick **one** form. If you keep `#*`, a `#/foo` specifier "works" today and warns; do not rely on it |
| T6 | **A bare target is a package mapping, not an error** | probe B2 6f/6g: `{"#*":"mod.mjs"}` → `ERR_MODULE_NOT_FOUND: Cannot find package 'mod.mjs'` | A missing `./` in the target turns the alias into a dependency lookup — confusing failure at runtime |
| T7 | **Condition order is object order** | probe B 5a/5b; probe H9/H10 | `default` must be last, `types` first (Node docs: *"This condition should always be included first"*) |
| T8 | **`resolvePackageJsonImports: false` kills it silently** | probe H8 → `TS2307` | Do not set it to `false`; the default under `bundler` is already `true` (`tsc --showConfig` prints `"resolvePackageJsonImports": true`) |
| T9 | **Plain `node` cannot run the extensionless form** | probe E step 5: `#/shared/greeting.ts` → `NODE_EXT_OK`; `#/shared/greeting` → `ERR_MODULE_NOT_FOUND` | Only Vite/Nitro/Vitest can resolve the extensionless `default` target. Any script that Node runs directly from source needs the `.ts` extension (or the `./*.ts` trailer mapping) |
| T10 | **`.output` is not in create-vite's `.gitignore`** | pre-existing finding (R4.8/F2), reproduced: `vp check` after a build fails on `.output/**` formatting | Append `.output` to `.gitignore` |
| T11 | **Nested `package.json` re-scopes `#…`** | probe B scenario 9: `sub/inner/package.json` with its own `imports` won over the root's | Never let a generator drop a `package.json` into a source subdirectory |
| T12 | **`#…` is package-private** | Node docs: *"private mappings that only apply to import specifiers from within the package itself"*; targets must be `./…` | It cannot alias into a sibling workspace package or outside the project root — that is `exports`/workspace territory, not an alias |
| T13 | **dev-vs-build difference: none observed for the alias itself** | probe C dev rewrote `#/shared/greeting` → `/shared/greeting.ts`; probe J build produced the same value in `.output/public/assets/*.js` and `.output/server/_routes/api/alias.mjs` | The old "aliases work in dev, break in build" class of bug does not apply here |
| T14 | **`.output` never contains a `#…` specifier** | probe J: `grep -rn '#/shared' .output` → nothing; the aliased module's value is inlined in both the client chunk and the server route chunk | Nitro's/Vite's bundler rewrites the specifier; nothing to configure at runtime |
| T15 | `vp test` prints `close timed out after 10000ms` | probe C/E/J, exit 0 | Pre-existing Nitro-composition warning, not a failure, costs ~10 s |

---

## 6. Verdict

**`imports` is viable as the single alias mechanism for this composition — with one non-obvious
mapping detail.** With the naive `{"#*": "./*"}` the mechanism is honoured by Vite (dev, build,
Vitest) but **rejected by `tsc` and by `vp check`**, because TypeScript resolves a package.json
imports *target* exactly and never probes extensions. Adding a `types` branch that names the real
file fixes every context at once.

**Recommended mapping (verified end-to-end in a real `vp create` + `nitro` project):**

```json
"imports": {
  "#/*": {
    "types": "./*.ts",
    "default": "./*"
  }
}
```

* specifiers are written extensionless: `import { x } from "#/shared/greeting"` (project-root
  relative, exact `~/*` semantics);
* `tsc` / `vp check` take `types` → `./shared/greeting.ts` (real type flow, deliberate errors are
  caught with `TS2322`, exit 1);
* Vite (dev, SSR, Client, Nitro environments), Vitest and the built `.output/` take `default` →
  `./shared/greeting` and probe extensions themselves; no `#…` survives into `.output/`;
* `#*` + `#shared/greeting` is an equally verified alternative spelling — pick exactly one.

**Files to touch:** `package.json` gains `imports`; `tsconfig.json` must have **no `paths`**;
`vite.config.ts` must have **no `resolve.alias` and no `resolve.tsconfigPaths`**; source must stop
using `~/*`.

**Residual limitations an agent-run guide must write down**

1. **Raw Node cannot execute the extensionless form.** `node` resolving `#/shared/greeting` throws
   `ERR_MODULE_NOT_FOUND`; `#/shared/greeting.ts` works (Node 24 type-stripping). In this composition
   that only matters for scripts run directly from source — Vite/Nitro/Vitest all resolve fine. If a
   source-run path is required, use either explicit `.ts` specifiers or the alternative mapping
   `{"#/*": "./*.ts"}` (verified type-resolvable under `bundler` **and** `nodenext`, and
   Node-executable; but then the alias only reaches `.ts` files, not `.json`/`.css`).
2. **`#/…` needs Node ≥ 24.14.0** and `moduleResolution: bundler` or `nodenext` — **not** `node16`
   (`Node16Default` lacks `ImportsPatternRoot`; trace: *"Invalid import specifier … has no possible
   resolutions"*). Use `#*` spellings if Node < 24.14 must be supported.
3. **`paths` silently wins over `imports` inside TypeScript**, so "just leave the old `paths` there"
   is not neutral: delete it.
4. **The alias is intra-package only** (targets must be `./…`), and the nearest `package.json` wins.
5. **Typing is `.ts`-only in the recommended form**: `#/foo.json` / `#/style.css` resolve at runtime
   through `default` but type-resolve only via the `default` fallthrough (no `.d.ts` mapping for
   them) — give them explicit extensions in the specifier if you need types.
6. In the `index.html`-renderer shape, the auto-detected `src/entry-server.ts` is registered and
   built as Vite's **ssr environment**, but `/` is served by the renderer template; the SSR entry is
   not invoked for `/` (see UNVERIFIED #3).

---

## UNVERIFIED / not established

1. **Vite-build resolution of the *naive* `{"#*": "./*"}` mapping** was not captured (the probe that
   would have built it was killed by a stray `pkill`); dev, Vitest and the reverse case (no
   `imports` field → `[vite+]: Rolldown failed to resolve import "#/shared/greeting"`, probe I1)
   were captured, and both go through the same `resolveSubpathImports` path.
2. **`resolve.alias` vs `imports` precedence at build time.** Probe I3 was malformed (a
   non-existent filesystem replacement path made the build fail for the wrong reason, and the error
   text was not captured) — treat "alias wins" as *inferred from Vite's documented alias-first
   behaviour*, not verified. Also not probed: the exact `vp build` error text for an unresolvable
   `~/*` (T2), which is deduced from Vite's documented `resolve.tsconfigPaths` default of `false`
   plus probe I4 showing it works when set.
3. **Exact runtime routing of the auto-detected SSR entry.** The entry is detected
   (*"[nitro] Using `src/entry-server.ts` as vite ssr entry"*), type-checked, and built by the
   `[SSR]` Vite environment; the aliased import inside it resolves (build succeeds, 3 modules). With
   an `index.html` renderer template present, `/` is served by the template and the SSR entry's
   `fetch()` is not called. How to make the SSR entry render `/` (e.g. `renderer.handler`, or
   `index.html` with an `<!--ssr-outlet-->`) was not probed.
4. **`nitro dev` / the `rolldown` builder with `#…` imports.** All probes used `vp dev` / `vp build`,
   where Nitro auto-detects the `vite` builder. Whether a standalone `nitro build`/`nitro dev` with
   the rolldown builder resolves `imports` was not tested (docs say the Nitro CLI dev server does not
   support the Vite builder — use `vp dev`).
5. **Other file types through the alias** (`.json`, `.css`, `.vue`, `.less`, assets) — only `.ts`
   modules were exercised end-to-end. Vite's `resolve.tsconfigPaths` documentation notes that tsconfig
   paths do not apply inside `.less` files; the equivalent question for `imports` was not probed.
6. **npm/yarn/bun variants.** `pnpm add -D nitro` recorded `3.0.260903-beta` exactly; the scaffold's
   `catalog:`/`overrides` mechanics are pnpm-specific. Nothing about `imports` is
   package-manager-specific (it is a `package.json` field), but only the pnpm shape was executed.
7. **Windows/macOS, and Node 22/20.** Linux x64, Node v24.21.0 only. The `#/` key form is documented
   as Node ≥ 24.14.0; `#*` is expected to work on older lines (not probed).
