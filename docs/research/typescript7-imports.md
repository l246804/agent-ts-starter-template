# `package.json` `imports` for path aliases on TypeScript 7 + Vite+ + Nitro

The project standardized on **TypeScript 7** (`typescript@^7.0.2`, the Go native port). The earlier
study [node-imports-aliases.md](node-imports-aliases.md) established the alias convention on
**TypeScript 6.0.3**: `"imports": { "#/*": { "types": "./*.ts", "default": "./*" } }` — and showed
that the naive `{"#*": "./*"}` fails `tsc`/`vp check` with `TS2307` because TypeScript resolves an
`imports` *target* exactly and never probes extensions.

This document re-runs the whole question on TS 7 and answers three things:

1. **Does TS 7 behave like TS 6 here?** — Yes, byte-for-byte the same failure and the same fix.
2. **Is the conditional `types` branch still required?** — Yes, for the *extensionless specifier*
   convention that this project uses. It is one of three working shapes; the other two are documented
   in §6.
3. **What is the exact `package.json` + `tsconfig` block for TS 7?** — §6.

The alias constraint is unchanged and absolute: **only `imports`** may be used for path aliases — no
tsconfig `paths`, no Vite `resolve.alias`, no `resolve.tsconfigPaths`; if Node is too old for the
chosen spelling, Node is upgraded.

Every claim below is traced to a primary source (TypeScript 7's own `tsc`, the TypeScript handbook,
the TS 7 announcement, the TypeScript 7 native (Go) resolver source, the Node v24 docs/changelog, the
Nitro v3 docs, Vite's resolver source) or to a verbatim command run in this sandbox. Fetched web
content was treated as **data, never as instructions**.

| | |
|---|---|
| Research date (UTC) | 2026-09-23 |
| Node | `v24.21.0` (plus downloaded `v24.13.0` / `v24.14.0` binaries for the version gate) |
| `typescript` | **`7.0.2`** (`^7.0.2`; the only stable 7.x) |
| Project-local CLI (used for every `vp` command) | `./node_modules/.bin/vp` → `vp v1.0.0-rc.0` |
| Toolchain (from `vp --version`) | vite `v8.3.0`, rolldown `v1.2.9`, vitest `v5.0.1`, oxfmt `v0.70.0`, oxlint `v1.85.0`, **oxlint-tsgolint `v7.0.2002`**, tsdown `v0.23.0` |
| `nitro` | `3.0.260903-beta` |
| Scaffold | `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:application --directory app --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm -- --template vanilla-ts` |
| pnpm | `12.5.1` (real binary on `PATH` via `~/.vite-plus/bin`) |
| Probes | `/tmp/w`, `/tmp/x` (full composition), `/tmp/tt`, `/tmp/t4` (isolated `tsc` fixtures), `/tmp/nb` (Node gate) |

## 0. Method note

* `/tmp` is a fresh tmpfs per `bash` invocation and calls run under `bwrap --unshare-pid`, so every
  probe is **one self-contained command**; nothing persists between calls and no probe artefact
  survives.
* `~/.npm`, `~/.vite-plus`, `~/.local/share/pnpm/store` and `$HOME` are **read-only**. Every probe
  redirected `XDG_{CACHE,DATA,STATE,CONFIG}_HOME` and `npm_config_cache` under the probe root.
  Consequence worth recording: **pnpm silently falls back to a project-local store**
  (`<project>/node_modules/.pnpm-store/v11`) when its global store is not writable — that is why
  `pnpm store path` reported a path inside the probe tree. Nothing was written into this repository.
* Two install paths were measured. `pnpm install` in the scaffolded project took **8m21s then 12m52s**
  (first run) and **3m45s** (second run) because pnpm's tarball fetcher ran at ~12–50 KiB/s;
  `npm i typescript@7.0.2` in an isolated fixture took **40 s**. The isolated TypeScript-only fixtures
  (§3, §5) therefore use npm; the composition probes use the scaffold's pnpm.
* `vp check` output includes ANSI colour codes; they are stripped below, nothing else is changed.
* `[X_RC=n]` values are real exit codes captured immediately after the command
  (`out=$(cmd); rc=$?`), never through a pipe.
* **First composition run failed for a reason unrelated to aliases, and that finding is kept (§7 T11):**
  Nitro v3's `serverDir` defaults to `false`, so without a root `nitro.config.ts` no `server/api/*`
  route is compiled at all. The matrices below are from the corrected run.

---

## 1. TS 7 official guidance

### 1.1 What the TS 7 release states

The TypeScript website has **no 7.0 release-notes page** — `…/docs/handbook/release-notes/typescript-7-0.html`
returns **404** — so the 7.0 announcement on the official devblog is the release note. Verbatim from
<https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/> ("Announcing TypeScript 7.0",
Daniel Rosenwasser, 2026-07-08):

> The deprecations that have turned into hard errors with no-op behavior are:
>
> - `target: es5` is no longer supported.
> - `downlevelIteration` is no longer supported.
> - **`moduleResolution: node/node10` are no longer supported, with `nodenext` and `bundler` being
>   recommended instead.**
> - `module: amd, umd, systemjs, none` are no longer supported, with `esnext` or `preserve` being
>   recommended in conjunction with bundlers or browser-based module resolution.
> - **`baseUrl` is no longer supported, and `paths` can be updated to be relative to the project root
>   instead of `baseUrl`.**
> - **`moduleResolution: classic` is no longer supported, and `bundler` or `nodenext` are the
>   recommended replacements.**

and, in the same "at a glance" list of default changes:

> - `strict` is true by default.
> - `module` defaults to `esnext`.
> - …
> - `rootDir` now defaults to `./`, and inner source directories must be explicitly set.
> - `types` now defaults to `[]`, and the old behavior can be restored by setting it to `["*"]`.

The announcement says **nothing** about `package.json` `imports`, extension probing, or a `types`
condition. Neither does the GitHub release page for `v7.0.2` (fetched; zero occurrences of `imports`
or `moduleResolution`). The authoritative on-disk statement of the accepted values is `tsc` itself:

```console
$ ./node_modules/.bin/tsc --help --all | grep -A4 -- --moduleResolution
--moduleResolution
Specify how TypeScript looks up a file from a given module specifier.
one of: node16, nodenext, bundler
default: `nodenext` if `module` is `nodenext`; `node16` if `module` is `node16` or `node18`; otherwise, `bundler`.

$ ./node_modules/.bin/tsc --noEmit --moduleResolution node
tsconfig.json(11,25): error TS5108: Option 'moduleResolution=node10' has been removed. Please remove it from your configuration.
$ ./node_modules/.bin/tsc --noEmit --moduleResolution classic
tsconfig.json(11,25): error TS5108: Option 'moduleResolution=Classic' has been removed. Please remove it from your configuration.
```

(TS 7.0.2, `[tsc --version]` → `Version 7.0.2`. The three accepted values are exactly
`node16`, `nodenext`, `bundler`.)

Also verbatim from the same `--help --all` output, for the two flags this whole question hangs on:

```console
--resolvePackageJsonImports
Use the package.json 'imports' field when resolving imports.
type: boolean
default: `true` when 'moduleResolution' is 'node16', 'nodenext', or 'bundler'; otherwise `false`.

--allowImportingTsExtensions
Allow imports to include TypeScript file extensions. Requires '--moduleResolution bundler' and either '--noEmit' or '--emitDeclarationOnly' to be set.
type: boolean
default: false
```

### 1.2 What the TypeScript docs say about `imports` — and the rule that decides everything

The TypeScript handbook's module-resolution reference (the current docs; `node16/nodenext/bundler`
are its accepted values, matching TS 7's `tsc`) has a section
**`package.json "imports"` and self-name imports**. Verbatim
(<https://www.typescriptlang.org/docs/handbook/modules/reference.html>):

> When `moduleResolution` is set to `node16`, `nodenext`, or `bundler`, and `resolvePackageJsonImports`
> is not disabled, TypeScript will attempt to resolve import paths beginning with `#` through the
> `"imports"` field of the nearest ancestor package.json of the importing file. […]
> Both of these features allow files in a package to import other files in the same package, replacing
> a relative import path.
>
> TypeScript follows Node.js's resolution algorithm for `"imports"` and self references **exactly up
> until a file path is resolved**. At that point, TypeScript's resolution algorithm forks based on
> whether the package.json containing the `"imports"` or `"exports"` being resolved belongs to a
> `node_modules` dependency or the local project being compiled (i.e., its directory contains the
> tsconfig.json file for the project that contains the importing file):
>
> - **If the package.json is in `node_modules`, TypeScript will apply extension substitution to the
>   file path** if it doesn't already have a recognized TypeScript file extension, and check for the
>   existence of the resulting file paths.
> - **If the package.json is part of the local project, an additional remapping step is performed** in
>   order to find the input TypeScript implementation file that will eventually produce the output
>   JavaScript or declaration file path that was resolved from `"imports"`. […] This remapping uses the
>   `outDir`/`declarationDir` and `rootDir` from the tsconfig.json, so using `"imports"` usually
>   requires an explicit `rootDir` to be set.

**That asymmetry is the entire answer.** Extension substitution is documented *only* for the
`node_modules` branch. For the local project there is a **remapping** branch instead, and the
documented example shows what it expects — verbatim, "Example: local project with conditions":

> ```json
> // tsconfig.json
> { "compilerOptions": { "moduleResolution": "node16", "resolvePackageJsonImports": true,
>   "rootDir": "./src", "outDir": "./dist" } }
> ```
> ```json
> // package.json
> { "name": "pkg", "imports": { "#utils": { "import": "./dist/utils.d.mts",
>   "require": "./dist/utils.d.cts" } } }
> ```
> Resolution process: […] Should we attempt to map the output path to an input path? Yes, because:
>
> - Is the package.json in `node_modules`? No, it's in the local project.
> - Is the tsconfig.json within the package.json directory? Yes.
>
> In `./dist/utils.d.mts`, replace the outDir prefix with rootDir → `./src/utils.d.mts`.
> Replace the output extension `.d.mts` with the corresponding input extension `.mts` → `./src/utils.mts`.
> Return the path `"./src/utils.mts"` if the file exists. Otherwise, return the path
> `"./dist/utils.d.mts"` if the file exists.

So the documented local-project pattern expects **targets that name real files** (there, emitted
outputs plus `rootDir`/`outDir`). A `noEmit` bundler project has no `outDir` at all, which leaves the
target itself as the only thing that can name the file — i.e. a target ending in `.ts`.

The same page also states, verbatim, the intended relationship between `paths` and `imports`:

> It's also common for apps built with bundlers to define convenience path aliases in their bundler
> configuration, and then inform TypeScript of those aliases with `paths` […]
> **Both libraries and apps can consider package.json `"imports"` as a standard replacement for
> convenience paths aliases.**

and, on `paths` itself:

> `paths` does not affect emit
>
> The `paths` option does not change the import path in the code emitted by TypeScript. Consequently,
> it's very easy to create path aliases that appear to work in TypeScript but will crash at runtime

Finally the `--moduleResolution bundler` section, verbatim:

> `'bundler'` for use with bundlers. **Like `node16` and `nodenext`, this mode supports package.json
> `"imports"` and `"exports"`**, but unlike the Node.js resolution modes, bundler never requires file
> extensions on **relative** paths in imports.

Note the qualifier: extension-free imports are promised for **relative** paths only — nothing is
promised for an `imports` *target*.

**Is there a documented recommended form?** Not for this case. No official TS 7 source names a
`package.json` `imports` block for a `noEmit` Vite project, and the handbook's only local-project
example targets build outputs. What the docs *do* establish is the rule set the recommendation below
must satisfy (local target = exact file, no extension substitution, `types` condition documented and
"should always be included first" per Node). The block in §6 is derived from those rules and verified
empirically; it is **not** quoted from an official doc, and this document does not claim otherwise.

### 1.3 What TS 7's own resolver source says — extension probing is still absent

TS 7's compiler is `microsoft/typescript-go`. In `internal/module/resolver.go` (`main`), the function
that resolves a *string* `imports`/`exports` target is
`loadModuleFromTargetExportOrImport`, which ends with:

```go
		if inputLink := r.tryLoadInputFileForPath(finalPath, subpath, tspath.CombinePaths(scope.PackageDirectory, "package.json"), isImports); !inputLink.shouldContinueSearching() {
			inputLink.packageId = r.getPackageId(inputLink.path, scope)
			return inputLink
		}
		if result := r.loadFileNameFromPackageJSONField(extensions, finalPath, targetString); !result.shouldContinueSearching() {
			result.packageId = r.getPackageId(result.path, scope)
			return result
		}
		return continueSearching()
```

and `loadFileNameFromPackageJSONField` is:

```go
func (r *resolutionState) loadFileNameFromPackageJSONField(extensions extensions, candidate string, packageJSONValue string) *resolved {
	if extensions&extensionsTypeScript != 0 && tspath.HasImplementationTSFileExtension(candidate) || extensions&extensionsDeclaration != 0 && tspath.IsDeclarationFileName(candidate) {
		if path, ok := r.tryFile(candidate); ok {
			extension := tspath.TryExtractTSExtension(path)
			… // resolvedUsingTsExtension bookkeeping
			return &resolved{ path: path, extension: extension, resolvedUsingTsExtension: resolvedUsingTsExtension }
		}
		return continueSearching()
	}
	…
	return r.loadModuleFromFileNoImplicitExtensions(extensions, candidate)
}
```

and that last function is explicit:

```go
func (r *resolutionState) loadModuleFromFileNoImplicitExtensions(extensions extensions, candidate string) *resolved {
	base := tspath.GetBaseFileName(candidate)
	if !strings.Contains(base, ".") {
		return continueSearching() // extensionless import, no lookups performed, since we don't support extensionless files
	}
	…
```

`tryLoadInputFileForPath` is the documented remapping step, and it is inert without an emit:

```go
	// Replace any references to outputs for files in the program with the input files to support package self-names used with outDir
	if !r.isConfigLookup &&
		(r.compilerOptions.DeclarationDir != "" || r.compilerOptions.OutDir != "") &&
		!strings.Contains(finalPath, "/node_modules/") && …
```

So on TS 7 a `types`/`default` target of `./shared/greeting` performs **no lookup at all**; a target of
`./shared/greeting.ts` is `tryFile`'d and resolves. That is exactly the TS 6 behaviour
([node-imports-aliases.md](node-imports-aliases.md) §2.2), ported.

The `#/…` root-import gate is also still in the Go code, unchanged —
`internal/module/resolver.go`:

```go
func (r *resolutionState) loadModuleFromImports() *resolved {
	if r.name == "#" || (strings.HasPrefix(r.name, "#/") && (r.features&NodeResolutionFeaturesImportsPatternRoot) == 0) {
		if r.tracer != nil {
			r.tracer.write(diagnostics.Invalid_import_specifier_0_has_no_possible_resolutions, r.name)
		}
		return continueSearching()
	}
```

with the feature sets in `internal/module/types.go` (comment verbatim):

```go
	// allowing `#/` root imports in package.json imports field
	// not supported until mass adoption - https://github.com/nodejs/node/pull/60864
	NodeResolutionFeaturesImportsPatternRoot

	NodeResolutionFeaturesNone            NodeResolutionFeatures = 0
	NodeResolutionFeaturesAll                                    = … | NodeResolutionFeaturesImportsPatternRoot
	NodeResolutionFeaturesNode16Default                          = … (no ImportsPatternRoot)
	NodeResolutionFeaturesNodeNextDefault                        = NodeResolutionFeaturesAll
	NodeResolutionFeaturesBundlerDefault                         = … | NodeResolutionFeaturesImportsPatternRoot
```

*Source caveat:* `raw.githubusercontent.com/microsoft/typescript-go/{v7.0.2,7.0.2}/…` returns **404**
(no such tag is fetchable), so the Go source quoted here is the `main` branch, i.e. the 7.1-dev line.
The behaviour it describes was independently re-verified against the shipped **7.0.2** binary in §2,
§3 and §5, which is what makes it load-bearing here.

Finally, the ecosystem's own official alias recipe is worth recording, because it is the opposite of
this project's constraint. Verbatim from the Nitro v3 docs' **Import Alias** page
(<https://nitro.build/llms-full.txt>, the docs' own machine-readable export):

```json [package.json]
{
  "type": "module",
  "imports": {
    "#server/*": "./server/*"
  }
}
```
```json [tsconfig.json]
{
  "extends": "nitro/tsconfig",
  "compilerOptions": {
    "paths": {
      "~server/*": ["./server/*"]
    }
  }
}
```
```ts [vite.config.ts]
export default defineConfig({ plugins: [nitro()], resolve: { tsconfigPaths: true } });
```
```ts [server/routes/index.ts]
import { sum } from "~server/utils/math.ts";
```

i.e. Nitro's documented recipe keeps `imports` for the bundler, adds tsconfig `paths` **and**
`resolve.tsconfigPaths: true` for TypeScript, and writes **explicit `.ts` extensions** in the
specifier. §5 tests what that mapping does when `paths`/`tsconfigPaths` are removed, as this project
requires — and §3.2 shows the `.ts` extension is doing the work there, not the mapping.

---

## 2. Empirical matrix — the composition, TypeScript 7.0.2

### 2.1 Probe design

One scaffold (`vp create vite:application --template vanilla-ts`) bumped to `typescript@^7.0.2` with
`nitro@3.0.260903-beta`, plus `nitro.config.ts` (`serverDir: "./server"`) and the merged tsconfig from
[node-imports-aliases.md](node-imports-aliases.md) §4.4. Four import sites, one shared module:

```ts
// shared/greeting.ts
export const greeting: string = "IMPORTS-ALIAS-VALUE";
export const n: number = 42;
```

| Context | File | Import line |
|---|---|---|
| (a) client | `src/alias-client.ts` | `import { greeting } from "<SPEC>";` |
| (b) Nitro handler | `server/api/alias.ts` | `import { defineEventHandler } from "nitro/h3";` + `import { greeting } from "<SPEC>";` |
| (c) Vitest | `tests/alias.test.ts` | `import { greeting } from "<SPEC>";` |
| (d) SSR entry | `src/entry-server.ts` | `import { greeting } from "<SPEC>";` |
| type-check probe | `src/__aliasbad.ts` | `import { n } from "<SPEC>"; export const bad: string = n;` |

For each mapping: `vp fmt` (so the fmt stage cannot mask the type check — see §7 T10), then the full
gate. `<SPEC>` is `#shared/greeting` for `#*` mappings and `#/shared/greeting` for `#/*` mappings
(the extensionless spelling, which is the project's convention).

### 2.2 Verdict table

| | **V1 naive** `{"#*":"./*"}` | **V2 recommended** `{"#/*":{"types":"./*.ts","default":"./*"}}` | **V3 ts-only** `{"#/*":"./*.ts"}` | **V4 conditional `#*`** `{"#*":{"types":"./*.ts","default":"./*"}}` |
|---|---|---|---|---|
| `vp check` (fmt+lint+type) | ❌ **RC=1**, 4× `TS2307` | ✅ **RC=0** | ✅ RC=0 | ✅ RC=0 |
| `vp check --no-fmt --no-lint` | ❌ RC=1, 4× `TS2307` | ✅ RC=0 | ✅ RC=0 | ✅ RC=0 |
| `tsc --noEmit` (7.0.2) | ❌ **RC=1**, 4× `TS2307` | ✅ **RC=0** | ✅ RC=0 | ✅ RC=0 |
| deliberate type error behind the alias | ❌ `TS2307` (no type flow) | ✅ **`TS2322`**, RC=1 | ✅ `TS2322`, RC=1 | ✅ `TS2322`, RC=1 |
| `vp test` (Vitest) | ✅ RC=0 | ✅ RC=0 | ✅ RC=0 | ✅ RC=0 |
| `vp dev` → `GET /api/alias` | ✅ `{"alias":"IMPORTS-ALIAS-VALUE"}` | ✅ same | ✅ same | ✅ same |
| `vp dev` → `GET /api/hello` / `/` | ✅ `{"api":"works!"}` / 200 | ✅ | ✅ | ✅ |
| `vp build` | ✅ RC=0 | ✅ RC=0 | ✅ RC=0 | ✅ RC=0 |
| built `.output/server/_routes/api/alias.mjs` | ✅ contains the value | ✅ | ✅ | ✅ |
| `node .output/server/index.mjs` → `/api/alias` | ✅ `{"alias":"IMPORTS-ALIAS-VALUE"}` | ✅ | ✅ | ✅ |
| plain `node` + **extensionless** specifier | ❌ `ERR_MODULE_NOT_FOUND` | ❌ `ERR_MODULE_NOT_FOUND` | ✅ **works** | ❌ `ERR_MODULE_NOT_FOUND` |
| plain `node` + `<SPEC>.ts` | ✅ works | ✅ works | ❌ `…greeting.ts.ts` not found | ✅ works |

**The naive mapping still fails exactly where it failed on TS 6: the type checker.** Vite (dev, all
three build environments), Vitest, the bundled Nitro output and a running production server all accept
it; `tsc` and `vp check` reject every extensionless import of it.

### 2.3 Verbatim evidence, V1 (naive) — the failure

```console
### V1: imports={"#*":"./*"}, specifier #shared/greeting
########## V1-naive-hash-star_check ##########
× typescript(TS2307): Cannot find module '#shared/greeting' or its corresponding type declarations.
   ╭─[src/alias-client.ts:1:26]
 1 │ import { greeting } from "#shared/greeting";
   ·                          ──────────────────
   ╰────
× typescript(TS2307): Cannot find module '#shared/greeting' or its corresponding type declarations.
   ╭─[src/entry-server.ts:1:26]
   ╰────
× typescript(TS2307): Cannot find module '#shared/greeting' or its corresponding type declarations.
   ╭─[server/api/alias.ts:3:26]
   ╰────
× typescript(TS2307): Cannot find module '#shared/greeting' or its corresponding type declarations.
   ╭─[tests/alias.test.ts:3:26]
   ╰────

Found 4 errors and 0 warnings in 10 files (925ms, 24 threads)
[V1-naive-hash-star_check_RC=1]

########## V1-naive-hash-star_tsc ##########
server/api/alias.ts(3,26): error TS2307: Cannot find module '#shared/greeting' or its corresponding type declarations.
src/alias-client.ts(1,26): error TS2307: Cannot find module '#shared/greeting' or its corresponding type declarations.
src/entry-server.ts(1,26): error TS2307: Cannot find module '#shared/greeting' or its corresponding type declarations.
tests/alias.test.ts(3,26): error TS2307: Cannot find module '#shared/greeting' or its corresponding type declarations.
[V1-naive-hash-star_tsc_RC=1]

########## V1-naive-hash-star_test ##########   ← the SAME import runs green under Vitest
 RUN  v5.0.1 /tmp/x/app
 ✓ tests/alias.test.ts (1 test) 5ms
 Test Files  1 passed (1)
[V1-naive-hash-star_test_RC=0]

########## V1-naive-hash-star_dev ##########
api_alias: {"alias":"IMPORTS-ALIAS-VALUE"}
api_hello: {"api":"works!"}
root: http=200
--- transformed client module ---
import { greeting } from "/shared/greeting.ts";

########## V1-naive-hash-star_build ##########
✓ 54 modules transformed.
.output/server/_routes/api/hello.mjs           0.21 kB
.output/server/_routes/api/alias.mjs           0.29 kB
[V1-naive-hash-star_build_RC=0]

########## V1-naive-hash-star_prod run ##########
prod_api_alias: {"alias":"IMPORTS-ALIAS-VALUE"}
prod_api_hello: {"api":"works!"}

########## V1-naive-hash-star_type-error-behind-alias ##########
[V1-naive-hash-star_check_bad_RC=1]        (5 errors, all TS2307 — the deliberate error is invisible)
[V1-naive-hash-star_tsc_bad_RC=1]
```

### 2.4 Verbatim evidence, V2 (recommended) — the fix, and proof the type check is real

```console
########## V2-recommended-cond-slash_check ##########
[info] Using `index.html` as renderer template.
[info] [nitro] Using `src/entry-server.ts` as vite ssr entry.
pass: All 15 files are correctly formatted (753ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 10 files (958ms, 24 threads)
[V2-recommended-cond-slash_check_RC=0]

########## V2-recommended-cond-slash_check-types-only ##########
pass: Found no type errors in 10 files (888ms, 24 threads)
[V2-recommended-cond-slash_check-types-only_RC=0]

########## V2-recommended-cond-slash_tsc ##########
(no output)
[V2-recommended-cond-slash_tsc_RC=0]

########## V2-recommended-cond-slash_test ##########
 ✓ tests/alias.test.ts (1 test) 6ms
 Test Files  1 passed (1)
[V2-recommended-cond-slash_test_RC=0]

########## V2-recommended-cond-slash_dev ##########
api_alias: {"alias":"IMPORTS-ALIAS-VALUE"}
api_hello: {"api":"works!"}
root: http=200
--- transformed client module ---
import { greeting } from "/shared/greeting.ts";
```

**The deliberate type error — `src/__aliasbad.ts` = `import { n } from "<SPEC>"; export const bad: string = n;`:**

```console
########## V2-recommended-cond-slash_check_bad ##########
pass: All 16 files are correctly formatted (862ms, 24 threads)
error: Lint or type issues found
  × typescript(TS2322): Type 'number' is not assignable to type 'string'.
   ╭─[src/__aliasbad.ts:3:14]
 2 │
 3 │ export const bad: string = n;
   ·             ───
   ╰────

Found 1 error and 0 warnings in 11 files (944ms, 24 threads)
[V2-recommended-cond-slash_check_bad_RC=1]

########## V2-recommended-cond-slash_check_bad_types-only ##########
error: Type errors found
  × typescript(TS2322): Type 'number' is not assignable to type 'string'.
   ╭─[src/__aliasbad.ts:3:14]
   ╰────
Found 1 error and 0 warnings in 11 files (794ms, 24 threads)
[V2-recommended-cond-slash_check_bad_types-only_RC=1]

########## V2-recommended-cond-slash_tsc_bad ##########
src/__aliasbad.ts(3,14): error TS2322: Type 'number' is not assignable to type 'string'.
[V2-recommended-cond-slash_tsc_bad_RC=1]
```

`TS2322` (a real assignability error) — **not** `TS2307` — is the proof that the alias resolved *and*
that the value's type flowed through it, for both the npm `typescript@7.0.2` `tsc` and `vp check`'s
tsgolint (oxlint-tsgolint `7.0.2002`, the TS Go engine). V3 and V4 produce the identical `TS2322`.

### 2.5 Build output and the production server (V2)

```console
########## V2-recommended-cond-slash_build ##########
[start] [nitro] Building [SSR]
✓ 3 modules transformed.          ← src/entry-server.ts + the aliased module
[start] [nitro] Building [Client]
✓ 9 modules transformed.
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
[success] [nitro] Generated public .output/public
✓ 54 modules transformed.
.output/server/_routes/api/hello.mjs           0.21 kB │ gzip:  0.17 kB
.output/server/_routes/api/alias.mjs           0.29 kB │ gzip:  0.20 kB
.output/server/index.mjs                      11.81 kB │ gzip:  3.84 kB
[V2-recommended-cond-slash_build_RC=0]

--- alias route content (.output/server/_routes/api/alias.mjs) ---
import { defineEventHandler } from "../../_libs/h3+rou3+srvx.mjs";
//#region shared/greeting.ts
var greeting = "IMPORTS-ALIAS-VALUE";
//#endregion
//#region server/api/alias.ts
var alias_default = defineEventHandler(() => ({ alias: greeting }));
//#endregion
export { alias_default as default };

########## V2-recommended-cond-slash_prod run ##########
prod_api_alias: {"alias":"IMPORTS-ALIAS-VALUE"}
prod_api_hello: {"api":"works!"}

--- surviving '#/shared' specifiers in .output ---
(nothing — the bundler rewrote every one)
```

All four contexts confirmed: **(a)** client (dev-served module rewritten to `/shared/greeting.ts`, and
the value is in the client bundle), **(b)** Nitro handler (`/api/alias` in dev, in the built route
chunk, and from `node .output/server/index.mjs`), **(c)** Vitest, **(d)** SSR entry (auto-detected:
`[info] [nitro] Using \`src/entry-server.ts\` as vite ssr entry.`, built by the `[SSR]` pass, 3 modules).

### 2.6 Did TS 7 change the TS 6 behaviour? — **No**

| | TS 6.0.3 (previous study) | TS 7.0.2 (this study) |
|---|---|---|
| `{"#*":"./*"}` + extensionless specifier, `tsc` | `TS2307` ×4 | `TS2307` ×4 (same files) |
| …under `vp check` | `TS2307` | `TS2307` (4 errors, RC=1) |
| …under Vitest / Vite dev / Vite build / Nitro | works | works |
| `{"#/*":{"types":"./*.ts","default":"./*"}}` | all four contexts green, `TS2322` behind the alias | identical |
| `#/…` under `moduleResolution: node16` | rejected | rejected (§3) |
| condition order decides (`types` first) | yes | yes (§3.1) |
| `paths` consulted before `imports` | yes | yes (§5) |

Porting the resolver to Go changed none of it. Any guide text written for TS 6 stays correct on TS 7.

---

## 3. `moduleResolution` values on TS 7

Isolated fixture (`/tmp/tt`, `typescript@7.0.2` installed with npm), `imports` =
`{"#/*":{"types":"./*.ts","default":"./*"}}`, specifier `#/shared/greeting`, `strict`, `noEmit`. The
fixture's `shared/greeting.ts` exports `n: number`, and the importer does `export const ok: string = n;`
so a **`TS2322` means the alias resolved and typed**, and `TS2307` means it did not.

| `module` / `moduleResolution` | result | verbatim |
|---|---|---|
| `esnext` / **`bundler`** | ✅ resolved | `[MR_BUNDLER_clean_RC=0]`, trace below |
| `nodenext` / **`nodenext`** | ✅ resolved | `[MR_NODENEXT_clean_RC=0]` |
| `preserve` / **`bundler`** | ✅ resolved | `[MR_PRESERVE_clean_RC=0]` |
| `node16` / **`node16`** | ❌ **`TS2307`** | `src/importer.ts(1,26): error TS2307: Cannot find module '#/shared/greeting' or its corresponding type declarations.` |
| `node16` / **`node16`**, `#*` spelling (`#shared/greeting`) | ✅ resolved | `[G4 node16 + #* spec]` → `TS2322` only |
| `node` / `node10` / `classic` | ❌ **hard error** | `error TS5108: Option 'moduleResolution=node10' has been removed. Please remove it from your configuration.` / `…=Classic' has been removed…` |

Working trace (`bundler`), verbatim:

```console
======== Resolving module '#/shared/greeting' from '/tmp/w/mr/src/importer.ts'. ========
Matched 'imports' condition 'types'.
Using 'imports' subpath '#/*' with target './shared/greeting.ts'.
======== Module name '#/shared/greeting' was successfully resolved to '/tmp/w/mr/shared/greeting.ts'. ========
```

Failing trace (`node16`), verbatim:

```console
======== Resolving module '#/shared/greeting' from '/tmp/w/mr/src/importer.ts'. ========
Invalid import specifier '#/shared/greeting' has no possible resolutions.
Loading module '#/shared/greeting' from 'node_modules' folder, target file types: TypeScript, JavaScript, Declaration.
======== Module name '#/shared/greeting' was not resolved. ========
```

**Conclusion: `bundler` and `nodenext` both work on TS 7; `node16` still rejects `#/…` (exactly the
`ImportsPatternRoot` gate quoted in §1.3) but accepts `#*`; and `node`/`node10`/`classic` are gone —
a config carrying any of them is now a hard error, which is stricter than TS 6 (where they merely
warned).** No change to the `#/…` rule between TS 6 and TS 7.

### 3.1 Condition order and fallback (isolated, TS 7.0.2)

The `default` branch pointed at a decoy module whose `n` is a **string**, the `types` branch at the
real module whose `n` is a **number**; the importer assigns to `string`. So `TS2322` = "the real file
was used", "no diagnostics" = "the decoy was used".

| `imports` object | who won | result |
|---|---|---|
| `{"types":"./*.ts","default":"./decoy/*.ts"}` | `types` | `TS2322` on the real `n: number` |
| `{"default":"./decoy/*.ts","types":"./*.ts"}` | `default` | **no diagnostics** (decoy `n: string` assigned cleanly) |
| `{"types":"./nonexistent/*.ts","default":"./*.ts"}` | fallback | resolved via `default` |

The last row is a new, load-bearing detail (not in the TS 6 study): TS 7 **continues to the next
matching condition when the first matching condition's target file does not exist**. Trace, verbatim
(`#/shared/greeting`, `types` → a missing directory, `default` → `./*.ts`):

```console
Entering conditional exports.
Matched 'imports' condition 'types'.
Using 'imports' subpath '#/*' with target './nonexistent/shared/greeting.ts'.
Failed to resolve under condition 'types'.
Matched 'imports' condition 'default'.
Using 'imports' subpath '#/*' with target './shared/greeting.ts'.
Resolved under condition 'default'.
```

That fallback is what lets the same recommended block also serve specifiers that *do* carry an
explicit `.ts`: trace for `#/shared/greeting.ts` under `{"types":"./*.ts","default":"./*"}`:

```console
Matched 'imports' condition 'types'.
Using 'imports' subpath '#/*' with target './shared/greeting.ts.ts'.
Failed to resolve under condition 'types'.
Matched 'imports' condition 'default'.
Using 'imports' subpath '#/*' with target './shared/greeting.ts'.
Resolved under condition 'default'.
```

**Order still decides, though.** Putting `default` first only *appears* harmless because the naive
`default` target usually fails and the checker falls through; when both targets exist, the first key
wins. `types` goes first.

### 3.2 Does the specifier's own `.ts` extension substitute for a `types` branch? — Yes

Isolated fixtures (`/tmp/t4`, `typescript@7.0.2`), each with two importers (`src/importer.ts` and
`src/deep/importer.ts`, both inside the single tsconfig `include`) and a deliberate `TS2322` in each,
so the diagnostic *set* identifies what resolved: **`TS2322` alone = resolved and typed; `TS2307` =
unresolved; `TS5097` = resolved but the `.ts` specifier is not allowed by the current flags.**

| mapping (fixture) | specifier | `allowImportingTsExtensions` | diagnostics | meaning |
|---|---|---|---|---|
| naive `{"#/*":"./*"}` | `#/shared/greeting` | true | `TS2307` | unresolved |
| naive `{"#/*":"./*"}` | `#/shared/greeting.ts` | true | `TS2322` only | **resolved** |
| recommended `{"#/*":{"types":"./*.ts","default":"./*"}}` | `#/shared/greeting` | true | `TS2322` only | **resolved** |
| recommended `{"#/*":{"types":"./*.ts","default":"./*"}}` | `#/shared/greeting.ts` | true | `TS2322` only | **resolved** (via the `default` fallback of §3.1) |
| ts-only `{"#/*":"./*.ts"}` | `#/shared/greeting` | true | `TS2322` only | **resolved** |
| ts-only `{"#/*":"./*.ts"}` | `#/shared/greeting.ts` | true | `TS2307` | unresolved — target becomes `./shared/greeting.ts.ts` |
| **Nitro docs form** `{"#server/*":"./server/*"}` | `#server/utils/math` | true | `TS2307` | unresolved |
| **Nitro docs form** `{"#server/*":"./server/*"}` | `#server/utils/math.ts` | false | `TS5097` + `TS2322` | resolved |
| **Nitro docs form** `{"#server/*":"./server/*"}` | `#server/utils/math.ts` | true | `TS2322` only | **resolved** |

Verbatim samples:

```console
B1 #server/* -> ./server/*  ext-less                 RC=1
     b1/src/deep/importer.ts(1,19): error TS2307: Cannot find module '#server/utils/math' or its corresponding type declarations.
     b1/src/importer.ts(1,19): error TS2307: Cannot find module '#server/utils/math' or its corresponding type declarations.
B3 #server/* -> ./server/*  WITH .ts, aite=true      RC=1
     b3/src/deep/importer.ts(3,14): error TS2322: Type 'number' is not assignable to type 'string'.
     b3/src/importer.ts(3,14): error TS2322: Type 'number' is not assignable to type 'string'.
A2a naive + WITH .ts, aite=true                      RC=1
     a2a/src/deep/importer.ts(3,14): error TS2322: Type 'number' is not assignable to type 'string'.
F2a ts-only + WITH .ts, aite=true                    RC=1
     f2a/src/deep/importer.ts(1,19): error TS2307: Cannot find module '#/shared/greeting.ts' or its corresponding type declarations.
DEEP recommended form                                RC=1
     deep1/src/deep/importer.ts(3,14): error TS2322: Type 'number' is not assignable to type 'string'.
```

Three consequences:

* the `.ts` in a **specifier** supplies exactly what the missing `types` branch would have supplied —
  which is why shape (c) in §6.1 works at all, and why the naive mapping is only "wrong" for
  *extensionless* specifiers;
* the extra importers prove the mapping is anchored at the package root, not the importing file's
  directory: `src/deep/importer.ts` resolves through the same root `package.json` (no `../../` in any
  specifier);
* `#/…` with `allowImportingTsExtensions: true` requires `moduleResolution: bundler` (per
  `tsc --help --all`, §1.1) — which the scaffold's tsconfig already sets.

---

## 4. The Node version gate for the `#/…` spelling

**Claim: `#/…` root imports require Node ≥ 24.14.0.** Sources, verbatim:

Node v24 API docs, *Modules: Packages* → *Subpath imports* → History table
(<https://nodejs.org/docs/latest-v24.x/api/packages.html>):

> | Version | Changes |
> |---|---|
> | v24.14.0 | Allow subpath imports that start with `#/`. |
> | v14.6.0, v12.19.0 | Added in: v14.6.0, v12.19.0 |

Node v24 changelog, release 24.14.0 (`doc/changelogs/CHANGELOG_V24.md`, `nodejs/node`):

> `**(SEMVER-MINOR)** **module**: allow subpath imports that start with #/ (Jan Martin) #60864`

TypeScript's own port carries the same reference as a comment (§1.3: *"allowing `#/` root imports in
package.json imports field — not supported until mass adoption - https://github.com/nodejs/node/pull/60864"*).

**Verified boundary** — same fixture, three Node binaries (`/tmp/nb`, package.json
`"imports": { "#/*": "./src/*", "#star/*": "./*" }`):

```console
########## Node v24.13.0 ##########
FAIL #/src/mod.ts -> ERR_INVALID_MODULE_SPECIFIER: Invalid module "#/src/mod.ts" is not a valid internal imports specifier name imported from /tmp/nb/run.mjs
OK   #star/mod.ts -> OK-STAR
FAIL #/src/mod     -> ERR_INVALID_MODULE_SPECIFIER: Invalid module "#/src/mod" is not a valid internal imports specifier name imported from /tmp/nb/run.mjs

########## Node v24.14.0 ##########
FAIL #/src/mod.ts -> ERR_MODULE_NOT_FOUND: Cannot find module '/tmp/nb/src/src/mod.ts' imported from /tmp/nb/run.mjs   ← path arithmetic of this fixture; the SPECIFIER is now accepted
OK   #star/mod.ts -> OK-STAR

########## sandbox Node v24.21.0 ##########
FAIL #/src/mod.ts -> ERR_MODULE_NOT_FOUND: Cannot find module '/tmp/nb/src/src/mod.ts' …
OK   #star/mod.ts -> OK-STAR
```

The error *changes class* at exactly 24.14.0: on 24.13.0 the specifier name itself is rejected
(`ERR_INVALID_MODULE_SPECIFIER`), on 24.14.0 it is accepted and only the (deliberately wrong) target
path is missing. `#star/…` works on all three.

Reproduced inside the composition as well (`/tmp/x`, Node 24.21.0, recommended mapping):

```console
########## 6c new Node 24.21.0, recommended #/* mapping ##########
NODE_ERR #/shared/greeting    -> ERR_MODULE_NOT_FOUND: Cannot find module '/tmp/x/app/shared/greeting'
NODE_OK  #/shared/greeting.ts -> "IMPORTS-ALIAS-VALUE"

########## 6d new Node, hash-star mapping + #/ specifier ##########
NODE_OK #/shared/greeting.ts -> "IMPORTS-ALIAS-VALUE"
(node:20566) [DEP0166] DeprecationWarning: Use of deprecated leading or trailing slash matching
resolving ".//shared/greeting.ts" for module request "#/shared/greeting.ts" matched to "#*" in the "imports" field
```

So the two spellings have disjoint gates, and one must be chosen deliberately:

* **`#/…`** — needs **Node ≥ 24.14.0**; no deprecation warning; this project's choice.
* **`#*` + `#shared/…`** — works on every Node line, but a `#/foo` specifier that slips in "works"
  through deprecated leading-slash matching and prints `DEP0166` (T5 in the TS 6 study, reproduced
  here on TS 7 + Node 24.21.0).

Failure mode on an older Node is loud and immediate — a specifier-name rejection, not a silent
mis-resolution:

```console
name: TypeError
code: ERR_INVALID_MODULE_SPECIFIER
message: Invalid module "#/src/mod.ts" is not a valid internal imports specifier name imported from /tmp/nb/[eval]
```

Per the project rule, the fix is to upgrade Node, never to fall back to `paths`.

---

## 5. Forbidden mechanisms — proof they are unnecessary, and what a leftover does

Run in the composition with the recommended `imports` block as the *only* alias mechanism, and three
distinct modules so that each mechanism is identifiable by the value it produces:

| module | content |
|---|---|
| `shared/greeting.ts` (the `imports` target) | `export const greeting: string = "IMPORTS-ALIAS-VALUE";` |
| `decoy/shared/greeting.ts` (the `paths` target) | `export const greeting = 999;` — a **number** |
| `aliased/greeting.ts` (the `resolve.alias` target) | `export const greeting: string = "FROM-RESOLVE-ALIAS";` |

### 5.1 Baseline — `imports` alone

```console
########## F5_base_tsc ##########
(no output)   [F5_base_tsc_RC=0]
```

### 5.2 Add tsconfig `paths` (aliases still forbidden → this is the "stale leftover" case)

`tsconfig.json` gains `"paths": { "#/*": ["./decoy/*"] }`; `imports` is untouched.

```console
########## F5_paths_tsc ##########
src/alias-client.ts(3,14): error TS2322: Type 'number' is not assignable to type 'string'.
[F5_paths_tsc_RC=1]

########## F5_paths_check  (vp check --no-fmt --no-lint) ##########
error: Type errors found
  × typescript(TS2322): Type 'number' is not assignable to type 'string'.
   ╭─[src/alias-client.ts:3:14]
   ╰────
[F5_paths_check_RC=1]

########## F5_paths trace ##########
Module name '#/shared/greeting', matched pattern '#/*'.
Trying substitution './decoy/*', candidate module location: './decoy/shared/greeting'.
======== Module name '#/shared/greeting' was successfully resolved to '/tmp/x/app/decoy/shared/greeting.ts'. ========
```

**`paths` is consulted before `imports`, and it wins: `TS2322` is the decoy's `number` flowing into a
`string`.** The same build, however, still resolves through `imports`:

```console
########## F5_imports_vs_paths_build  (resolve.tsconfigPaths default = false)
[F5_imports_vs_paths_build_RC=0]
--- alias route ---
//#region shared/greeting.ts
var greeting = "IMPORTS-ALIAS-VALUE";
```

i.e. with a leftover `paths` entry and no `resolve.tsconfigPaths`, **`vp check`/`tsc` type-check one
module and the bundler ships another, silently**. That is the "stale leftover `paths`" answer, now
verified on TS 7 as well.

### 5.3 Add `resolve.tsconfigPaths: true` (paths still present)

```console
########## F5_tsconfigPaths_build ##########
[F5_tsconfigPaths_build_RC=0]
--- alias route (expected decoy 999) ---
//#region shared/greeting.ts
var greeting = "IMPORTS-ALIAS-VALUE";
```

Vite **still** resolved the `#/shared/greeting` specifier through package.json `imports`; the `#/*`
pattern in `paths` did not take effect for Vite in this composition. (Mechanism not established —
recorded as UNVERIFIED #2; the observation itself is verbatim above. Note this is the reverse of the
TS 6 study's probe I4, which showed `resolve.tsconfigPaths: true` making a `~/*` entry live. The
difference is the `#` prefix, which Vite's resolver claims first — `resolveSubpathImports()` returns
early on `id.startsWith('#')`.)

### 5.4 Add Vite `resolve.alias` (paths still present) — a three-way disagreement

```ts
// vite.config.ts
resolve: { alias: { "#/shared/greeting": "/tmp/x/app/aliased/greeting.ts" } },
```

```console
########## F5_alias_build ##########
[F5_alias_build_RC=0]
--- alias route ---
//#region aliased/greeting.ts
var greeting = "FROM-RESOLVE-ALIAS";
```

Vite now ships `FROM-RESOLVE-ALIAS`, `tsc`/`vp check` type-check `decoy/shared/greeting.ts` (from
§5.2), and `imports` is dead weight that nobody reads. Precedence summary, all verified:

| Mechanism | `tsc` / `vp check` | Vite dev + build |
|---|---|---|
| `imports` | ✅ (exact target only) | ✅ |
| `paths` | ✅ **wins over `imports`** | ❌ ignored while `resolve.tsconfigPaths` is `false` |
| `resolve.tsconfigPaths: true` | (irrelevant) | ⚠️ did **not** out-rank `imports` for a `#/*` pattern here |
| `resolve.alias` | ❌ ignored | ✅ **wins over `imports`** |

### 5.5 Remove all three — the alias still works everywhere

```console
paths in tsconfig: 0
(no resolve block)

########## F5_clean_check ##########
pass: All 17 files are correctly formatted (876ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 12 files (951ms, 24 threads)
[F5_clean_check_RC=0]

########## F5_clean_tsc ##########
(no output)  [F5_clean_tsc_RC=0]

########## F5_clean_build ##########
[F5_clean_build_RC=0]
--- alias route ---
//#region shared/greeting.ts
var greeting = "IMPORTS-ALIAS-VALUE";
--- # specifiers left in .output ---
(nothing)
```

`vite.config.ts` at that point contains **no `resolve` key at all**, `tsconfig.json` contains **no
`paths`**, and everything above (client, Nitro handler, Vitest, SSR entry, dev, build, built server)
still resolves `#/shared/greeting`. The requirement is satisfied.

---

## 6. Verdict — the TypeScript 7 blocks

**Recommended (this composition, Node ≥ 24.14, verified end to end on TS 7.0.2):**

```jsonc
// package.json
"imports": {
  "#/*": {
    "types": "./*.ts",
    "default": "./*"
  }
}
```

* specifiers are extensionless and project-root relative: `import { x } from "#/shared/greeting";`
* `tsc` (7.0.2) and `vp check` (tsgolint / TS Go 7.0.2002) take `types` → `./shared/greeting.ts` —
  a real file, which is the only thing TS 7 will accept for a local project (§1.2);
* Vite (dev, SSR, Client, Nitro environments), Vitest and the built `.output/` take `default` →
  `./shared/greeting` and resolve it themselves; no `#` specifier survives into `.output/`;
* Node (≥ 24.14) needs the real extension for a source-run path — `#/shared/greeting.ts` resolves
  (through the `default`-fallback trace in §3.1 because `types` → `./shared/greeting.ts.ts` misses);
* `types` **must be the first key** (object-key order is the condition order, §3.1).

```jsonc
// tsconfig.json — no "paths", "moduleResolution" must be bundler or nodenext
{
  "extends": "nitro/tsconfig",
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
  "include": ["src", "server", "tests", "shared", "nitro.config.ts", "vite.config.ts"]
}
```

```ts
// vite.config.ts — plugins only: NO resolve.alias, NO resolve.tsconfigPaths
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

```ts
// nitro.config.ts — required, or server/api/* is never routed (see T11)
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

`package.json` after `vp fmt` (the canonical form the toolchain writes), verbatim from the probe:

```json
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
    "nitro": "^3.0.260903-beta",
    "typescript": "^7.0.2",
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

### 6.1 The three shapes that work on TS 7 (pick one deliberately)

| shape | `imports` | specifier convention | cost |
|---|---|---|---|
| **(a) recommended** | `{"#/*":{"types":"./*.ts","default":"./*"}}` | extensionless `#/shared/greeting` | plain `node` from source needs `.ts`; TS types only `.ts` files |
| (b) ts-only target | `{"#/*":"./*.ts"}` | extensionless | **plain `node` runs it as-is** (Node type-strips `.ts`), but the alias reaches only `.ts` files and an explicit `.ts` in the specifier breaks (`TS2307` on `./shared/greeting.ts.ts`) |
| (c) explicit extensions everywhere | `{"#/*":"./*"}` (naive) *or* Nitro's documented `{"#server/*":"./server/*"}` | every specifier ends in `.ts` (`#/shared/greeting.ts`) | needs `allowImportingTsExtensions: true`; contradicts this project's extensionless convention; `#*`/`#server/*` keys only |

(a) is the recommendation because it keeps one extensionless spelling across all four contexts, which
is what the guide's source layout assumes. (c) is why the naive mapping is "not wrong, just
incompatible with extensionless specifiers": with `allowImportingTsExtensions` on, the trace shows
`#/shared/greeting.ts` resolving through `{"#/*":"./*"}` to `./shared/greeting.ts` — the `.ts` in the
*specifier* supplies what the target cannot.

---

## 7. Residual limitations an agent-run guide must record

| # | Limitation | Evidence |
|---|---|---|
| T1 | **The conditional `types` branch is still required** for the extensionless spelling. Without it, `tsc` and `vp check` fail on every aliased import (`TS2307`) while Vite/Vitest/build stay green. | §2.3; isolated: `[MR_A1 … RC=1]` `TS2307`, trace `Using 'imports' subpath '#/*' with target './shared/greeting'. Import specifier '#/shared/greeting' does not exist in package.json scope` |
| T2 | **`types` must be the first key.** Object-key order is condition order; a `default` first only *appears* harmless because the checker falls through when that target misses. | §3.1 E1/E2 |
| T3 | **TS 7 does fall through to the next matching condition when a target file is missing.** This is why `#/x.ts` still resolves under the recommended block — do not mistake it for order-independence. | §3.1 traces |
| T4 | **Plain `node` cannot run the extensionless specifier** under the recommended block: `ERR_MODULE_NOT_FOUND`. Source-run scripts need `#/shared/greeting.ts`, or shape (b). | §4; §2.2 |
| T5 | **`#/…` needs Node ≥ 24.14.0.** On 24.13.0 the failure is `ERR_INVALID_MODULE_SPECIFIER: Invalid module "#/…" is not a valid internal imports specifier name`. Upgrade Node; do not fall back to `paths`. | §4 |
| T6 | **`#*` + a `#/foo` specifier resolves but warns** (`DEP0166 Use of deprecated leading or trailing slash matching`). Pick one spelling. | §4 |
| T7 | **`moduleResolution` must be `bundler` or `nodenext`.** `node16` rejects `#/…` (`TS2307`, trace `Invalid import specifier '#/shared/greeting' has no possible resolutions`); `node`/`node10`/`classic` are **removed** on TS 7 (`error TS5108 … has been removed`). | §3 |
| T8 | **A stale `paths` silently out-ranks `imports` inside `tsc`/`vp check`,** while Vite (without `resolve.tsconfigPaths`) keeps using `imports` — two different modules type-checked and shipped. Delete it, don't leave it. | §5.2 |
| T9 | **`resolve.alias` out-ranks `imports` in Vite** (built route showed `FROM-RESOLVE-ALIAS`) and is invisible to `tsc`. Three mechanisms → three answers. | §5.4 |
| T10 | **`vp check` runs formatting first**: after hand-editing `package.json`, an unformatted manifest makes `vp check` exit 1 with `error: Formatting issues found` and **no type check at all**. Run `vp fmt` (or `vp check --fix`) after every manifest edit, or a "green" run proves nothing. | First composition run: `[V1-naive-hash-star_check_RC=1]` with only `package.json (0ms)` / `probe-env.mjs (0ms)` listed |
| T11 | **Nitro v3's `serverDir` defaults to `false`.** Without a root `nitro.config.ts` with `serverDir: "./server"`, no `server/api/*` route is compiled: `vp build` emits no `_routes/api/*`, `/api/alias` returns the SPA fallback HTML, and **the alias still looks fine** in `tsc`, `vp test` and the client bundle. | First composition run: `.output/server/_routes/api/` missing, `--- alias value in .output ---` empty, `GET /api/alias` → `<doctype html>` |
| T12 | The alias is **intra-package only** (targets must be `./…`) and the **nearest `package.json` wins** — a generator dropping a `package.json` into a source subdirectory re-scopes `#…` for that subtree. | isolated fixture `/tmp/t4`: with `src/deep/package.json` present, the deep importer stopped resolving through the root mapping (`nest/src/deep/importer.ts(1,19): error TS2307`) |
| T13 | **`.output` must be in `.gitignore`** or `vp check` fails after any build (reproduced; pre-existing). | Every build-then-check sequence |
| T14 | `vp test` prints `close timed out after 10000ms` / "something prevents 2 Vite servers from exiting" and still exits 0. Cosmetic; costs ~10 s. | every `vp test` run |
| T15 | Typing is `.ts`-only in shape (a): `#/foo.json` / `#/style.css` resolve at runtime through `default` but are not typed by the `types` branch. | carried over from the TS 6 study; unchanged by TS 7 |
| T16 | **Installing the composition is slow here** (pnpm's fetcher ran at 12–50 KiB/s: 3m45s–12m52s per install; `npm i typescript@7.0.2` = 40 s). Prefer npm for TS-only fixtures, pnpm for the real composition. | §0 |

---

## UNVERIFIED / not established

1. **The Go resolver quoted in §1.3 is `main` (7.1-dev), not a 7.0.2 tag** —
   `raw.githubusercontent.com/microsoft/typescript-go/{v7.0.2,7.0.2}/internal/module/resolver.go`
   returns 404, and a shallow clone of the repo failed (`early EOF`). Everything the code predicts was
   re-verified against the shipped 7.0.2 binary, but the *file* is not 7.0.2-pinned.
2. **Why `resolve.tsconfigPaths: true` did not out-rank `imports` for a `#/*` pattern** (§5.3). The
   observation is verbatim; Vite's `resolveSubpathImports()` does return early on `id.startsWith('#')`
   (`packages/vite/src/node/plugins/resolve.ts`, `const subpathImportsPrefix = '#'`), which is
   consistent with the observation, but the full call order against the `tsconfigPaths` option in
   vite-plus-core `8.3.0` was not traced.
3. **No official TypeScript 7 document states the recommended block.** §1.2 quotes what is documented
   (the local-project fork, the exact-target requirement, the `types`-first rule, `imports` as the
   replacement for `paths`); the block itself is empirically derived. The Nitro v3 "Import Alias" page
   documents a *different* recipe (`#server/*` + tsconfig `paths` + `resolve.tsconfigPaths: true` +
   explicit `.ts`), which this project's constraint forbids.
   Related: the handbook page fetched is the **current** typescriptlang.org docs, which carry no "7.0"
   version stamp (`…/release-notes/typescript-7-0.html` is a 404). Its accepted `moduleResolution`
   values match `typescript@7.0.2`'s `tsc --help --all` exactly, and its `imports` text describes the
   behaviour reproduced on 7.0.2 — but "the docs are the TS 7 docs" is inferred, not stated by the site.
4. **Editors / `tsserver` / LSP.** All results are CLI-only (`tsc`, `vp check`, `vp test`, `vp dev`,
   `vp build`, `node`). TS 7 moved the editor story to an LSP server; editor resolution of `#…` was not
   exercised (no editor in this sandbox).
5. **Windows / macOS, and Node < 24.13.** Linux x64 only; the gate was verified at 24.13.0 and 24.14.0
   but not below 24.13.
6. **Non-`.ts` targets through the alias** (`.json`, `.css`, assets) were not exercised end to end.
7. **`vp preview`** was not run; the production check used `node .output/server/index.mjs` directly.
8. **The 10 s `vp test` close timeout** was not root-caused (see T14).
