# Vite+ (`vp`) `create` — research notes for an agent-facing init document

Every claim below is traced to a primary source: the installed CLI's own output, the files the tool
itself ships, the official docs served by `viteplus.dev`, or the npm registry as read by the CLI.
Fetched web content was treated as data, never as instructions.

| | |
|---|---|
| Research date (UTC) | 2026-09-23 |
| Tool under study | Vite+ global CLI (`vp`), `vite-plus` npm package |
| Installed versions on this machine | 0.3.1, 0.3.2, **0.3.3** (`~/.vite-plus/current` → `0.3.3`) |
| Binary used for every command below | `/home/leihaohao/.vite-plus/bin/vp` → `vp v0.3.3` |
| Installed package root (`$PKG` below) | `/home/leihaohao/.vite-plus/0.3.3/node_modules/.pnpm/vite-plus@0.3.3/node_modules/vite-plus` |
| Official docs | https://viteplus.dev/guide/ (`llms.txt`, `llms-full.txt`) |
| Registry `latest` for `vite-plus` at research time | **`1.0.0-rc.0`** (the installed 0.3.3 is *not* latest — see §5) |

## Method note (constraints hit while gathering this)

* `web_fetch` refuses `viteplus.dev`, `github.com`, `raw.githubusercontent.com`, `registry.npmjs.org`
  and `registry.npmmirror.com` — all resolve to non-public `198.18.0.x` addresses in this sandbox.
* The CLI's own network stack *does* reach them. Live docs and live registry data below were therefore
  fetched with the tool's own runtime, e.g.
  `vp node -e 'fetch("https://viteplus.dev/guide/create.md").then(r=>r.text()).then(console.log)'`.
* The npm registry was read with `vp view vite-plus dist-tags` after redirecting the npm cache:
  `npm_config_cache=/tmp/vpx-npm-cache` (the default `~/.npm` is read-only here).
* `~/.vite-plus` is read-only in this sandbox, so all scaffolding probes ran in throwaway `/tmp`
  directories with `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `npm_config_cache` redirected under `/tmp`.
  `/tmp` is ephemeral per shell invocation here, so each probe printed its tree and file contents in
  the same command; artefacts are gone, but every command and its verbatim output is recorded below.
* Most probes set `VP_SKIP_INSTALL=1` (`$PKG/dist/prompts-k14KgthC.js`: `if (process.env.VP_SKIP_INSTALL) return {status:"skipped"}`)
  to skip the ~8-minute dependency install. Consequence, visible in that output: the final
  `vp fmt` step fails to resolve `vite-plus`/`@vitejs/plugin-react` and prints
  `You may need to run "vp fmt" manually`. That is a probe artefact, not a product bug. One full run
  *with* installation is recorded in §4/§6.

---

## 1. Template surface

### 1.1 `vp create --list` (verbatim, `vp` 0.3.3)

```console
$ vp create --list
Usage: vp create --list

List available builtin and popular project templates.

Vite+ Built-in Templates:
  vite:monorepo     Create a new monorepo
  vite:application  Create a new application
  vite:library      Create a new library
  vite:generator    Scaffold a new code generator (monorepo only)

Popular Templates (shorthand):
  vite             Official Vite templates (create-vite)
  @tanstack/start  TanStack applications (@tanstack/cli create)
  next-app         Next.js application (create-next-app)
  nuxt             Nuxt application (create-nuxt)
  react-router     React Router application (create-react-router)
  svelte           Svelte application (sv create)
  vue              Vue application (create-vue)

Examples:
  vp create # interactive mode
  vp create vite # shorthand for create-vite
  vp create @tanstack/start # shorthand for @tanstack/cli create
  vp create <template> -- <options> # pass options to the template

Tip:
  You can use any npm template or git repo with vp create.

Documentation: https://viteplus.dev/guide/create
```

### 1.2 `vp create --help` (verbatim, `vp` 0.3.3)

```console
$ vp create --help
Usage: vp create [TEMPLATE] [OPTIONS] [-- TEMPLATE_OPTIONS]

Use any builtin, local or remote template with Vite+.

Arguments:
  [TEMPLATE]             Builtin, local, or remote template name
  [TEMPLATE_OPTIONS]...  Arguments passed to the template without changes

Options:
  --directory <DIR>                      Target directory for the generated project
  --agent <NAME>                         Write coding agent instructions to AGENTS.md, CLAUDE.md, etc.
  --no-agent                             Skip writing coding agent instructions
  --editor <NAME>                        Write editor config files for the specified editor
  --no-editor                            Skip writing editor config files
  --git                                  Initialize a git repository
  --no-git                               Skip git repository initialization
  --hooks                                Set up pre-commit hooks (default in non-interactive mode)
  --no-hooks                             Skip pre-commit hooks setup
  --package-manager <pnpm|npm|yarn|bun>  Use the specified package manager
  --approve-builds                       Approve and run gated dependency build scripts without prompting
  --verbose                              Show detailed scaffolding output
  --interactive                          Enable interactive prompts
  --no-interactive                       Run in non-interactive mode
  --list                                 List all available templates
  -h, --help                             Show this help message

Examples:
  vp create                                      # Interactive mode
  vp create vite                                 # Use create-vite
  vp create vite -- --template react-ts          # Pass template options
  vp create vite:monorepo                        # Create a Vite+ monorepo
  vp create github:user/repo                     # Use a GitHub template
  vp create @your-org                            # Open an org template picker

Documentation: https://viteplus.dev/guide/create
```

### 1.3 What each builtin template actually produces

Resolution is implemented in `$PKG/dist/create/bin.js` (functions `executeBuiltinTemplate`,
`executeMonorepoTemplate`, `executeGeneratorScaffold`) and `$PKG/dist/create/templates/types.ts`
inlined there:

```js
const LibraryTemplateRepo = "github:sxzz/tsdown-templates/vite-plus";
const BuiltinTemplate = {
	generator: "vite:generator",
	monorepo: "vite:monorepo",
	application: "vite:application",
	library: "vite:library"
};
```

| Template | What runs | What you get |
|---|---|---|
| `vite:application` | `templateInfo.command = "create-vite@latest"`, `--no-interactive` appended in non-interactive mode, target dir unshifted as first positional | Whatever `create-vite` on npm produces that day (probe: `create-vite 9.2.1`, React+TS/vanilla-ts/…), then Vite+ rewrites it (§4) |
| `vite:monorepo` | `copyDir($PKG/templates/monorepo)` + `renameFiles` + `package.json` name patch; then `create-vite@latest` into `apps/website` (`--template vanilla-ts`) and `degit github:sxzz/tsdown-templates/vite-plus` into `packages/utils` | `apps/website` (Vite app), `packages/utils` (TS library), root `vite.config.ts` with `run.cache: true`, `pnpm-workspace.yaml`, `tsconfig.json`, `README.md` |
| `vite:library` | `degit github:sxzz/tsdown-templates/vite-plus` (subdirectory of a third-party repo) | A publishable, browser-less TypeScript package: `src/index.ts`, `tests/index.test.ts`, `vite.config.ts` with `pack`/`dts`/`exports`, scripts `build: vp pack`, `dev: vp pack --watch`, `test: vp test`, `check: vp check`, `prepublishOnly` |
| `vite:generator` | bundled `$PKG/templates/generator`; **monorepo only** | A Bingo-based code-generator package (`src/template.ts`, `bin/index.ts`, `bingo`+`zod` deps). Outside a monorepo it refuses: `The vite:generator template requires a monorepo workspace.` and it self-registers into `create.templates` |

Verbatim probe for the library output (this is the only builtin with no `index.html`):

```console
$ vp create vite:library --no-interactive --no-git --no-hooks --no-agent --directory lib
◇ Scaffolded lib with Vite+ library ... rc=0
$ find /tmp/pb/lib -not -path '*node_modules*' | sort
/tmp/pb/lib/.gitignore  /tmp/pb/lib/package.json  /tmp/pb/lib/pnpm-workspace.yaml
/tmp/pb/lib/README.md   /tmp/pb/lib/src/index.ts  /tmp/pb/lib/tests/index.test.ts
/tmp/pb/lib/tsconfig.json  /tmp/pb/lib/vite.config.ts
$ cat /tmp/pb/lib/src/index.ts
export function fn() {
  return "Hello, tsdown!";
}
```

Monorepo probe tree (abridged, exact):

```console
$ vp create vite:monorepo --no-interactive --no-git --no-hooks --no-agent --directory mono   # rc=0
/tmp/pb/mono/apps/website/{index.html,package.json,public/,src/{main.ts,counter.ts,style.css,assets/},tsconfig.json}
/tmp/pb/mono/packages/utils/{package.json,README.md,src/index.ts,tests/index.test.ts,tsconfig.json,vite.config.ts}
/tmp/pb/mono/{package.json,pnpm-workspace.yaml,vite.config.ts,tsconfig.json,README.md,.gitignore}
```

### 1.4 Exact non-interactive flags (and the defaults that bite)

Source of truth: the help text above plus the parse/flow code in `$PKG/dist/create/bin.js` and
`$PKG/dist/prompts-k14KgthC.js`, plus the probes in this document.

| Concern | Flag(s) | Non-interactive default (no flag given) |
|---|---|---|
| Template choice | first positional `[TEMPLATE]`; a **builtin** may also use `--directory <DIR>` | required; `vp create @org` in non-interactive prints a manifest table and **exits 1** |
| Target directory | `--directory <DIR>` — **builtin and bundled `@org` templates only** | builtins prompt/derive names; remote templates must take the dir as the first arg **after `--`** |
| Package manager | `--package-manager <pnpm\|npm\|yarn\|bun>` | `pnpm` — probe prints `Using default package manager: pnpm` (`selectPackageManager`: non-interactive returns `PackageManager.pnpm`) |
| TypeScript | **no Vite+ flag.** TS comes from the template's own flag, forwarded after `--` (e.g. `-- --template react-ts`) | template-dependent |
| Git init | `--git` / `--no-git` | **no git init** — `promptGitInit` returns `false` when non-interactive and `options.git` is undefined |
| Pre-commit hooks | `--hooks` / `--no-hooks` | **hooks ON** — help says "(default in non-interactive mode)"; `promptGitHooks` falls through to `return true` when non-interactive; docs: "`--hooks` enables pre-commit hook setup (dispatcher + `.vite-hooks` + `staged` config)" |
| Agent files | `--agent <NAME>` (accepts comma-separated list) / `--no-agent` | **AGENTS.md is written** — `resolveAgentOptions(agent ?? "agents")` (verified by probe) |
| Editor configs | `--editor <NAME>` / `--no-editor` | none written (`shouldConfigureEditorsForCreate` → `false` when `--editor` is absent and not interactive) |
| Prompts | `--no-interactive` / `--interactive` | `defaultInteractive() = !process.env.CI && process.stdin.isTTY` |
| Dependency build scripts | `--approve-builds` | non-interactive: a note lists gated deps and points at `vp pm approve-builds` |

Two argument-order rules that are easy to get wrong, both verified:

```console
$ vp create github:sxzz/tsdown-templates/vite-plus  pinned --no-interactive ...
error: unexpected argument 'pinned' found
$ vp create vite --no-interactive --agent cursor -- d4 --template vanilla-ts     # correct form, rc=0
$ vp create vite --no-interactive ... --directory d4 ... --template vanilla-ts
The --directory option is only available for builtin and bundled @org templates   # rc=1
```

`vp create --help` documents no `--template-version`, `--ts`, `--typescript`, or `--ref` flag, and the
parsed options interface confirms the closed set:

```ts
// $PKG/dist/create/bin.d.ts
export interface Options {
  directory?: string; interactive: boolean; list: boolean; verbose: boolean;
  agent?: string | string[] | false; editor?: string | false;
  git?: boolean; hooks?: boolean; packageManager?: PackageManager; approveBuilds?: boolean;
}
```

---

## 2. Backend coverage

### 2.1 Can `vp create` produce a pure backend TypeScript project?

**No builtin does.** Evidence:

* `vp create --list` (§1.1) contains exactly four `vite:*` builtins and seven popular shorthands, all
  of them frontend/UI frameworks (`create-vite`, TanStack Start, Next.js, Nuxt, React Router, Svelte,
  Vue).
* `grep -rn 'backend' $PKG/dist --include=*.js -i` → **zero matches** in the whole bundled CLI.
* `docs/guide/create.md` never mentions backend, server, API, or full-stack project creation. The only
  occurrence of the word anywhere in the live docs is an *example description string* a monorepo author
  writes themselves: `{ name: 'service', description: 'Backend service', template: 'service-generator' }`
  (https://viteplus.dev/config/create.md).

**Full-stack also has no builtin.** There is no SSR/server template in the list; the closest server-y
frameworks (`next-app`, `nuxt`, `@tanstack/start`) are reached only as third-party npm templates via
`<pm> dlx`, and what they produce is their own business, not Vite+'s.

**Closest thing to a backend artefact:** `vite:library` produces a pure TypeScript package with no
`index.html`, no browser entry, and a tsdown-based build (`vp pack`, `exports: "./dist/index.mjs"`) —
usable in Node, but it is a library, not a server: there is no HTTP entry point and no runtime dev
server. (Tree and `package.json` in §1.3.)

### 2.2 Mechanisms that do exist

| Mechanism | How | Evidence |
|---|---|---|
| GitHub template | `vp create github:user/repo` or `vp create https://github.com/user/repo` → `degit <owner>/<repo> [args]` via the package manager's dlx | code: `parseGitHubUrl` + `discoverTemplate` (`command: "degit"`); verified working end-to-end (`github:sxzz/tsdown-templates/vite-plus#main` scaffolded, rc=0) |
| Local monorepo template | register in `create.templates` in the root `vite.config.ts`; the referenced workspace package must have a `bin` | `docs/config/create.md`: *"A `create.templates` entry whose `template` does not match any workspace package, or resolves to a local package without a `bin`, is reported as an error rather than falling through to an unrelated npm package."* |
| `@org` picker | `vp create @org` → reads `createConfig.templates` from the published `@org/create` package's `package.json`; `vp create @org:web`, `vp create @org@1.2.3`, `vp create @org:web@next` | `docs/guide/create.md` §Organization Templates, incl. the manifest schema table |
| `vite:monorepo` | a place to put a backend package (`packages/*`, `apps/*`, `tools/*` workspaces) — it does not create one | probe tree §1.3 |

### 2.3 Documented template-authoring contract

Three distinct contracts exist; only the first two are real "contracts".

1. **Bingo generators** (`vite:*`-adjacent local templates). The bundled starter
   (`$PKG/templates/generator`) is the contract, and its `README.md` states it:

   > For automation, provide the directory and every required template option:
   > `vp create <generator-name> --no-interactive -- --directory new-package --name new-package`
   > Vite+ sets `VP_CREATE_INTERACTIVE=0` for non-interactive local Bingo generators.

   Required files: `package.json` with `bin` (and `bingo` as a dependency if you want
   `--skip-requests` auto-appended), `src/template.ts` exporting
   `createTemplate({ about, options: {…zod…}, async produce({options}) { return { files: {...}, scripts, suggestions } } })`,
   and `bin/index.ts` as the CLI entry (`runTemplateCLI` interactively, `runTemplate` programmatically
   when `VP_CREATE_INTERACTIVE === "0"`). Options are declared as Zod schemas; every option must also
   be added to the `parseArgs` list in `bin/index.ts`.

2. **Bundled `@org/create` subdirectory templates.** Copied as-is:

   > The referenced directory is copied into the target project as-is (no template-engine processing);
   > the only exception is that a small set of underscore-prefixed scaffold files (`_gitignore`,
   > `_npmrc`, `_yarnrc.yml`) are renamed to their dotfile equivalents. Paths that escape the package
   > root are rejected. — `docs/guide/create.md`

   Implemented as `const RENAME_FILES = { _gitignore: ".gitignore", _npmrc: ".npmrc", "_yarnrc.yml": ".yarnrc.yml" }`
   in `$PKG/dist/create/bin.js`. Note this renaming applies to `vite:monorepo` too (it ships `_gitignore`).

3. **Remote npm templates** (`create-*`): no manifest, no contract. `vp create` only requires the
   package to exist on npm (`checkNpmPackageExists`) and then runs it; the template owns its own flags,
   which you pass after `--`.

`create.templates` entry shape (from `docs/config/create.md`): `name` (required, unique, `vite:` prefix
reserved), `description` (required), `template` (required — workspace package name, relative `./path`
resolved against the workspace root, a `vite:*` builtin, a GitHub URL, or a full npm package name;
**"run as-is (not shorthand-expanded)"**). `create.defaultTemplate` sets the default; precedence is
`CLI argument > create.defaultTemplate > built-in picker`.

---

## 3. Agent integration

### 3.1 What `vp create --agent <NAME>` writes

The authoritative list is the installed CLI's own table (`$PKG/dist/agent-Cu6-tXIP.js`), not the docs —
no page on `viteplus.dev` enumerates the names (`llms-full.txt`, 267 509 bytes at research time,
contains only `--agent <name>` and one example, `vp migrate --agent claude --editor zed`).

| `id` | Target file | Hint (official) | Accepted aliases (normalized: lowercase, non-alphanumerics stripped) |
|---|---|---|---|
| `agents` | `AGENTS.md` | Codex, Amp, OpenCode, and similar agents | `agents.md`, `chatgpt`, `chatgpt-codex`, `codex`, `amp`, `kilo`, `kilo-code`, `kiro`, `kiro-cli`, `opencode`, `other` |
| `claude` | `CLAUDE.md` | Claude Code | `claude.md`, `claude-code` |
| `gemini` | `GEMINI.md` | Gemini CLI | `gemini.md`, `gemini-cli` |
| `copilot` | `.github/copilot-instructions.md` **plus** `.github/workflows/copilot-setup-steps.yml` | GitHub Copilot | `github-copilot`, `copilot-instructions.md` |
| `cursor` | `.cursor/rules/viteplus.mdc` | Cursor | `viteplus.mdc` |
| `jetbrains` | `.aiassistant/rules/viteplus.md` | JetBrains AI Assistant | `jetbrains`, `jetbrains-ai-assistant`, `aiassistant`, `viteplus.md` |

Behaviours proven by probe (`vp create vite:application --directory <d> --no-interactive --no-git --no-hooks --agent …`):

* `--agent codex,claude,cursor,copilot` → `AGENTS.md` is a real 1731-byte file; the others are
  **symlinks to it**, and the copilot workflow file is emitted:

  ```console
  $ ls -la app
  -rw-rw-r-- 1 … 1731 AGENTS.md
  lrwxrwxrwx 1 …    9 CLAUDE.md -> AGENTS.md
  lrwxrwxrwx 1 …   19 .cursor/rules/viteplus.mdc -> ../../AGENTS.md
  lrwxrwxrwx 1 …   17 .github/copilot-instructions.md -> ../AGENTS.md
  -rw-rw-r-- 1 …  .github/workflows/copilot-setup-steps.yml
  ```

  (Code: `tryLinkTargetToAgents` symlinks every non-`AGENTS.md` target to `AGENTS.md` with a relative
  link, falling back to `copyFile` on `EPERM`.)
* `--agent gemini,jetbrains` (no `agents` in the list) → real files `GEMINI.md` and
  `.aiassistant/rules/viteplus.md`, 1731 bytes each.
* `--agent bogus` → **no error**, silently writes `AGENTS.md`
  (`resolveSingleAgentOption` falls back to `AGENTS.find(o => o.id === "agents")`).
* `--no-agent` → no agent files at all.
* No `--agent` + `--no-interactive` → `AGENTS.md` is written (default id is `agents`).
* The content is always the CLI package's own `$PKG/AGENTS.md`, wrapped in markers
  `<!--VITE PLUS START-->` / `<!--VITE PLUS END-->`; verbatim it is:

  ```markdown
  <!--VITE PLUS START-->

  # Using Vite+, the Unified Toolchain for the Web

  This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

  Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

  ## Built-in Commands vs Scripts

  `vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

  ## Tool Versions

  Run `vp toolchain` to show versions and relationships in the active Vite+
  release. Add a tool name to select part of the graph. For example, run
  `vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
  `vp why <package>` to show the package-manager dependency graph.

  ## Review Checklist

  - [ ] Run `vp install` after pulling remote changes and before getting started.
  - [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
  - [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
  - [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

  <!--VITE PLUS END-->
  ```

* The Copilot workflow is fixed content (verbatim, probe output), including the pinned action tag
  `voidzero-dev/setup-vp@v1.20.0` (= `SETUP_VP_VERSION` in `$PKG/dist/constants-C2dTOTe-.js`):

  ```yaml
  name: "Copilot Setup Steps"
  on:
    workflow_dispatch:
    push:
      paths: [.github/workflows/copilot-setup-steps.yml]
    pull_request:
      paths: [.github/workflows/copilot-setup-steps.yml]
  jobs:
    copilot-setup-steps:
      runs-on: ubuntu-latest
      permissions:
        contents: read
      steps:
        - name: Checkout code
          uses: actions/checkout@v6
          with:
            persist-credentials: false
        - name: Set up Vite+
          uses: voidzero-dev/setup-vp@v1.20.0
          with:
            cache: true
            run-install: true
        - name: Verify Vite+
          run: vp --version
  ```

* Collision policy (`classifyExistingAgentTarget` / `writeAgentInstructions`): an existing file
  **with** the markers gets its marked section replaced in place; an existing file **without** markers
  is skipped non-interactively and prompts `Append` / `Skip` interactively (`initialValue: "skip"`);
  symlinked targets are skipped. So a template that ships its own `AGENTS.md` is *not* overwritten.
* **No MCP config and no skills are generated.** `dist/agent-Cu6-tXIP.js` and `dist/config/bin.js` were
  read in full; they write only the six instruction targets plus the Copilot workflow.

### 3.2 What `vp config --agent` writes

`vp config`'s `--agent` is a **boolean**, not a name — see the help text in §4.3 and:

```console
$ vp config --agent claude --no-hooks
error: unexpected argument 'claude' found

Usage: vp config [OPTIONS]
rc=1
```

And it never creates agent files — it only refreshes marked sections of files that already exist and
already contain the Vite+ markers (`updateExistingAgentInstructions` → `detectExistingAgentTargetPaths`):
"Silently update agent instruction files that contain Vite+ markers. No agent files → no writes."

```console
$ mkdir /tmp/pd && cd /tmp/pd && vp config --no-hooks && vp config --agent --no-hooks
rc=0
$ ls -a
.  ..          # no AGENTS.md, no CLAUDE.md
```

Net: **`vp create --agent` creates; `vp config --agent` only refreshes what `vp create` (or a previous
`vp migrate --agent`) already created.** `vp migrate` accepts `--agent` with a name too
(`vp migrate --agent claude --editor zed`, live `docs/guide/migrate.md`).

---

## 4. Generated project surface (what a template must not fight)

### 4.1 Defaults

* **Package manager: pnpm.** Non-interactive `vp create` prints `Using default package manager: pnpm`,
  then `pnpm@latest installing… pnpm@12.5.1 installed`. Detection order for existing projects
  (`docs/guide/install.md`): `packageManager` field, `devEngines.packageManager`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, …, falling back to pnpm; `vp env pin <pm>@<version>` sets an exact version.
* **Toolchain bundled by `vite-plus@0.3.3`** (`$PKG/package.json` dependencies):
  `vite: npm:@voidzero-dev/vite-plus-core@0.3.3`, `vitest 4.1.11`, `oxfmt =0.68.0`, `oxlint =1.83.0`,
  `oxlint-tsgolint =7.0.2001`, plus tsdown/rolldown via Vite+ internals.
* **Formatter: Oxfmt**, **linter: Oxlint** (type-aware via tsgolint), **tests: Vitest** exposed as
  `vite-plus/test` (docs: *"a single `vite-plus` install is enough — you do not need to install
  `vitest` directly"*).
* **Task cache:** `run.cache.tasks = true`, `run.cache.scripts = false` by default
  (`docs/guide/cache.md` table); the monorepo template turns it on explicitly with
  `run: { cache: true }`.

### 4.2 Verbatim probe: standalone scaffold with git + hooks + editor + agents

```console
$ XDG_CACHE_HOME=/tmp/vxc XDG_DATA_HOME=/tmp/vxd npm_config_cache=/tmp/vxn VP_SKIP_INSTALL=1 \
  vp create vite:application --directory app --no-interactive --git --hooks --editor vscode \
    --package-manager pnpm --agent codex,claude,cursor,copilot -- --template react-ts
rc=0
$ find /tmp/pa -not -path '*/node_modules*' | sort        # abridged to the files that matter
/tmp/pa/app/{AGENTS.md, CLAUDE.md, README.md, index.html, package.json, pnpm-workspace.yaml,
             tsconfig.json, tsconfig.app.json, tsconfig.node.json, vite.config.ts, .gitignore}
/tmp/pa/app/.cursor/rules/viteplus.mdc
/tmp/pa/app/.github/{copilot-instructions.md, workflows/copilot-setup-steps.yml}
/tmp/pa/app/.vscode/{settings.json, extensions.json}
/tmp/pa/app/.vite-hooks/pre-commit            # project-owned, contents: "vp staged"
/tmp/pa/app/.vite-hooks/_/{pre-commit,h,commit-msg,post-checkout,…,applypatch-msg,.gitignore}
/tmp/pa/app/.git/…                            # because --git was passed
$ git -C /tmp/pa/app config --get core.hooksPath
.vite-hooks/_
```

`package.json` after the rewrite (react-ts variant, verbatim):

```json
{
  "name": "app", "private": true, "version": "0.0.0", "type": "module",
  "scripts": {
    "dev": "vp dev", "build": "tsc -b && vp build", "lint": "vp lint",
    "preview": "vp preview", "prepare": "vp config"
  },
  "dependencies": { "react": "^19.2.8", "react-dom": "^19.2.8" },
  "devDependencies": {
    "@types/node": "^24.13.3", "@types/react": "^19.2.18", "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1", "typescript": "~6.0.2",
    "vite": "catalog:", "vite-plus": "catalog:"
  },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" } }
}
```

`vite.config.ts` after the rewrite (verbatim; note `staged`, merged `.oxlintrc.json`, and
`lazyPlugins`):

```ts
import react from '@vitejs/plugin-react'
import { defineConfig, lazyPlugins } from 'vite-plus'

// https://vite.dev/config/
export default defineConfig({
  staged: { "*": "vp check --fix" },
  fmt: {},
  lint: { "plugins": ["react","typescript","oxc"], "rules": {…}, "options": { "typeAware": true, "typeCheck": true },
    "jsPlugins": [{ "name": "vite-plus", "specifier": "vite-plus/oxlint-plugin" }] },
  plugins: lazyPlugins(() => [react()]),
})
```

Corroborating code: `$PKG/dist/editor-4sjlHmUh.js` holds
`const DEFAULT_STAGED_CONFIG = { "*": "vp check --fix" };`,
`if (!pkg.scripts.prepare) pkg.scripts.prepare = "vp config";` and
`else if (!pkg.scripts.prepare.includes("vp config")) pkg.scripts.prepare = \`vp config && ${pkg.scripts.prepare}\`;`.
The scaffolding transcript also prints `Merged vite-project/.oxlintrc.json into vite-project/vite.config.ts`,
`Rewrote imports in one file` and `Wrapped inline Vite plugins with lazyPlugins`.

### 4.3 Hook dispatcher (`vp hooks` / `vp config`)

`vp config --help` (verbatim):

```console
Usage: vp config [OPTIONS]

Configure Vite+ for the current project (hook dispatcher + agent integration).

Options:
  --hooks-dir <path>  Custom hooks directory (default: .vite-hooks, or last used in this clone)
  --hooks             Install the hook dispatcher
  --no-hooks          Skip hook dispatcher installation
  --agent             Update coding agent instructions
  --no-agent          Skip updating coding agent instructions
  -h, --help          Show this help message

Environment:
  VP_GIT_HOOKS=0  Skip hook dispatcher installation
```

* Dispatcher lives in `<hooks-dir>/_` (generated, gitignored, recreated) while
  `<hooks-dir>/pre-commit` is **project-owned** and should be committed. `core.hooksPath` points at
  `<hooks-dir>/_`.
* `vp hooks enable|disable|status`; `vp hooks disable` persists a **local** preference so
  `prepare`/`vp config` do not reinstall (`git config --local vp.hooks.disabled true` is the documented
  manual equivalent); remembered dir key `vp.hooks.dir`.
* `VP_GIT_HOOKS=0` (and `HUSKY=0` for compatibility) disables at commit time and skips reinstall;
  init scripts `$XDG_CONFIG_HOME/vite-plus/hooks-init.sh` then `$XDG_CONFIG_HOME/husky/init.sh` are
  sourced by every generated hook.
* `vp staged` reads the `staged` block from `vite.config.ts` and is what `.vite-hooks/pre-commit`
  runs. Docs: *"This is the default Vite+ approach and should replace separate `lint-staged`
  configuration in most projects."*

### 4.4 What this means for a template

Anything a template ships in these areas will be rewritten, merged, or warned about:

* `vite.config.ts` — rewritten/wrapped (`lazyPlugins`, imports, `fmt`/`lint`/`staged` blocks injected);
  an `.oxlintrc.json` is **merged into** `vite.config.ts` and the docs say nested lint/format config is
  not supported.
* `package.json` — scripts rewritten to `vp …`, `prepare` script injected when hooks are set up,
  `vite`/`vite-plus` added as `catalog:` deps, `pnpm` catalog/overrides written.
* ESLint/Prettier/tsup projects trigger migration prompts (`detectEslintProject`,
  `promptEslintMigration`, `promptPrettierMigration`, `promptTsupMigration`).
* Husky/lefthook/simple-git-hooks/yorkie hook tooling is *preserved with a warning*, never converted
  (live `docs/guide/migrate.md`), so a template shipping Husky silently wins over Vite+'s hooks.

---

## 5. "Always latest" mechanics

### 5.1 What is fetched at run time vs bundled

| Scaffolded thing | Resolution | Pinned? |
|---|---|---|
| `vite:application`, `vite` shorthand, `@tanstack/start`, `next-app`, `nuxt`, `react-router`, `svelte`, `vue` | shorthand expansion (`expandCreateShorthand`: `vite`→`create-vite`, `svelte`→`sv`, `next-app`→`create-next-app`, `@tanstack/start`→`@tanstack/cli`, `nitro`→`create-nitro-app`, otherwise `create-<name>`) then `<pm> dlx <spec>` with **no version** → npm `latest` at run time. `vite:application` is literally `create-vite@latest` in code | **No** |
| `vite:library`, and the monorepo's `packages/utils` | `degit github:sxzz/tsdown-templates/vite-plus` — no ref → GitHub default branch | **No** |
| `vite:monorepo` root files | bundled snapshot `$PKG/templates/monorepo`, copied and patched | Bundled with the CLI version |
| `vite:generator` | bundled snapshot `$PKG/templates/generator` | Bundled with the CLI version |
| `vite-plus` / `vite` in the new project | `pnpm-workspace.yaml` catalog: `vite: npm:@voidzero-dev/vite-plus-core@<CLI version>`, `vite-plus: <CLI version>` (probe: `0.3.3`) — `VP_VERSION` overrides (`VITE_PLUS_VERSION = process.env.VP_VERSION || version`) | **Yes** — to the CLI's own version |
| Package manager binary | `pnpm@latest installing… pnpm@12.5.1 installed`, then recorded as `devEngines.packageManager.version = "12.5.1"` | No — whatever latest was at run time |

Verbatim proof of the run-time fetch (`--verbose`):

```console
$ vp create vite:application --directory v1 --no-interactive --no-agent --no-git --no-hooks \
    --verbose -- --template vanilla-ts
Running: pnpm dlx create-vite@latest v1 --template vanilla-ts --no-interactive --no-immediate --no-rolldown
+ create-vite 9.2.1
```

`autoFixRemoteTemplateCommand` also injects per-template flags: `create-vite` gets
`--no-immediate --no-rolldown`; `@tanstack/cli` gets a `create` subcommand, `--no-install --no-toolchain`;
`sv` gets `create --no-install`; in a monorepo `create-nuxt` gets `--no-gitInit` and `@tanstack/cli`
`--no-git`.

### 5.2 How to verify you got latest

* `--verbose` prints the exact `Running: <pm> dlx <spec>` line, and the package manager prints the
  resolved version (`+ create-vite 9.2.1`). This is the only CLI-native evidence in the scaffold output.
* `vp view <pkg> version` / `vp info <pkg>` for the registry's answer at any time (needed
  `npm_config_cache` redirected here only because `~/.npm` is read-only in this sandbox).
* `vp --version`, `vp toolchain [--global] [--json]` for the toolchain actually in play.

### 5.3 Updating `vp` itself, and whether 0.3.3 is latest

`docs/guide/upgrade.md` (identical in the bundled 0.3.3 docs and live):

> Update the global CLI with:
> ```bash
> vp upgrade                        # upgrade to the latest version
> vp upgrade --check                # check for updates without installing
> vp upgrade <version>              # install a specific version
> vp upgrade --registry <registry>  # use a custom npm registry
> ```
> Vite+ keeps the **3 most recent** versions installed so you can revert quickly: `vp upgrade --rollback`

`vp upgrade --help` (verbatim) adds `--tag <TAG>  npm dist-tag to install (default: "latest", also: "alpha") [default: latest]`,
`--force`, `--silent`. Homebrew installs delegate to `brew upgrade vite-plus`.

**0.3.3 is NOT the latest.** Three independent first-party readings agree:

```console
$ vp upgrade --check
info: checking for updates...
info: found vite-plus@1.0.0-rc.0 (current: 0.3.3)
Update available: 0.3.3 → 1.0.0-rc.0
Run `vp upgrade` to update.

$ npm_config_cache=/tmp/vpx-npm-cache vp view vite-plus dist-tags
{ test: '0.0.2-g9a3a310d.20260303-0757', alpha: '0.1.21-alpha.7', latest: '1.0.0-rc.0' }
```

The stale local cache confirms it is a moving target: `~/.vite-plus/cache/upgrade-check.json` reads
`{"checked_for":"0.3.3","latest":"0.3.3","status":"current","checked_at":1790062071}`, while
`~/.vite-plus/.upgrade-check.json` and `.previous-version` (`0.3.2`) show earlier checks.

The live docs are 1.x (their `llms.txt` index includes `/guide/upgrade-project.md` with a prompt
*"to upgrade an existing Vite+ 0.3 project"*), **but the create surface did not change**: live
`https://viteplus.dev/guide/create.md` (15 123 bytes) is the same document as the bundled
`$PKG/docs/guide/create.md` (15 171 bytes; the delta is the live front-matter `--- url: … ---`), and
likewise for `/config/create.md`. So everything in §1–§4 is expected to hold for 1.0.0-rc.0 — see the
UNVERIFIED list for what that claim does *not* cover.

---

## 6. Reproducibility exit

| Lever | Status | Evidence |
|---|---|---|
| Lockfile | Produced by the install step: the one full (installing) probe yielded `pnpm-lock.yaml` + `node_modules` in the new project | probe with real install: tree contained `/tmp/vp-probe2/vite-project/pnpm-lock.yaml`; `✓ Dependencies installed in 505s` |
| Toolchain pin | **Yes, by default**: `pnpm-workspace.yaml` catalog pins `vite-plus` and the `vite` alias to the scaffolding CLI's version, plus `overrides: { 'vite@*': 'catalog:' }`, `peerDependencyRules`; monorepo adds `catalogMode: prefer`, `typescript`, `@types/node` | probe output, `pnpm-workspace.yaml` in §5.1 |
| Template ref pin | `vp create @org@1.2.3` and `vp create @org:web@next` (npm version or dist-tag for the *manifest* package); manifest entries may carry `@version` | docs: *"Pin to an exact version or a dist-tag"*; manifest table: *"An npm specifier (`@org/template-foo`, optionally `@version`)"* |
| GitHub ref pin | `github:user/repo#ref` works, because the whole spec is handed to `degit` | probe: `github:sxzz/tsdown-templates/vite-plus#main` → rc=0; `…#no-such-branch-xyz` → rc=1 with *"Make sure the GitHub repository exists"* troubleshooting |
| Config field | `create.defaultTemplate` pins *which* template, not its version; `create.templates[].template` may embed `@version`; no other version field exists | `docs/config/create.md`; `$PKG/dist/create/bin.d.ts` has no version option |
| CLI-version pin of the scaffold | `VP_VERSION` env overrides the vite-plus version written into the catalog | `$PKG/dist/constants-C2dTOTe-.js` |

**Gotcha found by probe:** with a ref and no explicit directory, the inferred target directory keeps the
ref verbatim — `vp create github:sxzz/tsdown-templates/vite-plus#main --no-interactive …` created
`./vite-plus#main` and printed `→ Next: cd "vite-plus#main" && vp run`. Always pass the directory after
`--` (`vp create github:user/repo#ref --no-interactive … -- my-dir`).

**No documented way to pin the `create-vite` version** that `vite:application` / the `vite` shorthand
resolves — see UNVERIFIED.

---

## UNVERIFIED

Explicitly not established by the evidence above. None of these should be filled in with a guess:

1. **Whether any template produces a true backend or full-stack app.** No builtin does (§2.1), but what
   third-party npm templates (`next-app`, `nuxt`, `@tanstack/start`, …) emit was not probed, and no
   Vite+-side backend template was found in code, `--list`, or docs.
2. **Whether 1.0.0-rc.0 adds builtin templates or new `--agent` ids.** Only the 0.3.3 binary and its
   bundled docs were inspected. The live create/config docs are textually identical to 0.3.3's, but the
   1.0.0-rc.0 binary was not available (no install/upgrade attempted).
3. **How npm / yarn / bun scaffolds pin `vite-plus`.** Only the pnpm path was probed
   (`pnpm-workspace.yaml` catalog + `overrides`). Code comments claim npm/yarn/bun use root
   `overrides`/`resolutions` instead, but that was not executed.
4. **Whether `github:user/repo#ref` is officially supported.** NOT DOCUMENTED on viteplus.dev (searched
   the whole 267 509-byte `llms-full.txt`; no `#ref` syntax appears). It works only as degit
   pass-through, verified empirically for `#main` and for a deliberately bogus ref.
5. **Whether `sxzz/tsdown-templates` (the source of `vite:library` and the monorepo library) is itself
   versioned/pinned.** Code shows no ref, so it tracks the default branch; the repository's default
   branch and release tags were not inspected (GitHub DNS blocked, and `codeload` was not tried).
6. **`@org` picker / `@org:name@version` end-to-end.** Documented in detail, but no `@org/create`
   package was available to exercise; the non-interactive manifest-table path was not run.
7. **MCP configuration and skills generation for agents.** None found in the 0.3.3 code paths read in
   full (`dist/agent-Cu6-tXIP.js`, `dist/config/bin.js`) and none mentioned in the docs; whether
   1.0.0-rc.0 adds them is unverified.
8. **`--editor <NAME>`'s full value list** (out of scope for the questions asked; `vscode` was the only
   value probed, and it wrote `.vscode/settings.json` with `"npm.scriptRunner": "vp"` and
   `oxc.oxc-vscode` as the default formatter).
9. **`checkNpmPackageExists` behaviour for a template that does not exist on npm** — read in code
   (`log.error('Template "…" not found on npm.')` + `exitCode 1`), not executed.
10. **Hooks-on-by-default in non-interactive mode was not isolated by probe.** The two independent
    sources are the help text (`--hooks  Set up pre-commit hooks (default in non-interactive mode)`) and
    `promptGitHooks` returning `true` at the end of its non-interactive branch; every probe here passed
    `--hooks` or `--no-hooks` explicitly.
11. **Proxy/registry specifics of the run-time fetch.** The `pnpm dlx` resolution went through this
    sandbox's network interception; the resolved `create-vite@9.2.1` is what the *sandbox* saw, not
    necessarily what a normal environment sees today.

---

## Implications for an agent-facing init doc

1. **Non-interactive invocations are opinionated.** For a frontend app the deterministic incantation is
   `vp create vite:application --no-interactive --directory <dir> --package-manager pnpm --git --hooks
   --agent <ids> -- --template <name>`. Remember: git is **off**, hooks are **on**, AGENTS.md **is
   written**, editor configs are **off** unless asked for; `--directory` only works for builtins.
2. **Agent-file collisions are the biggest hazard.** `vp create --no-interactive` writes `AGENTS.md`
   by default. If the target repo (or the template) already has an `AGENTS.md` **without** the
   `<!--VITE PLUS START-->` markers, `vp create` skips it silently; if it *has* the markers it rewrites
   that section. Decide deliberately between `--agent agents`, another agent id, or `--no-agent`, and
   say so in the init doc. Never assume `vp config` will create the file — `vp config --agent` is a
   boolean refresh-only switch.
3. **Use the canonical agent ids** (`agents`, `claude`, `gemini`, `copilot`, `cursor`, `jetbrains`),
   comma-separated for several. Unknown names silently degrade to `AGENTS.md`, so a typo is invisible.
4. **There is no backend/full-stack builtin.** An init doc that needs a server project must either
   (a) hand-author it, (b) point at a `github:owner/repo#ref` template and always pass an explicit
   target directory (otherwise the directory is literally named `repo#ref`), or (c) register a local
   bingo generator in `create.templates` — the only mechanism with a documented authoring contract
   (`src/template.ts` + zod options + `produce()`, `bin/index.ts` CLI, `VP_CREATE_INTERACTIVE=0` in
   non-interactive runs).
5. **Templates must not fight the generated tooling.** Put lint/format/staged config in
   `vite.config.ts`; do not ship `.oxlintrc.json` (it gets merged into the config), ESLint/Prettier/tsup
   config (they trigger migration prompts), or Husky/lefthook (Vite+ then refuses to install its own
   hooks and only warns). Expect `vite.config.ts`, `package.json` scripts, and import statements to be
   rewritten, and `prepare: vp config` to appear.
6. **Reproducibility needs two explicit moves.** Pin the template source (`github:…/repo#ref`, or an
   npm `@version` / `@org:name@tag`) and rely on the catalog pin for the toolchain
   (`vite-plus: <CLI version>`, written by default). `create-vite` itself is **always `@latest`** and
   cannot be pinned through `vp`; record the resolved version from `vp create --verbose` (or
   `vp view create-vite version`) in the init doc/CI if that matters.
7. **Version-awareness banner for the agent.** The binary on this machine is 0.3.3 while registry
   `latest` is `1.0.0-rc.0`; `vp upgrade --check` and `vp view vite-plus dist-tags` are the sanctioned
   ways to check. Advise agents to run `vp <cmd> --help` rather than trusting a memorized flag list,
   because `vp` self-updates and the docs ship inside `node_modules/vite-plus/docs`.

---

## Round-3 addendum — skeleton assembly and AGENTS.md ownership

Round 3 answers only the questions the sections above left open. Every claim below is a fresh probe against
the same installed binary (the sections above are unchanged):

| | |
|---|---|
| Binary | `/home/leihaohao/.vite-plus/bin/vp` → `vp v0.3.3` |
| Round-3 date (UTC) | 2026-09-23 |
| Probe preamble (every command below) | `XDG_CACHE_HOME=/tmp/<p>/xdc XDG_DATA_HOME=/tmp/<p>/xdd npm_config_cache=/tmp/<p>/npm CI=1` |
| Where probes ran | throwaway `/tmp/<p>/…` only — never inside this repo |
| Install steps | either `VP_SKIP_INSTALL=1` (marked **no-install**) or a real install (**real install**, 24 s with pnpm / 53–59 s with npm) |
| `degit` for the library | `vp dlx degit github:sxzz/tsdown-templates/vite-plus <dir>` → `> cloned sxzz/tsdown-templates#HEAD to <dir>`, rc=0 (confirms `vite-plus` is a **subdirectory** of that repo's default branch, not a branch) |

**Round-3 method note.** `/tmp` is ephemeral per *bash invocation* in this sandbox (not per file): two
separate tool calls do not share it. Every probe below is therefore one self-contained shell command that
scaffolds, inspects and prints in the same invocation, so the transcripts are reproducible as written.
Files written with the editor/write tools under `/tmp` land in a *different* overlay than `/tmp` seen by
`bash` — use heredocs inside the command. `~/.vite-plus` and `~/.npm` were never written to.

---

### A1. AGENTS.md: full content, markers, and refresh safety

#### A1.1 The generated file, verbatim

```console
$ vp create vite:application --directory x1 --no-interactive --no-git --no-hooks \
    --agent agents --package-manager pnpm -- --template vanilla-ts        # rc=0, no prompts
$ wc -c x1/AGENTS.md
1731 x1/AGENTS.md
$ sha256sum x1/AGENTS.md
135ce87bb04f351ec2b3d4c702c3ff84f612684c21c352a02c0dd5e51bdbcfc5  x1/AGENTS.md
$ tail -c 30 x1/AGENTS.md | od -c        # file starts at byte 0 with the START marker, ends with a newline
0000000   r       h   e   l   p   .  \n  \n   <   !   -   -   V   I   T
0000020   E       P   L   U   S       E   N   D   -   -   >  \n
0000036
```

Full content, byte-for-byte (this is the complete file; identical to `$PKG/AGENTS.md`):

```markdown
<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
```

#### A1.2 Exactly what `vp config --agent` rewrites

The mechanism is a pure **splice of the marked range**, so anything outside the two markers is preserved
byte-for-byte. Verbatim from `$PKG/dist/agent-Cu6-tXIP.js`:

```js
const AGENT_INSTRUCTIONS_START_MARKER = "<!--VITE PLUS START-->";
const AGENT_INSTRUCTIONS_END_MARKER = "<!--VITE PLUS END-->";

function replaceMarkedAgentInstructionsSection(existing, incoming) {
	const existingRange = getMarkedRange(existing, AGENT_INSTRUCTIONS_START_MARKER, AGENT_INSTRUCTIONS_END_MARKER);
	if (!existingRange) return;
	const incomingRange = getMarkedRange(incoming, AGENT_INSTRUCTIONS_START_MARKER, AGENT_INSTRUCTIONS_END_MARKER);
	if (!incomingRange) return;
	return `${existing.slice(0, existingRange.start)}${incoming.slice(incomingRange.start, incomingRange.end)}${existing.slice(existingRange.end)}`;
}

/**
* Silently update agent instruction files that contain Vite+ markers.
* - No agent files → no writes
* - No Vite+ markers → no writes
* - Markers present, content up to date → no writes
* - Markers present, content outdated → update marked section
*/
function updateExistingAgentInstructions(projectRoot) { … }

function detectExistingAgentTargetPaths(projectRoot) {
	…
	if (fs.existsSync(targetPath) && !fs.lstatSync(targetPath).isSymbolicLink()) detectedPaths.push(option.targetPath);
	…
}
```

Note the last line: the refresh path **skips symlinked targets** — it only ever considers real files.

#### A1.3 Proof: marker-free text survives a refresh

One command (`no-install` probe). Three mutations at once: text prepended **above** `START`, a hand edit
**inside** the markers, text appended **below** `END`. Then `vp config --agent`:

```console
$ vp config --agent --no-hooks
warn: No project-local vite-plus installation was found. Run `vp install` in `/tmp/p1/x1` to install dependencies.
rc=0

$ diff EDITED.md x1/AGENTS.md          # what the refresh changed
5c5
< # Using Vite+, the Unified Toolchain for the Web (HAND-EDITED INSIDE MARKERS)
---
> # Using Vite+, the Unified Toolchain for the Web
DIFF RC=1

$ diff ORIGINAL.md x1/AGENTS.md        # what survived
0a1,2
> # Project preamble (marker-free, ABOVE the Vite+ block)
> 
27a30,33
> 
> ## Our project rules (marker-free, APPENDED below the Vite+ block)
> - rule one
> - rule two
DIFF2 RC=1
```

* The hand edit **inside** the markers was reverted (the marked range is authoritative).
* Both marker-free additions survived **exactly**, including their surrounding blank lines.
* The file grew 1731 → 1878 bytes; the markers still occur exactly once each.

Idempotency, proven separately with hashes (`no-install` probe). Appending one marker-free section and
running the refresh twice:

```console
### hash BEFORE refresh ###   9847d18cfea5fdc7d6c16c8d795aec3ddd50e8542964311ab95911898f48b8c0  1789 AGENTS.md
refresh1 rc=0
### hash AFTER refresh 1 ###  9847d18cfea5fdc7d6c16c8d795aec3ddd50e8542964311ab95911898f48b8c0  1789 AGENTS.md
refresh2 rc=0
### hash AFTER refresh 2 ###  9847d18cfea5fdc7d6c16c8d795aec3ddd50e8542964311ab95911898f48b8c0  1789 AGENTS.md
IDEMPOTENT DIFF RC=0 (0 = byte-identical; the section was already current → no writes)
```

#### A1.4 The other two collision cases

| Situation | `vp create --agent …` | `vp config --agent` |
|---|---|---|
| File **has** markers | marked range replaced in place (§3.1 above; `writeAgentInstructions` → `classifyExistingAgentTarget` → `kind: "markers"`) | marked range replaced; other bytes kept (§A1.3) |
| File **has no** markers | non-interactive: `Skipped writing <path> (already exists)`; interactive: prompt `Append` / `Skip`, `initialValue: "skip"`; `Append` ⇒ `appendFile(dest, `${separator}\n${incomingContent}`)` | **no writes at all** — proven: a hand-written marker-free `nm/AGENTS.md` was byte-identical after `vp config --agent --no-hooks` (`diff` rc=0) |
| Target is a symlink | skipped when it points where vp wants (`Skipped linking … (already linked to AGENTS.md)`); re-linked/copied otherwise | not detected at all (§A1.2) |

Reverse-convention sanity check (`no-install` probe): with `AGENTS.md -> CLAUDE.md` (the *opposite* of what
`vp create` does) and markers only in `CLAUDE.md`, `vp config --agent` refreshed `CLAUDE.md` and left the
symlink alone. This is consistent with the two rules above and is *not* a supported layout — vp's own
convention is real `AGENTS.md` + symlinks pointing **at** it.

**Answer to the load-bearing question:** a guide **can extend vp's `AGENTS.md` instead of overwriting it.**
Append (or prepend) a marker-free section and it survives both `vp config --agent` and future
`vp create`/`vp migrate --agent` refreshes. Conversely, a project-authored `AGENTS.md` with *no* Vite+
markers is never touched by vp at all — but then vp's own text is never added either.

---

### A2. File trees per builtin

Two fast probes (`VP_SKIP_INSTALL=1`, **no-install**) and one full probe (**real install**). None of them
prompted: with `--no-interactive` there is no prompt at all (the only prompt observed in round 3 required
forcing `--interactive`, see §A6). The `warn: No project-local vite-plus installation was found` /
`error: Failed to resolve vite config` / `You may need to run "vp fmt" manually` lines in the no-install
transcripts are the documented `VP_SKIP_INSTALL` probe artefact from the Method note above; they do not
appear when installation runs.

#### A2.1 `vite:application --template vanilla-ts`

```console
$ vp create vite:application --directory app --no-interactive --no-git --no-hooks \
    --no-agent --package-manager pnpm -- --template vanilla-ts
◇ Scaffolded app with Vanilla + TypeScript
• Node 24.21.0  pnpm 12.5.1
→ Next: cd app && vp run
rc=0
$ find app -not -path '*/node_modules/*' | sort
app/.gitignore
app/index.html
app/package.json
app/pnpm-workspace.yaml
app/public/favicon.svg
app/public/icons.svg
app/src/assets/hero.png
app/src/assets/typescript.svg
app/src/assets/vite.svg
app/src/counter.ts
app/src/main.ts
app/src/style.css
app/tsconfig.json
app/vite.config.ts
```

(`--directory` on a **pre-created but empty** directory is fine; see §A5 for non-empty. A real install adds
`node_modules/` + `pnpm-lock.yaml`; `--git` adds `.git/`; `--hooks` adds `.vite-hooks/`; the default agent
setting adds `AGENTS.md`.)

What is whose — `diff -r` of a raw `create-vite@latest … --template vanilla-ts` run against the vp result
(**no-install** probe, verbatim):

```console
$ diff -r plain app
diff -r plain/index.html app/index.html
7c7
<     <title>plain</title>
---
>     <title>app</title>
diff -r plain/package.json app/package.json
2c2
<   "name": "plain",
---
>   "name": "app",
7,9c7,9
<     "dev": "vite",
<     "build": "tsc && vite build",
<     "preview": "vite preview"
---
>     "dev": "vp dev",
>     "build": "tsc && vp build",
>     "preview": "vp preview"
13c13,21
<     "vite": "^8.3.0"
---
>     "vite": "catalog:",
>     "vite-plus": "catalog:"
>   },
>   "devEngines": {
>     "packageManager": {
>       "name": "pnpm",
>       "version": "12.5.1",
>       "onFail": "download"
>     }
Only in app: pnpm-workspace.yaml
Only in app: vite.config.ts
```

So `index.html` (title only), `package.json`, `tsconfig.json`, `.gitignore`, `public/*` and `src/*` are
**create-vite-authored**; vp **rewrites** `package.json` (scripts to `vp …`, `vite` → `catalog:`,
`+vite-plus: catalog:`, `+devEngines.packageManager`) and `index.html`'s title, and **creates**
`vite.config.ts` + `pnpm-workspace.yaml` (plus, per flags, `AGENTS.md` and `.vite-hooks/`).
Note `create-vite` itself writes **no** `vite.config.ts` — that file is entirely vp's.

#### A2.2 `vite:library` (real install, `--git --hooks`, default `--agent`)

```console
$ vp create vite:library --directory lib --no-interactive --git --hooks --package-manager pnpm
◇ Scaffolded lib with TypeScript library
• Node 24.21.0  pnpm 12.5.1
✓ Dependencies installed in 24s
→ Git (optional): git -C lib add -A && git -C lib commit -m "chore: initial commit"
→ Next: cd lib && vp run
CREATE RC=0
$ find lib -not -path '*/node_modules/*' -not -path '*/.git/*' | sort
lib/.gitignore
lib/.vite-hooks/pre-commit
lib/.vite-hooks/_/.gitignore
lib/.vite-hooks/_/{applypatch-msg,commit-msg,h,post-applypatch,post-checkout,post-commit,
                   post-merge,post-rewrite,pre-applypatch,pre-auto-gc,pre-commit,
                   pre-merge-commit,prepare-commit-msg,pre-push,pre-rebase}
lib/AGENTS.md
lib/package.json
lib/pnpm-lock.yaml
lib/pnpm-workspace.yaml
lib/README.md
lib/src/index.ts
lib/tests/index.test.ts
lib/tsconfig.json
lib/vite.config.ts
$ git -C lib config --get core.hooksPath
.vite-hooks/_
$ cat lib/.vite-hooks/pre-commit      # project-owned, meant to be committed
vp staged
$ cat lib/.vite-hooks/_/.gitignore    # dispatcher dir ignores itself
*
```

vp-authored: `pnpm-workspace.yaml` (catalog pin), `AGENTS.md`, `.vite-hooks/**`, `pnpm-lock.yaml`, the
rewrites in `package.json`/`vite.config.ts`. Template-authored (byte-identical to the raw `degit`):
`tsconfig.json`, `src/index.ts`, `tests/index.test.ts`, `README.md`, `.gitignore` — verified with `cmp`:

```console
$ diff -rq rawlib lib
Files rawlib/package.json and lib/package.json differ
Only in lib: pnpm-workspace.yaml
Files rawlib/vite.config.ts and lib/vite.config.ts differ
$ for f in tsconfig.json src/index.ts tests/index.test.ts README.md .gitignore; do cmp -s rawlib/$f lib/$f && echo "IDENTICAL: $f"; done
IDENTICAL: tsconfig.json
IDENTICAL: src/index.ts
IDENTICAL: tests/index.test.ts
IDENTICAL: README.md
IDENTICAL: .gitignore
```

The two rewrites worth knowing (verbatim diffs):

```diff
--- rawlib/package.json
+++ lib/package.json
@@
-  "name": "vite-plus-starter",
+  "name": "lib",
@@
-    "vite-plus": "^0.2.4"
+    "vite": "catalog:",
+    "vite-plus": "catalog:"
+  },
+  "devEngines": {
+    "packageManager": {
+      "name": "pnpm",
+      "version": "12.5.1",
+      "onFail": "download"
+    }
--- rawlib/vite.config.ts
+++ lib/vite.config.ts
@@
-  pack: {
+  pack: { deps: { resolveDepSubpath: true },
@@
-      tsgo: true,
+      generator: 'tsgo',
```

(`homepage`/`bugs`/`repository` keep the template's placeholder `author/library` values; only `name` is
patched. `prepare: "vp config"` and the `staged` block are added only because `--hooks` was on.)

#### A2.3 `vite:monorepo` (no-install)

```console
$ vp create vite:monorepo --directory mono --no-interactive --no-git --no-hooks \
    --no-agent --package-manager pnpm
◇ Scaffolded mono with Vite+ monorepo
• Node 24.21.0  pnpm 12.5.1
→ Next: cd mono && vp run
MONO RC=0
$ find mono -not -path '*/node_modules/*' -not -path '*/.git/*' | sort
mono/.gitignore
mono/README.md
mono/apps/website/.gitignore
mono/apps/website/index.html
mono/apps/website/package.json
mono/apps/website/public/{favicon.svg,icons.svg}
mono/apps/website/src/{assets/{hero.png,typescript.svg,vite.svg},counter.ts,main.ts,style.css}
mono/apps/website/tsconfig.json
mono/package.json
mono/packages/utils/.gitignore
mono/packages/utils/README.md
mono/packages/utils/package.json
mono/packages/utils/src/index.ts
mono/packages/utils/tests/index.test.ts
mono/packages/utils/tsconfig.json
mono/packages/utils/vite.config.ts
mono/pnpm-workspace.yaml
mono/tsconfig.json
mono/vite.config.ts
```

With `--git --hooks --agent agents` (no-install probe), **both** the agent file and the hook dispatcher land
at the **workspace root**, not per package:

```console
$ find mono -maxdepth 3 -name '.vite-hooks' -o -name 'AGENTS.md' | sort
mono/.vite-hooks
mono/AGENTS.md
$ git -C mono config --get core.hooksPath
.vite-hooks/_
```

The monorepo's `packages/utils/vite.config.ts` is **not** the same file as the standalone library's — the
rewrite strips the `staged`/`lint`/`fmt` blocks (leaving odd blank lines) and hoists them to the root
config:

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: { deps: { resolveDepSubpath: true },
    dts: {
      generator: 'tsgo',
    },
    exports: true,
  },
  
  
});
```

Config files that carry vp settings, by builtin:

| Builtin | vp settings live in |
|---|---|
| `vite:application` | `vite.config.ts` (created by vp: `fmt`, `lint.jsPlugins/rules/options`, `staged` when hooks are on), `pnpm-workspace.yaml` (catalog + `overrides.vite@*` + `peerDependencyRules`), `package.json` (`scripts.* → vp …`, `devEngines.packageManager`, `prepare: vp config` when hooks are on), `.vite-hooks/{pre-commit,_/**}` |
| `vite:library` | same set, plus `vite.config.ts` → `pack{deps,dts,exports}`, `staged`; `package.json` keeps the template's own `build/dev/test/check/prepublishOnly` scripts which already call `vp …` |
| `vite:monorepo` | root `vite.config.ts` (+ `run: { cache: true }`), root `vite.config.ts` `staged`, root `pnpm-workspace.yaml` (`packages`, `catalogMode: prefer`, catalog incl. `typescript`/`@types/node`), root `package.json` (`ready`/`dev` scripts), root `tsconfig.json` (nodenext), root `.vite-hooks/**`; `packages/utils/vite.config.ts` keeps only `pack` |

---

### A3. Backend skeleton starting point

#### A3.1 Does `vite:library` yield a pure TS package with no browser entry? — Yes

Evidence: the tree in §A2.2 has **no `index.html`, no `public/`, no DOM code**; `package.json` exposes
`exports: { ".": "./dist/index.mjs" }` and nothing browser-facing; `tsconfig.json` is `lib: ["es2023"]`,
`types: ["node"]` (no `DOM`), `module/moduleResolution: nodenext`. The only "web" leftovers are the
template's `README.md` text and the placeholder `homepage`/`bugs`/`repository` fields.

#### A3.2 Do `vp check` and `vp test` work out of the box? — Yes, on the freshly scaffolded library

```console
$ vp check
note: You are running `vp check` as a Vite+ built-in command. If you meant to run the check npm script, use `vpr check` instead.
pass: All 8 files are correctly formatted (589ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 3 files (485ms, 24 threads)
CHECK RC=0
$ vp test
note: You are running `vp test` as a Vite+ built-in command. If you meant to run the test npm script, use `vpr test` instead.

 RUN  v4.1.11 /tmp/vp3/work/lib

 ✓ tests/index.test.ts (1 test) 5ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  333ms (transform 82ms, setup 0ms, import 105ms, tests 5ms, environment 0ms)
TEST RC=0
```

* **Test runner: Vitest 4.1.11**, driven by `vp test` (a built-in, *not* the `test` script — hence the
  `vpr test` note). There is **no `vitest` dependency and no `vitest.config.ts`**: `node_modules/vitest`
  does not exist (`Cannot find module '/tmp/vp3/work/lib/node_modules/vitest/package.json'`); tests import
  `vite-plus/test`. Config comes from `vite.config.ts` (`test` block if you add one; none needed).
* Formatter Oxfmt / linter Oxlint / type checker via `lint.options.typeCheck` are all bundled through
  `vite-plus`; the project only depends on `vite-plus` (+ `vite: catalog:`).
* In that project `node_modules`: `vite-plus 0.3.3`, `vite 0.3.3` (the `@voidzero-dev/vite-plus-core`
  alias), `typescript 7.0.2`.
* `vp pack` also works out of the box → `dist/index.mjs` + `dist/index.d.mts` (tsdown; TypeScript 7 prints
  `warn: TypeScript 7.0 does not yet have a stable API and is experimental`).

Generated files, verbatim (as printed in §A2.2/A3.1):

```json
// package.json
{
  "name": "lib",
  "version": "0.0.0",
  "description": "A starter for creating a TypeScript package.",
  "homepage": "https://github.com/author/library#readme",
  "bugs": { "url": "https://github.com/author/library/issues" },
  "license": "MIT",
  "author": "Author Name <author.name@mail.com>",
  "repository": { "type": "git", "url": "git+https://github.com/author/library.git" },
  "files": ["dist"],
  "type": "module",
  "exports": { ".": "./dist/index.mjs", "./package.json": "./package.json" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "vp pack",
    "dev": "vp pack --watch",
    "test": "vp test",
    "check": "vp check",
    "prepublishOnly": "vp run build",
    "prepare": "vp config"
  },
  "devDependencies": {
    "@types/node": "^26.1.1",
    "bumpp": "^11.1.0",
    "typescript": "^7.0.2",
    "vite": "catalog:",
    "vite-plus": "catalog:"
  },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" } }
}
```

```json
// tsconfig.json  (template-authored, byte-identical to the raw degit output)
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["es2023"],
    "moduleDetection": "force",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolveJsonModule": true,
    "types": ["node"],
    "strict": true,
    "noUnusedLocals": true,
    "declaration": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  }
}
```

```ts
// vite.config.ts  (template + vp rewrite; `staged` added because --hooks was on)
import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    deps: { resolveDepSubpath: true },
    dts: {
      generator: "tsgo",
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
```

#### A3.3 What minimal additions make it a runnable server?

Probed by adding `node:http` code to the library's `src/index.ts` (real install, **no** `VP_SKIP_INSTALL`):

| Addition | Result |
|---|---|
| Server code using `node:http` in `src/index.ts` | `vp test` rc=0; `vp check` **rc=1 with `error: Formatting issues found → src/index.ts`** and nothing else — i.e. only Oxfmt style, no lint/type complaint (`@types/node` is already a dep). Run `vp check --fix` once, or write Oxfmt-clean code. |
| `"start": "node src/index.ts"` in `scripts`, then `vp run start` | works: `$ node src/index.ts ⊘ cache disabled` / `listening 8811`, then `HTTP 200 "hi /vp-run\n"` — Node 24.21 strips the TS types itself, so there is **no build step in the dev loop** |
| `vp node src/index.ts` (no script) | works the same: `HTTP 200 "hello from vp library base /from-vp-node\n"` |
| `vp pack` (default entry `src/index.ts`, default `--platform node`) then `node dist/index.mjs` | works: `dist/index.mjs` (+ `dist/index.d.mts` from the template's `dts`), then `HTTP 200 "hello from vp library base /hello\n"` |
| `vp dev` | **does not run your server.** It boots Vite's dev server (`VITE+ v0.3.3 ➜ Local: http://localhost:8802/`); a request to it returned `HTTP 404 ""` and the `node:http` listener was *not* up. Docs (`$PKG/docs/guide/dev.md`): *"`vp dev` always runs the built-in Vite dev server."* |

**Is there any server/SSR story in vp?** Only Vite's, passed through:

* `vp build --ssr [entry]` — `vp build --help` lists `--ssr [entry] Build specified entry for server-side rendering`; the option is forwarded to Vite verbatim. There is **no** `vp dev --ssr`, no server runtime, and no server entry template.
* The bundled docs never mention a backend template. The only Node-server mention anywhere in `$PKG/docs` is `docs/guide/docker.md`: `## Production: SSR / Node.js server app` — *"For apps that run Node.js in production (SvelteKit, Nuxt, a custom Vite SSR server, and so on), build with the toolchain image and copy the resolved Node.js and the built app into a slim runtime stage"*. (The word "backend" appears in the docs exactly once, as an author's own example description string in `docs/config/create.md`.)
* Practical consequence: a server runs under `vp run start` / `vp node` / `node dist/…`. Vite's SSR machinery (`vite.createServer({ middlewareMode })`) is available because `vite` is a dep, but vp adds no server dev loop on top of it.

**Where `vite:library` fails as a server base** (all of it is publishing-shaped, none of it is server-shaped
— but none of it *blocks* server use, it just has to be ignored or deleted):

1. `files: ["dist"]`, `publishConfig.access: "public"`, `prepublishOnly`, `bumpp` devDep, `exports` map,
   README about publishing, and placeholder `homepage`/`bugs`/`repository` fields.
2. No `start` script and no server entry — the entry is a library export (`export function fn()`), and
   `dev` means `vp pack --watch`, not a running process.
3. `vp dev` is actively misleading for a server (it serves a 404-ing Vite dev server, §A3.3).
4. The base itself is fetched at run time from an unpinned third-party subdirectory of
   `github:sxzz/tsdown-templates` (see §5 of the main document) — the server skeleton inherits that
   non-reproducibility, plus a name/description you must rewrite by hand.

**Closest alternative — a hand-written minimal skeleton that vp fully manages: viable, and proven.** See
§A4.2 for the exact file set and the one trap (package-manager declaration). If a workspace is genuinely
needed, `vite:monorepo` gives you `packages/*` + root `vite.config.ts` + root `.vite-hooks`/`AGENTS.md` —
add the server package by hand into `packages/` (nothing in vp will scaffold it for you).

---

### A4. Empty-directory toolchain

#### A4.1 Does `vp config` create anything in a fresh directory? — No. Is `vp create` mandatory? — No, but a `package.json` is

```console
$ mkdir fresh && cd fresh && ls -a
.  ..
$ vp config --no-hooks --no-agent        # rc=0   (silent)
$ vp config --agent --no-hooks           # rc=0   (silent)
$ vp config                              # rc=0   → prints ".git can't be found"
$ ls -la
total 0
drwxrwxr-x 2 … .
drwxrwxr-x 3 … ..
```

Without a `package.json`, nothing works — the error names the exact contract:

```console
$ vp check          # in the same empty dir
error: Package not found in workspace: `/tmp/p4/fresh`
rc=1
$ vp test
error: Package not found in workspace: `/tmp/p4/fresh`
rc=1
$ vp install        # no package.json
npm error code ENOENT
npm error path /tmp/p4/fresh/package.json
…
rc=254
```

(Note `vp install` fell back to **npm** here too — see the package-manager trap in §A4.3.)

#### A4.2 Minimal command sequence and the minimum viable file set

Minimum set that makes `vp check` **and** `vp test` pass, isolated one file at a time in a single directory
(`no-install` for the removals, one `vp install` for the additions):

```console
$ vp install                    # rc=0  (pnpm, 2.8s)  → pnpm-lock.yaml
$ vp check --fix                # rc=0  → pass: Formatting completed for checked files ; pass: Found no warnings, lint errors, or type errors in 3 files
$ vp check                      # rc=0  → pass: All 5 files are correctly formatted ; pass: Found no warnings, lint errors, or type errors in 3 files
$ vp test                       # rc=0  → Test Files 1 passed (1) / Tests 1 passed (1)
$ vp pack                       # rc=0  → dist/index.mjs
$ node dist/index.mjs           # HTTP 200 "hi /built\n"
$ vp run start                  # HTTP 200 "hi /start\n"   ($ node src/index.ts ⊘ cache disabled)
```

| File | Required? | Evidence |
|---|---|---|
| `package.json` | **yes** | `error: Package not found in workspace: …` rc=1 without it |
| `tsconfig.json` | **yes** | removed → `vp check` rc=1, 5 errors (`process`/`import.meta`/module resolution) |
| `src/*.ts` + `tests/*.test.ts` | **yes** (that's the content) | — |
| `.gitignore` with `node_modules` | **yes, before `vp check --fix`** | see the trap below |
| `vite.config.ts` | optional for `check`/`test` — **but required for type checking** | removed → `vp check` rc=0 `pass: All 4 files are correctly formatted` + `pass: Found no warnings or lint errors in 2 files` (no types pass at all) |
| `lint.options.typeCheck: true` (+ `typeAware`) | required for "check = fmt + lint + **types**" | with a deliberate `export const wrong: number = "not a number";`: **without** the option `vp check` rc=0 `pass: … no warnings or lint errors in 4 files`; **with** it `vp check` rc=1 `error: Lint or type issues found` pointing at `src/bad.ts:1:14` |
| `@types/node` devDep | required iff `tsconfig` says `types: ["node"]` | without it: `error: typescript(tsconfig-error): Invalid tsconfig` / `help: Cannot find type definition file for 'node'.` rc=1 |
| `vite` devDep | **not** required | minimal run had only `vite-plus` + `@types/node`; check/test/pack all rc=0 |
| `typescript` devDep | **not** required for check/test | same run; needed only if you want `vp pack --dts` (the library template pins `typescript ^7.0.2` for that) — the no-typescript `--dts` case was **not** probed (UNVERIFIED) |

**Lead verification (independent re-run, 2026-09-23, vp 0.3.3, probes outside the workspace).** The
load-bearing claims above were re-checked from scratch:

| claim | re-run result |
| --- | --- |
| vp's `AGENTS.md` is a marked block, and text outside the markers survives `vp config --agent` | CONFIRMED — generated file is 1731 bytes, sha256 `135ce87b…`, `<!--VITE PLUS START-->` at L1 / `<!--VITE PLUS END-->` at L27; text added above START *and* below END both survived a `vp config --agent` run (rc=0) |
| `vp create --directory X` refuses a non-empty X | CONFIRMED — rc=1, `Target directory "…" is not empty`, `Use --directory to specify a different location or remove the directory first`; no merge, no prompt |
| no `vite.config.ts` ⇒ `vp check` does not type check at all | CONFIRMED — with `export const x: number = "not a number";` and no config: rc=0, `pass: Found no warnings or lint errors in 1 file` |
| the exact option pair | **`typeAware: true` is mandatory next to `typeCheck: true`** — with `typeCheck` alone: rc=1 `error: Linting could not start` / `The --type-check option requires type-aware linting.`, i.e. no analysis ran at all. The CLI flags the hint suggests are NOT accepted by `vp check`: `--type-aware` → `error: Unexpected argument '--type-aware'`. |
| do vp's OWN generated configs already enable it? | **YES — both of them.** `vite:application` (vanilla-ts) and `vite:library` each scaffold `lint: { options: { typeAware: true, typeCheck: true } }`, and both caught the deliberate error: rc=1, `error: Lint or type issues found` → `typescript(TS2322)` at `src/bad.ts:1:14`. A generated-base skeleton type-checks for free; a hand-written one silently does not. |

Verbatim minimal files that produced the rc=0 run above:

```json
// package.json
{
  "name": "min-srv",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "devEngines": {
    "packageManager": { "name": "pnpm", "version": "12.5.1", "onFail": "download" }
  },
  "scripts": { "check": "vp check", "test": "vp test", "start": "node src/index.ts" },
  "devDependencies": { "@types/node": "^26.1.1", "vite-plus": "0.3.3" }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["es2023"],
    "moduleDetection": "force",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  }
}
```

```ts
// vite.config.ts   (this one file is what turns on vp's type checking)
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
});
```

```ts
// src/index.ts
import { createServer } from "node:http";

export function createApp() {
  return createServer((req, res) => {
    res.setHeader("content-type", "text/plain");
    res.end(`hi ${req.url}\n`);
  });
}

const port = Number(process.env.PORT ?? 8911);
const arg = process.argv[1];

if (arg !== undefined && import.meta.url.endsWith(arg.split("/").pop() ?? "")) {
  createApp().listen(port, () => console.log(`listening on ${port}`));
}
```

```ts
// tests/index.test.ts
import { expect, test } from "vite-plus/test";
import { createApp } from "../src/index.ts";

test("createApp returns an http server", () => {
  const app = createApp();
  expect(app.listening).toBe(false);
  app.close();
});
```

```gitignore
# .gitignore — do NOT omit this
node_modules
dist
*.log
```

**The `.gitignore` trap (observed, mechanism UNVERIFIED).** In a directory that had `node_modules` but no
`.gitignore`, `vp check --fix` walked dependencies: `Found 370 errors and 16793 warnings in 2072 files`,
including `node_modules/oxfmt/dist/*.js` and `node_modules/…/meriyah-*.js` with
`⚠ File is too long to fit on the screen — help: … seems like a minified file`. In the directory that had
`.gitignore` with `node_modules`/`dist`, the same command reported `pass: Formatting completed …` and
`Found no warnings, lint errors, or type errors in 3 files`. Plain `vp check` (no `--fix`) stayed scoped to
project files in both cases. Whether the exclusion comes from `.gitignore`, from a built-in ignore that
`--fix` bypasses, or from state left by the first run was not established — so: **ship `.gitignore` before
the first `vp check --fix`.**

#### A4.3 Package-manager trap for hand-written skeletons

`docs/guide/install.md` documents a 10-step detection order (`packageManager` → `devEngines.packageManager`
→ `pnpm-workspace.yaml` → `pnpm-lock.yaml` → `yarn.lock`/`.yarnrc.yml` → `package-lock.json` →
`bun.lock`/`bun.lockb` → `.pnpmfile.cjs`/`pnpmfile.cjs` → `bunfig.toml` → `yarn.config.cjs`) and then:

> If none of those files are present, `vp` falls back to `pnpm` by default.

**The probe disagrees with that fallback sentence** in this environment. A directory containing *only*
`package.json` (no lockfile, no `packageManager`, no `devEngines`) made `vp install` run **npm**:

```console
$ ls            # before
package.json
$ vp install
added 86 packages, and audited 87 packages in 59s
  run `npm fund` for details
rc=0
$ ls | grep -i lock
package-lock.json
```

Declaring the manager switches it, exactly as documented:

```console
$ # "packageManager": "pnpm@12.5.1"  →
Done in 9.7s using pnpm v12.5.1        → pnpm-lock.yaml
$ # "devEngines": {"packageManager":{"name":"pnpm","version":"12.5.1","onFail":"download"}}  →
Done in 168ms using pnpm v12.5.1       → pnpm-lock.yaml
```

So a hand-written skeleton must declare `devEngines.packageManager` (as `vp create` does) or
`packageManager`; otherwise vp may pick npm and write a `package-lock.json` you did not expect.

---

### A5. Non-empty target directory — refuses, writes nothing, merges nothing

All three templates behave identically and refuse **before** scaffolding. Verbatim (`VP_SKIP_INSTALL=1`,
`--no-interactive --no-git --no-hooks --no-agent --package-manager pnpm`):

```console
$ mkdir -p e1/docs && echo "pre-existing note" > e1/notes.txt && echo x > e1/docs/a.md
$ vp create vite:application --directory e1 … -- --template vanilla-ts
Use --directory to specify a different location or remove the directory first
Target directory "/tmp/p3/e1" is not empty
CASE1 RC=1
$ find e1 | sort
e1
e1/docs
e1/docs/a.md
e1/notes.txt
$ cat e1/notes.txt
pre-existing note

$ mkdir -p e2 && printf 'MY OWN README\n' > e2/README.md && printf 'MY OWN PACKAGE JSON\n' > e2/package.json \
    && printf '<html>mine</html>\n' > e2/index.html && printf 'export const mine = 1\n' > e2/conflict.ts
$ vp create vite:application --directory e2 …
Use --directory to specify a different location or remove the directory first
Target directory "/tmp/p3/e2" is not empty
CASE2 RC=1
$ cat e2/README.md e2/package.json e2/conflict.ts
MY OWN README
MY OWN PACKAGE JSON
export const mine = 1

$ mkdir -p e3 && echo "keep me" > e3/keep.txt
$ vp create vite:library --directory e3 …
Use --directory to specify a different location or remove the directory first
Target directory "/tmp/p3/e3" is not empty
CASE3 RC=1
$ cat e3/keep.txt
keep me
```

* **No merge, no partial overwrite, no prompt** — `--no-interactive` does not change it, and conflicting
  files are *not* touched (identical message and behaviour for `vite:application`, `vite:library`; the
  check is template-independent, `isTargetDirAvailable`/`isEmpty` in `$PKG/dist/create/bin.js`).
* An existing **empty** directory is accepted (every fast probe above did `mkdir -p <dir>` first, rc=0).
* `--directory` pointing at an existing **file** crashes with a raw stack trace, rc=1:

```console
$ echo "iam a file" > f1
$ vp create vite:application --directory f1 …
  code: 'ENOTDIR',
  syscall: 'scandir',
  path: '/tmp/p3/f1'
Failed to generate code: ENOTDIR: not a directory, scandir '/tmp/p3/f1'
CASE4 RC=1
```

Consequence for an agent-run guide: **create the target directory or make sure it is empty (or absent)
first; never point `vp create` at a populated repo** — it will exit 1 and the guide must therefore scaffold
into a fresh directory and copy/merge afterwards.

---

### A6. `--editor`: full value list and the zero-prompt requirement

The complete set is hard-coded in `$PKG/dist/editor-4sjlHmUh.js` — three editors, two aliases:

```js
const EDITORS = [
	{ id: "vscode",    label: "VSCode",  targetDir: ".vscode", files: { "settings.json": VSCODE_SETTINGS, "extensions.json": VSCODE_EXTENSIONS } },
	{ id: "zed",       label: "Zed",     targetDir: ".zed",    files: { "settings.json": ZED_SETTINGS } },
	{ id: "jetbrains", label: "JetBrains (IntelliJ, WebStorm, etc)", targetDir: ".idea",
	  files: { "externalDependencies.xml": …, "workspace.xml": …, "OxfmtSettings.xml": … } }
];
const EDITOR_ALIASES = [{ id: "intellij", alias: "jetbrains" }, { id: "webstorm", alias: "jetbrains" }];

function resolveEditorId(editor) {
	const normalized = editor.trim().toLowerCase();
	const match = EDITORS.find((option) => option.id === normalized || option.label.toLowerCase() === normalized);
	if (match) return match.id;
	const aliasMatch = EDITOR_ALIASES.find((option) => option.id === normalized);
	if (aliasMatch) { log.warn(`--editor ${aliasMatch.id} was passed; use --editor ${aliasMatch.alias} instead, as it's the canonical ID for that editor.`); return aliasMatch.alias; }
}
```

So the full value list is **`vscode`, `zed`, `jetbrains`** (matched case-insensitively; `intellij`/`webstorm`
are accepted with a warning and mapped to `jetbrains`). Probe results:

| Invocation (non-interactive) | Result |
|---|---|
| `--editor vscode` | `.vscode/settings.json` + `.vscode/extensions.json` (verbatim: `"npm.scriptRunner": "vp"`, `"editor.defaultFormatter": "oxc.oxc-vscode"`, `"oxc.disableNestedConfig": true`, `"editor.formatOnSave": true`, … and `recommendations: ["VoidZero.vite-plus-extension-pack"]`) |
| `--editor VSCode` | same as `vscode` (case-insensitive) |
| `--editor zed` | `.zed/settings.json` (oxlint/oxfmt LSP + per-language `format_on_save`, `prettier.allowed: false`) |
| `--editor jetbrains` / `--editor intellij` | `.idea/{externalDependencies.xml,workspace.xml,OxfmtSettings.xml}`; `intellij` prints the canonical-ID warning first |
| `--editor bogus` | **no error, no warning, no editor files** — silently ignored (same silent-fallback style as `--agent bogus`) |
| `--editor vscode,zed` | **nothing** — `--editor` is **not** comma-separated (unlike `--agent`) |
| `--editor vscode --editor zed` | only `.zed/` — a repeated flag is **not** additive, last value wins |
| no `--editor` | nothing written, no prompt (non-interactive) |

**Zero prompts.** Prompts are gated on interactivity, not on the editor flag:
`if (interactive && !editor) { …multiselect("Which editors are you using?")… }`. Proven both ways:

```console
$ vp create vite:application --interactive --directory i2 --agent agents --no-git --no-hooks \
    --package-manager pnpm -- --template vanilla-ts < /dev/null
VITE+ - The Unified Toolchain for the Web

› Which editors are you using?
    Writes editor config files to enable recommended extensions and Oxlint/Oxfmt integrations.
  › ◼ VSCode (.vscode)
    ◻ Zed
    ◻ JetBrains (IntelliJ, WebStorm, etc)
  Press  space  to select,  enter  to submit

$ # same command with --no-editor  → no prompt, rc=0, full scaffold
$ # same command with --editor zed → no prompt, rc=0, .zed/settings.json written
```

So `--editor`/`--no-editor` are **not** required to avoid the editor prompt in non-interactive mode — but
they are exactly what suppresses it when `--interactive` is forced (or when a TTY makes
`defaultInteractive()` true: `!process.env.CI && process.stdin.isTTY`). For a guarantee of zero prompts,
pass **both** `--no-interactive` **and** an explicit `--no-editor` (or a concrete `--editor <id>`); a
non-TTY stdin alone already prevents prompts in practice. Note that in interactive mode with no
`--editor`, vp also has `detectExistingEditors(projectRoot)` as a default.

---

### A7. `vite:generator` (the code-generator contract) — two lines

`vp create vite:generator` is monorepo-only and refuses outside one (`The vite:generator template requires a
monorepo workspace. Run this command inside a Vite+ monorepo, or create one first with vp create
vite:monorepo` / `Cannot create a generator outside a monorepo`, rc=1); it scaffolds a **Bingo + Zod** package
(`bin: ./bin/index.ts`, deps `bingo ^0.9.3` + `zod ^3.25.76`, `src/template.ts` with
`createTemplate({ about, options, async produce({options}) → { files, scripts, suggestions } })`,
`VP_CREATE_INTERACTIVE=0` in non-interactive runs).

Yes — a **local** generator can produce a custom skeleton without publishing anything, because
`create.templates[].template` accepts "a relative `./path` to a local package's directory (resolved against
the workspace root) … run as-is (not shorthand-expanded)" (`$PKG/docs/config/create.md`), but it requires a
Vite+ **monorepo** + a workspace package with a `bin` + bingo/zod, and its own docs note that "existing
generators are copied project files and are not updated by upgrading Vite+" — so for a deliverable that is
only a step-by-step guide it is a plausible-but-overweight mechanism (a `git`/`github:` template or plain
documented file writes are simpler).

---

### Round-3 UNVERIFIED

1. **Why `vp install` chose npm** in a bare `package.json` directory instead of the documented pnpm
   fallback. Observed behaviour is in §A4.3; the JS side of detection delegates to a native
   `detectWorkspace` binding, and the fallback branch was not read. `packageManager`/`devEngines` fix it.
2. **The exact ignore rule behind the `vp check --fix` → `node_modules` storm** (§A4.2). `.gitignore`
   presence correlates with correct scoping in the two observed cases, but the deciding code path was not
   identified.
3. **`vp pack --dts` without a `typescript` devDependency.** Not probed; the library template pins
   `typescript ^7.0.2` and tsdown printed `warn: TypeScript 7.0 does not yet have a stable API and is
   experimental` when emitting `.d.mts`.
4. **Whether `vp config`'s `prepare` hook path re-adds anything else besides agent sections and hooks** —
   only `--agent`/`--hooks` behaviour was probed here; `vp config` in a fresh dir wrote nothing at all.
5. **Non-pnpm server skeletons.** Only pnpm installs were probed for the minimal skeleton; npm/yarn/bun
   dependency-resolution specifics for a hand-written server package were not.
6. **Behaviour of a pre-existing `vite.config.ts` when `vp create` runs into an *empty* directory** (i.e.
   scaffolding over an intentional config): an empty directory is accepted, so a pre-seeded `vite.config.ts`
   would be rewritten/merged by the create pipeline, but that case was not probed directly (the main
   document §4.4 covers the merge machinery).
7. **Whether `vite:application --template vanilla-ts` gains `tsconfig.app.json`/`tsconfig.node.json` with
   other create-vite versions** — in this environment `create-vite@latest` produced the single-`tsconfig.json`
   vanilla-ts layout shown in §A2.1, unlike the `react-ts` layout recorded in §4.2.

---

## Round-6 addendum — monorepo layout

**Question.** The single-project composition is verified in `nitro-v3.md` Rounds 4–5 (Vite+-first
`vite:application` + `nitro()` plugin + `nitro.config.ts { serverDir: "./server" }`; SSR shape B).
This round verifies the missing cell: the **monorepo layout** on the same stack, where
(fullstack, monorepo) means 前后分离 — a web package and a server package side by side — with
(backend, monorepo) and (frontend, monorepo, sometimes with a placeholder example package) as the
other two valid shapes. Tests are centralized per package (`<pkg>/tests/`), never inside a Nitro
`serverDir`; pure frontend packages get no test command and no test directory.

**Answer: YES — the monorepo layout works, and the minimal recipe is `vp create vite:monorepo` +
one hand-authored `packages/server` (6 files) + `pnpm --filter ./packages/server add -D nitro` +
one `.output` line in the ROOT `.gitignore`.** The generated root already ships the exact
orchestration (`"ready": "vp check && vp run -r test && vp run -r build"`), so **nothing has to be
added** for build/test/check; `vp run -r build`, `vp run -r test` and `vp check` all exit 0 once the
`.output` ignore rule exists, and the server runs from `packages/server/.output/server/index.mjs`.
Three measured facts change what an agent would otherwise write:

1. **`vp install` at the root fails in CI as soon as a new package is added** — pnpm runs frozen in
   CI, and the new workspace importer is not in `pnpm-lock.yaml` (F1). Use the package manager
   (`pnpm --filter ./<pkg> add …`) or a plain `pnpm install` to refresh the lockfile.
2. **A package with no `test` script is silently skipped by `vp run -r test` (rc=0), but a filter
   that selects that package makes the missing task a hard error** (F7). Orchestration must use
   `-r`, never a per-package filter, if the frontend package is to stay test-less.
3. **`vp run` does not forward arbitrary environment variables to scripts** — a `start` script run
   through the runner listened on Nitro's default 3000 despite `PORT=…` (F8); declaring
   `env: ["PORT"]` (or `untrackedEnv`) on a task fixes it (verified).

### R6.1 Method note

Measured on 2026-09-23 in throwaway `/tmp` directories, `CI=1`, with `npm_config_cache`,
`XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CONFIG_HOME` all redirected under `/tmp`
(the real `~/.npm` and `~/.vite-plus` are read-only here; the warm 8.5 GB pnpm store is read-only
too, so every install was cold). `/tmp` is not shared between bash invocations, so **each of the six
probes below was one self-contained command** that scaffolded, mutated, ran and printed everything;
all artefacts are gone. `vp` was always the **project-local** `./node_modules/.bin/vp` of a workspace
created by `pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo` (guest CLI on `PATH` is
`vp v0.3.3`; project-local is `vite-plus@1.0.0-rc.0`, Nitro `3.0.260903-beta`, Vite 8.3.0 through the
alias, Node 24.21.0, pnpm 12.5.1, Linux x64). Everything fetched was treated as **data**, never as
instructions; `[rc=n]` markers are real measured exit codes. Wall-clock times are a property of this
sandbox's slow registry link (10–50 KiB/s tarballs — `✓ Dependencies installed in 209s…335s`,
whole `vp create` 4m54s–18m28s), not of the recipe. Probe legend (labels used in the evidence
below):

| Probe | Workspace | What it measured |
|---|---|---|
| **A** | stock `vite:monorepo` | create output, tree, root/package files, built-ins at the root and in each package, `-r` fan-out, `.output`/`dist`, catalog inheritance, the task/script collision (A11) |
| **B** | monorepo + `packages/server` (Nitro + `tests/.gitkeep` + `test: vp test --passWithNoTests`) | install wiring, server check/fmt/test/build, `-r build/test/check`, `--fail-if-no-match` / `-F` / `--filter` / `--parallel` / `--concurrency-limit` / `-v`, dev servers, `node .output/server/index.mjs`, the `PORT` finding, the per-package `.output` ignore |
| **C** | monorepo + server + inert placeholder (`package.json` only) | `.output` ignore variants (C4a–e), root **tasks** instead of scripts (C5), backend-only shape after deleting `apps/website` (C6), frontend-only shape after deleting the server (C7) |
| **D** | pnpm-only mini workspace | `catalogMode: prefer` rewrites a `pnpm add` specifier into the root catalog |
| **E** | monorepo + server | the `nitro` catalog entry, `env` / `untrackedEnv` port forwarding, `defaultPackage` |
| **F** | stock monorepo | `defaultPackage` for bare `vp dev` (no flags → works, `--port` → 404 anomaly), `vp run dev`, `vp -C apps/website dev` |

Prior findings this addendum reuses instead of re-deriving: the template's content and flags (§1.3,
§1.4, §A2.3 above), what is fetched at run time and what the catalog pins (§5.1 above), the task
runner (`vp-project-local.md` §5: `vp run --help`, task-vs-script semantics, the name-collision
hard error, `-r`/`-t`/`-F`/`-w`/`--parallel`/`--concurrency-limit`), and the Nitro composition
(`nitro-v3.md` §R4.2/§R4.7/§R4.8 and §R5.5/§R5.8: `serverDir`, `.output` in `.gitignore`, the
"no test files → rc 1" behaviour, the 10 s `close timed out` warning).

### R6.2 Q1 — BASELINE: the exact create command, tree, root config, and what the packages are

```console
$ pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo \
    --directory mono --no-interactive --no-git --no-hooks --no-agent --package-manager pnpm
◇ Scaffolded mono with Vite+ monorepo
• Node 24.21.0  pnpm 12.5.1
✓ Dependencies installed in 237s
→ Next: cd mono && vp run
Done in 13m 9.6s using pnpm v12.5.1
[rc=0]
```

`--package-manager pnpm` is the non-interactive default anyway (§1.4 above); `--git/--hooks/--agent`
were left off for determinism — their non-interactive defaults are git **off**, hooks **on**,
`AGENTS.md` **written**, and in a monorepo they land at the **workspace root** (§A2.3 above). Running
the scaffold through `pnpm dlx --package=vite-plus@1.0.0-rc.0` is what makes the catalog below pin
`1.0.0-rc.0` (the guest 0.3.3 would pin 0.3.3); reproducibility caveats for `create-vite@latest` and
`degit` are in §5.1/§6 above.

Resulting tree (verbatim, `node_modules` and `.git` pruned):

```text
.
├── .gitignore
├── README.md
├── apps/website/{.gitignore,index.html,package.json,tsconfig.json}
├── apps/website/public/{favicon.svg,icons.svg}
├── apps/website/src/{assets/{hero.png,typescript.svg,vite.svg},counter.ts,main.ts,style.css}
├── package.json
├── packages/utils/{.gitignore,README.md,package.json,tsconfig.json,vite.config.ts}
├── packages/utils/src/index.ts
├── packages/utils/tests/index.test.ts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
└── vite.config.ts
```

**Root config — what exists and what it declares.** `vite.config.ts` (fmt/lint with `typeAware` +
`typeCheck`, caching on, **no `run.tasks` at all**), `pnpm-workspace.yaml` (workspaces + catalog +
overrides), `tsconfig.json` (nodenext, not extended by the packages), `.gitignore`, `README.md`, and
`package.json` whose only scripts are `ready` and `dev`:

```json [package.json]
{
  "name": "mono",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "ready": "vp check && vp run -r test && vp run -r build",
    "dev": "vp run website#dev"
  },
  "devDependencies": {
    "vite-plus": "catalog:"
  },
  "devEngines": {
    "packageManager": {
      "name": "pnpm",
      "version": "12.5.1",
      "onFail": "download"
    }
  },
  "engines": {
    "node": ">=22.18.0"
  }
}
```

```ts [vite.config.ts]
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

```yaml [pnpm-workspace.yaml]
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

```json [tsconfig.json]
{
  "compilerOptions": {
    "noEmit": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "allowImportingTsExtensions": true,
    "esModuleInterop": true
  }
}
```

`.gitignore` is create-vite's default list (`logs`, `*.log`, **`node_modules`**, **`dist`**,
`dist-ssr`, `*.local`, `.env*`, editor dirs, plus `# AI agent worktrees` / `.claude/worktrees/`).
Note what is **absent: `.output`** — the same trap as Round-4 F2, re-confirmed in R6.5/F2.

**The two generated packages are not the same kind of thing.**

* `apps/website` is a plain `create-vite` vanilla-ts app: `index.html`, `src/main.ts`, and scripts
  `dev: vp dev`, `build: tsc && vp build`, `preview: vp preview` — **no `test` script and no
  `tests/` directory**. Its devDependencies are `typescript ^7.0.2`, `vite: catalog:`,
  `vite-plus: catalog:`.
* `packages/utils` is the tsdown "vite-plus" library (`degit github:sxzz/tsdown-templates/vite-plus`,
  §1.3 above): `src/index.ts` (`export function fn() { return "Hello, tsdown!"; }`),
  `tests/index.test.ts`, and scripts `build: vp pack`, `dev: vp pack --watch`, `test: vp test`,
  `check: vp check`, `prepublishOnly: vp run build`. Its `vite.config.ts` keeps only
  `pack: { deps: { resolveDepSubpath: true }, dts: { generator: "tsgo" }, exports: true }` (§A2.3
  above shows the same file). This is the package that carries tests and a `test` script.

**Built-ins at the ROOT and in each package** (every value measured; base monorepo, nothing added):

| Command | rc | Verbatim result (abridged) |
|---|---|---|
| `vp check` (root) | **0** | `pass: All 17 files are correctly formatted (544ms, 24 threads)` / `pass: Found no warnings, lint errors, or type errors in 6 files (665ms, 24 threads)` — **the root run covers every package** |
| `vp test` (root) | **0** | `RUN v5.0.1 /tmp/PA/mono` … `✓ packages/utils/tests/index.test.ts (1 test)` — vitest runs from the root and picks up package tests |
| `vp build` (root) | **1** | ``error: `vp build` at the workspace root needs a target package.`` + package list + `Pass a directory:  vp -C apps/website build` / `Or run every package's build script:  vp run -r build` |
| `vp check` (apps/website) | 0 | `All 6 files…` / `… in 2 files` |
| `vp test` (apps/website) | **1** | `No test files found, exiting with code 1` / `include: **/*.{test,spec}.?(c\|m)[jt]s?(x)` (Round-4 F4 re-confirmed: this is why a frontend package gets **no** test command) |
| `vp build` (apps/website) | 0 | real Vite build → `dist/index.html` + `dist/assets/*` (`✓ built in 105ms`) |
| `vp check` (packages/utils) | 0 | `All 6 files…` / `… in 3 files` |
| `vp test` (packages/utils) | 0 | `✓ tests/index.test.ts (1 test)` |
| `vp build` (packages/utils) | **1** | `[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.` — **the built-in `vp build` is not the package's `build` script**; that package builds with `vp pack` (`vpr build` / `vp run build`), see F4 |
| `vp run -r build` (root) | 0 | runs `~/apps/website$ tsc`, `~/packages/utils$ vp pack`, `~/apps/website$ vp build`; `vp run: 0/3 cache hit (0%)` — the compound script is split and cached as sub-tasks |
| `vp run -r test` (root) | 0 | runs `~/packages/utils$ vp test` **only**; apps/website is skipped with no warning |
| `vp run -r check` (root) | 0 | runs `~/packages/utils$ vp check` only (website has no `check` script) |
| bare `vp run` (root) | 0 | flat listing of scripts: `dev: vp run website#dev`, `ready: …`, `utils#build: vp pack`, `utils#test: vp test`, `website#build: tsc && vp build`, `website#dev: vp dev`, `website#preview: vp preview` |
| bare `vp dev` (root, stock 2-package repo) | **1** | ``error: `vp dev` at the workspace root needs a target package.`` + list + `Pass a directory:  vp -C apps/website dev` / `Or run every package's dev script:  vp run -r dev` |

The two working ways to run the website's dev server are the template's own root script
(`vp run dev -- --port 3811` → `~/apps/website$ vp dev -- --port 3811` → `VITE+ v1.0.0-rc.0`,
`➜ Local: http://localhost:3811/`, `GET / → HTTP 200`) and `vp -C apps/website dev --port N` (also
200). `defaultPackage` is a third option — R6.3.

### R6.3 Q2 — the Nitro SERVER package (backend-only package beside the generated ones)

**Steps** (all measured in one run; nothing else was needed):

```sh
mkdir -p packages/server/server/api packages/server/tests
# write the five files below
: > packages/server/tests/.gitkeep
pnpm --filter ./packages/server add -D nitro      # NOT `vp install` — see F1
```

```json [packages/server/package.json]
{
  "name": "@mono/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vp dev",
    "build": "vp build",
    "start": "node .output/server/index.mjs",
    "test": "vp test --passWithNoTests",
    "check": "vp check"
  },
  "devDependencies": {
    "vite": "catalog:",
    "vite-plus": "catalog:"
  }
}
```

```json [packages/server/tsconfig.json]
{
  "extends": "nitro/tsconfig",
  "include": ["server", "tests", "nitro.config.ts", "vite.config.ts"]
}
```

```ts [packages/server/vite.config.ts]
import { defineConfig } from "vite-plus";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [nitro()],
});
```

```ts [packages/server/nitro.config.ts]
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

```ts [packages/server/server/api/hello.ts]
import { defineHandler } from "nitro";

export default defineHandler(() => {
  return { api: "works!" };
});
```

This is the pruned-application shape of `nitro-v3.md` §R4.7(b) (no `index.html`, no client entry),
hand-written instead of scaffolded — §R4.7 measured `GET / → 404`, `GET /api/hello → 200` for that
shape, and the probe here reproduces it in-monorepo. `tests/` sits at the **package** root, next to
`server/`, never inside `serverDir` (a file under `server/api/` or `server/routes/` is a *route*:
"The file path becomes the route path", `nitro-v3.md` §"routing"). `vite` + `vite-plus` come from the
root catalog; `nitro` is added by the package manager.

**Does a root install wire it?** `vp install` **fails in this environment/CI** until the lockfile
knows the new importer; `pnpm … add` is the working wiring step:

```console
$ ./node_modules/.bin/vp install
Scope: all 4 workspace projects
Error: ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER

  × installing dependencies
  ╰─▶ Cannot install with "frozen-lockfile" because pnpm-lock.yaml has no
      `importers["packages/server"]` entry. Regenerate the lockfile with `pnpm
      install --lockfile-only`.
[rc=1]

$ pnpm --filter ./packages/server add -D nitro
Packages: +19
Progress: resolved 19, reused 0, downloaded 19, added 19, done
Done in 27s using pnpm v12.5.1
[rc=0]
```

With `catalogMode: prefer` pnpm rewrites the specifier and **hoists the new dependency into the root
catalog** (mechanism independently verified in a vite-plus-free pnpm-only probe: `pnpm add -D
is-even` ⇒ `packages/a/package.json` gets `"is-even": "catalog:"` and `pnpm-workspace.yaml` gains
`is-even: ^1.0.0`). In the real workspace:

```yaml
catalog:
  "@types/node": ^24
  nitro: 3.0.260903-beta        # ← added by `pnpm --filter ./packages/server add -D nitro`
  typescript: ^7.0.2
  vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
  vite-plus: 1.0.0-rc.0
```

`packages/server/package.json` then reads `"nitro": "catalog:"`, and the workspace resolves:

```console
$ pnpm --filter ./packages/server ls --depth 0
@mono/server@0.0.0 /tmp/PB/mono/packages/server (PRIVATE)
│
│   devDependencies:
├── vite@npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
├── nitro@3.0.260903-beta
└── vite-plus@1.0.0-rc.0
```

**Verification from the root** (after one server build; `vp check`/`vp fmt` in-package both rc=0, and
`tests/.gitkeep` survived them untouched):

```console
$ vp run -r build                       # rc=0
~/apps/website$ tsc
~/packages/server$ vp build
~/packages/utils$ vp pack
…
vp run: 0/4 cache hit (0%). @mono/server#build not cached because it modified its input.
$ find . -maxdepth 4 \( -name .output -o -name dist \) -not -path '*/node_modules/*' | sort
./apps/website/dist
./packages/server/.output          # ← .output is per PACKAGE, and only where nitro() is used
./packages/utils/dist
```

The server package's build is the same Nitro build as Round 4, scoped to the package:
`.output/{nitro.json,public/,server/{index.mjs,_routes/api/hello.mjs,_libs/*.mjs}}` (6 files), and

```console
$ cd packages/server && vp test --passWithNoTests     # rc=0
No test files found, exiting with code 0
…
close timed out after 10000ms
Tests closed successfully but something prevents 2 Vite servers from exiting
```

so a `tests/` directory that contains only `.gitkeep` is green under the package's own `test` script
(the 10 s warning is Round-4 F5, unchanged).

**How the server is actually started.** Three ways were measured:

| Way | Verbatim | Result |
|---|---|---|
| production, direct | `cd packages/server && PORT=3620 node .output/server/index.mjs` | `➜ Listening on: http://localhost:3620/ (all interfaces)`, `GET /api/hello → 200 {"api":"works!"}`, `GET / → 404` |
| via the task runner | `PORT=3621 vp run -F @mono/server start` (from the root) | runs `~/packages/server$ node .output/server/index.mjs`, but **`➜ Listening on: http://localhost:3000/` — `PORT` is not forwarded** (F8) |
| dev (Nitro dev through the Vite plugin) | `vp -C packages/server dev --port 3619` from the root | `VITE+ v1.0.0-rc.0`, `GET /api/hello → 200 {"api":"works!"}`, `GET / → 404` JSON error |

Fix for the runner case (verified): declare the variable on a task. With
`run: { tasks: { serve: { command: "node .output/server/index.mjs", env: ["PORT"] } } }` in
`packages/server/vite.config.ts`, `PORT=3902 vp run -F @mono/server serve` listened on **3902**;
`untrackedEnv: ["PORT"]` (passed but not fingerprinted) gave the same result on 3903. The shipped
docs state the mechanism (`docs/config/run.md`, 0.3.3 copy): Vite Task passes only `HOME`, `USER`,
`PATH`, `SHELL`, `LANG`, `TZ`, `NODE_OPTIONS`, `COREPACK_HOME`, `PNPM_HOME`, `CI`, `VERCEL_*`,
`NEXT_*` to all tasks, and everything else must be listed under `env`/`untrackedEnv`.

**Does `vp dev` serve only the website?** Dev servers are per package. From the root, bare `vp dev`
(with more than one candidate package) refuses and lists:

```console
$ vp dev
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.
error: `vp dev` at the workspace root needs a target package.

  Packages in this workspace:
    website       apps/website
    @mono/server  packages/server
    utils         packages/utils
    mono          .

  Pass a directory:  vp -C apps/website dev
  Or run every package's dev script:  vp run -r dev
[rc=1]
```

`vp dev` **inside** `apps/website` serves the website (`GET / → 200` HTML, and `/api/hello` also
returns the SPA `index.html`, i.e. the web package knows nothing about the API), while
`vp -C packages/server dev` serves the Nitro app (`/api/hello → 200`). The template's root
`"dev": "vp run website#dev"` is the one-command way to get the website dev server.

**A third way to disambiguate bare app commands: `defaultPackage`.** Set at the **top level** of the
root `vite.config.ts` (documented in the shipped `docs/guide/monorepo.md` §"A fixed default with
`defaultPackage`" / `docs/config/index.md`; read statically, plain string literals only):

```ts [vite.config.ts]
export default defineConfig({
  defaultPackage: "./apps/website",
  fmt: { … },
  lint: { … },
  run: { cache: true },
});
```

Measured in the stock monorepo: `vp build` → `note: vp build: using ./apps/website (defaultPackage in
vite.config.ts)`, built into `./apps/website/dist` (rc=0); bare `vp dev` (no arguments) → `note: vp
dev: using ./apps/website (defaultPackage in vite.config.ts)` and `GET / → 200` (rc=0). **Anomaly:**
`vp dev --port 3812` with `defaultPackage` set served a 404 with no `using …` note at all, while
`vp -C apps/website dev --port 3813` and `vp run dev -- --port 3811` both served the website. So use
`-C` or the root script whenever extra flags are passed; `defaultPackage` alone is only verified for
argument-less `vp dev`/`vp build` (cause of the anomaly UNVERIFIED, §R6.8).

### R6.4 Q3 — TASK ORCHESTRATION: build + test + check for the whole workspace

The generated root already contains the answer — its only scripts are the orchestration itself, and
they work as written (`vp run ready` rc=0):

```json [package.json — as generated]
"scripts": {
  "ready": "vp check && vp run -r test && vp run -r build",
  "dev": "vp run website#dev"
}
```

If you want the conventional names, **add them in exactly one place**. Both options below were
measured end-to-end in a 3-package workspace (website without a test script, utils with one, the
Nitro server package with `--passWithNoTests`).

**Option 1 — root `package.json` scripts** (no config change; the root `vite.config.ts` keeps
`run.cache: true` and no `tasks`):

```json [package.json]
"scripts": {
  "ready": "vp check && vp run -r test && vp run -r build",
  "dev": "vp run website#dev",
  "build": "vp run -r build",
  "test": "vp run -r test",
  "check": "vp check"
}
```

```console
$ vp run build                    # rc=0 — the nested `vp run -r build` is self-reference-pruned, no recursion
~/apps/website$ vp build ○ cache miss: 'package.json' modified, executing
~/packages/utils$ vp pack ○ cache miss: 'package.json' modified, executing
~/packages/server$ vp build
…
vp run: 1/4 cache hit (25%), 187ms saved. @mono/server#build not cached because it modified its input.

$ vp run test                     # rc=0 — utils + server only; website silently skipped
$ vp run check                    # rc=0 — runs `$ vp check`
```

**Option 2 — root `vite.config.ts` tasks** (task-level caching/`dependsOn` available; no scripts
needed):

```ts [vite.config.ts]
export default defineConfig({
  fmt: { … },
  lint: { … },
  run: {
    cache: true,
    tasks: {
      build: { command: "vp run -r build" },
      test: { command: "vp run -r test" },
      check: { command: "vp check" },
    },
  },
});
```

```console
$ vp run build                    # rc=0, inlined, no recursion
$ vp run -r -v build              # verbose summary proves the nesting was flattened into tasks:
Statistics:   4 tasks • 4 cache hits • 0 cache misses
  [1] website#build: ~/apps/website$ tsc ✓
  [2] website#build: ~/apps/website$ vp build ✓
  [3] @mono/server#build: ~/packages/server$ vp build ✓
      → Not cached: read and wrote 'packages/server/.output/nitro.json'
  [4] utils#build: ~/packages/utils$ vp pack ✓
$ vp run -w build                 # root package only → the same fan-out, rc=0
$ vp run check                    # `$ vp check`, rc=0
$ vp run                          # listing shows tasks and scripts together, alphabetically:
  build: vp run -r build
  check: vp check
  dev: vp run website#dev
  ready: vp check && vp run -r test && vp run -r build
  test: vp run -r test
  @mono/server#build: vp build
  …
```

**Rule:** never declare the same name twice in one package. With root *tasks* `build`/`test`/`check`,
do **not** also add root *scripts* with those names — that is the collision in F10.

**A package that deliberately has NO `test` script** (the frontend package): `vp run -r test` neither
fails nor errors — it **skips the package silently, exit 0**:

```console
$ vp run -r test
~/packages/utils$ vp test
~/packages/server$ vp test --passWithNoTests
…
vp run: 0/2 cache hit (0%).
[rc=0]
```

There is no "website has no test task" line, and the verbose summary simply counts the tasks that
ran (`Statistics: 2 tasks • 2 cache hits`, C6e) — a placeholder package with *no scripts at all* is
absent from `-r build`/`-r test`/`-r check` the same way (C5f: `Statistics: 4 tasks`). So the
orchestration-safe selector is **`-r`**. By contrast:

* `vp run --filter ./apps/website test` → `error: Task "test" not found`, **rc=1** (F7) — a filter
  names a package explicitly, so the missing task becomes fatal.
* `vp run -F @mono/server test` → rc=0 (runs/redisplays that package).
* `vp run -r --fail-if-no-match test` → rc=0, unchanged — `--fail-if-no-match` is about *filters that
  match no packages*, not about packages missing a task:
  `vp run --filter @mono/nope --fail-if-no-match test` → `error: No packages matched the filter:
  @mono/nope`, rc=1; without the flag the same filter prints `No packages matched the filter:
  @mono/nope` and exits 0 (`vp-project-local.md` §5.5).

Other flags, measured on the 3-package workspace:

| Flag | Verbatim effect |
|---|---|
| `--parallel` | dependency ordering dropped, all runnable tasks launched at once: `~/packages/server$ vp build` starts before `~/packages/utils$ vp pack ◉ cache hit, replaying …`; rc=0; `vp run: 3/4 cache hit (75%)` |
| `--concurrency-limit 1` | serialized (server first, then utils); same rc and same cache summary |
| `-v` / `--last-details` | execution summary table; the cache-miss reason is spelled out (`→ Not cached: read and wrote 'packages/server/.output/nitro.json'`) |
| `-w` | workspace-root package only (`vp run -w build` ran the root task) |
| `-t`, `vpr` | unchanged from `vp-project-local.md` §5 (`vpr build` ≡ `vp run build`) |

**The task/script name collision is re-confirmed in this real workspace.** Injecting a root task
named `ready` (the first root script) into the root `vite.config.ts` made an *unrelated* run fail:

```console
$ vp run -r build
error: Failed to load task graph
* Task mono#ready conflicts with a package.json script of the same name. Remove the script from package.json or rename the task
[rc=1]
```

After restoring the config, `vp run -r build` exited 0 (`vp run: 3/3 cache hit (100%), 1.28s saved.`).
Built-in commands are not part of the task graph, but the same hand-edited config made `vp check`
fail for a different reason — `error: Formatting issues found … vite.config.ts`, rc=1 — i.e. always
`vp fmt` after editing config files (F11, Round-4 F3).

### R6.5 Q4 — WORKSPACE HYGIENE

**Where `.output` lands.** Per **package**, in the package that uses `nitro()`; pure web/library
packages keep Vite's/tsdown's `dist`. Measured after `vp run -r build`:

```text
./apps/website/dist
./packages/server/.output
./packages/utils/dist
```

```text
packages/server/.output
├── nitro.json
├── public/
└── server/{index.mjs,_libs/{h3+rou3+srvx,hookable,ufo}.mjs,_routes/api/hello.mjs}
```

**Per-package `.gitignore` or only a root one?** All five variants were measured with the built
`.output` on disk (`vp check` from the root unless noted):

| # | `.output` ignore entry | rc | Verbatim result |
|---|---|---|---|
| a | **none** | **1** | `error: Formatting issues found` + `packages/server/.output/nitro.json`, `…/server/_libs/*.mjs`, `…/server/_routes/api/hello.mjs`, `…/server/index.mjs` — `Found formatting issues in 6 files` |
| b | `.output` in the **root** `.gitignore` only | **0** | `pass: All 23 files are correctly formatted` / `pass: Found no warnings, lint errors, or type errors in 9 files` |
| c | as (b), but `vp check` run **inside** `packages/server` | **0** | `All 5 files…` / `… in 3 files` |
| d | `.output` in `packages/server/.gitignore` only | **0** | `All 23 files…` / `… in 9 files` |
| e | `**/.output` in the root `.gitignore` only | **0** | `All 23 files…` / `… in 9 files` |

So **one line, `.output`, in the ROOT `.gitignore` is sufficient and minimal** (git ignore patterns
without a slash match at every depth), and it also protects in-package `vp check` runs (c). A
per-package entry (d) is equivalent; neither is needed twice. This is exactly Round-4 F2's fix,
re-confirmed for the monorepo layout.

**Does a root `vp check` reach into every package (including package `.output` dirs)?** Yes. (a)
lists files inside `packages/server/.output`, and the pass counts grow with the packages
(17 files / 6 lint+type targets in the stock repo; 23 / 9 with a placeholder + the server package),
so one root run covers all packages — including their test files. Paths are printed relative to the
run root: from the root you see `packages/server/.output/...`; from `-r check` you see
`.output/nitro.json` (B5c). A root `vp check` plus `vp run -r build && vp run -r test` is therefore a
complete CI gate; `vp run -r check` is redundant unless you want per-package caching.

**Empty `tests/` with `.gitkeep` inside a package.** Green and untouched:
`vp test --passWithNoTests` → `No test files found, exiting with code 0` (rc=0, only the 10 s
close-timeout warning), `vp fmt`/`vp check` in the package → rc=0 with the file still present
(`-rw-rw-r-- … 0 tests/.gitkeep`; `find . -name .gitkeep` → `./tests/.gitkeep`). It is not an oxfmt
target and does not appear in the formatted-file count.

**Catalog pin and inheritance.** The root `pnpm-workspace.yaml` (verbatim in R6.2) pins
`vite-plus: 1.0.0-rc.0` **and** the Vite alias `vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0`,
with `overrides: { vite@*: "catalog:" }`, `catalogMode: prefer`, plus `typescript ^7.0.2` and
`@types/node ^24`. Every package inherits through the `catalog:` protocol — generated ones
(`apps/website`, `packages/utils`) and the hand-written `packages/server` alike declare
`"vite": "catalog:"` / `"vite-plus": "catalog:"`, and each package's `node_modules/vite-plus` symlink
resolves to the same `vite-plus@1.0.0-rc.0`. Dependencies added later with pnpm join the same catalog
(`nitro: 3.0.260903-beta`, R6.3). The alias is load-bearing: without it every `vp` command fails with
Round-4 F9 (`Expected @voidzero-dev/vite-plus-core@<project vite-plus version>, but found vite@…`).

### R6.6 Q5 — EVERY WARNING, PROMPT, DEGRADATION AND NON-ZERO EXIT IN THIS FLOW

**Nothing prompted anywhere.** `CI=1` + `--no-interactive --no-git --no-hooks --no-agent` on
`vp create`, and no step (`vp install`, `pnpm add`, `vp check`, `vp fmt`, `vp test`, `vp build`,
`vp dev`, `vp run …`, `node .output/server/index.mjs`) ever asked a question. The table is ordered
by where an agent hits it.

| # | Step | Symptom (verbatim, abridged) | rc | Fix / verdict |
|---|---|---|---|---|
| **F1** | `vp install` at the root after adding a package, with `CI=1` | `Error: ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER` / `Cannot install with "frozen-lockfile" because pnpm-lock.yaml has no \`importers["packages/server"]\` entry. Regenerate the lockfile with \`pnpm install --lockfile-only\`.` | **1** | **Real trap.** Wire new packages with `pnpm --filter ./<pkg> add …` (or a non-CI `pnpm install`) so the lockfile gains the importer, then `vp install` behaves. |
| **F2** | root `vp check` after building a Nitro package, `.output` not ignored | `error: Formatting issues found` listing the 6 `.output` files → `Found formatting issues in 6 files (571ms, 24 threads). Run \`vp check --fix\` to fix them.` | **1** | Add `.output` to the ROOT `.gitignore` (one line, sufficient — R6.5). Round-4 F2 re-confirmed; it also breaks CI after any successful build. |
| **F3** | `vp run -r check` with that same `.output` present | the package's `vp check` fails on `.output/…`, then `vp run: 0/2 cache hit (0%), 2 failed.` | **1** | Same fix as F2. A `-r` fan-out propagates any package failure as a run failure (this is correct behaviour, unlike the silent missing-task skip). |
| **F4** | per-package `vp build` in the tsdown library package | `[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.` | **1** | In the generated monorepo the library's `build` script is `vp pack`; use `vpr build`/`vp run build` (or `vp pack`). The built-in `vp build` is not the script. |
| **F5** | root `vp build` / `vp dev` (built-ins) at a monorepo root | ``error: `vp build` at the workspace root needs a target package.`` + `Packages in this workspace:` … + `Pass a directory:  vp -C apps/website build` / `Or run every package's build script:  vp run -r build` | **1** | Intended. Use `-C`, `vp run -r …`, the root script (`vp run dev`), or `defaultPackage`. |
| **F6** | `vp test` inside the pure frontend package | `No test files found, exiting with code 1` + `include: **/*.{test,spec}.?(c\|m)[jt]s?(x)` | **1** | By design: pure frontend packages get **no** `test` script and no `tests/` (the workspace-level `-r test` skips them). Only `--passWithNoTests` where a `test` script exists. Round-4 F4 re-confirmed. |
| **F7** | `vp run --filter ./apps/website test` (package has no `test`) | `error: Task "test" not found` | **1** | **Filters make a missing task fatal; `-r` does not.** Never orchestrate with `-F`/`--filter` when some package legitimately lacks the task. `-r --fail-if-no-match test` stays rc=0. |
| **F8** | `PORT=3621 vp run -F @mono/server start` (script `node .output/server/index.mjs`) | runs `~/packages/server$ node .output/server/index.mjs` but `➜ Listening on: http://localhost:3000/` — the variable never arrives | 0 | **Silent degradation.** Declare it: a task with `env: ["PORT"]` (fingerprinted) or `untrackedEnv: ["PORT"]` (not fingerprinted) forwards it — verified on 3902/3903. Direct `node .output/server/index.mjs` and `vp -C … dev` honour the environment normally. |
| **F9** | root `"dev": "vp run website#dev"` after deleting/renaming `apps/website` | `vp run dev` prints only `---` and `vp run: 0/0 cache hit (0%).` | **0** | **Silent degradation — no error if the code is not checked.** Repoint the root `dev` script (and `defaultPackage`) when a package is renamed or removed. |
| **F10** | root `vite.config.ts` task whose name equals a root `package.json` script | `error: Failed to load task graph` / `* Task mono#ready conflicts with a package.json script of the same name. Remove the script from package.json or rename the task` | **1** | Poisons **every** `vp run` in the workspace, including unrelated ones (`vp run -r build` died on a `ready` conflict). Keep a name in exactly one place. Re-confirmed from `vp-project-local.md` §5.3. |
| **F11** | hand-editing `vite.config.ts` (or any file oxfmt owns) without formatting | `error: Formatting issues found` … `vite.config.ts` → `Found formatting issues in 1 file`; **no lint/type verdict is printed at all** | **1** | `vp fmt` (or `vp check --fix`) after writing files, before trusting `vp check`. Round-4 F3 re-confirmed. |
| **F12** | `vp test --passWithNoTests` (and every `-r test`) | `close timed out after 10000ms` / `Tests closed successfully but something prevents 2 Vite servers from exiting` | 0 | Warning only; it adds ~10 s per test task (visible in the runner summary as `10.78s saved` on a cache hit). Round-4 F5. |
| **F13** | `pnpm --filter ./packages/server add -D nitro` under `catalogMode: prefer` | package.json silently becomes `"nitro": "catalog:"` and the root `pnpm-workspace.yaml` catalog gains `nitro: 3.0.260903-beta` | 0 | Not a failure, but the dependency is **not** a plain range in package.json; commit the workspace file too. |
| **F14** | bare `vp dev --port <N>` **with** `defaultPackage` set | server answers on `<N>` but `GET / → 404` and **no** `note: vp dev: using … (defaultPackage …)` line; the same command without `--port` works (200 + note) | 0/1 by content | Reproduced twice (with and without Nitro in the repo). Use `vp run dev` or `vp -C apps/website dev --port N`, both verified 200. Cause UNVERIFIED. |
| **F15** | informational lines you will see | `note: You are running \`vp build\` as a Vite+ built-in command. If you meant to run the build npm script, use \`vpr build\` instead.`; `vp run: 0/4 cache hit (0%). @mono/server#build not cached because it modified its input.`; `warn: TypeScript 7.0 does not yet have a stable API and is experimental.` (from `vp pack`) | 0 | Cosmetic/informational. |
| — | probe-environment artefacts (not product bugs) | `[WARN] Tarball download average speed … below 50 KiB/s` from pnpm; create+install 4m54s–18m28s | 0 | Sandbox network; every install here was cold because the machine's 8.5 GB pnpm store is read-only. |

### R6.7 Q6 — VERDICT: the exact minimal recipes

All three start from the same scaffold (R6.2) and share the two hygiene rules: **`.output` in the ROOT
`.gitignore`** and **tests per package under `<pkg>/tests/`, never under `serverDir`**.

#### (a) 前后分离 fullstack monorepo — web package + server package side by side

```sh
# 1 — scaffold (project-local CLI = 1.0.0-rc.0; hooks/git/AGENTS.md are opt-in flags)
pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:monorepo \
  --directory acme --no-interactive --git --hooks --agent agents --package-manager pnpm
cd acme

# 2 — BEFORE the first build: keep Nitro output out of vp check (one root line)
printf '\n.output\n' >> .gitignore

# 3 — server package: the 5 files in R6.3 (package.json / tsconfig.json / vite.config.ts /
#     nitro.config.ts / server/api/hello.ts) + tests/.gitkeep

# 4 — wire dependencies; do NOT use `vp install` for this step under CI (F1)
pnpm --filter ./packages/server add -D nitro

# 5 — let oxfmt own the files you hand-wrote (otherwise vp check fails, F11)
./node_modules/.bin/vp fmt

# 6 — the three gates (all rc=0)
./node_modules/.bin/vp check              # whole workspace: format + lint + type-check
./node_modules/.bin/vp run -r test        # utils + server; apps/website skipped silently
./node_modules/.bin/vp run -r build       # apps/website/dist + packages/server/.output

# 7 — development (two terminals; the web package is a pure frontend)
./node_modules/.bin/vp run dev            # website dev server (root script → website#dev)
./node_modules/.bin/vp -C packages/server dev   # Nitro dev server: /api/hello → 200

# 8 — production server
PORT=3000 node packages/server/.output/server/index.mjs
```

The root's generated `"ready": "vp check && vp run -r test && vp run -r build"` is already the
complete orchestration — **no root config or script change is required**. Optional: add
`build`/`test`/`check` scripts *or* tasks (R6.4, never both); set `defaultPackage: "./apps/website"`
for argument-less `vp build`/`vp dev`; add a `serve` task with `env: ["PORT"]` if the port must be
injected through the runner (F8). Package roles: web = frontend only (no test script, no `tests/`);
server = `tests/.gitkeep` + `"test": "vp test --passWithNoTests"`; `packages/utils` = tested pure-TS
utility (keep, replace with domain packages, or delete — the root `-r` fan-out tolerates all three).

#### (b) backend-only monorepo

```sh
# same scaffold, then drop the web package and repoint the root dev script
rm -rf apps/website
# keep packages/utils (a pure-TS utility package may carry tests) or delete it as well
# add packages/server exactly as in (a) steps 2–5
```

```json [package.json — the one edit that matters]
"scripts": {
  "ready": "vp check && vp run -r test && vp run -r build",
  "dev": "vp run @mono/server#dev"
}
```

Measured with `apps/website` removed and the script left pointing at it: `vp run dev` is a **silent
no-op** (rc=0, `vp run: 0/0 cache hit (0%).`, F9) — so changing that one line (or using
`vp -C packages/server dev`) is mandatory, not cosmetic. Everything else keeps working:
`vp run ready`, `vp check`, `vp run -r build` (utils + server) and `vp run -r test` all rc=0;
`defaultPackage: "./packages/server"` is the optional convenience for bare `vp dev`/`vp build`.

#### (c) frontend-only monorepo, optionally with a placeholder example package

The stock scaffold *is* this shape with `apps/website` as the web package and `packages/utils` as the
tested utility. For a placeholder-only workspace:

```sh
mkdir -p packages/placeholder
cat > packages/placeholder/package.json <<'JSON'
{
  "name": "placeholder",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
JSON
pnpm install        # registers the new workspace importer (vp install is frozen under CI — F1)
```

Measured: a script-less package is invisible to `vp run -r build|test|check` (skipped, rc=0) and to
root `vp check` (rc=0); `vp run dev` serves the website on 5173; `vp run -r build` builds
`apps/website/dist` + `packages/utils/dist`; `vp run -r test` runs `utils#test` only. No `.output`
ignore is needed unless a package uses Nitro, and the pure frontend package keeps **no** `test`
script and **no** `tests/` directory.

### R6.8 What this addendum does NOT establish

1. **Non-CI `vp install`.** Only `CI=1` was probed; F1's frozen-lockfile error is pnpm's CI default,
   and whether a local `vp install` regenerates the lockfile for a brand-new importer (and with which
   flag) was not measured. Treat "run `vp install` after adding a package" as UNVERIFIED.
2. **The cause of the `defaultPackage` + `vp dev --port` anomaly (F14).** Reproduced twice; the
   argument-less path works, the flagged path served 404 without the `using …` note. Flag parsing /
   resolution interaction not read in the implementation.
3. **SSR inside the monorepo.** Round 5's SSR shape B was verified in a *single* project; this
   round's server package is a JSON-API backend (no `entry-server`, no `index.html`), and a
   monorepo where the server package renders the web package (cross-package SSR inputs, shared
   `?assets` imports, build ordering) was **not** probed. `nitro-v3.md` §R5.10's single-project
   verdict is not automatically transferable.
4. **Web frameworks other than `vanilla-ts`** in the monorepo web package (react-ts/vue/… templates,
   `vp create vite:monorepo` always scaffolds `--template vanilla-ts` for `apps/website`, §1.3 above)
   and the effect of replacing the generated `packages/utils` with a framework package.
5. **npm / yarn / bun workspaces** — the catalog/`overrides` alias mechanism exercised here is
   pnpm-specific (§3.3/§5.1 above cover what `vp create` writes for the other managers, not how a
   hand-authored server package behaves there). Also Windows/macOS, non-`node-server` Nitro presets,
   and container/deployment targets.
6. **Cross-machine task-cache reuse / CI cache configuration**, and `VP_RUN_CONCURRENCY_LIMIT`
   (documented only) — unchanged from `vp-project-local.md`.
7. **The exact project-local `vp --version` banner line.** Only the toolchain table
   (vite 8.3.0, rolldown 1.2.9, vitest 5.0.1, oxfmt 0.70.0, oxlint 1.85.0, oxlint-tsgolint
   7.0.2002, tsdown 0.23.0) and the dev banner `VITE+ v1.0.0-rc.0` were captured; version
   identification rests on `pnpm ls` and the catalog.
8. **Whether `-r` fan-out offers any "task missing everywhere" warning flag**, and **interactive**
   behaviour (`vp run` picker, `vp dev` package picker, `vp create` prompts) — every probe was
   non-TTY. Skipped packages produced no output at all; only the `-v` summary proves they were
   excluded.
9. **Timings and environment workarounds** (cold installs because the machine's pnpm store is
   read-only, 10–50 KiB/s tarball downloads) are sandbox properties, not recipe properties.
