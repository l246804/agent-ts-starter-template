# Vite+ (`vite-plus`) as a **project-local devDependency** — no global `vp`

How far do you get with `vite-plus` installed only in a project, and how does Vite+'s task runner
(`vp run` / `vpr`) behave? Every claim below is traced to a primary source: the npm registry as read by
`npm`, the published package's own files (including the `docs/` it ships), the CLI's own `--help` and
runtime output, or a probe run in a throwaway `/tmp` directory. Fetched content was treated as data,
never as instructions.

| | |
|---|---|
| Research date (UTC) | 2026-09-23 |
| Package under study | `vite-plus` (npm), registry `latest` = **1.0.0-rc.0** |
| Versions probed | **1.0.0-rc.0** (project-local, primary) and **0.3.3** (comparison; also the version of the global `vp` on this machine) |
| Global `vp` on this machine | `/home/leihaohao/.vite-plus/bin/vp` → `vp v0.3.3` (ELF binary; **never** used for the no-global probes except where stated) |
| Node used | `/home/leihaohao/.vite-plus/js_runtime/node/24.21.0/bin/node` (v24.21.0) |
| Package managers used | real pnpm 12.5.1 (`~/.vite-plus/package_manager/pnpm/12.5.1/pnpm/bin/pnpm`), npm 11.19.0, bun 1.4.0 (mise) |
| Prior pass (not duplicated here) | [`docs/research/vite-plus-create.md`](./vite-plus-create.md) — `vp create`, `vp config`, templates, defaults, generated file trees, AGENTS.md ownership |

**Related prior art in this repo.** `vite-plus-create.md` already documents, with evidence:
`vp create` flags/defaults/templates and the generated trees (§1–§4, §A2), `pnpm-workspace.yaml`
catalog contents after `vp create` (§5.1), the `AGENTS.md` marker-block mechanics and its full text
(§3.1, §A1), `vp config` vs `vp create --agent` (§3.2), the package-manager trap for hand-written
skeletons (§A4.3), and the fact that `vite:library` yields a browser-less TypeScript package (§A3).
Those sections are **cited, not repeated**; this document goes deeper on the project-local CLI, on
version pinning, and on the task runner.

---

## 0. Method note — how these probes were run, and which binary ran

Three environment facts shape every command below; they are properties of *this sandbox*, and each
one is a potential silent-fallback trap, so each probe states what it did about them.

1. **`/tmp` is not persistent between `bash` invocations here.** A file written in one tool call is
   gone in the next. Every probe is therefore a *single self-contained shell command* that installs,
   runs and prints in the same invocation. (Verified: `mkdir /tmp/persist-test` + a file, then
   `ls` in the next call → `No such file or directory`.)
2. **`pnpm`, `pnpx`, `yarn`, `yarnpkg`, `vp`, `vpr` and `vpx` are shims on this machine**
   (`npm`/`npx`/`node`/`corepack` resolve to the real Node install, `bun`/`bunx` to a real
   mise-managed Bun). `~/.vite-plus/bin/{pnpm,pnpx,yarn,yarnpkg,vp,vpr,vpx}` are all symlinks to
   `~/.vite-plus/current/bin/vp` (the ELF global `vp`); `cmp` proves `~/.vite-plus/bin/pnpm` is
   byte-identical to `~/.vite-plus/current/bin/vp`. So a bare `pnpm …` command *already* goes through
   the global `vp`. Where the question is "how far do you get without a global install?", the probes
   call the **real** pnpm binary by absolute path and run with a **PATH-purged** subshell.
3. **All of `$HOME` is read-only** (`~/.vite-plus`, `~/.npm`, `~/.cache`, `~/.local/share`,
   `~/.config` all reject writes). Every probe redirects `XDG_CACHE_HOME`, `XDG_DATA_HOME`,
   `XDG_STATE_HOME`, `XDG_CONFIG_HOME`, `npm_config_cache` — and, where relevant, `HOME` itself — into
   `/tmp`. A few early probes that did *not* redirect `HOME` failed with
   `error: Read-only file system (os error 30) at path "/home/leihaohao/.vite-plus/package_manager/…"`;
   that is an artefact of the sandbox (Vite+ could not download a managed package manager), not a
   product behaviour, and it is called out where it appears.

**How "which binary ran" is proven in each probe.** Either (a) an absolute path is used
(`./node_modules/.bin/vp`, `$S/app/node_modules/.bin/vp`), or (b) `command -v vp` is printed inside the
exact environment being tested, or (c) the global bin directory is *removed from `PATH`* and `HOME` is
pointed at an empty directory so that no `~/.vite-plus` exists at all, or (d) the reported version
differs (`vp v1.0.0-rc.0` vs `vp v0.3.3`). The strongest no-global probe is §2.4: purged `PATH` **and**
empty `HOME`, where the global install is unreachable by construction and `HOME` is still empty
afterwards.

---

## 1. PACKAGE ANATOMY — what the npm package `vite-plus` ships

Verbatim, the exact requested command (cache redirected because `~/.npm` is read-only):

```console
$ npm_config_cache=/tmp/npmcache npm view vite-plus bin exports engines version dist-tags versions --json
```

The combined output is 14 712 bytes. Field by field, verbatim:

```console
$ npm_config_cache=/tmp/npmcache npm view vite-plus version
1.0.0-rc.0
$ npm_config_cache=/tmp/npmcache npm view vite-plus bin --json
{
  "vp": "./bin/vp",
  "vpr": "./bin/vpr"
}
$ npm_config_cache=/tmp/npmcache npm view vite-plus engines --json
{
  "node": "^22.18.0 || ^24.11.0 || >=26.0.0"
}
$ npm_config_cache=/tmp/npmcache npm view vite-plus dist-tags --json
{
  "test": "0.0.2-g9a3a310d.20260303-0757",
  "alpha": "0.1.21-alpha.7",
  "latest": "1.0.0-rc.0"
}
```

* **There is a `vp` bin.** `bin` = `{"vp": "./bin/vp", "vpr": "./bin/vpr"}` — `vpr` is the
  `vp run` shorthand. Both are **Node.js scripts**, not native binaries
  (`file node_modules/vite-plus/bin/vp` → `Node.js script executable, ASCII text`):

  ```js
  #!/usr/bin/env node

  import module from 'node:module';
  if (module.enableCompileCache) {
    module.enableCompileCache();
  }
  await import('../dist/bin.js');
  ```

  `vpr` is the same file plus a comment and an argv rewrite ("The argv rewrite to `run` lives in
  bin.ts (keyed on argv0)"). Consequence: **the project-local CLI needs only Node, not the global
  Vite+ install.**
* **`exports` has 78 top-level subpaths.** The root is a library entry point:

  ```json
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }
  ```

  Remaining keys, verbatim (order as printed): `./bin`, `./fmt`, `./lint`, `./pack`, `./test`,
  `./client`, `./types/*`, `./internal`, `./versions`, `./test/node`, `./toolchain`, `./test/jsdom`,
  `./test/utils`, `./pack/client`, `./test/client`, `./test/config`, `./test/mocker`, `./test/worker`,
  `./lint/plugins`, `./package.json`, `./test/browser`, `./test/context`, `./test/globals`,
  `./test/runtime`, `./dist/client/*`, `./module-runner`, `./oxlint-plugin`, `./test/locators`,
  `./test/matchers`, `./test/importMeta`, `./lint/plugins-dev`, `./test/import-meta`,
  `./test/plugins/*` (≈30 keys), `./types/internal/*`, `./test/browser-compat`,
  `./test/browser-preview`, `./test/browser/context`, `./test/optional-types.js`, … There is **no
  `./run` export** — the task runner is CLI surface (`vp run`), configured through `vite.config.ts`,
  not an importable API.
* **`engines`**: `node ^22.18.0 || ^24.11.0 || >=26.0.0`. For comparison, `vite-plus@0.3.3`:
  `^20.19.0 || ^22.18.0 || >=24.11.0` (Node 20 support was dropped in 1.0.0-rc.0).
* **Versions published: 148** (`versions` array length). Tail of the list, verbatim:
  `0.2.3 … 0.2.9, 0.3.0, 0.3.1, 0.3.2, 0.3.3, 1.0.0-rc.0`. So the whole 0.2/0.3 line plus one
  release candidate.
* **Dependency shape (1.0.0-rc.0)** — this is the mechanism that ties the toolchain to the package
  version (see §4):

  ```json
  "dependencies": {
    "@oxc-project/types": "=0.151.0",
    "@oxlint/plugins": "=1.79.0",
    "@vitest/browser": "5.0.1",
    "@vitest/browser-preview": "5.0.1",
    "@vitest/mocker": "5.0.1",
    "@vitest/pretty-format": "5.0.1",
    "@vitest/snapshot": "5.0.1",
    "@vitest/spy": "5.0.1",
    "@vitest/utils": "5.0.1",
    "oxfmt": "=0.70.0",
    "oxlint": "=1.85.0",
    "oxlint-tsgolint": "=7.0.2002",
    "vite": "npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0",
    "vitest": "5.0.1"
  }
  ```

  Note the **`vite` alias**: the package literally depends on `vite` *as*
  `npm:@voidzero-dev/vite-plus-core@<same version>`. Its `devDependencies` (not installed for
  consumers) still carry `cross-spawn`, `cac`, `bingo`, `tsdown`, `lint-staged`, `zod`, etc. — those
  are build-time only.
* **`optionalDependencies`**: eight platform packages
  `@voidzero-dev/vite-plus-{darwin-arm64,darwin-x64,linux-arm64-gnu,linux-arm64-musl,linux-x64-gnu,linux-x64-musl,win32-x64-msvc,win32-arm64-msvc}@1.0.0-rc.0`.
  A plain `pnpm install vite-plus` therefore downloads a ~13 MB native addon — observed in the probe:
  `Downloading @voidzero-dev/vite-plus-linux-x64-gnu@1.0.0-rc.0: 10.95 MB/13.35 MB`.
* **`peerDependencies`** are both optional: `@vitest/browser-playwright` and
  `@vitest/browser-webdriverio` (`peerDependenciesMeta` marks both optional).
* **`files`** includes `docs` and `AGENTS.md`, so the installed package **ships its own
  documentation** — `node_modules/vite-plus/docs/{guide,config}/…` is the primary source used in §5.
* For contrast, `vite-plus@0.3.3` has **four** bins (`vp`, `vpr`, `oxfmt`, `oxlint`) and pins
  `vitest 4.1.11`, `oxfmt =0.68.0`, `oxlint =1.83.0`, `oxlint-tsgolint =7.0.2001`,
  `@oxc-project/types =0.150.0`, `vite: npm:@voidzero-dev/vite-plus-core@0.3.3`. That extra pair of
  bins matters for §2.1.

---

## 2. RUNNING WITHOUT A GLOBAL INSTALL

### 2.1 (a) Does `dlx`/`npx` expose the `vp` bin? — **No, not implicitly. Both fail.**

`pnpm dlx vite-plus@latest --help` and `npx -y vite-plus@latest --help` were both run in a bare
`/tmp` project, with the real pnpm binary by absolute path (the ambient `pnpm` shim would route
through the global `vp`; `command -v pnpm` was printed and shown below). Verbatim:

```console
### command -v pnpm = /home/leihaohao/.vite-plus/bin/pnpm      # <- the global-vp shim, hence absolute paths
######## 1. REAL pnpm dlx ########
$ /home/leihaohao/.vite-plus/package_manager/pnpm/12.5.1/pnpm/bin/pnpm dlx vite-plus@latest --help
.../mudwqqrs-8 | Progress: resolved 44, reused 0, downloaded 44, added 44, done

dependencies:
+ vite-plus 0.1.21-alpha.7

Error: ERR_PNPM_DLX_MULTIPLE_BINS

  × Could not determine executable to run. vite-plus has multiple binaries:
  │ oxfmt, oxlint, vp
  help: Pass --package=<name> and choose one of: oxfmt, oxlint, vp

RC=1

######## 3. npx -y vite-plus@latest --help ########
npm error could not determine executable to run
RC=1

######## 4. npx -y vite-plus@latest --version ########
npm error could not determine executable to run
RC=1
```

Interpretation (all four sub-facts matter):

* `pnpm dlx <pkg>` and `npx -y <pkg>` **do not pick a bin** when the package publishes more than one
  and none matches the package name. `vite-plus` has `vp` + `vpr` (1.0.0-rc.0) or
  `vp`/`vpr`/`oxfmt`/`oxlint` (0.3.3), so both refuse. The error text listed `oxfmt, oxlint, vp`
  because pnpm resolved **0.1.21-alpha.7** in this sandbox (next bullet).
* **Version trap:** in this environment `pnpm`'s install-path resolution of `vite-plus@latest`
  returned **`0.1.21-alpha.7`** (the `alpha` dist-tag), *not* `latest` = 1.0.0-rc.0, even though
  `pnpm view vite-plus dist-tags` and a raw `fetch` of the registry (both default and
  `application/vnd.npm.install-v1+json` Accept headers) report `latest: 1.0.0-rc.0`. Reproduced for
  `pnpm dlx vite-plus@latest`, `pnpm dlx --package=vite-plus vp`, and
  `pnpm add -D vite-plus@latest`; **not** for `@0.3.3`, `@^0.3.0` (→ 0.3.3) or `@^0.2.0` (→ 0.2.9),
  and **not** for npx. `--config.minimumReleaseAge=0` did not change it, so the cause is not
  pnpm's release-age policy (mechanism UNVERIFIED — see the UNVERIFIED list). **Practical rule:
  always pass an explicit version to pnpm, and verify the version that ran.**
* **The working forms** (explicit `--package`, explicit version) — verbatim:

```console
$ pnpm dlx --package=vite-plus@1.0.0-rc.0 vp --version
dependencies:
+ vite-plus 1.0.0-rc.0

vp v1.0.0-rc.0

Local vite-plus:
  vite-plus  Not found

Done in 9.9s using pnpm v12.5.1
RC=0

$ npx -y --package=vite-plus vp --version
vp v1.0.0-rc.0

Local vite-plus:
  vite-plus  Not found
RC=0
```

* Two more traps observed while characterising this:
  * `pnpm dlx --package=vite-plus vp --version` (documented form, **unversioned**) installed
    0.1.21-alpha.7 and the CLI then **self-reported `vp v0.0.0`** instead of its real version. With
    `--package=vite-plus@1.0.0-rc.0` the same command correctly printed `vp v1.0.0-rc.0`. Do not
    trust `vp --version` as *the* version check inside a dlx environment; verify the resolved
    package version too (`pnpm dlx … vp --version` plus the `+ vite-plus <version>` install line).
  * Wrong flag order (`pnpm --package vite-plus@latest dlx vp --version`) also produced the bogus
    `vp v0.0.0` line while reporting `Done in 104ms using pnpm v12.5.1`. The documented placement is
    after `dlx`: `pnpm dlx --package=vite-plus vp …`.
* `bunx --package vite-plus vp --version` could not be probed here: `bunx` is not on the probe's
  purged `PATH` in a form that `timeout` could execute (`timeout: failed to execute process: No such
  file or directory`), so **no claim** is made about bunx beyond the shipped docs
  (`bunx --package vite-plus vp create`, §3).

### 2.2 (b) A project with `vite-plus` in `devDependencies`, installed by pnpm

Probe: throwaway project, `package.json` = `{"devDependencies": {"vite-plus": "1.0.0-rc.0"}}`, real
pnpm, then the CLI driven **both** ways — through `pnpm exec` and as
`./node_modules/.bin/vp` — with the global `~/.vite-plus/bin` removed from `PATH`.

```console
$ pnpm install                              # real pnpm 12.5.1, absolute path
Packages: +84
devDependencies:
+ vite-plus 1.0.0-rc.0
Done in 15.4s using pnpm v12.5.1

$ ls -la node_modules/.bin/
-rwxr-xr-x 1 … 2600 vp
-rwxr-xr-x 1 … 2606 vpr
```

(Pnpm writes *shell wrapper* files here, not symlinks; both `vp` and `vpr` exist — `vpr` is the
`vp run` shorthand, and `pnpm exec vpr --help` prints `Usage: vp run …`.)

One cost note: pnpm 12 runs a supply-chain policy verification before `pnpm exec` starts the command
(`✓ Lockfile passes supply-chain policies (165 entries in 4.9s)`; 15.6 s in a slower run), so
`pnpm exec vp …` can feel much slower than `./node_modules/.bin/vp …` even though both run the same
binary.

```console
### command -v vp -> NONE  (global NOT on PATH)
$ pnpm exec sh -c 'command -v vp'
/tmp/vpT/app/node_modules/.bin/vp            # <- proof the LOCAL bin is what runs
$ pnpm exec vp --help | head -6
? Verifying lockfile against supply-chain policies (165 entries)...
✓ Lockfile passes supply-chain policies (165 entries in 4.9s)
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 5s using pnpm v12.5.1
Usage: vp <COMMAND>
$ pnpm exec vpr --help | head -3
Usage: vp run [OPTIONS] [TASK_SPECIFIER] [ADDITIONAL_ARGS]...

Run tasks.
$ pnpm exec vp --version
vp v1.0.0-rc.0

Local vite-plus:
  vite-plus  v1.0.0-rc.0

Tools:
  vite             v8.3.0
  rolldown         v1.2.9
  vitest           v5.0.1
  oxfmt            v0.70.0
  oxlint           v1.85.0
  oxlint-tsgolint  v7.0.2002
  tsdown           v0.23.0
RC=0

$ pnpm exec vp check
note: You are running `vp check` as a Vite+ built-in command. If you meant to run the check npm script, use `vpr check` instead.
error: Formatting issues found
package.json (1ms)
pnpm-workspace.yaml (0ms)
vite.config.ts (0ms)

Found formatting issues in 3 files (294ms, 24 threads). Run `vp check --fix` to fix them.
RC=1                                   # rc=1 is the finding: those files are genuinely unformatted

$ pnpm exec vp install
Already up to date
Done in 4ms using pnpm v12.5.1
RC=0

$ ./node_modules/.bin/vp --version
vp v1.0.0-rc.0
… (same tool list) …
RC=0
```

**Which subcommands actually work project-locally.** Full sweep with the local binary only
(168 probes' worth condensed; each `--help` or real run, global `vp` absent from `PATH`):

| Subcommand | rc | First line of output |
|---|---|---|
| `vp dev` / `build` / `preview` / `pack` / `test` / `lint` / `fmt` | 0 | `Usage: vp dev [ROOT] [OPTIONS]` … (all present) |
| `vp check` | 0/1 | runs Oxfmt + Oxlint + type check (rc=1 when files are unformatted) |
| `vp run` / `vpr` | 0 | `Usage: vp run [OPTIONS] [TASK_SPECIFIER] [ADDITIONAL_ARGS]...` |
| `vp exec` | 0 | `Usage: vp exec [OPTIONS] [COMMAND]...` |
| `vp cache` | 0 | `Usage: vp cache <COMMAND>` |
| `vp config` | 0 | `Usage: vp config [OPTIONS]` |
| `vp hooks` | 0 | `Usage: vp hooks <COMMAND> [OPTIONS]` |
| `vp staged` | 0 | `Usage: vp staged [OPTIONS]` |
| `vp toolchain` | 0 | `Vite+ toolchain (local)` + full version graph |
| `vp create` | 0 | `Usage: vp create [TEMPLATE] [OPTIONS] [-- TEMPLATE_OPTIONS]` |
| `vp migrate` | 0 | `Usage: vp migrate [PATH] [OPTIONS]` |
| `vp install` | 0 | `Install all dependencies, or add packages if package names are provided` |
| `vp dlx` / `pm` / `add` / `remove` / `uninstall` / `update` / `dedupe` / `link` / `why` / `info` / `outdated` | 0 | help lines, e.g. `Download and execute a package without installing it globally`, `Forward a command to the package manager` |
| **`vp env`** | **2** | `error: The `env` command is only available in the global `vp` CLI. See https://viteplus.dev/guide/ to install it, then run the same command via the global `vp` binary.` |
| **`vp upgrade`** | **2** | same error text, `` `upgrade` `` |
| **`vp implode`** | **2** | same error text, `` `implode` `` |
| `vp list` | 2 | `error: Command 'list' not found` |
| `vp rebuild` | 2 | `error: Command 'rebuild' not found` |

The local `vp help` prints exactly this surface (verbatim, ANSI stripped):

```console
Usage: vp <COMMAND>

Core Commands:
  create         Create a new project from a template
  migrate        Migrate an existing project to Vite+
  dev            Run the development server
  build          Build for production
  test           Run tests
  lint           Lint code
  fmt, format    Format code
  check          Run format, lint, and type checks
  pack           Build library
  run            Run tasks
  exec           Execute a command from local node_modules/.bin
  preview        Preview production build
  cache          Manage the task cache
  config         Configure hooks and agent integration
  hooks          Manage the Git hook dispatcher
  staged         Run linters on staged files
  toolchain      Show Vite+ tool versions and relationships

Package Manager Commands:
  install    Install all dependencies, or add packages if package names are provided

Options:
  -C <DIR>    Run as if vp was started in <DIR> instead of the current working directory
  -h, --help  Print help
```

Note that this help is *shorter* than the command set that actually answers `--help` (e.g.
`vp dlx`, `vp add`, `vp why` work but are not listed). The bundled docs state the rule explicitly
(`node_modules/vite-plus/docs/guide/local-cli.md`):

> The local package cannot manage the machine-level Vite+ installation. The `vp env`, `vp upgrade`,
> and `vp implode` commands require the [global CLI](/guide/global-cli). Upgrade or remove a
> local-only installation through your package manager.

and it recommends exactly the script pattern this probe validated:

> For open-source projects or any project with collaborators, we recommend adding `package.json`
> scripts that call `vp`, whether you use both CLIs or only the project-local CLI. Inside scripts,
> `vp` resolves automatically from `node_modules/.bin`: …

### 2.3 (c) Does the LOCAL binary differ from the GLOBAL one?

Yes, in four observable ways. All were measured on the same project (`vite-plus@1.0.0-rc.0`
installed locally).

| Probe (same project, same cwd) | Global `vp` 0.3.3 on `PATH` | Local `node_modules/.bin/vp` 1.0.0-rc.0 |
|---|---|---|
| `vp --version` | `vp v0.3.3` **then** `Local vite-plus: vite-plus  v1.0.0-rc.0` and the *local* tool list | `vp v1.0.0-rc.0` and the local tool list |
| `vp toolchain` | `Vite+ toolchain (local)` — **delegates to the project's version** | `Vite+ toolchain (local)` — identical graph |
| `vp upgrade --check` | works (global concern) | `error: The `upgrade` command is only available in the global `vp` CLI.` **rc=2** |
| `vp env` / `vp env doctor` | works | same global-only error, **rc=2** |
| `vp implode` | works | same global-only error, **rc=2** |
| `vp create` / `vp create --list` | works (flags per `vite-plus-create.md` §1.2) | works; same flag set |
| `vp config --no-hooks --no-agent` | works | works (silent, rc=0, writes nothing) |
| `vpr --version` | `error: Package not found in workspace: …` (0.3.3, in a non-project dir) | `Task "--version" not found.` rc=1 — `vpr` rewrites argv to `run`, so `--version` is read as a task name |

So `vp --version` is a **two-part** answer: the CLI's own version (global 0.3.3 here) plus the
project's toolchain. The global CLI's *delegation* to the local package is documented in
`docs/guide/global-cli.md`:

> For development commands such as `vp dev`, `vp build`, `vp test`, and `vp run`, the global CLI
> delegates to the project's installed version when available … Package-manager commands such as
> `vp install` and `vp add` use the global CLI. Commands for managing your environment or global
> installation, such as `vp env`, `vp upgrade`, and `vp implode`, also stay with the global CLI
> regardless of the project's version.

**Precisely which subcommands FAIL or misbehave without a global install:** `vp env` (and
`vp env doctor`, `vp env pin`, `vp env exec`, …), `vp upgrade` (incl. `--check`, `--rollback`),
`vp implode` — all exit **2** with the "only available in the global `vp` CLI" message. Additionally
`vp list` and `vp rebuild` are **not implemented in the local CLI at all** (`error: Command 'list'
not found`, `error: Command 'rebuild' not found`) even though the bundled `docs/guide/install.md`
documents them as part of the shared command set — a docs/CLI mismatch worth knowing about. Nothing
else probed failed: create/migrate/dev/build/preview/test/lint/fmt/check/pack/run/exec/cache/config/
hooks/staged/toolchain/install/dlx/pm/add/remove/update/why/info/outdated/dedupe/link all work.

### 2.4 The strongest no-global probe: purged `PATH` **and** empty `HOME`

`PATH` was rebuilt without `~/.vite-plus/bin` (only `node_modules/.bin`, a scratch bin dir holding
symlinks to the *real* pnpm/npm, and the Node bin dir), and `HOME` pointed at a fresh empty
directory, so `~/.vite-plus` did not exist for the process. Verbatim results:

```console
$ HOME=/tmp/vpF/home2 vp --version
vp v1.0.0-rc.0

Local vite-plus:
  vite-plus  v1.0.0-rc.0

Tools:
  vite             v8.3.0
  rolldown         v1.2.9
  vitest           v5.0.1
  oxfmt            v0.70.0
  oxlint           v1.85.0
  oxlint-tsgolint  v7.0.2002
  tsdown           v0.23.0
RC=0

$ HOME=/tmp/vpF/home2 vp check
error: Formatting issues found
package.json (1ms)
pnpm-workspace.yaml (0ms)
vite.config.ts (0ms)
Found formatting issues in 3 files (274ms, 24 threads). Run `vp check --fix` to fix them.
RC=1

$ HOME=/tmp/vpF/home2 vp env
error: The `env` command is only available in the global `vp` CLI. …
RC=2

$ HOME=/tmp/vpF/home2 vp toolchain
Vite+ toolchain (local)
vite-plus@1.0.0-rc.0
├── depends on @voidzero-dev/vite-plus-core@1.0.0-rc.0
│   ├── bundles vite@8.3.0
│   │   └── uses rolldown@1.2.9
│   │       ├── compiles oxc@0.150.0
│   │       └── compiles oxc-resolver@11.24.3
│   ├── bundles rolldown@1.2.9
│   └── bundles tsdown@0.23.0
├── depends on vitest@5.0.1
├── depends on oxlint@1.85.0
├── depends on oxlint-tsgolint@7.0.2002
├── depends on oxfmt@0.70.0
└── compiles vite-task (built 2026-09-22T13:22:54Z, revision 790b15282344e00f508e74bc0e10ad0feffcbbf2)
RC=0

### what the empty HOME now contains ###
/tmp/vpF/home2                      # <- nothing created: no ~/.vite-plus, no cache, no config
```

**Conclusion for §2:** a project with `vite-plus` in `devDependencies` is fully usable with **no
global install**: `dev`, `build`, `test`, `lint`, `fmt`, `check`, `pack`, `run`/`vpr`, `cache`,
`create`, `migrate`, `config`, `hooks`, `staged`, `toolchain`, `install` and the package-manager
commands all run from `node_modules/.bin/vp` (or `pnpm exec vp`). The only hard failures are the
three machine-level commands `env`, `upgrade`, `implode` (plus the two un-implemented ones `list`,
`rebuild`). The local CLI does not require Node.js to be installed *by Vite+* — it runs on whatever
`node` is on `PATH` — and it created nothing outside the project.

---

## 3. BOOTSTRAP ORDER WITHOUT A GLOBAL VP

### 3.1 The correct first command

Because `pnpm dlx vite-plus@latest create …` and `npx -y vite-plus@latest create` **fail**
(§2.1), the right shape is the one the bundled `docs/guide/local-cli.md` gives — explicit
`--package`, explicit bin name:

| Package manager | First command (verbatim from `docs/guide/local-cli.md`) |
|---|---|
| pnpm | `pnpm dlx --package=vite-plus vp create` |
| npm | `npx --package=vite-plus vp create` |
| Yarn | `yarn dlx --package vite-plus vp create` |
| Bun | `bunx --package vite-plus vp create` |

with one hardening step this environment forces: **pin the version**, because pnpm's
`latest` resolution picked 0.1.21-alpha.7 here (§2.1):

```bash
# what the guide should tell an agent to run (no global vp anywhere on PATH):
pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:application \
  --directory app --no-interactive --no-git --no-hooks --no-agent \
  --package-manager pnpm -- --template vanilla-ts
# npm equivalent:
npx -y --package=vite-plus@1.0.0-rc.0 vp create vite:application …
```

`vp create --list`, `--help` and the whole flag surface work through this route; the create-side
flags, defaults and generated trees are documented in
[`vite-plus-create.md`](./vite-plus-create.md) §1 and §A2 and are not repeated here.

### 3.2 What the scaffold leaves behind — `vp create … --package-manager pnpm`

Probe: project-local `vite-plus@1.0.0-rc.0` binary, `VP_SKIP_INSTALL=1` (skips only the dependency
install; every generated file is written), `--no-interactive --no-git --no-hooks --no-agent`:

```console
$ vp create vite:application --directory app --no-interactive --no-git --no-hooks --no-agent \
    --package-manager pnpm --verbose -- --template vanilla-ts
```

Tree (16 files, no `node_modules` because of `VP_SKIP_INSTALL`):

```console
app/.gitignore            app/index.html          app/package.json        app/pnpm-workspace.yaml
app/public/favicon.svg    app/public/icons.svg    app/src/assets/hero.png app/src/assets/typescript.svg
app/src/assets/vite.svg   app/src/counter.ts      app/src/main.ts         app/src/style.css
app/tsconfig.json         app/vite.config.ts
```

**Yes — it adds `vite-plus` to `devDependencies`, at `catalog:` for pnpm, with the exact version
pinned in the workspace catalog.** Verbatim:

```json
// app/package.json
{
  "name": "app",
  "private": true,
  "version": "0.0.0",
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

```yaml
# app/pnpm-workspace.yaml
catalog:
  vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
  vite-plus: 1.0.0-rc.0
overrides:
  vite@*: 'catalog:'
peerDependencyRules:
  allowAny:
    - vite
  allowedVersions:
    vite: '*'
```

```ts
// app/vite.config.ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {},
  lint: {"jsPlugins":[{"name":"vite-plus","specifier":"vite-plus/oxlint-plugin"}],"rules":{"vite-plus/prefer-vite-plus-imports":"error"},"options":{"typeAware":true,"typeCheck":true}},
});
```

So the created project depends **only** on `vite-plus` (plus `vite` as the catalog alias and
`typescript`); Vitest/Oxlint/Oxfmt/tsdown are not listed — they come from `vite-plus` itself, which is
the whole point of the pin (§4).

### 3.3 Same scaffold, `--package-manager npm` — the pin becomes literal

```json
// app/package.json  (npm variant; no pnpm-workspace.yaml is written)
{
  "name": "app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "dev": "vp dev", "build": "tsc && vp build", "preview": "vp preview" },
  "devDependencies": {
    "typescript": "~6.0.2",
    "vite": "npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0",
    "vite-plus": "1.0.0-rc.0"
  },
  "overrides": {
    "vite": "npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0"
  },
  "devEngines": {
    "packageManager": { "name": "npm", "version": "12.1.0", "onFail": "download" }
  }
}
```

Differences that matter: npm gets the alias **inline** (`"vite": "npm:@voidzero-dev/vite-plus-core@X"`)
plus a matching `overrides.vite`, and the `vite-plus` version is written **literally** instead of
`catalog:`. The `devEngines.packageManager.version` recorded is whichever version Vite+ resolved for
that manager (`12.1.0` here — not the 11.19.0 that was on the probe's `PATH`), so it is worth reading
the generated value rather than assuming it.

`yarn` and `bun` scaffolds use the docs' `resolutions` / `overrides` spellings (§4.5); their create
runs were not completed in this environment (see UNVERIFIED #4).

### 3.4 Two `create`/`migrate` footguns when the CLI is invoked by absolute path

`vp create` finishes by spawning a bare **`vp fmt`**, and `vp migrate` by spawning a bare
**`vp install`**. If you invoke the local binary as `/path/to/node_modules/.bin/vp` while
`node_modules/.bin` is *not* on `PATH`, the scaffold is written and then the command **exits 1**:

```console
$ /tmp/…/tool/node_modules/.bin/vp create vite:application --directory app … --package-manager pnpm
spawn vp ENOENT
Error: spawn vp ENOENT
    …
    spawnargs: [ 'fmt' ]
Failed to generate code: spawn vp ENOENT
  CREATE RC=1                      # …although every file above was already written
```

(With `--verbose` the same run through `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create …` returned
**rc=0** for pnpm — the difference is only whether `vp` is resolvable on `PATH` for that internal
spawn.) Practical rule: run create/migrate through the package manager's local-binary executor
(`pnpm exec`, `pnpm dlx --package=… vp`, `npx --package=… vp`) or put `node_modules/.bin` on `PATH`,
then treat a written-but-rc=1 scaffold as "files are fine, follow-up step failed".

---

## 4. VERSION PINNING — how one `vite-plus` version ties the toolchain together

### 4.1 The pnpm catalog written by `vp create` / `vp migrate`

`vite-plus` depends on exact versions of everything (§1), and for pnpm the scaffold records that
version in a **workspace catalog** so every package shares it. Verbatim, from a project migrated by
`vp migrate` (1.0.0-rc.0) — see §4.4 for the exact command:

```yaml
# pnpm-workspace.yaml
catalog:
  vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
  vite-plus: 1.0.0-rc.0
overrides:
  vite@*: 'catalog:'
peerDependencyRules:
  allowAny:
    - vite
  allowedVersions:
    vite: '*'
```

and the matching `package.json`:

```json
{
  "name": "p033",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "devDependencies": { "vite-plus": "catalog:" },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" } }
}
```

`vite-plus-create.md` §5.1 already records the catalog produced by `vp create` itself (with
`overrides: { 'vite@*': 'catalog:' }`, `catalogMode: prefer`, and the same
`vite: npm:@voidzero-dev/vite-plus-core@<CLI version>` mapping) — the point to carry forward is that
**the catalog's `vite` alias and `vite-plus` entry are two halves of one pin, and both must match.**

A real `vp create` under 1.0.0-rc.0 writes exactly this (verbatim, §3.2):

```yaml
catalog:
  vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
  vite-plus: 1.0.0-rc.0
overrides:
  vite@*: 'catalog:'
peerDependencyRules:
  allowAny:
    - vite
  allowedVersions:
    vite: '*'
```

`vp migrate` **additionally** writes a `minimumReleaseAge` escape hatch for pnpm — a
`minimumReleaseAgeExclude` list covering the whole `@voidzero-dev/vite-plus-*` family plus
`vite-plus` itself at the new version:

```yaml
minimumReleaseAgeExclude:
  - "@voidzero-dev/vite-plus-core@1.0.0-rc.0"
  - "@voidzero-dev/vite-plus-darwin-arm64@1.0.0-rc.0"
  # … one entry per platform package …
  - vite-plus@1.0.0-rc.0
```

This is direct evidence that **pnpm's release-age/supply-chain policy would otherwise refuse a
just-published Vite+ release** (pnpm printed `✓ Lockfile passes supply-chain policies (165 entries)`
elsewhere in these probes), and it is the closest thing found to an explanation for the
`vite-plus@latest` resolution anomaly in §2.1 — see UNVERIFIED #1.

### 4.2 Do the bundled Vite / Vitest / Oxlint / Oxfmt versions follow the `vite-plus` version? — **Yes, exactly.**

Same project shape, two pins, `./node_modules/.bin/vp --version` in each:

```console
--- vite-plus 0.3.3 ---
vp v0.3.3
Local vite-plus: vite-plus  v0.3.3
Tools:
  vite             v8.3.0
  rolldown         v1.2.9
  vitest           v4.1.11
  oxfmt            v0.68.0
  oxlint           v1.83.0
  oxlint-tsgolint  v7.0.2001
  tsdown           v0.23.0

--- vite-plus 1.0.0-rc.0 ---
vp v1.0.0-rc.0
Local vite-plus: vite-plus  v1.0.0-rc.0
Tools:
  vite             v8.3.0
  rolldown         v1.2.9
  vitest           v5.0.1
  oxfmt            v0.70.0
  oxlint           v1.85.0
  oxlint-tsgolint  v7.0.2002
  tsdown           v0.23.0
```

The resolution is visible in pnpm's virtual store (symlinks inside
`node_modules/.pnpm/vite-plus@<X>/node_modules/`):

```console
033:  vite   -> ../../@voidzero-dev+vite-plus-core@0.3.3/node_modules/@voidzero-dev/vite-plus-core
      vitest -> ../../vitest@4.1.11_…_@voidzero-dev+vite-plus-core@0.3.3/node_modules/vitest
100:  vite   -> ../../@voidzero-dev+vite-plus-core@1.0.0-rc.0/node_modules/@voidzero-dev/vite-plus-core
      vitest -> ../../vitest@5.0.1_…_@voidzero-dev+vite-plus-core@1.0.0-rc.0/node_modules/vitest
```

So: **Vitest, Oxlint, Oxfmt and tsgolint track the `vite-plus` version exactly** (they are `=`/exact
dependencies), and **`vite` resolves to `@voidzero-dev/vite-plus-core@X` — the alias always matches
X.** The *bundled Vite version* is a separate number inside that package and happened to be 8.3.0
for both 0.3.3 and 1.0.0-rc.0, so "pin vite-plus ⇒ pin Vite" holds only in the sense of the alias
target, not of Vite's own version string.

The bundled docs say the same and explain *why* the alias matters
(`docs/guide/local-cli.md`, "Why are these settings needed?"):

> - The `vite` alias directs those imports to Vite+'s core package. Separate Vite instances can break
>   runtime identity checks: [issue #1391] reported TanStack Start returning 404s because an
>   `instanceof` check crossed two copies.
> - The exact `vitest` pin keeps dependencies and `vp test` on the same Vitest version, avoiding
>   separate mocks, `expect` instances, and runner state.

> Keep the core alias aligned with your installed `vite-plus` version and update the Vitest pin to
> match its bundled version when upgrading.

### 4.3 `vp upgrade` is not the project-local upgrade path

`vp upgrade` (and `--check`, `--rollback`) **fails locally**, rc=2:
`error: The `upgrade` command is only available in the global `vp` CLI.` The bundled
`docs/guide/upgrade-project.md` states the local equivalents:

> After updating the project's `vite-plus` dependency, run the local CLI to align the toolchain
> versions: `./node_modules/.bin/vp migrate`
> If your global CLI is newer than the project's version, running `vp migrate` upgrades the project to
> that global version instead.
> On a project that is already on Vite+, migrate does a toolchain version upgrade only: it re-pins
> `vite-plus`, the `vite` -> `@voidzero-dev/vite-plus-core` alias, and the `vitest` pin to the
> versions bundled with the CLI running the migration, across every workspace package.

> Without the global CLI, run the `vp` commands on this page through your package manager, for
> example `pnpm exec vp toolchain vitest`.

### 4.4 What actually happens on an upgrade, measured

**(i) `pnpm update` respects an exact pin.** Project pinned `"vite-plus": "0.3.3"`:

```console
$ pnpm update vite-plus --latest
Already up to date
… Done in 161ms using pnpm v12.5.1     rc=0
$ grep vite-plus package.json
{"name":"p033", … "devDependencies":{"vite-plus":"0.3.3"}}     # unchanged
$ ./node_modules/.bin/vp --version
vp v0.3.3 … vitest v4.1.11, oxfmt v0.68.0, oxlint v1.83.0, oxlint-tsgolint v7.0.2001
```

So `pnpm update --latest` (and by extension npm/yarn/bun update flows) will **not** move an exact
pin; the toolchain follows the manifest, not the registry. You must change the specifier
(`pnpm add -D vite-plus@1.0.0-rc.0`, or edit the catalog) and then re-run the alignment step.

**(ii) `vp migrate` from a newer local CLI re-pins everything.** The clean run used a realistic
catalog project (`pnpm-workspace.yaml` with `catalog:` + `overrides: vite@*: 'catalog:'` +
`vitest@*: 4.1.11`; `"vite-plus": "catalog:"`; a `vitest: 4.1.11` devDependency; installed at 0.3.3)
and the **local** 1.0.0-rc.0 binary with `node_modules/.bin` on `PATH`:

```console
$ vp migrate --no-interactive
Formatting code...

Code formatted
◇ Updated . to Vite+ 1.0.0-rc.0
• Node 24.21.0  pnpm 12.5.1
• Dependencies:
    vite-plus  0.3.3 → 1.0.0-rc.0
✓ Dependencies installed in 505ms
• Package manager settings configured
MIGRATE RC=0
```

Before → after (verbatim highlights):

| Item | Before | After |
|---|---|---|
| `package.json` devDependencies | `vite-plus: catalog:`, `vitest: 4.1.11`, `typescript` | `vite: catalog:`, `vite-plus: catalog:`, `typescript` — **`vitest` removed** |
| pnpm catalog | `vite: …vite-plus-core@0.3.3`, `vite-plus: 0.3.3` | `vite: …vite-plus-core@1.0.0-rc.0`, `vite-plus: 1.0.0-rc.0` |
| `overrides` | `vite@*: 'catalog:'`, `vitest@*: 4.1.11` | `vite@*: "catalog:"` — **`vitest@*` removed** |
| new key | — | `minimumReleaseAgeExclude:` listing the whole Vite+ family at 1.0.0-rc.0 (§4.1) |
| `./node_modules/.bin/vp --version` | `vp v0.3.3`, vitest v4.1.11, oxfmt v0.68.0, oxlint v1.83.0 | `vp v1.0.0-rc.0`, vitest v5.0.1, oxfmt v0.70.0, oxlint v1.85.0, oxlint-tsgolint v7.0.2002 |

The resulting `pnpm-workspace.yaml` catalog is exactly the block quoted in §4.1. A second
`vp migrate --no-interactive` printed `This project is already using Vite+! Happy coding!` and left
the files byte-identical — **idempotent**.

Note the doc/behaviour mismatch: `docs/guide/upgrade-project.md` says migrate "re-pins `vite-plus`,
the `vite` -> `@voidzero-dev/vite-plus-core` alias, and the `vitest` pin", but on this project it
**dropped** the `vitest` devDependency and the `vitest@*` override rather than re-pinning them
(plausible reason: with 1.0.0 the bundled runner is the only Vitest, so a project-level `vitest` is
redundant — the removal is observed, the intent is inferred). An earlier run against a project that
had only `"vite-plus": "0.3.3"` and no catalog produced the same catalog shape.

Two more operational caveats:

* `vp migrate` **spawns a bare `vp install`** (and `vp create` a bare `vp fmt`) as its last step. Run
  by absolute path with `node_modules/.bin` *not* on `PATH`, it fails at that point with
  `spawn vp ENOENT … spawnargs: [ 'install', '--no-frozen-lockfile', '--ignore-scripts' ]` — **after**
  the manifest/catalog rewrites were already written. Drive it as `pnpm exec vp migrate`, or put
  `node_modules/.bin` on `PATH` — exactly what `docs/guide/upgrade-project.md` recommends (§3.4).
* `vp` parses `pnpm-workspace.yaml` with a strict YAML parser: an **unquoted** override value
  (`vite@*: catalog:`) is fatal —
  `YAMLParseError: Nested mappings are not allowed in compact mappings at line 7, column 11`. The
  generated form is quoted (`vite@*: 'catalog:'`). If you hand-edit the file, quote it.
* Migrating is slow when the registry is slow: the 0.3.3 install in that probe took
  `4m 36.3s using pnpm v12.5.1` because pnpm re-verified its supply-chain policy across 165 entries.

### 4.5 Other package managers

The prior pass left "how npm / yarn / bun scaffolds pin `vite-plus`" as UNVERIFIED
(`vite-plus-create.md` UNVERIFIED #3). Per-package-manager create results are recorded in §3.3
above/below; the mechanism the docs describe is the same override/resolution idea with different
spellings (`docs/guide/local-cli.md`):

```yaml
# pnpm-workspace.yaml
overrides:
  vite: npm:@voidzero-dev/vite-plus-core@latest
  vitest: 5.0.1
```
```json
// npm / Bun package.json
"overrides": { "vite": "npm:@voidzero-dev/vite-plus-core@latest", "vitest": "5.0.1" }
```
```json
// Yarn package.json
"resolutions": { "vite": "npm:@voidzero-dev/vite-plus-core@latest", "vitest": "5.0.1" }
```

---

## 5. TASK RUNNER (`vp run`, `vpr`) — needed for monorepo mode

Primary sources: the CLI's own `vp run --help`, the docs the package ships
(`node_modules/vite-plus/docs/guide/run.md`, `docs/config/run.md`, `docs/guide/cache.md`,
`docs/guide/automatic-data-tracking.md`, `docs/guide/monorepo.md`), and a live monorepo probe.

### 5.1 `vp run --help` (verbatim, 1.0.0-rc.0)

```console
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

Documentation: https://viteplus.dev/guide/run
```

`vpr` is the same command: `docs/guide/run.md` — *"`vpr` is available as a standalone shorthand for
`vp run`. All examples below work with both `vp run` and `vpr`."* Both `vp` and `vpr` land in
`node_modules/.bin` (§2.2), so `vpr` works project-locally too.

### 5.2 Verbatim config shape for declaring a task

`docs/guide/run.md` (Task Definitions):

```ts [vite.config.ts]
import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: 'vp build',
        dependsOn: ['lint'],
        env: ['NODE_ENV'],
      },
      deploy: {
        command: 'deploy-script --prod',
        cache: false,
        dependsOn: ['build', 'test'],
      },
    },
  },
});
```

`docs/config/run.md` gives the whole block:

```ts [vite.config.ts]
import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    enablePrePostScripts: true,
    cache: {/* ... */},
    tasks: {/* ... */},
  },
});
```

Task fields (all from `docs/config/run.md`, abbreviated to the load-bearing text):

| Field | Type / default | Documented meaning |
|---|---|---|
| `command` | `string \| string[]` (required per task) | "interpreted by a shell, so spaces, quoting, `&&`, pipes, and redirects all work as written". An **array runs each entry as its own command, sequentially**; `['vp','build']` is *not* `vp build`. |
| `dependsOn` | `Array<string \| { task, from }>`, default `[]` | tasks that must succeed first; `'build'` (same package), `'@my/core#build'` (another package), or `{ task: 'build', from: 'dependencies' \| 'devDependencies' \| 'peerDependencies' \| [ … ] }` to run that task in every direct dependency that defines it. |
| `cache` | `boolean`, default `true` | `false` for dev servers etc.; "This cannot be overridden by any other cache control flag." |
| `env` | `string[]` (glob + `!` supported) | env vars **in** the cache fingerprint. |
| `untrackedEnv` | `string[]` | env vars passed to the task but **not** fingerprinted. |
| `input` | default `[{ auto: true }]` | files that invalidate the cache; `{ pattern, base: 'workspace' \| 'package' }` to rebase; `[]` disables file tracking. |
| `output` | default automatic write tracking | files restored on a cache hit; `[]` disables restoration. |
| `cwd` | default package root | working directory relative to the package root. |

Shorthand: `tasks: { build: 'vp build', check: ['vp lint', 'vp build'] }`.

### 5.3 How tasks differ from `package.json` scripts

From `docs/guide/run.md` ("Built-in Commands vs Scripts" and "Task Definitions"), verbatim:

> `vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a
> `vite.config.ts` task. Built-in commands cannot be overwritten, so adding a `dev` script does not
> change what `vp dev` does.

> If you want to run an existing `package.json` script as-is, use `vp run <script>`. If you want
> task-level caching, dependencies, or environment/input controls, define a task with an explicit
> `command`. A task name can come from `vite.config.ts` or `package.json`, but not both.

| | `package.json` script | `vite.config.ts` task |
|---|---|---|
| Cached by default | **no** (`⊘ cache disabled` in output) | **yes** (`◉ cache hit, replaying`) |
| Dependencies / env / input / output control | none | `dependsOn`, `env`, `untrackedEnv`, `input`, `output`, `cwd` |
| Opt in to caching | `vp run --cache <script>` or `run.cache.scripts: true` | always on unless `cache: false` |
| Name collision with a task | — | **fatal**, see below |

Probes that pin this down (real monorepo, `vite-plus@1.0.0-rc.0` at the root):

```console
$ vp run scriptbuild                 # a package.json script
~/packages/app$ node build.mjs ⊘ cache disabled
APP BUILD RAN
RC=0

$ vp run --cache scriptbuild         # same script, CLI-forced caching
~/packages/app$ node build.mjs ◉ cache hit, replaying
APP BUILD RAN
---
vp run: cache hit, 58ms saved.
RC=0

$ vp run build                       # a vite.config.ts task in the same package
~/packages/app$ node build.mjs ◉ cache hit, replaying
APP BUILD RAN

$ vp run dev                         # only a `dev` SCRIPT exists → runs the script
~/packages/app$ node dev.mjs ⊘ cache disabled
APP DEV SCRIPT RAN
RC=0

$ vp dev --help                      # the built-in is untouched by that script
Usage: vp dev [ROOT] [OPTIONS]

Run the development server.
Options are forwarded to Vite.
```

**The name-collision rule is enforced globally, not lazily.** With a `build` task in
`vite.config.ts` *and* a `build` script in the same `package.json`, every `vp run` in that workspace
fails, including unrelated task names:

```console
$ vp run build
error: Failed to load task graph
* Task c#build conflicts with a package.json script of the same name. Remove the script from package.json or rename the task
RC=1

$ vp run rootbuild        # unrelated task, same workspace
error: Failed to load task graph
* Task @my/app#dev conflicts with a package.json script of the same name. Remove the script from package.json or rename the task
RC=1
```

i.e. one duplicate name poisons the whole task graph — worth a loud warning in any agent-facing
guide, because it turns an unrelated `vp run` into rc=1.

### 5.4 Dependencies, parallelism, caching — measured

Monorepo: root `vite.config.ts` with tasks `rootbuild` and `report` (`dependsOn: ['@my/core#build']`)
and `test` (`dependsOn: [{ task: 'build', from: ['dependencies'] }]`); `packages/core` and
`packages/app` each define a cached `build` task (`command: 'node build.mjs'`),
`packages/nolib` defines only a `build` **script**; `app` depends on `core` via `workspace:*`.

```console
$ vp run -r build
~/packages/core$ node build.mjs
~/packages/nolib$ node build.mjs ⊘ cache disabled
NOLIB BUILD RAN
CORE BUILD RAN

~/packages/app$ node build.mjs
APP BUILD RAN

---
vp run: 0/3 cache hit (0%). (Run `vp run --last-details` for full details)
RC=0

$ vp run -r build                      # second run
~/packages/core$ node build.mjs ◉ cache hit, replaying
~/packages/nolib$ node build.mjs ⊘ cache disabled
~/packages/app$ node build.mjs ◉ cache hit, replaying
---
vp run: 2/3 cache hit (66%), 100ms saved.
RC=0

$ vp run -r -v build                   # execution summary (verbatim, trimmed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Vite+ Task Runner • Execution Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Statistics:   3 tasks • 2 cache hits • 0 cache misses • 1 cache disabled
Performance:  66% cache hit rate, 100ms saved in total
Task Details:
  [1] @my/core#build: ~/packages/core$ node build.mjs ✓
      → Cache hit - output replayed - 53ms saved
  [2] @my/app#build: ~/packages/app$ node build.mjs ✓
      → Cache hit - output replayed - 47ms saved
  [3] @my/nolib#build: ~/packages/nolib$ node build.mjs ✓
      → Cache disabled in task configuration

$ vp run report                        # root task dependsOn ['@my/core#build']
~/packages/core$ node build.mjs ◉ cache hit, replaying
CORE BUILD RAN

$ node -e "console.log(2)"
2
RC=0

$ vp run --ignore-depends-on report     # dependency skipped
$ node -e "console.log(2)" ◉ cache hit, replaying
2
RC=0

$ vp run --no-cache -r build            # every task reports ⊘ cache disabled
$ vp run -r --parallel build            # order is no longer dependency-ordered (app first)
$ vp run -r --concurrency-limit 1 build # serialized
$ vp run -r --log labeled build
[@my/core#build] ~/packages/core$ node build.mjs ◉ cache hit, replaying
[@my/nolib#build] ~/packages/nolib$ node build.mjs ⊘ cache disabled
$ vp cache clean                        # rc=0, deletes node_modules/.vite/task-cache
```

Cache mechanics, verbatim from `docs/guide/cache.md`:

> When a task runs successfully (exit code 0), its terminal output (stdout/stderr) and all written
> files (output files) are saved. On the next run, Vite Task checks if anything changed:
> 1. **Arguments** … 2. **Environment variables** … 3. **Inputs** …
> When all checks match, Vite Task replays the cached terminal output, restores saved output files,
> and skips the command.

> There are three types of controls for task caching, in order:
> 1. Per-task `cache: false` … This cannot be overridden by any other cache control flag.
> 2. CLI flags — `--no-cache` … `--cache` …
> 3. Workspace config — `run.cache` … `cache.tasks` default `true`, `cache.scripts` default `false`.

> The task cache is stored in `node_modules/.vite/task-cache` at the project root. `vp cache clean`
> deletes that cache directory.

Probe confirms the location: `find` → `/tmp/vpM/mono/node_modules/.vite/task-cache`.

Automatic input tracking is what makes caching work without config
(`docs/guide/automatic-data-tracking.md`):

> File system tracking applies to every cache-enabled task. If you omit `input`, Vite Task tracks the
> files a command reads while it runs … Vite Task records source files, config files, missing files
> the command checked, and directories the command scanned.
> `vp build` … Vite reports that metadata to Vite Task … For a standard Vite build, you do not need
> to add these entries yourself.

Concurrency, verbatim from `docs/guide/run.md`:

> By default, up to 4 tasks run at the same time. Use `--concurrency-limit` to change this … The limit
> can also be set via the `VP_RUN_CONCURRENCY_LIMIT` environment variable. The `--concurrency-limit`
> flag takes priority over the environment variable.
> Use `--parallel` to ignore task dependencies and run all tasks at once with unlimited concurrency.

Compound commands and nesting (`docs/guide/run.md`): commands joined with `&&` (or given as an
array) "are split into independent sub-tasks", each cached separately; a command containing
`vp run` is "inlined as separate tasks instead of spawning a nested process"; and a root script like
`"build": "vp run -r build"` is self-reference-pruned automatically so it does not recurse.

### 5.5 Workspace / monorepo execution — yes, with `-r`, `-t`, `-F`, `-w`, `vpr`

All of these were executed in the probe monorepo (verbatim results abridged to the first line):

```console
$ vp run -r build                       # every workspace package, dependency order
~/packages/core$ node build.mjs …
$ vp run -t @my/app#build               # app + its transitive workspace deps → core, then app
$ vp run @my/app#build                  # one package from anywhere
$ vp run -F @my/app -F @my/core build    # multiple -F are a union
$ vp run --filter "@my/*" build
$ vp run --filter @my/app... build       # package + its dependencies
$ vp run --filter "...@my/core" build    # package + its dependents
$ vp run --filter ./packages/app build   # by directory
$ vp run --filter @my/nope build
No packages matched the filter: @my/nope          # rc=0
$ vp run --filter @my/nope --fail-if-no-match build
error: No packages matched the filter: @my/nope   # rc=1
$ vpr -r build                           # exactly equivalent to `vp run -r build`
$ vp run -w build                        # workspace root only
error: Task "build" not found              # rc=1 — the root package defines no `build`
$ vp run build                           # run from the root with no root task
Task "build" not found. Did you mean:
  rootbuild: node -e "console.log(1)"
  @my/app#build: node build.mjs
  @my/app#scriptbuild: node build.mjs
  @my/core#build: node build.mjs
  @my/nolib#build: node build.mjs
RC=1
$ vp run                                 # bare, stdin closed (non-TTY) → flat listing, rc=0
  report: node -e "console.log(2)"
  rootbuild: node -e "console.log(1)"
  test: node test.mjs
  @my/app#build: node build.mjs
  @my/app#dev: node dev.mjs
  @my/app#echoargs: node echoargs.mjs
  @my/app#scriptbuild: node build.mjs
  @my/core#build: node build.mjs
  @my/nolib#build: node build.mjs
RC=0
```

Notes worth carrying into a guide:

* `vp run` lists both tasks and scripts, qualified as `pkg#name`; ordering follows the workspace
  dependency graph.
* Additional arguments after the task name are passed through verbatim
  (`vp run echoargs --foo bar` → `node echoargs.mjs --foo bar`), and passing them **changes the cache
  key** (`docs/guide/cache.md`: "`vp test ✗ cache miss: args changed`").
* A missing task name is rc=1 with a did-you-mean list; a filter that matches nothing is rc=0
  (warning only) unless `--fail-if-no-match` is given.
* At a monorepo root, bare `vp dev`/`vp build`/`vp pack` are monorepo-aware: one runnable package is
  auto-selected, several open a picker, and a non-interactive shell prints a listing and exits 1
  (`docs/guide/monorepo.md`, quoted in that file's "App Commands" section). `-C <dir>` is the
  documented way to target a package, and `defaultPackage` sets a fixed default.

### 5.6 Monorepo config surface (root `vite.config.ts`)

`docs/guide/monorepo.md`: run `vp lint` / `vp fmt` / `vp check` from the workspace root; package
configs "cannot replace root format settings, lint rules, or type-check options"; per-package
variation goes through `lint.overrides` / `fmt.overrides` with workspace-relative globs
(`apps/web/**`). `run.enablePrePostScripts` "can only be set in the workspace root's
`vite.config.ts`". Task definitions can live in each package's own `vite.config.ts` (as the probe
monorepo did) or in the root config; `dependsOn` strings cross packages with `pkg#task`.

---

## 6. PACKAGE-MANAGER DETECTION

### 6.1 The documented order

`node_modules/vite-plus/docs/guide/install.md`, verbatim:

> Vite+ detects the package manager from the workspace root in this order:
> 1. `packageManager` in `package.json`
> 2. `devEngines.packageManager` in `package.json`
> 3. `pnpm-workspace.yaml`
> 4. `pnpm-lock.yaml`
> 5. `yarn.lock` or `.yarnrc.yml`
> 6. `package-lock.json`
> 7. `bun.lock` or `bun.lockb`
> 8. `.pnpmfile.cjs` or `pnpmfile.cjs`
> 9. `bunfig.toml`
> 10. `yarn.config.cjs`
>
> If none of those files are present, `vp` falls back to `pnpm` by default.

Plus:

> The `devEngines.packageManager` field accepts a single object or an array of objects, and its
> `version` may be a semver range … A range resolves to an already-downloaded satisfying version when
> possible, otherwise to the latest satisfying version from the npm registry … When both
> `packageManager` and `devEngines.packageManager` are declared, the `packageManager` field drives
> selection and Vite+ warns when it does not satisfy the devEngines constraint.

> Vite+ automatically downloads the matching package manager and uses it for the command you ran, but
> package-manager detection never rewrites `package.json`.

### 6.2 Measured matrix (local `vite-plus@1.0.0-rc.0`, per-case installs)

Each case: a fresh directory with a `package.json` (`{"name":…,"private":true,"version":"0.0.0","type":"module"}`)
plus the marker file(s), then the **local** binary: `$VP install --lockfile-only --ignore-scripts`
(rc and the resulting lockfile identify the engine). `HOME` redirected to `/tmp` so Vite+ could
manage/download package managers.

| Case (files besides `package.json`) | rc | Which engine ran | Evidence |
|---|---|---|---|
| *(nothing — bare)* | 0 | **pnpm** | `Done in 20ms using pnpm v12.5.1` → `pnpm-lock.yaml` |
| *(no `package.json` at all)* | 0 | **pnpm** | same; Vite+ **created** `package.json` + `pnpm-lock.yaml` |
| `packageManager: pnpm@12.5.1` | 0 | pnpm | `using pnpm v12.5.1` |
| `devEngines.packageManager: {pnpm, 12.5.1, download}` | 0 | pnpm | `using pnpm v12.5.1` |
| `package-lock.json` | 0 | **npm** | `up to date, audited 1 package in 426ms` / `found 0 vulnerabilities` |
| `pnpm-workspace.yaml` | 0 | pnpm | `pnpm-lock.yaml` written |
| `pnpm-lock.yaml` | 0 | pnpm | rewritten in place |
| `pnpmfile.cjs` | 0 | pnpm | `pnpm-lock.yaml` written |
| `packageManager: npm@11.19.0` | 1 | npm *(blocked)* | `error: Read-only file system (os error 30) at path "/home/leihaohao/.vite-plus/package_manager/npm/.tmp…"` |
| `devEngines.packageManager: {npm, …}` | 1 | npm *(blocked)* | same |
| `yarn.lock` / `.yarnrc.yml` / `yarn.config.cjs` | 1 | yarn *(blocked)* | `… /package_manager/yarn/.tmp…` |
| `bun.lockb` / `bunfig.toml` | 1 | bun *(blocked)* | `error: Read-only file system (os error 30)` |
| `packageManager: pnpm@12.5.1` **and** `devEngines.packageManager: {yarn, …}` | 1 | pnpm (declared) | `warn: packageManager is pnpm@12.5.1 but devEngines.packageManager requires "yarn". This will become an error in a future release.` then yarn's `ERR_PNPM_OTHER_PM_EXPECTED` |

Reading of the rc=1 rows: the **detection** was right (Vite+ resolved npm / yarn / bun from the
marker files) but the *managed download* of that package manager's exact version failed because
`~/.vite-plus` is read-only in this sandbox. Those runs are evidence **for detection order**, not for
installation behaviour. The pnpm rows and the `package-lock.json` → npm row ran end-to-end.

### 6.3 Rating the "bare directory chose npm" finding

The prior pass observed (`vite-plus-create.md` §A4.3, Round-3 UNVERIFIED #1):

> A directory containing *only* `package.json` (no lockfile, no `packageManager`, no `devEngines`)
> made `vp install` run **npm** … `added 86 packages, and audited 87 packages in 59s` …
> → `package-lock.json`

Re-probed here with **both** CLIs:

| CLI | Project | Result |
|---|---|---|
| global `vp` **0.3.3** (`/home/leihaohao/.vite-plus/bin/vp`, real `HOME`) | bare `package.json` | reproduced the npm path: `up to date, audited 1 package in 408ms` / `found 0 vulnerabilities` → `package-lock.json` (`rc=0`) |
| local `vite-plus` **1.0.0-rc.0** | bare `package.json` | **pnpm** — `Done in 20ms using pnpm v12.5.1` → `pnpm-lock.yaml` (same on a full, not `--lockfile-only`, install) |

**Rating.** The documented behaviour is unambiguous — "If none of those files are present, `vp`
falls back to **pnpm** by default" — and 1.0.0-rc.0 matches it. The npm choice is therefore a
**deviation from documented behaviour, i.e. a bug in the 0.3.3-era CLI** (or at least in the
0.3.3 binary shipped in this sandbox), not "documented fallback to npm". Two independent probes
(prior pass, this pass) agree that 0.3.3 picked npm in a bare directory. For a hand-written skeleton
on 0.3.3 the practical consequence stands exactly as the prior doc concluded: declare
`devEngines.packageManager` (what `vp create` writes) or `packageManager`, or you may get a
`package-lock.json` you did not ask for. On 1.0.0-rc.0 the bare default is pnpm as documented.

Note also that Vite+'s *detection* is not the same as *management*: it will download/select its own
copy of the detected package manager under its data directory (`packages/`, `package_manager/`) and
prefers that; the read-only-FS errors above are that machinery refusing to write. `VP_PACKAGE_MANAGER`
(`npm|pnpm|yarn|bun@<version>`) overrides detection for one command
(`docs/guide/global-cli.md` → "Runtime Variables").

---

## 7. DETECTING INSTALLED PACKAGE MANAGERS FROM A SHELL SCRIPT

The question a guide actually has to answer: "which of pnpm/npm/yarn/bun/deno exist here, and at
what versions?" `command -v` alone is **not** enough on a machine that has Vite+ shims installed —
which is precisely the machine an agent is likely to be on. Measured here:

```console
$ for pm in pnpm pnpx npm npx yarn yarnpkg bun bunx deno corepack vp vpr vpx; do
    p=$(command -v "$pm"); real=$(readlink -f "$p"); ft=$(file -b "$real" | cut -c1-45)
    v=$("$pm" --version 2>&1 | head -1); printf '%-8s %s -> %s [%s]  --version: %s\n' "$pm" "$p" "$real" "$ft" "$v"
  done
pnpm     /home/leihaohao/.vite-plus/bin/pnpm            -> /home/leihaohao/.vite-plus/0.3.3/bin/vp [ELF 64-bit LSB pie executable]  --version: 12.5.1
pnpx     /home/leihaohao/.vite-plus/bin/pnpx            -> /home/leihaohao/.vite-plus/0.3.3/bin/vp [ELF …]  --version: Error: ERR_PNPM_CLI_DLX_CACHE
npm      /home/leihaohao/.vite-plus/js_runtime/node/24.21.0/bin/npm -> …/npm-cli.js [Node.js script]  --version: 11.19.0
npx      …/node/24.21.0/bin/npx -> …/npx-cli.js [Node.js script]  --version: 11.19.0
yarn     /home/leihaohao/.vite-plus/bin/yarn            -> /home/leihaohao/.vite-plus/0.3.3/bin/vp [ELF …]  --version: vp: Failed to resolve package manager for 'yarn': Install error: Read-only file system (os error 30) at path "…/package_manager/yarn/.tmpsZZjVA"
yarnpkg  … same, different tmp name
bun      /home/leihao….local/share/mise/installs/bun/latest/bin/bun -> …/bun/1.4.0/bin/bun [ELF]  --version: 1.4.0
bunx     … same binary  --version: 1.4.0
deno     MISSING
corepack /home/leihaohao/.vite-plus/js_runtime/node/24.21.0/bin/corepack -> …/corepack/dist/corepack.js  --version: 0.36.0
vp       /home/leihaohao/.vite-plus/bin/vp -> …/0.3.3/bin/vp [ELF]  --version: vp v0.3.3
vpr      /home/leihaohao/.vite-plus/bin/vpr -> …/0.3.3/bin/vp [ELF]  --version: error: Package not found in workspace: `…`
vpx      /home/leihaohao/.vite-plus/bin/vpx -> …/0.3.3/bin/vp [ELF]  --version: 11.19.0     # ← misleading!
```

Load-bearing observations for a guide:

* `pnpm`, `pnpx`, `yarn`, `yarnpkg`, `vp`, `vpr`, `vpx` all resolve to **the same ELF `vp` binary**
  (`readlink -f` proves it; `cmp` shows the shim is byte-identical to `current/bin/vp`). Presence of
  the name proves nothing about the real tool being installed.
* `pnpm --version` prints `12.5.1` — correct-looking, because the shim delegates to a *managed* pnpm.
  `yarn --version` prints a `vp: Failed to resolve package manager …` error **with exit code 0**, and
  `vpx --version` prints `11.19.0` (npm's version). Any check that only does
  `[ -n "$(command -v yarn)" ]` or parses the first line of `--version` will be wrong here.
* `bun` is a genuine binary (mise-managed) and `bun --version` prints `1.4.0`; `deno` is absent, so
  the loop must tolerate "not found".
* Version output shapes: `pnpm`, `npm`, `yarn`(berry/classic), `bun` all print a **bare version** on
  line 1; `deno --version` prints **multiple lines**
  (`deno 2.x.y` / `v8 …` / `typescript …`), so take `head -1` and expect `deno <ver>`;
  `corepack --version` prints a bare version.

**Recommended shell idiom** (defensive about shims, wrong-binary output and rc=0 error text):

```sh
# Enumerate the package managers that really work, with versions.
for pm in pnpm npm yarn bun deno; do
  bin=$(command -v "$pm" 2>/dev/null) || { printf '%-5s absent\n' "$pm"; continue; }
  real=$(readlink -f "$bin" 2>/dev/null || printf '%s' "$bin")
  ver=$("$pm" --version 2>/dev/null | head -1)          # capture stdout only
  case "$ver" in
    *[0-9].[0-9]*) : ;;                                 # looks like a version
    *) ver="<no usable --version>" ;;
  esac
  printf '%-5s %-40s %s\n' "$pm" "$real" "$ver"
done
```

and, when Vite+ is involved, prefer Vite+'s own answer over PATH inspection:

* `vp toolchain` (works project-locally) reports the tool versions actually in use;
* `vp env doctor` / `vp env` report managed runtimes and package managers — **but they require the
  global CLI and exit 2 without it** (§2.3);
* `VP_BYPASS=<dir>` bypasses the Vite+ shim for one command so you can reach the system tool
  (`docs/guide/global-cli.md`: "Bypass the Vite+ shim and use the system tool", PATH-style list);
* the shim's own debugging hook is `VP_DEBUG_SHIM=1`.

---

## UNVERIFIED

Marked unverifiable from the evidence gathered. None of these should be filled in with a guess.

1. **Root cause of pnpm resolving `vite-plus@latest` → `0.1.21-alpha.7`** in this sandbox, while
   `pnpm view vite-plus dist-tags`, a raw `fetch` of the registry with either Accept header, and
   `npx --package=vite-plus` all report `latest: 1.0.0-rc.0`. `--config.minimumReleaseAge=0` did not
   change it, and `@^0.3.0`/`@0.3.3` resolved correctly. **Strong lead, not proof:** Vite+'s own
   `vp migrate` writes a `minimumReleaseAgeExclude` list for every Vite+ package at the target
   version (§4.1) and pnpm prints `✓ Lockfile passes supply-chain policies (165 entries)`, i.e. pnpm
   here does apply a release-age/supply-chain policy that a 1-day-old release fails; why that makes
   the *bare `latest` spec* land on the `alpha` tag instead of the newest version that passes (0.3.3)
   was not determined.
2. **Whether `pnpm dlx --package=vite-plus vp` (unversioned) resolves to today's `latest`
   elsewhere.** The `vp v0.0.0` self-report and the alpha resolution both come from this sandbox; the
   version-pinned form is the only one proven correct here.
3. **bunx (`bunx --package vite-plus vp create`) end-to-end.** Not executable in the probe
   environment (`timeout: failed to execute process: No such file or directory`); only the shipped
   docs' claim is recorded.
4. **npm/yarn/bun project installs.** Detection was observed (§6.2) but the managed-download step
   aborted on the read-only `~/.vite-plus` in the first matrix, so "what a full `vp install` produces
   for npm/yarn/bun projects" is unverified. For `vp create`, the **npm** variant was captured in full
   (§3.3) and the **yarn/bun** variants were not completed in this environment — only the
   `resolutions`/`overrides` spellings from the shipped docs (§4.5) are recorded for them.
5. **Why `vp list` and `vp rebuild` exist in the bundled `docs/guide/install.md` but are not
   implemented in the 1.0.0-rc.0 local CLI** (`error: Command 'list' not found`). Possibly
   global-only commands not gated with the explicit "only available in the global CLI" message like
   `env`/`upgrade`/`implode`; the gating logic was not read.
6. **Whether 1.0.0-rc.0 is the final answer for the `latest` tag** at read time — this is a moving
   target; the research date is 2026-09-23 and the `alpha`/`test` tags were also present.
7. **`VP_SKIP_INSTALL` create probes** used for the file-shape questions print
   `Could not resolve 'vite-plus' in vite.config.ts` / `You may need to run "vp fmt" manually`.
   That is the same probe artefact the prior pass documented (`vite-plus-create.md` method note),
   not a product bug; the without-`VP_SKIP_INSTALL` path was not re-run for every package manager.
8. **`vp run` interactive selector** (bare `vp run` with a TTY). Only the non-TTY flat listing was
   captured; the docs' interactive picker text is quoted, not observed.
9. **`VP_RUN_CONCURRENCY_LIMIT`** was not exercised (only `--concurrency-limit`); the env var is
   documented only.
10. **Task-cache reuse across machines / CI cache configuration** (`docs/guide/github-actions-cache.md`
    exists in the package) — out of scope, not read.
11. **`vite-plus` 0.3.3 vs 1.0.0-rc.0 behaviour differences beyond those listed** — only the surfaces
    probed above were compared; the local package's `dist/` bundles were not diffed.

---

## Implications for an agent-facing init guide

1. **No global install is required.** Put `"vite-plus": "<exact version>"` in `devDependencies`,
   install with the project's package manager, and drive everything as
   `node_modules/.bin/vp …` / `pnpm exec vp …` / `"scripts": {"check": "vp check"}`. Proven to work
   with a purged `PATH` and an empty `HOME`; the local CLI is a Node script and writes nothing
   outside the project.
2. **Bootstrap with an explicit package and an explicit version:**
   `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create …` (or `npx -y --package=vite-plus@<X> vp create …`).
   The bare `pnpm dlx vite-plus@latest create` form **fails** (multiple bins), and unversioned pnpm
   resolution is not trustworthy in this environment. Keep `vp` resolvable on `PATH` for the run
   (the CLI shells out to a bare `vp fmt` / `vp install` at the end — §3.4); a create/migrate that
   printed its files but exited 1 is a PATH problem, not a failed scaffold.
3. **Three subcommands are global-only** (`vp env`, `vp upgrade`, `vp implode`, all rc=2) and two are
   simply absent locally (`vp list`, `vp rebuild`). Everything else in the local `vp help` list works.
   For environment diagnostics without a global CLI, use `vp toolchain` (works) instead of
   `vp env doctor` (fails).
4. **Rebuild the toolchain pin deliberately after any version change.** In pnpm that means the
   `pnpm-workspace.yaml` catalog pair (`vite: npm:@voidzero-dev/vite-plus-core@X` + `vite-plus: X`),
   `"catalog:"` specifiers in each package, the `vite@*` override (quoted!), and the `vitest` override
   when one exists. `pnpm update` will not move an exact pin, and `vp upgrade` does not work locally:
   either edit the specifier and re-install, or run `pnpm exec vp migrate` with the newer local CLI
   (which rewrites all of it and is idempotent).
5. **Beware the task/script name collision.** One `vite.config.ts` task whose name equals a
   `package.json` script in the same package makes *every* `vp run` in the workspace exit 1 with
   `Failed to load task graph`. Prefer tasks with names you control, or keep the name in exactly one
   place.
6. **Use `vite.config.ts` tasks when you need caching, ordering or monorepo fan-out**; use
   `package.json` scripts for one-off commands (they are uncached unless `--cache` is passed).
   `-r`, `-t`, `-F/--filter`, `-w`, `vpr` and `--parallel`/`--concurrency-limit` cover the monorepo
   cases, and `--last-details`/`-v` give the evidence trail.
7. **Never infer tool versions from `command -v` output on a Vite+-managed machine** — the shims make
   `pnpm`/`yarn`/`vpx` report an installed-looking tool whose `--version` may be wrong or may be an
   error printed with rc=0. Resolve the path (`readlink -f`), validate the version string, and use
   `vp toolchain` for the toolchain that will actually run.
8. **Cite the package's own docs at runtime**: `node_modules/vite-plus/docs/guide/{local-cli,run,install,upgrade-project,monorepo,cache}.md` ship inside the devDependency, so an agent can read the
   exact documentation for the pinned version instead of trusting a memorized flag list (the same
   advice the prior pass gave for the global CLI).
