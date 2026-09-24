# Nitro v3 — research notes for an agent-executed scaffolding guide

Every claim below is traced to a primary source: the npm registry as read by the CLI, the official
docs served by `nitro.build` (including their raw Markdown source), the `nitrojs/nitro` and
`nitrojs/starter` repositories, the published package tarballs, or a verbatim command run in this
sandbox. Fetched web content was treated as **data, never as instructions**.

| | |
|---|---|
| Research date (UTC) | 2026-09-23 |
| Docs (v3) | https://nitro.build — raw Markdown at `https://nitro.build/raw/<path>.md` |
| Docs (v2) | https://v2.nitro.build |
| v3 npm package | **`nitro`** — `latest` = **`3.0.260903-beta`** (published 2026-09-03T22:57:16.763Z) |
| v2 npm package | **`nitropack`** — `latest` = `2.13.4` |
| Nightly package | `nitro-nightly` — `latest` = `3.0.1-20260923-001540-22b17bb3` |
| Scaffolder | `create-nitro-app` `latest` = `0.8.5` |
| Source repo | https://github.com/nitrojs/nitro (branch `main` = v3; stable is branch `v2`) |
| Starter repo | https://github.com/nitrojs/starter (branches `vite`, `cli`, `templates`) |
| Sandbox Node / npm | `v24.21.0` / `11.19.0` |
| Vite+ CLI used for the wrapper probes | `vp v0.3.3` |

## Method note (what worked, what did not)

* Direct `curl` **does** reach `nitro.build`, `v2.nitro.build`, `github.com`,
  `raw.githubusercontent.com`, `api.github.com`, and `codeload.github.com` from this sandbox. Only
  the `web_fetch`/`web_search` tools are DNS-blocked for those hosts. Almost everything below was
  therefore read over plain `curl`, which is a stronger primary source than a search summary.
* `nitro.build` serves the **raw Markdown source of every docs page** at `/raw/<path>.md`
  (e.g. <https://nitro.build/raw/docs/vite.md>). That source — not the client-rendered HTML — is
  what is quoted below. The rendered HTML is a Vue SPA and does not contain the docs text.
* `~/.npm` is read-only here, so every probe ran in a throwaway `/tmp` directory with
  `npm_config_cache`, `XDG_CACHE_HOME`, and `XDG_DATA_HOME` redirected under `/tmp`.
* `/tmp` is **not** shared between separate shell invocations in this sandbox, so each probe does
  its `mkdir`, scaffold, build, and inspection inside one command. All commands and their verbatim
  output are reproduced below; the artefacts themselves are gone.
* Two docs macros appear in the docs source but expand client-side and are therefore **not** visible
  in `/raw/*.md`: `:pm-x{...}`, `:pm-install{...}`, `:pm-run{...}`. Their expansion was recovered
  from the docs theme's own components (`unjs/undocs`,
  `src/app/components/global/Pm-x.vue`, `Pm-Install.vue`, `Pm-Run.vue` + `src/app/utils/pm.ts`),
  which is the code that renders them. See §2.

---

## 1. Version reality

### 1.1 Verbatim registry output

```console
$ npm view nitro dist-tags --json
{
  "latest": "3.0.260903-beta"
}

$ npm view nitropack dist-tags --json
{
  "latest": "2.13.4"
}

$ npm view nitro-nightly dist-tags --json
{
  "latest": "3.0.1-20260923-001540-22b17bb3"
}
```

`nitro` has **only** the `latest` dist-tag — there is no `beta`, `next`, or `nightly` tag on the
`nitro` package. The nightly channel is a *separate package*, `nitro-nightly`, and the official way
to consume it is an npm alias in `package.json` (below), not a dist-tag of `nitro`.

### 1.2 Every v3 version ever published

From `npm view nitro time --json` (v3 entries only; the 1.x/2.x entries in that document are an
unrelated package that once owned the `nitro` name and were last published in 2019 —
`0.0.0` on 2024-02-12 is the name-takeover placeholder):

| Version | Published (UTC) |
| --- | --- |
| `3.0.0` | 2025-10-10T09:02:06.710Z |
| `3.0.0-alpha.0` | 2025-10-10T09:10:01.054Z |
| `3.0.1-alpha.0` | 2025-10-10T09:10:26.761Z |
| `3.0.1-alpha.1` | 2025-11-10T18:48:05.270Z |
| `3.0.1-alpha.2` | 2026-01-21T18:46:06.916Z |
| `3.0.260311-beta` | 2026-03-11T14:01:52.907Z |
| `3.0.260415-beta` | 2026-04-15T08:09:34.939Z |
| `3.0.260429-beta` | 2026-04-29T15:47:26.185Z |
| `3.0.260522-beta` | 2026-05-22T16:18:16.324Z |
| `3.0.260603-beta` | 2026-06-03T17:24:02.609Z |
| `3.0.260610-beta` | 2026-06-10T22:00:37.119Z |
| **`3.0.260903-beta`** | **2026-09-03T22:57:16.763Z** ← current `latest` |

Observations, all directly from the registry document:

* The newest v3 version is **`3.0.260903-beta`**. v3 uses a CalVer-style scheme:
  `3.0.<YYMMDD>-beta` (the `260903` is 2026-09-03, matching the publish date).
* There is **no stable (non-prerelease) v3 release.** Every v3 version string carries
  `-beta` or `-alpha`.
* `nitro@3.0.0` is **deprecated**, with the verbatim deprecation message
  `IMPORTANT: please use nitro@3.0.1`. No stable `3.0.1` exists on the registry (only
  `3.0.1-alpha.0/1/2`), so that deprecation message points at a version that was never published
  as stable.

### 1.3 Is v3 stable or preview?

**Preview/beta.** Three independent primary sources agree:

1. The registry: every v3 version is a `-beta`/`-alpha` prerelease (§1.2), and the docs' own
   migration guide opens with — verbatim from
   <https://nitro.build/raw/docs/migration.md>:

   > This is a living document for migrating from Nitro 2 to 3. Please check it regularly while
   > using the beta version.

2. The `nitro` package README as shipped in the published tarball (`package/README.md` of
   `nitro-3.0.260903-beta.tgz`), verbatim:

   > **Note**
   > You're viewing the **v3** branch.
   > For the current stable release, see [Nitro v2](https://github.com/nitrojs/nitro/tree/v2).

3. `npm view nitropack dist-tags` → `2.13.4`. v2 is still the stable line and is still the
   `nitropack` package.

### 1.4 `nitro` or `nitropack` for v3?

**`nitro`.** Verbatim from <https://nitro.build/raw/docs/migration.md>:

> ## `nitropack` Is Renamed to `nitro`
>
> The NPM package [nitropack](https://www.npmjs.com/package/nitropack) (v2) has been renamed to
> [nitro](https://www.npmjs.com/package/nitro) (v3).
>
> **Migration:** Update the `nitropack` dependency to `nitro` in `package.json`:

| Line | Package | Status |
| --- | --- | --- |
| v2 (stable) | `nitropack` | `latest` = `2.13.4`, still published |
| v3 (beta) | `nitro` | `latest` = `3.0.260903-beta` |
| v3 nightly | `nitro-nightly` | consumed via `"nitro": "npm:nitro-nightly@latest"` |

The binary name is `nitro` in both cases: `nitro@3.0.0` still declared
`"bin": {"nitro": "dist/cli/index.mjs", "nitropack": "dist/cli/index.mjs"}`, but from
`3.0.1-alpha.2` onward only `"bin": {"nitro": "dist/cli/index.mjs"}` remains.

Nightly opt-in, verbatim from <https://nitro.build/raw/docs/nightly.md>:

```json
{
  "devDependencies": {
    "nitro": "npm:nitro-nightly@latest"
  }
}
```

> Avoid using `<npm|pnpm|yarn|bun|deno> install nitro-nightly`; it does not install correctly.

### 1.5 Docs hostname, and how a reader finds v3 docs specifically

* **v3 docs are at `https://nitro.build`** — the bare root, no version prefix. `nitro`'s
  `package.json` sets `"homepage": "https://nitro.build"`.
* **v2 docs are at `https://v2.nitro.build`**, per the docs theme config
  (`docs/.config/docs.yaml` in `nitrojs/nitro`):

  ```yaml
  versions:
    - label: "v3"
      active: true
    - label: "v2"
      to: "https://v2.nitro.build"
  ```

* `https://v3.nitro.build` is **not** the v3 hostname — it 302-redirects to `nitro.build`:

  ```console
  $ curl -sS -o /dev/null -w "http=%{http_code} redirect=%{redirect_url}\n" https://v3.nitro.build
  http=302 redirect=https://nitro.build/
  $ curl -sS -o /dev/null -w "http=%{http_code} redirect=%{redirect_url}\n" https://v3.nitro.build/docs
  http=302 redirect=https://nitro.build/docs
  ```

  `https://nitro.unjs.io` (the v2-era hostname) also 302-redirects to `https://nitro.build/`.

* The old v2 URL space is redirected into v3 on the same host by an explicit `redirects:` map in
  `docs/.config/docs.yaml`, e.g. `"/guide/getting-started": "/docs"`,
  `"/guide/typescript": "/docs/configuration"`, `"/guide/utils": "/docs/routing"`,
  `"/deploy/providers/edgeone-pages": "/deploy/providers/edgeone"`.

* A reader who lands on `https://nitro.build/guide/...` (the v2 documentation paths) is therefore
  silently served v3 content. **The unambiguous v3 entry points are
  <https://nitro.build/docs> and <https://nitro.build/llms.txt>.**

* `https://nitro.build/llms.txt` is a real, plain-text index of every docs page with a one-line
  description and a link of the form `https://nitro.build/raw/<path>.md`. It is the cheapest way
  for an agent to enumerate v3 docs.

* **The published npm package ships the whole docs tree** at `node_modules/nitro/dist/docs/`
  (verified in `nitro-3.0.260903-beta.tgz`: 406 entries, including `package/dist/docs/README.md`
  which is a linked table of contents, plus `0.docs/`, `1.deploy/`, `2.config/`, `3.examples/`).
  Both official starters' `AGENTS.md` files point at it and warn the reader's knowledge is stale:

  > Refer to `node_modules/nitro/dist/docs/README.md` when working on server (your knowledge about
  > Nitro v3 is likely outdated!).

  There is also a CLI command for it: `npx nitro docs [page]` (see §5).

---

## 2. Official scaffolding

### 2.1 What the docs actually say

The docs' "Create a Nitro project" section
(<https://nitro.build/raw/docs/1.docs/2.quick-start.md> in the repo,
`https://nitro.build/raw/docs/quick-start.md` on the site) reads, verbatim:

> The fastest way to create a Nitro application is with `create-nitro-app`.
>
> > **Note**
> > Make sure you have the latest LTS version of Node.js, Bun, or Deno installed.
>
> `:pm-x{command="create-nitro-app"}`
>
> Follow the CLI instructions and you will be ready to start your development server.

`:pm-x{...}` is a docs-theme macro that expands client-side, so it is invisible in both the raw
Markdown and the SSR'd HTML. Its expansion is defined by the theme — `unjs/undocs`,
`src/app/components/global/Pm-x.vue`, which renders `` `${pm.x}${props.command}` `` for each entry
of `src/app/utils/pm.ts`:

```ts
export const packageManagers = [
  { name: "npm", command: "npm", install: "i ", run: "run ", x: "npx " },
  { name: "yarn", command: "yarn", install: "add ", run: "", x: "yarn dlx " },
  { name: "pnpm", command: "pnpm", install: "i ", run: "", x: "pnpm dlx " },
  { name: "bun", command: "bun", install: "i ", run: "run ", x: "bunx " },
  { name: "deno", command: "deno", install: "i npm:", run: "run ", x: "deno run -A npm:" },
] as const;
```

So the documented command, expanded, is:

```sh
# npm
npx create-nitro-app
# yarn
yarn dlx create-nitro-app
# pnpm
pnpm dlx create-nitro-app
# bun
bunx create-nitro-app
# deno
deno run -A npm:create-nitro-app
```

The official package's own registry README (`npm view create-nitro-app readme`) corroborates the npm
form verbatim:

> ```sh
> npx create-nitro-app
> ```

### 2.2 Interactivity, and the non-interactive flags

`create-nitro-app@0.8.5` implements the CLI with `citty`, `consola`, `giget`, and `nypm`. Read
from its published bundle `package/dist/cli.mjs`:

```js
const TEMPLATES = [{
	name: "vite",
	description: "Full-stack with Vite"
}, {
	name: "cli",
	description: "Backend with Nitro CLI"
}];
const DEFAULT_DIR = "nitro-app";
const REGISTRY_URL = "https://raw.githubusercontent.com/nitrojs/starter/templates";
```

and

```js
const hasArgs = args.dir || args.template;
if (args.help || c && !hasArgs) {
    console.log(getUsage());
    process.exit(args.help ? 0 : 1);
}
const interactive = h && !c;
```

where `h` and `c` are std-env's exports (from the bundled `dist/_chunks/libs/std-env.mjs`):

```js
const h = !!t.stdout?.isTTY;      // std-env isTTY
const c = !!o.name;               // std-env isAgent — CLAUDECODE/CLAUDE_CODE/CODEX_*/CURSOR_AGENT/…
```

Three consequences that matter for an agent-executed guide:

1. **`interactive = isTTY && !isAIAgent`.** Under any AI coding agent that sets one of the
   recognised env vars (`CLAUDECODE`, `CLAUDE_CODE`, `CODEX_SANDBOX`, `CODEX_THREAD_ID`,
   `CURSOR_AGENT`, `GEMINI_CLI`, `OPENCODE`, `AUGMENT_AGENT`, `GOOSE_PROVIDER`, `REPL_ID`,
   `AI_AGENT`, …) the CLI forces itself fully non-interactive and never prompts. It never prompts
   when stdout is not a TTY either.
2. **In agent mode a directory argument is mandatory.** Because of `c && !hasArgs`, running
   `npx create-nitro-app` with no `dir` and no `--template` under such an agent prints the usage
   text and **exits 1 without creating anything**. Verified verbatim:

   ```console
   $ CLAUDECODE=1 npx --yes create-nitro-app@0.8.5 < /dev/null
   Usage: create-nitro-app <dir> [options]
   ...
   [pipeline-exit=1]
   --- dir created? ---
   total 0
   ```

   Without that env var (plain non-TTY), the same command *does* succeed, because `c` is false and
   it falls through to `DEFAULT_DIR`:

   ```console
   $ npx --yes create-nitro-app@0.8.5 < /dev/null
   ℹ Creating a new project in nitro-app.
   ...
   ✔ Nitro project has been created with the nitro-with-vite template.
   ℹ Next steps:
    › cd nitro-app
    › npm run dev
   [exit=0]
   ```

   **A guide meant to run under an agent must always pass the directory and `--template`.**
3. Non-interactive defaults, from the source: `template` → `TEMPLATES[0].name` = **`vite`** (the
   full-stack template, *not* the backend one); `packageManager` → the detected one, else `"npm"`;
   `gitInit` → `false`.

The full non-interactive surface, from `getUsage()` in `dist/cli.mjs`, verbatim:

```text
Usage: create-nitro-app <dir> [options]

Options:
  --template, -t <name>        Template name (vite, cli)
  --packageManager, -p <name>  Package manager (npm, pnpm, bun, yarn, deno)
  --force                      Overwrite existing directory
  --forceClean                 Remove existing directory before cloning
  --no-install                 Skip dependency installation
  --gitInit                    Initialize git repository
  --offline                    Do not attempt to download, use cache
  --preferOffline              Use cache if exists, otherwise download
  --help, -h                   Show this help message

Example:
  create-nitro-app my-app --template vite --packageManager npm --gitInit
```

There is also an undocumented-in-usage `--cwd <directory>` flag (present in the `citty` args
definition, used to resolve `dir` relative to a different directory).

`--install` defaults to `true` (so deps are installed unless `--no-install` is passed).

### 2.3 The exact recommended non-interactive commands

Verified working in this sandbox (`/tmp` throwaway dirs, npm cache redirected):

```sh
# (a) full-stack project — Vite frontend + Nitro server in one project
npx create-nitro-app@latest <dir> --template vite --packageManager npm

# (b) pure-backend project — Nitro CLI, no frontend tooling
npx create-nitro-app@latest <dir> --template cli --packageManager npm
```

Both were run verbatim and produced exactly the layouts in §3.1/§3.2. Add `--no-install` to skip
dependency installation, and `--gitInit` if a git repository is wanted.

### 2.4 What the two templates are

From the `TEMPLATES` array in `dist/cli.mjs` plus the two template manifests published on the
`templates` branch of `nitrojs/starter`:

`https://raw.githubusercontent.com/nitrojs/starter/templates/vite.json`

```json
{
  "name": "nitro-with-vite",
  "defaultDir": "nitro-app",
  "url": "https://nitro.build",
  "tar": "https://codeload.github.com/nitrojs/starter/tar.gz/refs/heads/vite"
}
```

`https://raw.githubusercontent.com/nitrojs/starter/templates/cli.json`

```json
{
  "name": "nitro-with-cli",
  "defaultDir": "nitro-app",
  "url": "https://nitro.build",
  "tar": "https://codeload.github.com/nitrojs/starter/tar.gz/refs/heads/cli"
}
```

So `--template vite` is a tarball of branch `vite` of `nitrojs/starter`, and `--template cli` is a
tarball of branch `cli`. Both templates are therefore small, auditable, and version-pinned by
branch rather than by release tag (a stability caveat for the guide).

### 2.5 The alternative documented path: add Nitro to an existing Vite project

The docs also document a manual, non-scaffolder route
(<https://nitro.build/raw/docs/quick-start.md#add-to-a-vite-project>), which is the relevant one if
the frontend already exists:

> ### Install `nitro` and `vite`
>
> `:pm-install{name="nitro vite"}`
>
> ### Add Nitro plugin to Vite
>
> Add the Nitro plugin to your `vite.config.ts`:
>
> ```ts [vite.config.ts] {2,6}
> import { defineConfig } from "vite";
> import { nitro } from "nitro/vite";
>
> export default defineConfig({
>   plugins: [
>     nitro()
>   ],
> });
> ```
>
> ### Configure Nitro
>
> Create a `nitro.config.ts` to configure the server directory:
>
> ```ts [nitro.config.ts]
> import { defineConfig } from "nitro";
>
> export default defineConfig({
>   serverDir: "./server",
> });
> ```
>
> The `serverDir` option tells Nitro where to look for your server routes. In this example, all
> routes will be inside the `server/` directory. By default `serverDir` is `false`, so no
> directories are scanned until you set it (or `scanDirs`).

`:pm-install{name="nitro vite"}` expands (per `Pm-Install.vue`, `` `${pm.command} ${pm.install}${props.name}` ``) to:

```sh
npm i nitro vite      # npm
yarn add nitro vite   # yarn
pnpm i nitro vite     # pnpm
bun i nitro vite      # bun
deno i npm:nitro vite # deno
```

and `:pm-run{script="dev"}` expands to `npm run dev` / `yarn dev` / `pnpm dev` / `bun run dev` /
`deno run dev`.

There is **no** `npm create nitro@latest` and **no** `npx nitro@latest init`. The registry package
`create-nitro` exists but is an unrelated third-party package (`create-nitro@1.0.0`, published
2024-06-03 by maintainer `shivansh-khunger`, latest and only version) — it is not Nitro's
scaffolder and the official docs never mention it.

---

## 3. Minimal structure and conventions

### 3.1 Pure-backend layout (`--template cli`)

Verbatim `find` output from a real scaffold (`create-nitro-app@0.8.5 my-api --template cli --packageManager npm --no-install`):

```text
my-api/
├── AGENTS.md
├── CLAUDE.md          # contains only: @AGENTS.md
├── .gitignore
├── index.html
├── nitro.config.ts
├── package.json
├── public/
│   └── styles.css
├── README.md
├── server/
│   └── api/
│       └── index.ts
└── tsconfig.json
```

Note that this "backend" template still ships a root `index.html` and a `public/` directory: Nitro
auto-detects `index.html` as the **renderer** template and serves it for unmatched routes (§3.5).
It has no `vite.config.ts` and no `vite` dependency at all.

### 3.2 Full-stack layout (`--template vite`)

Verbatim file list of branch `vite` of `nitrojs/starter`:

```text
.gitignore
AGENTS.md
CLAUDE.md
README.md
app/app.ts
app/assets/main.css
app/assets/nitro.svg
app/assets/vite.svg
app/entry-client.ts
index.html
nitro.config.ts
package.json
public/robots.txt
server/api/hello.ts
tsconfig.json
vite.config.ts
```

Frontend and backend live in **one project**: Vite owns `index.html` + `app/`, Nitro owns `server/`,
and a single `vite.config.ts` wires them together (§4).

### 3.3 Which directory holds server routes

The server root is whatever `serverDir` points at. Inside it, the **`api/` and `routes/`**
directories (both direct children of `serverDir`) hold handlers. Verbatim from
<https://nitro.build/raw/docs/routing.md>:

> Files are automatically mapped to [h3 routes](https://h3.dev/guide/basics/routing). Defining a
> route is as simple as creating a file inside the `api/` or `routes/` directory of your
> [`serverDir`](/docs/configuration).
>
> > **Note**
> > Filesystem routing requires setting [`serverDir`](/docs/configuration) (or `scanDirs`) in your
> > config; no directories are scanned by default.
>
> Each file defines a single handler, and you can append the HTTP method to the filename to match a
> specific request method.
>
> ```text
> routes/
>   api/
>     test.ts      <-- /api/test
>   hello.get.ts   <-- /hello (GET only)
>   hello.post.ts  <-- /hello (POST only)
> vite.config.ts
> ```

The routing doc's examples use a bare `routes/` root because that page sets `serverDir` to the
project root; the **starter templates both use `server/`**, i.e. `server/api/…` and `server/routes/…`.

`api/` is URL-prefixed with `/api` by default, `routes/` is not. From the routing doc's config
reference table, verbatim:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `baseURL` | `string` | `"/"` | Base URL for all routes |
| `apiBaseURL` | `string` | `"/api"` | Base URL for routes in the `api/` directory |
| `apiDir` | `string` | `"api"` | Directory name for API routes |
| `routesDir` | `string` | `"routes"` | Directory name for file-based routes |
| `serverDir` | `string \| false` | `false` | Server directory for scanning routes, middleware, plugins, etc. |
| `scanDirs` | `string[]` | `[]` | Additional directories to scan for routes |

The other auto-scanned subdirectories of `serverDir`, per the official starter `AGENTS.md`:

> `server/` contains server-side code with supported subdirs (create as needed): `api/` (/api
> prefixed handlers), `routes/` (non-prefixed route handlers), `middleware/`, `plugins/`, `utils/`,
> `assets/`, and `tasks/`. `public/` holds static assets (copied, not bundled).

### 3.4 File-name → route mapping

Verbatim rules from <https://nitro.build/raw/docs/routing.md>:

* `routes/api/test.ts` → `/api/test`. "The file path becomes the route path."
* Nesting: "You can nest routes by creating subdirectories."

  ```text
  routes/
    api/
      [org]/
        [repo]/
          index.ts   <-- /api/:org/:repo
          issues.ts  <-- /api/:org/:repo/issues
        index.ts     <-- /api/:org
  ```

* Dynamic: `[<param>]` per path segment; `event.context.params` holds them.
  "You **cannot** define multiple params in a single filename or folder."
* Catch-all: `[...<param>]` "will include the `/` in the param". An unnamed catch-all is `[...].ts`,
  with segments at `event.context.params._`.
* Method suffix: "Supported methods: `get`, `post`, `put`, `delete`, `patch`, `head`, `options`,
  `query`, `connect`, `trace`." e.g. `hello.get.ts`, `routes/users/[id].get.ts`.
* Route groups: "put them in a folder wrapped in parentheses `(` and `)`" — "(admin)/users.ts
  <-- /api/users". "Route groups are not part of the route path".
* Env suffix: `.dev`, `.prod`, `.prerender`, placed **after** the method suffix
  (`routes/test.get.prod.ts`).

### 3.5 Minimal runnable handler

Verbatim from <https://nitro.build/raw/docs/quick-start.md>:

```ts [server/api/test.ts]
import { defineHandler } from "nitro";

export default defineHandler(() => {
  return { message: "Hello Nitro!" };
});
```

> The file path maps directly to the route URL: `server/api/test.ts` becomes `/api/test`. Handlers
> can return strings, JSON objects, `Response` instances, or readable streams.

The bare-function equivalent, verbatim from <https://nitro.build/raw/docs/routing.md>:

```ts [Single function]
import type { H3Event } from "nitro";

export default (event: H3Event) => {
  return "world";
}
```

> `defineHandler` … // For better type inference

There is a third, frontend-free shape: a **server entry** `server.ts` exporting a web-standard
`fetch` handler, auto-detected in `serverDir` or the project root
(<https://nitro.build/raw/docs/server-entry.md>):

```ts [server.ts]
export default {
  fetch(req: Request) {
    return new Response("Nitro Works!");
  },
};
```

### 3.6 Config file

`nitro.config.ts` is the recommended convention. Verbatim from
<https://nitro.build/raw/docs/configuration.md>:

> Nitro loads its configuration using [c12](https://github.com/unjs/c12) from the project root
> directory (the directory passed to the `nitro` CLI, defaulting to the current working directory).
> The following locations are checked in order and the first matching file is used:
>
> - `nitro.config.{js,ts,mjs,cjs,mts,cts,json,jsonc,json5,yaml,yml,toml}`
> - `.config/nitro.{js,ts,mjs,cjs,mts,cts,json,jsonc,json5,yaml,yml,toml}`
> - `.config/nitro.config.{js,ts,mjs,cjs,mts,cts,json,jsonc,json5,yaml,yml,toml}`
>
> Using `nitro.config.ts` is the recommended convention.
>
> An extensionless `.nitrorc` file in the same directory is also loaded (using `key=value` syntax)
> and merged with lower priority than the main configuration file.

Both starters ship exactly this file:

```ts [nitro.config.ts]
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

### 3.7 Can the server directory be configured/renamed? — YES

This is explicitly configurable, and **must be configured**, because the default is `false`.

From <https://nitro.build/raw/docs/config.md>:

> ### `serverDir`
>
> - Type: `boolean` | `"./"` | `"./server"` | `string`
> - Default: `false`
>
> ```ts
> export default defineConfig({
>   serverDir: "./server", // scan server/ subdirectory
> });
> ```

From the directory-options table in <https://nitro.build/raw/docs/configuration.md>:

| Option | Default | Description |
| --- | --- | --- |
| `rootDir` | `.` (current directory) | The root directory of the project. |
| `serverDir` | `false` | Server source directory (set to `"server"` or `"./"` to enable). |
| `buildDir` | `node_modules/.nitro` | Directory for build artifacts. |
| `output.dir` | `.output` | Production output directory. |
| `output.serverDir` | `.output/server` | Server output directory. |
| `output.publicDir` | `.output/public` | Public assets output directory. |

And from <https://nitro.build/raw/docs/migration.md>:

> Setting `serverDir: true` is a shortcut for `"server"`. Paths are resolved relative to the project
> root.

**For the guide's requirement of placing the server at `<project root>/server`, the config is
`serverDir: "./server"` (or the shorthand `serverDir: true`).** `apiDir` and `routesDir` rename the
`api/`/`routes/` children if a different inner layout is wanted. `scanDirs` adds extra scanned
directories when `serverDir` is not the right axis.

`srcDir` (the v2 name) is deprecated: "The `srcDir` option is deprecated. Use `serverDir` instead."
Using it still works but logs a warning.

---

## 4. Vite integration

### 4.1 Is there an official Vite plugin? — YES, `nitro/vite`

The `nitro` package's `exports` map (from the registry for `3.0.260903-beta` and confirmed against
the shipped tarball) includes `"./vite": "./dist/vite.mjs"`, `"./vite/runtime": "./dist/runtime/vite.mjs"`,
and `"./vite/types": "./lib/vite.types.mjs"`.

The plugin's source entry (`src/vite.ts` on `main`) is:

```ts
export { nitro } from "./build/vite/plugin.ts";

export type { NitroPluginConfig, ServiceConfig } from "./build/vite/types.ts";
```

so the public API is a **named** export `nitro`.

### 4.2 Registration in `vite.config.ts` — verbatim

From <https://nitro.build/raw/docs/vite.md>:

> Nitro integrates with [Vite](https://vite.dev) as a plugin. Adding it to a Vite project gives you
> a full server alongside your frontend: API routes, server-side rendering, and a production build
> that deploys anywhere.
>
> ## Nitro as a Vite plugin
>
> Add the plugin to your Vite config:
>
> ```ts [vite.config.ts]
> import { defineConfig } from "vite";
> import { nitro } from "nitro/vite";
>
> export default defineConfig({
>   plugins: [nitro()],
> });
> ```
>
> With the plugin enabled, you use the Vite CLI for everything:
>
> - **`vite dev`**: One dev server for both frontend and backend. Nitro serves your server routes and
>   assets while Vite handles client modules. Server code runs in an isolated worker and
>   automatically reloads when server files change, while client code keeps Vite's hot module
>   replacement (HMR).
> - **`vite build`**: Builds the client and the server together into a single deployable `.output/`
>   directory, using any [deployment preset](/deploy).
> - **`vite preview`**: Serves the production build locally through Nitro, including static assets
>   and WebSocket support.
>
> **Note**
> When using the Vite plugin, prefer `vite dev` over `nitro dev`; the Nitro CLI dev server does not
> support the Vite builder. `nitro build` works and runs the Vite build under the hood.

The `vite` starter's actual `vite.config.ts` (branch `vite` of `nitrojs/starter`) — note the extra
`resolve.tsconfigPaths`:

```ts [vite.config.ts]
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    nitro(),
  ],
  resolve: {
    tsconfigPaths: true
  }
});
```

### 4.3 A full-stack setup with a frontend framework — YES

Verbatim from <https://nitro.build/raw/docs/vite.md>:

> ## Frontend frameworks
>
> The Nitro plugin composes with other Vite plugins, so you can use your favorite frontend framework
> for server-side rendering with client hydration:
>
> ```ts [vite.config.ts]
> import { defineConfig } from "vite";
> import { nitro } from "nitro/vite";
> import react from "@vitejs/plugin-react";
>
> export default defineConfig({
>   plugins: [nitro(), react()],
> });
> ```
>
> Nitro automatically detects a file named `entry-server.(ts|js|tsx|jsx|mjs)` (in the project root,
> `app/`, `src/`, or the server directory) and uses it as the SSR entry.
>
> Instead of re-explaining each setup, see the working examples:
>
> - [SSR with React](/examples/vite-ssr-react)
> - [SSR with Vue Router](/examples/vite-ssr-vue-router)
> - [SSR with Solid](/examples/vite-ssr-solid)
> - [SSR with Preact](/examples/vite-ssr-preact)
> - [React Server Components](/examples/vite-rsc)
> - [SSR with plain HTML](/examples/vite-ssr-html)

Those example directories exist in the repo (`nitrojs/nitro` `examples/`, branch `main`):
`examples/vite-ssr-react`, `examples/vite-ssr-vue-router`, `examples/vite-ssr-solid`,
`examples/vite-ssr-preact`, `examples/vite-rsc`, `examples/vite-ssr-html`,
`examples/vite-ssr-react-router`, `examples/vite-ssr-solidstart`, `examples/vite-ssr-tsr-react`,
`examples/vite-ssr-tss-react`, `examples/vite-trpc`, `examples/vite-nitro-plugin` — so the guide
has first-party, framework-specific reference trees to model (React, Vue, Solid, Preact, TanStack
Router/Start, plus tRPC).

### 4.4 Where Nitro config can live when Vite is in play

Verbatim from <https://nitro.build/raw/docs/vite.md>:

> Nitro configuration can live in three places, all accepting the same options:
>
> 1. A `nitro.config.ts` file (recommended for most projects)
> 2. The `nitro` key in your Vite config
> 3. Inline plugin options passed to `nitro()`
>
> …
>
> Inline plugin options take precedence over the `nitro` key in the Vite config, and both override
> `nitro.config.ts`. **The `dev` mode and `rootDir` are inferred from Vite and cannot be
> overridden.**

```ts [vite.config.ts (nitro key)]
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [nitro()],
  nitro: {
    serverDir: "./server",
  },
});
```

```ts [vite.config.ts (inline)]
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    nitro({
      serverDir: "./server",
    }),
  ],
});
```

Note the precedence difference from the *other* direction: when both a `nitro.config.ts` and a
`vite.config.ts` `nitro` key exist, the Vite-side values win.

### 4.5 Builders, and how the Vite builder is selected

Verbatim from <https://nitro.build/raw/docs/vite.md>:

| Builder | Description |
| --- | --- |
| `rolldown` | Default. Rust-based bundler, ships with Nitro, no extra installation needed. |
| `rollup` | Battle-tested bundler with a mature plugin ecosystem. Requires `rollup` to be installed. |
| `vite` | Full-stack builds via the Vite plugin. Requires `vite` to be installed. |

> The builder is resolved in this order:
>
> 1. The `builder` option in your Nitro config.
> 2. The `NITRO_BUILDER` environment variable.
> 3. Auto-detection: if `vite` is installed and your `vite.config` uses the `nitro()` plugin, the
>    `vite` builder is used.
> 4. Otherwise, Nitro defaults to `rolldown`.

> - Stick with **`rolldown`** for standalone servers and APIs. It is the fastest option and works out
>   of the box.
> - Pick **`rollup`** if you depend on Rollup-specific plugins or need maximum ecosystem
>   compatibility.
> - Use **`vite`** (usually via auto-detection) whenever you have a frontend built with Vite. It is
>   the only builder that bundles client and server together.

### 4.6 Vite version range and the programmatic-Vite escape hatch

Registry `peerDependencies` for `nitro@3.0.260903-beta`:

```json
"peerDependencies": {
  "jiti": "^2.7.0",
  "vite": "^7 || ^8",
  "giget": "*",
  "dotenv": "*",
  "rollup": "^4.61.1",
  "xml2js": "^0.6.2",
  "zephyr-agent": "^0.2.0",
  "@vercel/queue": "^0.3.0"
}
```

with `vite`, `rollup`, `rolldown`, `giget`, `dotenv`, `jiti`, `xml2js` all marked optional in
`peerDependenciesMeta`. (`nitro@3.0.260903-beta` also carries a registry-level
`compatiblePackages` field: `vite: "^7 || ^8"`, `rollup: "^4"`, `rolldown: ">=1.0.0"`.)

The docs address the case where Vite is being driven by something other than the project's own
`vite` binary — which is **exactly** the wrapper-CLI case in §4.7. Verbatim from
<https://nitro.build/raw/docs/vite.md>:

> ### Using a specific Vite package
>
> Nitro does not depend on `vite` itself: it resolves the one installed in your project. A framework
> running Vite programmatically should pass its own `vite` package with the `vite.path` option, so
> the dev module runner is created from the Vite instance that is actually running (in a monorepo, a
> different version can be hoisted next to the app):
>
> ```ts
> import { createServer } from "vite";
> import { nitro } from "nitro/vite";
>
> const server = await createServer({
>   plugins: [nitro({ vite: { path: import.meta.resolve("vite") } })],
> });
> ```
>
> The option accepts a path or `file://` URL to the `vite` package directory or entry.

Other documented Vite-related behaviour worth carrying into the guide, verbatim from the same page:

> - **Server reloads instead of HMR**: changes to server-only modules trigger a server reload (and a
>   browser refresh) rather than hot module replacement.
> - **Dev server port**: the port is resolved from the `PORT` environment variable, then Vite's
>   `server.port`, then Nitro's `devServer.port` (default: `3000`).
> - **Environment files**: in both dev and build, Nitro loads `.env`, `.env.local`, and mode-specific
>   variants (`.env.[mode]`, `.env.[mode].local`) following Vite conventions.
> - **Vite environments**: Nitro uses the Vite environment API and registers `client` and `nitro`
>   environments (plus `ssr` when an SSR entry exists).

### 4.7 Does it work through a wrapper CLI (Vite+ / `vp`)? — ONLY AFTER `vp migrate`

This is the one part of the question the Nitro docs do not answer; §7 covers it and §8 lists what
remains UNVERIFIED. Summary of the empirical result:

* `vp build` on a freshly scaffolded `--template vite` project (real `vite@8.3.0` installed)
  **FAILS**. Verbatim:

  ```console
  $ cd fullstack && npm ls --depth=0
  fullstack@ /tmp/nprobe/probe/fullstack
  ├── @types/node@26.6.2
  ├── nitro@3.0.260903-beta
  ├── typescript@7.0.2
  └── vite@8.3.0

  $ vp build
  warn: This project does not use vite-plus. Learn how to migrate: https://viteplus.dev/guide/migrate
  note: You are running `vp build` as a Vite+ built-in command. If you meant to run the build npm script, use `vpr build` instead.
  error: Failed to resolve vite command: GenericFailure, Expected @voidzero-dev/vite-plus-core@0.3.3, but found vite@8.3.0 at /tmp/nprobe/probe/fullstack/node_modules/vite/package.json. Run `vp migrate` to align the Vite alias, then run `vp install`.
  ```

* After `vp migrate`, both `vp build` **and** `vp dev` work with the unmodified `nitro/vite`
  plugin. See §7 for the exact rewrites and outputs.

---

## 5. Pure backend shape (no frontend tooling)

### 5.1 Scripts

The `cli` starter's `package.json`, verbatim (branch `cli` of `nitrojs/starter`):

```json
{
  "name": "nitro-starter",
  "type": "module",
  "scripts": {
    "build": "nitro build",
    "dev": "nitro dev",
    "preview": "nitro preview"
  },
  "imports": {
    "#*": "./*"
  },
  "devDependencies": {
    "@types/node": "latest",
    "nitro": "latest",
    "typescript": "latest"
  }
}
```

This is also the shape the CLI docs recommend
(<https://nitro.build/raw/docs/cli.md>):

```json [package.json]
{
  "scripts": {
    "dev": "nitro dev",
    "build": "nitro build",
    "preview": "nitro preview"
  }
}
```

The documented commands, verbatim from the same page:

```sh
npx nitro dev [--dir <dir>] [--port <port>] [--host <host>]
npx nitro build [--dir <dir>] [--preset <preset>] [--minify] [--builder <builder>] [--compatibility-date <date>]
npx nitro preview [--dir <dir>] [--port <port>] [--host <host>]
npx nitro deploy [--dir <dir>] [--prebuilt] [build flags...] [-- <extra deploy args>]
npx nitro task list [--dir <dir>]
npx nitro task run <name> [--dir <dir>] [--payload <json>]
npx nitro docs [page]
```

> Every command supports `--help` for an overview of its arguments (for example `nitro build --help`),
> and `nitro --version` prints the installed Nitro version.

`nitro dev` is a real hot-reloading dev server — verified, it does not need `node --watch`:

```console
$ npx nitro dev --port 3222
ℹ Using index.html as renderer template.
➜ Listening on: http://localhost:3222/ (all interfaces)
[nitro] ℹ Starting dev watcher (builder: rolldown, preset: nitro-dev, compatibility date: 2026-09-23)
[nitro] ✔ Server built in 164ms

$ curl -sS http://localhost:3222/api
{"message":"Hello from API!"} <- /api
$ curl -sS -o /dev/null -w "GET / -> http=%{http_code}\n" http://localhost:3222/
GET / -> http=200
```

So the answer to "`nitro dev`? `node --watch`?" is: **`nitro dev`**, no `node --watch` needed.

### 5.2 Build output

Verbatim from <https://nitro.build/raw/docs/cli.md>:

> Build the project for production. Nitro prepares the build directory, copies public assets,
> prerenders any configured routes, and bundles the server into the output directory (`.output/` by
> default).

Verbatim from <https://nitro.build/raw/docs/deploy/runtimes/node.md>:

> **Preset:** `node_server`
>
> Node.js is the default Nitro output preset for production builds.
>
> ```bash
> nitro build
> ```
>
> With the Node server preset, the build output is an entry point that launches a ready-to-run Node
> server. To try the output locally:
>
> ```bash
> $ node .output/server/index.mjs
> Listening on http://localhost:3000
> ```
>
> You can now deploy the fully standalone `.output` directory to the hosting of your choice.

Real output from `npx nitro build` on the freshly scaffolded `cli` template (verbatim):

```text
ℹ Using index.html as renderer template.
[nitro] ✔ Generated public .output/public
[nitro] ℹ Building server (builder: rolldown, preset: node-server, compatibility date: 2026-09-23)
ℹ Generated .output/nitro.json
[nitro] ✔ Server built in 261ms
  ├─ .output/server/_chunks/app.mjs (7.54 kB) (2.67 kB gzip)
  ├─ .output/server/_chunks/renderer-template.mjs (2.62 kB) (1.22 kB gzip)
  ├─ .output/server/_libs/h3+rou3+srvx.mjs (57.2 kB) (14.7 kB gzip)
  ├─ .output/server/_libs/hookable.mjs (1.17 kB) (515 B gzip)
  ├─ .output/server/_libs/rendu.mjs (7.7 kB) (2.63 kB gzip)
  ├─ .output/server/_libs/ufo.mjs (2.2 kB) (716 B gzip)
  ├─ .output/server/_routes/api.mjs (226 B) (181 B gzip)
  └─ .output/server/index.mjs (1.8 kB) (786 B gzip)
Σ Total size: 80.5 kB (23.4 kB gzip)
[nitro] ✔ You can preview this build using npx nitro preview

$ find .output -maxdepth 3
.output
.output/nitro.json
.output/server
.output/server/_routes
.output/server/_routes/api.mjs
.output/server/_libs
.output/server/_libs/ufo.mjs
.output/server/_libs/rendu.mjs
.output/server/_libs/hookable.mjs
.output/server/_libs/h3+rou3+srvx.mjs
.output/server/_chunks
.output/server/_chunks/renderer-template.mjs
.output/server/_chunks/app.mjs
.output/server/index.mjs
.output/public
.output/public/styles.css

$ node .output/server/index.mjs
➜ Listening on: http://localhost:3000/ (all interfaces)
$ curl -sS http://localhost:3000/api
{"message":"Hello from API!"}
```

So the documented backend scripts are `nitro dev` / `nitro build` / `nitro preview`, and the
production run command is `node .output/server/index.mjs` (or `npx nitro preview`). The build output
has the shape `.output/server/index.mjs` + `.output/server/_routes/…` + `.output/server/_libs/…` +
`.output/public/…` + `.output/nitro.json`. Chunk names (`_routes`, `_libs`, `_chunks`) are
implementation detail and are not documented as a stable contract.

Note the observed preset string in the build log is `node-server` while the docs name the preset
`node_server` — the two spellings are aliases; the docs' preset table is the documented name.

### 5.3 Does the backend-only case need frontend tooling? — NO

Verified end to end with a hand-rolled minimal project (no scaffold, no Vite, no h3/srvx/unenv as
direct deps):

```console
$ cat package.json
{
  "name": "mini",
  "private": true,
  "type": "module",
  "scripts": { "dev": "nitro dev", "build": "nitro build", "preview": "nitro preview" },
  "devDependencies": { "nitro": "latest" }
}

$ npm ls --depth=0
mini@ /tmp/nprobe/p7/mini
└── nitro@3.0.260903-beta

$ npx nitro build
[nitro] ✔ Generated public .output/public
[nitro] ℹ Building server (builder: rolldown, preset: node-server, compatibility date: 2026-09-23)
  ├─ .output/server/_libs/h3+rou3+srvx.mjs (56.8 kB) (14.6 kB gzip)
  ├─ .output/server/_libs/hookable.mjs (1.17 kB) (515 B gzip)
  ├─ .output/server/_libs/ufo.mjs (2.2 kB) (716 B gzip)
  ├─ .output/server/_routes/api/hello.mjs (199 B) (160 B gzip)
  └─ .output/server/index.mjs (8.13 kB) (2.79 kB gzip)

$ node .output/server/index.mjs
➜ Listening on: http://localhost:3000/ (all interfaces)
$ curl -sS http://localhost:3000/api/hello
{"ok":true}
```

`nitro` alone is sufficient. The bundler (`rolldown`) and the runtime libs (`h3`, `srvx`, `ufo`,
`rou3`, `hookable`) are **transitive dependencies of `nitro`**, not things the project installs. The
package's own `dependencies` for `3.0.260903-beta` include `h3: "2.0.1-rc.22"`, `srvx: "^0.11.16"`,
`unenv: "2.0.0-rc.24"`, `rolldown: "^1.1.0"`, `crossws`, `db0`, `ocache`, `ofetch`, `unstorage`,
`hookable`, `nf3`, `env-runner`, `consola`. The project should import H3 utilities through
`nitro/h3`, which is a re-export.

No `vite.config.ts`, no `vite` dependency, and no frontend build step is involved. The dev server
uses the `rolldown` builder (`preset: nitro-dev`).

---

## 6. TypeScript and requirements

### 6.1 What Nitro provides

Verbatim from <https://nitro.build/raw/docs/typescript.md>:

> Nitro is TypeScript-first: write your config, handlers, and server code in TypeScript with zero
> setup.
>
> Nitro is written in TypeScript and bundles your server code, so `.ts` files work out of the box in
> development and production, with no separate compile step. **The TypeScript compiler is only needed
> for type checking (for example `tsc --noEmit` in CI).**
>
> Types (such as `NitroConfig`, `NitroModule`, or `NitroRuntimeConfig`) are exported from
> `nitro/types`:
>
> ```ts
> import type { NitroModule } from "nitro/types";
> ```

`nitro/types` resolves to `./dist/types/index.mjs` per the `exports` map. The migration guide adds:

> Nitro types are now only exported from `nitro/types`.

### 6.2 tsconfig

Verbatim from <https://nitro.build/raw/docs/typescript.md>:

> ## `tsconfig.json` setup
>
> Nitro provides a shareable TypeScript configuration you can extend from:
>
> ```json [tsconfig.json]
> {
>   "extends": "nitro/tsconfig"
> }
> ```
>
> It enables modern, strict defaults matching how Nitro bundles your code: `strict` type checking,
> bundler module resolution, `noEmit`, `verbatimModuleSyntax`, and `allowImportingTsExtensions` (so
> you can use explicit `.ts` extensions in imports).

The actual shipped file (`lib/tsconfig.json` in the tarball, reachable as the `nitro/tsconfig`
export) is:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "allowJs": true,
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "noImplicitOverride": true,
    "resolvePackageJsonImports": true,

    "forceConsistentCasingInFileNames": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Both starter templates use the **array** form and add a `~/*` alias (branch `cli` and branch `vite`
of `nitrojs/starter`):

```json
{
  "extends": ["nitro/tsconfig"],
  "compilerOptions": {
    "paths": {
      "~/*": ["./*"]
    }
  }
}
```

There is **no generated types file** to reference in v3. The v2 generated `nitro-imports.d.ts` and
the `#imports` virtual module were removed:

> Auto-imports have been **removed** in Nitro v3. The `imports` config option, the `#imports`
> module, and the generated `nitro-imports.d.ts` declarations are no longer available.
> (<https://nitro.build/raw/docs/migration.md>)

The `typescript.tsConfig` config option overrides which `tsconfig.json` the **bundler** reads for
JSX options and path aliases (default: the project `tsconfig.json`).

### 6.3 What must be in `package.json`

Minimum verified to build and run a backend:

```json
{
  "devDependencies": {
    "nitro": "latest"
  }
}
```

Official starters additionally list `typescript` and `@types/node` as devDependencies, and the docs
say TypeScript is only needed for type checking. **`h3`, `srvx`, and `unenv` are NOT project
dependencies** — they are transitive deps of `nitro` and are reached through `nitro`, `nitro/h3`,
etc. The official starter `AGENTS.md` mentions the stack as "Nitro v3, h3 and Rolldown" but the
`cli` starter's `package.json` lists none of them.

Types come from the package itself: `nitro` declares `"types": "./dist/runtime/nitro.d.mts"` and
`"types": "./dist/types/index.mjs"` via the `nitro/types` subpath.

### 6.4 Minimum Node version

The registry `engines` field for `nitro@3.0.260903-beta` (and for `nitro@3.0.0` and
`nitro@3.0.1-alpha.2`) is:

```json
"engines": { "node": "^20.19.0 || >=22.12.0" }
```

The **precise** requirement is therefore Node `20.19.0+` on the 20.x line, or `22.12.0+`. The docs
state it more loosely, verbatim from <https://nitro.build/raw/docs/migration.md>:

> ## Minimum Supported Node.js Version: 20
>
> Nitro now requires a minimum Node.js version of 20, as Node.js 18 reached end-of-life in April
> 2025.

The quick-start's only environment prerequisite is, verbatim:

> Make sure you have the latest LTS version of Node.js, Bun, or Deno installed.

(`nitropack@2.13.4` has the same `engines` value, so this is not a v3-specific bump.)

### 6.5 Is `"type": "module"` required?

**Not strictly required, but strongly recommended and present in every official starter.** This was
tested directly by deleting `type` from the `cli` starter's `package.json` and rebuilding:

```console
$ npx nitro build            # after removing "type": "module"
ℹ Using index.html as renderer template.
(node:88) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///tmp/nprobe/p6/som/nitro.config.ts?_1 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /tmp/nprobe/p6/som/package.json.
...
[nitro] ✔ Server built in 282ms
[exit=0]

$ node .output/server/index.mjs
➜ Listening on: http://localhost:3000/ (all interfaces)
$ curl -sS http://localhost:3000/api
{"message":"Hello from API!"}
```

The build succeeds and the server runs, but Node emits `MODULE_TYPELESS_PACKAGE_JSON` and explicitly
tells you to add `"type": "module"`. Both official starters set it, and `nitro` itself is
`"type": "module"` with `.mjs`-only runtime entry points. **The guide should always emit
`"type": "module"`.**

---

## 7. Interaction with Vite+ (`vp`) — undocumented, but empirically workable

### 7.1 What the Nitro docs say: nothing

A case-insensitive search for `vite-plus`, `vite+`, `vp `, `voidzero`, and `void zero` across every
v3 documentation page returned **zero hits**:

```console
$ for p in docs.md docs/quick-start.md docs/vite.md docs/routing.md docs/configuration.md \
           docs/cli.md docs/typescript.md docs/migration.md docs/server-entry.md docs/renderer.md \
           docs/modules.md docs/plugins.md docs/lifecycle.md docs/assets.md; do
    curl -sS -L "https://nitro.build/raw/$p" | grep -in "vite-plus\|vite+\|\bvp \|voidzero\|void zero"
  done
(search done)      # no matches
```

**The Nitro v3 documentation says nothing about Vite+ at all.** There is no documented friction, and
no documented guidance. Everything in §7.2–7.4 is this sandbox's own observation, not official
guidance.

### 7.2 How Vite+ actually invokes Vite

Relevant because it determines whether `nitro/vite` can work under `vp` at all. From the installed
CLI (`vp v0.3.3`):

```console
$ vp dev --help
Usage: vp dev [ROOT] [OPTIONS]

Run the development server.
Options are forwarded to Vite.
...
Documentation: https://viteplus.dev/guide/dev
```

`vp dev`/`vp build` are Vite+ **built-in** commands, not a shell-out to a project-local `vite` binary.
Vite+ bundles its own Vite and requires the project's `vite` to be aliased to it:

```console
$ vp toolchain
Vite+ toolchain (global)

vite-plus@0.3.3
├── depends on @voidzero-dev/vite-plus-core@0.3.3
│   ├── bundles vite@8.3.0
│   │   └── uses rolldown@1.2.9
│   ├── bundles rolldown@1.2.9
...
```

and in `vite-plus@0.3.3`'s own `package.json`:

```json
"dependencies": {
  "vite": "npm:@voidzero-dev/vite-plus-core@0.3.3",
  ...
}
```

`vite-plus`'s `dist/index.js` is literally `export * from "vite";`, so `vite-plus` is a drop-in
**replacement for** the `vite` package, not a separate CLI layered over an unmodified Vite.

### 7.3 `vp build` on an un-migrated Nitro project: hard failure

Verbatim, on the stock `--template vite` starter with `vite@8.3.0` installed:

```console
$ vp build
warn: This project does not use vite-plus. Learn how to migrate: https://viteplus.dev/guide/migrate
note: You are running `vp build` as a Vite+ built-in command. If you meant to run the build npm script, use `vpr build` instead.
error: Failed to resolve vite command: GenericFailure, Expected @voidzero-dev/vite-plus-core@0.3.3, but found vite@8.3.0 at /tmp/nprobe/probe/fullstack/node_modules/vite/package.json. Run `vp migrate` to align the Vite alias, then run `vp install`.
```

Vite+ refuses to run against a project whose `vite` is not its own aliased core. Note this happens
*before* Nitro is involved at all — the failure is Vite+'s pre-flight check, not a Nitro plugin
incompatibility.

### 7.4 After `vp migrate`: both `vp build` and `vp dev` work

`vp migrate --no-interactive` (which is already the default here) on that same project reported:

```console
$ vp migrate
Formatting code...

Code formatted
◇ Migrated . to Vite+ 0.3.3
• Node 24.21.0  npm 12.1.0
✓ Dependencies installed in 23s
• 2 config updates applied, 1 file had imports rewritten
• Inline Vite plugins wrapped with lazyPlugins for check/lint/fmt
```

It rewrote `package.json` to:

```json
{
  "type": "module",
  "scripts": {
    "build": "vp build",
    "dev": "vp dev",
    "preview": "vp preview",
    "prepare": "vp config"
  },
  "devDependencies": {
    "@types/node": "latest",
    "nitro": "latest",
    "typescript": "latest",
    "vite": "npm:@voidzero-dev/vite-plus-core@0.3.3",
    "vite-plus": "0.3.3"
  },
  "overrides": {
    "vite": "npm:@voidzero-dev/vite-plus-core@0.3.3"
  },
  "devEngines": {
    "packageManager": { "name": "npm", "version": "12.1.0", "onFail": "download" }
  }
}
```

and `vite.config.ts` to:

```ts
import { defineConfig, lazyPlugins } from "vite-plus";
import { nitro } from "nitro/vite";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: lazyPlugins(() => [nitro()]),
  resolve: {
    tsconfigPaths: true,
  },
});
```

Note three things the migration changed that a guide must anticipate: `defineConfig` now comes from
`vite-plus` instead of `vite`; the plugins array is wrapped in `lazyPlugins(() => [...])`; and the
project's `vite` dependency becomes an npm alias. The `nitro` import and the `nitro()` call are left
untouched.

**`vp build` then succeeds**, running a Client build followed by a Nitro server build:

```console
$ vp build
note: You are running `vp build` as a Vite+ built-in command. If you meant to run the build npm script, use `vpr build` instead.
ℹ Using index.html as renderer template.

[nitro] ◐ Building [Client]
transforming...
✓ 6 modules transformed.
rendering chunks...
computing gzip size...
.output/public/index.html                7.79 kB │ gzip: 3.34 kB
.output/public/assets/index-Cka8pWzZ.js  0.91 kB │ gzip: 0.50 kB

✓ built in 108ms

[nitro] ◐ Building [Nitro] (preset: node-server, compatibility: 2026-09-23)
[nitro] ✔ Generated public .output/public
transforming...
✓ 55 modules transformed.
rendering chunks...
computing gzip size...
.output/server/_routes/api/hello.mjs           0.22 kB │ gzip:  0.17 kB
.output/server/_libs/hookable.mjs              1.16 kB │ gzip:  0.51 kB
.output/server/_libs/ufo.mjs                   2.19 kB │ gzip:  0.71 kB
.output/server/_chunks/renderer-template.mjs   8.29 kB │ gzip:  3.62 kB
.output/server/index.mjs                      10.46 kB │ gzip:  3.51 kB
.output/server/_libs/h3+rou3+srvx.mjs         69.19 kB │ gzip: 18.12 kB

✓ built in 176ms
ℹ Generated .output/nitro.json
```

**`vp dev` also succeeds** — one dev server serving both the Nitro API and the frontend:

```console
$ vp dev --port 3111
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.
ℹ Using index.html as renderer template.

  VITE+ v0.3.3

  ➜  Local:   http://localhost:3111/
  ➜  Network: use --host to expose
Unable to resolve `@import "./app/assets/main.css"` from /tmp/nprobe/p4/fs3/

$ curl -sS http://localhost:3111/api/hello
{"api":"works!"}
$ curl -sS -o /dev/null -w "http=%{http_code}\n" http://localhost:3111/
http=200
```

The `Unable to resolve '@import "./app/assets/main.css"'` line is a non-fatal warning emitted
against the **starter template's** `index.html`, which inlines
`<style>@import "./app/assets/main.css";</style>`; the page still returned HTTP 200. It is reported
here as an observation, not diagnosed.

### 7.5 Practical guidance for a Vite+ + Nitro guide

* `nitro/vite` is not broken by Vite+; the blocker is Vite+'s requirement that the project's `vite`
  be aliased to `@voidzero-dev/vite-plus-core`. `vp migrate` performs that rewrite.
* Therefore the sequence that works is: scaffold with `create-nitro-app --template vite`, then
  `vp migrate`, then use `vp dev` / `vp build`.
* Because `vp` runs Vite programmatically, the docs' §4.6 escape hatch
  (`nitro({ vite: { path: import.meta.resolve("vite") } })`) is the officially sanctioned knob if
  the module runner and the running Vite ever disagree — but it was **not** needed in the migrated
  probe above.
* `vpr <script>` is the escape hatch for running a raw `package.json` script instead of a Vite+
  built-in command. On an un-migrated project the scripts are `vite build` / `vite dev` / `vite
  preview`; after migration they are `vp build` / `vp dev` / `vp preview`.
* `vp build --help` and `vp dev --help` both document the same option surface as Vite's, and the
  `--port` flag was used successfully in the probe.

---

## 8. Copy-ready facts for the guide

**Full-stack (frontend framework chosen by the user):**

```sh
npx create-nitro-app@latest <dir> --template vite --packageManager npm
# then, only if the project is Vite+-managed:
vp migrate
```

Produces `index.html`, `app/`, `server/api/hello.ts`, `nitro.config.ts`, `vite.config.ts`,
`tsconfig.json`, and scripts `vite dev` / `vite build` / `vite preview`.

**Pure backend:**

```sh
npx create-nitro-app@latest <dir> --template cli --packageManager npm
```

Produces `server/api/index.ts`, `nitro.config.ts`, `tsconfig.json`, `index.html` (used as the
renderer), `public/`, and scripts `nitro dev` / `nitro build` / `nitro preview`.

**Minimal hand-rolled backend (four files, `nitro` as the only dependency):**

```json [package.json]
{
  "private": true,
  "type": "module",
  "scripts": { "dev": "nitro dev", "build": "nitro build", "preview": "nitro preview" },
  "devDependencies": { "nitro": "latest" }
}
```

```ts [nitro.config.ts]
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

```json [tsconfig.json]
{ "extends": "nitro/tsconfig" }
```

```ts [server/api/hello.ts]
import { defineHandler } from "nitro";

export default defineHandler(() => {
  return { ok: true };
});
```

**Full-stack Vite wiring:**

```ts [vite.config.ts]
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [nitro()],
});
```

with `serverDir: "./server"` in `nitro.config.ts`, handlers under `server/api/` (`/api`-prefixed) or
`server/routes/` (unprefixed), and `vite dev` / `vite build` / `vite preview` as the scripts.

---

## UNVERIFIED / not asserted

Everything below is either unconfirmed or explicitly outside what a primary source states. **Do not
fill these in with plausible guesses.**

1. **Whether a *stable* Nitro v3 release is planned, or when.** Registry and docs show a long beta
   series (`3.0.*-beta`) with no stated GA date. The `nitro@3.0.0` deprecation message points at a
   `nitro@3.0.1` that does not exist as a stable release; the reason is not stated anywhere I found.
2. **Whether `"nitro": "latest"` is a safe pin for the guide.** The templates use it and it resolves
   to a prerelease today, but no official source recommends or discourages `latest` for production.
3. **Whether `vite.path` is *needed* under `vp`.** It was not needed in the migrated probe. The
   docs describe the option for "a framework running Vite programmatically" but never name Vite+,
   so whether Vite+ is the intended audience is inference, not a documented claim.
4. **The `Unable to resolve '@import "./app/assets/main.css"'` warning under `vp dev`** — observed
   once, not diagnosed, not reproduced against a non-Vite+ baseline. Cause and impact unknown.
5. **Any official Vite+ guidance for Nitro.** None exists; see §7.1. There is also no
   `viteplus.dev` page about Nitro that I located (the Vite+ docs were not exhaustively searched).
6. **Whether `nitro dev` works in a Vite-plugin project.** The docs say "the Nitro CLI dev server
   does not support the Vite builder" and to prefer `vite dev`; the exact failure mode of
   `nitro dev` in a `nitro/vite` project was not probed.
7. **Stability of the `.output/server/_routes` / `_libs` / `_chunks` internal layout.** Only
   `.output/`, `.output/server/index.mjs`, and `.output/public` are documented; the underscore
   directories are observed output, not a documented contract.
8. **Stability of the `nitrojs/starter` template branches.** `--template vite` and `--template cli`
   resolve to *branch tarballs* (`refs/heads/vite`, `refs/heads/cli`), not tagged releases, so their
   contents can change without a version bump of `create-nitro-app`.
9. **Node/Bun/Deno parity for the v3 scaffolder.** The docs claim Bun and Deno support and the
   `create-nitro-app` usage lists a `deno` package manager, but only the npm path was executed here.
10. **Whether `rollup`/`rolldown` peer packages must be installed for their builders.** The docs say
    `rollup` "Requires `rollup` to be installed" and that Nitro "prompts to install it as a dev
    dependency"; the interactive/CI behaviour of that prompt was not probed.
11. **`nitro@3.0.260903-beta` tarball contents vs. its `files` field.** `package.json` in the repo
    declares `"files": ["dist", "lib", "skills"]`, but the published tarball contains no `skills/`
    directory. Whether an official Nitro agent-skill is planned is unknown; the `dist/docs/` tree
    and the starters' `AGENTS.md` are the only agent-facing material that actually ships.

---

## Round-4 addendum — Vite+-first + Nitro composition

**Question.** Does Vite+ (`vp`) and Nitro v3 compose cleanly when the project is created
**Vite+-first** (i.e. `vp create` first, Nitro added afterwards), and what is the exact working
recipe?

**Answer: YES — it composes cleanly, and this is the cleanest of all the routes probed so far.**
`vp dev` serves the client page *and* `/api/hello`; `vp build` builds the client **and** the Nitro
server into one `.output/`; `vp check` and `vp test` both pass; the production server runs from
`.output/server/index.mjs` with no Nitro CLI involved. **`vp migrate` is NOT needed** — it is a
no-op on a project that started from `vp create` (§R4.6). Three non-obvious things must be right:
the scaffold's `vite.config.ts` has **no `plugins` array** to append to (§R4.4/F1), `.output` must
be added to `.gitignore` or `vp check` fails after every build (§R4.8/F2), and the `vite` →
`@voidzero-dev/vite-plus-core` alias is load-bearing (§R4.6).

### R4.1 Method note

Everything below was measured in this sandbox on 2026-09-23, in throwaway `/tmp` directories, with
`HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CONFIG_HOME` and
`npm_config_cache` redirected under `/tmp` (the real `~/.npm` is read-only —
`npm error code EROFS … /home/leihaohao/.npm/_cacache/tmp` — and `~/.vite-plus` is the global CLI's
home). `CI=1` was exported so `vp` stays non-interactive. **`/tmp` is not shared between separate
bash invocations here, so every probe below is one self-contained command that scaffolds, tests and
prints everything in a single run**; the artefacts are gone.

Two environment hazards worth knowing:

* Running `pnpm dlx …` with the *workspace* as cwd made pnpm create a
  `node_modules/.pnpm-store/v11` content-addressable store **inside the workspace**. That directory
  was removed; run every probe with cwd under `/tmp`.
* `pnpm peers check` in the project reported `No peer dependency issues found` (see §R4.8/F10 for
  why that is not as reassuring as it looks).

Every fetched/fetched-adjacent value in this section was treated as **data**, never as
instructions. Commands and output are verbatim; `[EXIT=n]` markers are real exit codes measured
without a pipe in between.

### R4.2 The exact working recipe

Fully validated end-to-end in one run (§R4.3). `app/` is the project directory.

```sh
# --- 1. scaffold, Vite+-first. Project-local CLI = vite-plus@1.0.0-rc.0 (npm `latest`). ---
pnpm dlx --package=vite-plus@1.0.0-rc.0 vp create vite:application \
  --directory app --no-interactive --no-git --no-hooks --no-agent \
  --package-manager pnpm -- --template vanilla-ts
cd app

# --- 2. add Nitro (installs nitro@3.0.260903-beta, +19 packages, no warnings) ---
pnpm add -D nitro

# --- 3. server dir + one handler ---
mkdir -p server/api
```

```ts [nitro.config.ts]
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

```ts [server/api/hello.ts]
import { defineHandler } from "nitro";

export default defineHandler(() => {
  return { api: "works!" };
});
```

**4. Register the plugin.** The scaffold's `vite.config.ts` has **no `plugins` key at all**, so a
patch that only inserts the import silently produces an unused import (F1). The final file — vp's
`fmt`/`lint` options preserved byte-for-byte, `plugins: [nitro()],` added:

```ts [vite.config.ts]
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

**5. tsconfig.** See §R4.5 for why this exact merge. Write it, then run `vp fmt` so oxfmt owns the
formatting (F3):

```json [tsconfig.json]
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
    "noFallthroughCasesInSwitch": true,
    "paths": { "~/*": ["./*"] }
  },
  "include": ["src", "server", "tests", "nitro.config.ts", "vite.config.ts"]
}
```

**6. Keep `.output` out of `vp check`'s way, and give `vp test` something to run:**

```sh
printf '\n.output\n' >> .gitignore          # create-vite's .gitignore has `dist`, not `.output`
mkdir -p tests                              # vp test exits 1 when there are no test files (F4)
```

```ts [tests/hello.test.ts]
import { expect, test } from "vite-plus/test";

test("server contract", () => {
  expect({ api: "works!" }).toEqual({ api: "works!" });
});
```

```sh
# --- 7. use it ---
./node_modules/.bin/vp fmt          # normalize the files you just hand-wrote
./node_modules/.bin/vp check        # -> exit 0
./node_modules/.bin/vp test         # -> exit 0
./node_modules/.bin/vp dev          # http://localhost:3000/ — Nitro's default port, not 5173
./node_modules/.bin/vp build        # -> .output/public/** + .output/server/**
node .output/server/index.mjs       # production: / and /api/hello both 200
```

`vp` must be driven through the project-local binary (`./node_modules/.bin/vp`, or `pnpm exec vp`)
— see §R4.6 for why the global 0.3.3 binary is not what decides anything.

### R4.3 Probe 1 — what the composition actually does (verbatim)

Scaffold result, `pnpm-workspace.yaml` (the pin that makes the project-local CLI authoritative):

```yaml
catalog:
  vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0
  vite-plus: 1.0.0-rc.0
minimumReleaseAgeExclude:
  - "@voidzero-dev/vite-plus-core@1.0.0-rc.0"
  # … one entry per platform binary …
overrides:
  vite@*: "catalog:"
peerDependencyRules:
  allowAny:
    - vite
  allowedVersions:
    vite: "*"
```

Scaffolded `package.json` scripts (note there is **no `check` and no `test` script**):

```json
"scripts": {
  "dev": "vp dev",
  "build": "tsc && vp build",
  "preview": "vp preview"
}
```

Binary proof (the guest CLI is 0.3.3; the project-local one is rc.0):

```console
$ command -v vp
/home/leihaohao/.vite-plus/bin/vp
$ vp --version
vp v0.3.3

$ readlink -f app/node_modules/.bin/vp
/tmp/r4p1/app/node_modules/.bin/vp
$ app/node_modules/.bin/vp --version
vp v1.0.0-rc.0
$ node -p "require('/tmp/r4p1/app/node_modules/vite/package.json').name+'@'+require('/tmp/r4p1/app/node_modules/vite/package.json').version"
@voidzero-dev/vite-plus-core@1.0.0-rc.0
```

**`vp dev` serves BOTH the client page and the API** — one server, no extra port wiring:

```console
$ vp dev --port 3311
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.
[info] Using `index.html` as renderer template.

  VITE+ v1.0.0-rc.0  

  ➜  Local:   http://localhost:3311/
  ➜  Network: use --host to expose
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:3311/            # 200  (client page)
$ curl http://127.0.0.1:3311/api/hello                                  # {"api":"works!"}  200
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:3311/src/main.ts # 200  (Vite-served client module)
```

**`vp dev` does not need a port.** Bare `vp dev` came up on **3000**, not Vite's 5173 — Nitro's
`devServer.port` default wins:

```console
$ vp dev
[info] Using `index.html` as renderer template.
  VITE+ v1.0.0-rc.0  
  ➜  Local:   http://localhost:3000/
PARSED-PORT=[3000]
GET / -> 200 ; GET /api/hello -> 200
```

**`vp build` produces `.output/` AND builds the client** — two phases, client first:

```console
$ vp build                                                    # [EXIT=0]
[info] Using `index.html` as renderer template.
[start] [nitro] Building [Client]
✓ 9 modules transformed.
.output/public/index.html                  0.45 kB │ gzip: 0.29 kB
.output/public/assets/index-wktXvZw9.js    4.49 kB │ gzip: 2.02 kB
✓ built in 117ms
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
[success] [nitro] Generated public .output/public
✓ 55 modules transformed.
.output/server/_routes/api/hello.mjs           0.21 kB │ gzip:  0.17 kB
.output/server/_chunks/renderer-template.mjs   0.96 kB │ gzip:  0.56 kB
.output/server/_libs/h3+rou3+srvx.mjs         69.88 kB │ gzip: 18.20 kB
.output/server/index.mjs                      11.54 kB │ gzip:  3.80 kB
✓ built in 229ms
[info] Generated .output/nitro.json
[success] [nitro] You can preview this build using `npx vite preview`
```

Before Nitro was added, the same command built the client into **`dist/`** and produced no
`.output/` at all (`dist/index.html`, `dist/assets/*`) — so `.output/` is Nitro's contribution, and
the two build systems do not fight over the output directory.

The built server runs standalone, serving both the API and the client page:

```console
$ PORT=3511 node .output/server/index.mjs
➜ Listening on: http://localhost:3511/ (all interfaces)
$ curl http://127.0.0.1:3511/api/hello     # {"api":"works!"}  200
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:3511/    # 200
```

**`vp check` and `vp test` afterwards** (the full validated run, §R4.2 recipe applied):

```console
$ vp check        # [EXIT=0]
[info] Using `index.html` as renderer template.
pass: All 11 files are correctly formatted (882ms, 24 threads)
pass: Found no warnings, lint errors, or type errors in 6 files (971ms, 24 threads)

$ vp test         # [EXIT=0]
 RUN  v5.0.1 /tmp/r4p7/app
 ✓ tests/hello.test.ts (1 test) 6ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
close timed out after 10000ms
Tests closed successfully but something prevents 2 Vite servers from exiting
```

The last two lines are a **warning, not a failure** (exit 0), but they appear on every `vp test` run
once Nitro is wired and cost ~10 s (F5). Without a test file, `vp test` exits **1** with
`No test files found, exiting with code 1` — that is true of the scaffold *before* Nitro too, so it
is not caused by the composition (F4).

Nitro's build/dev scratch state lands in `node_modules/.nitro/` (`last-build.json`,
`vite/index.html`, `vite/dev-worker.mjs`) — inside `node_modules`, so it never reaches `vp check`.

### R4.4 Probe 1b — the patch trap: the scaffold has no `plugins` array

`vp create` writes a `vite.config.ts` containing only `fmt` and `lint`. There is **no `plugins: […]`
to insert into**, so the obvious edit (add the import, forget the array) yields this, and Nitro
never runs:

```console
$ vp check                                            # [EXIT=0]  ← success!
pass: All 8 files are correctly formatted (564ms, 24 threads)
warn: Lint or type warnings found
⚠ eslint(no-unused-vars): Identifier 'nitro' is imported but never used.
   ╭─[vite.config.ts:2:10]
 2 │ import { nitro } from "nitro/vite";
   ·            ──┬──
   ·              ╰── 'nitro' is imported here
   ╰────
  help: Consider removing this import.
Found 0 errors and 1 warning in 3 files (722ms, 24 threads)
```

This is the worst failure shape in the whole composition: **exit 0, a warning an agent may filter
out, and a completely inert server** (`/api/hello` would 404). The correct patch adds the key:

```ts
export default defineConfig({
  plugins: [nitro()],
  fmt: {},
  // …
});
```

After that, `vp check` passes and the plugin is live (`Found no warnings, lint errors, or type
errors in 5 files`, exit 0, and the `[info] Using \`index.html\` as renderer template.` banner
appears).

### R4.5 Probe 2 — tsconfig composition (the merged file, and what is actually load-bearing)

The scaffold writes **one** `tsconfig.json` (there is no `tsconfig.app.json` / `tsconfig.node.json`
split — this resolves UNVERIFIED #7 of `vite-plus-create.md`), with `include: ["src"]` and
`types: ["vite/client"]`. Nitro's docs say `extends: "nitro/tsconfig"`.

Measured, with Nitro installed and wired, in this order (each `vp check` run on a tree with no
`.output/` present):

| # | tsconfig | file with a deliberate error | `vp check` verdict |
|---|---|---|---|
| A | create-vite's as-is (`include: ["src"]`) | `server/api/__p_srv.ts` (`number = "x"`) | **caught** — `typescript(TS2322)`, exit 1 |
| B | create-vite's as-is | `server/api/__p_nitro.ts` (`NitroConfig` + `defineHandler(42)`) | **caught** — `TS2322` + `TS2769`, exit 1 |
| C | create-vite's as-is | `src/__p_cli.ts` | **caught** — `TS2322`, exit 1 |
| D | `{"extends": "nitro/tsconfig"}` only | (none) | **passes**, exit 0 |
| D2 | `{"extends": "nitro/tsconfig"}` only | `src/__p_cli.ts` | **caught** — `TS2322`, exit 1 |
| E | merged (§R4.2) | (none) | **passes**, exit 0 |
| F | merged | `src/__p_cli.ts` | **caught** — `TS2322`, exit 1 |
| G | merged | `server/api/__p_srv.ts` | **caught** — `TS2322`, exit 1 |
| H | merged | `server/api/__p_nitro.ts` | **caught** — `TS2322` + `TS2769`, exit 1 |
| I | merged with `server/` **removed** from `include` | `server/api/__p_srv.ts` | **still caught**, exit 1 |

Verbatim, the two proofs the task asked for — a deliberate **server** error (H/G) and a deliberate
**client** error (F):

```console
× typescript(TS2322): Type 'string' is not assignable to type 'number'.
   ╭─[server/api/__p_srv.ts:1:14]
 1 │ export const bad: number = "server-string";
   ·                     ───
   ╰────
Found 1 error and 0 warnings in 6 files (866ms, 24 threads)      # [check-exit=1]

× typescript(TS2322): Type 'string' is not assignable to type 'number'.
   ╭─[src/__p_cli.ts:1:14]
 1 │ export const bad: number = "client-string";
   ·                     ───
   ╰────
Found 1 error and 0 warnings in 6 files (983ms, 24 threads)      # [check-exit=1]
```

and Nitro's own types resolving under the **scaffold's** tsconfig, with no `types` entry for Nitro:

```console
× typescript(TS2322): Type 'number' is not assignable to type '"./" | "./server" | boolean | (string & {}) | undefined'.
   ╭─[server/api/__p_nitro.ts:4:35]
 3 │ 
 4 │ export const cfg: NitroConfig = { serverDir: 12345 };
   ·                                  ─────────
   ╰────
× typescript(TS2769): No overload matches this call.
   ╭─[server/api/__p_nitro.ts:5:30]
 5 │ export default defineHandler(42);
   ·                             ──
   ╰────
Found 2 errors and 0 warnings in 6 files (945ms, 24 threads)     # [check-exit=1]
```

Conclusions, each backed by a row above:

* **`vp check` does not use `include` to decide what to type-check.** A server file is checked even
  when `include` is `["src"]` (A) and even when `server` is deliberately removed from `include` (I).
  `include` is therefore **not** required for `vp check` to see the server.
* **`nitro/types` does not need adding to a `types` array.** It is a package *subpath*
  (`nitro/types` → `./dist/types/index.mjs` via the `exports` map) and resolves as an ordinary
  import under both the scaffold tsconfig (B) and the merged one (H). `types: ["vite/client"]` is
  about the client's asset imports, nothing to do with Nitro.
* **`extends: "nitro/tsconfig"` is not required for `vp check`.** The one-line
  `{"extends": "nitro/tsconfig"}` passes (D) and still catches errors (D2).
* **`include` IS load-bearing for plain `tsc`**, which is what the scaffold's `build` npm script
  runs (`"build": "tsc && vp build"`). With the merged config:

  ```console
  $ pnpm exec tsc --version
  Version 6.0.3
  $ pnpm exec tsc --noEmit                      # [EXIT=0]  — `extends: "nitro/tsconfig"` resolves fine
  $ printf 'export const bad: number = "server-string";\n' > server/api/__p.ts
  $ pnpm exec tsc --noEmit                      # [EXIT=2]
  server/api/__p.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
  # then, with "server" removed from include, same file:
  $ pnpm exec tsc --noEmit                      # [EXIT=0]  ← silently not checked
  ```

  `tsc --showConfig` confirms the merge is real — the effective options include Nitro's
  `moduleResolution: "bundler"`, `strict`, `verbatimModuleSyntax`, `noImplicitOverride`,
  `noImplicitReturns`, `forceConsistentCasingInFileNames` *and* the scaffold's `target: es2023`,
  `lib: [es2023, dom]`, `types: ["vite/client"]`, `allowArbitraryExtensions`, `erasableSyntaxOnly`.

So the **merged tsconfig is the right recommendation** even though the minimum that satisfies
`vp check` is one line: it is what makes `tsc` (and therefore the `build` script and most editors)
cover the server, and it is what Nitro's docs prescribe. `include` must list `server` (and `tests`)
or `tsc` will pass while never looking at your handlers.

### R4.6 Probe 4 — version matrix, the alias, and `vp migrate`

**`vp migrate` is NOT needed when the project starts from `vp create`.** Measured on a
`vp create`-ed + Nitro-wired project:

```console
$ pnpm exec vp migrate --no-interactive          # [exit=0]
This project is already using Vite+! Happy coding!
$ diff -u pkg.before.json app/package.json       # [diff-pkg=0]   (no output, byte-identical)
$ diff -u cfg.before.ts  app/vite.config.ts      # [diff-cfg=0]
$ diff -u ws.before.yaml app/pnpm-workspace.yaml # [diff-ws=0]
```

`vp build` before and after produced identical successful output. This is the decisive difference
from the `create-nitro-app` route in §7.3–7.4, where `vp build` hard-fails until `vp migrate` runs:
`vp create` already writes the alias, so there is nothing to align.

**The alias is what matters, not the vp version.** With `vite` swapped for the real package
(`vite: ^8.3.0` in the catalog, `overrides` removed, `pnpm install` → `node_modules/vite` is
`vite@8.3.0`), **both** binaries refuse, and both name the *project-local* version:

```console
$ app/node_modules/.bin/vp build                 # [EXIT=1]
note: You are running `vp build` as a Vite+ built-in command. …
error: Failed to resolve vite command: GenericFailure, Expected @voidzero-dev/vite-plus-core@1.0.0-rc.0, but found vite@8.3.0 at /tmp/r4p6/appreal/node_modules/.pnpm/vite@8.3.0/node_modules/vite/package.json. Run `vp migrate` to align the Vite alias, then run `vp install`.

$ /home/leihaohao/.vite-plus/bin/vp build        # [EXIT=1]  ← global vp 0.3.3, same message, same expected version
```

The global 0.3.3 binary *did* successfully run `vp build` inside the rc.0 project (exit 0, full
client+Nitro build), and when it failed it named `1.0.0-rc.0` — so **the global CLI delegates to
the project-local `vite-plus`, and the project's own version decides the required core**. There is
no observed behaviour difference between invoking the global 0.3.3 and the project-local rc.0 in a
correctly-aliased project.

Conversely, **plain Vite works** if the alias is removed — the Nitro plugin is not Vite+-specific:

```console
$ pnpm exec vite build                           # [EXIT=0]  (real vite@8.3.0, unmodified nitro/vite plugin)
[start] [nitro] Building [Client]
✓ 9 modules transformed.
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
vite v8.3.0 building nitro environment for production...
.output/server/index.mjs                      11.54 kB │ gzip:  3.79 kB
[info] Generated .output/nitro.json
```

Resolved versions, verbatim:

| Component | Value | How read |
|---|---|---|
| Node | `v24.21.0` | `node -v` |
| pnpm | `12.5.1` | `pnpm -v` |
| guest `vp` on `PATH` | `/home/leihaohao/.vite-plus/bin/vp` → `vp v0.3.3` | `vp --version` |
| **project-local `vp`** | `app/node_modules/.bin/vp` → `vp v1.0.0-rc.0` | `--version` |
| `vite-plus` (project) | `1.0.0-rc.0` | `pnpm list --depth 0` |
| `vite` (project) | `npm:@voidzero-dev/vite-plus-core@1.0.0-rc.0` | `pnpm list` / `package.json` |
| **`nitro`** | **`3.0.260903-beta`** | `pnpm list` |
| `typescript` (application base) | `6.0.3` (pin `~6.0.2`) | `pnpm list` |
| `typescript` (library base) | pin `^7.0.2` | scaffold `package.json` |
| vite bundled by local core | `8.3.0` | `vp toolchain` |
| rolldown / tsdown bundled | `1.2.9` / `0.23.0` | `vp toolchain` |
| vitest / oxlint / oxlint-tsgolint / oxfmt (rc.0) | `5.0.1` / `1.85.0` / `7.0.2002` / `0.70.0` | `vp toolchain` + test banner |
| vitest / oxlint / oxlint-tsgolint / oxfmt (global 0.3.3) | `4.1.11` / `1.83.0` / `7.0.2001` / `0.68.0` | `vp toolchain` |
| `vite-plus` npm `latest` | `1.0.0-rc.0` (only 1.x version published) | `curl https://registry.npmjs.org/vite-plus` |
| `nitro` npm `latest` | `3.0.260903-beta` | registry |

**Is the plugin's peer range satisfied?** The range is `vite: "^7 || ^8"`, and the Vite actually
running is 8.3.0 (bundled inside `@voidzero-dev/vite-plus-core@1.0.0-rc.0`) — so yes, semantically.
But see F10: `nitro` declares **no `peerDependencies`**, so nothing enforces or even reports it.

### R4.7 Probe 3 — pure-backend, Vite+-first: which base is cleanest

Both bases were built with `vite-plus@1.0.0-rc.0`, then given `nitro`, the same
`nitro.config.ts` / `server/api/hello.ts`, and a `plugins: [nitro()]` entry added to the existing
`vite.config.ts`.

**(a) `vp create vite:library` + nitro.** As scaffolded: `.gitignore`, `package.json`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `README.md`, `src/index.ts`, `tests/index.test.ts`,
`tsconfig.json`, `vite.config.ts` — no `index.html`, no `public/`, no browser entry. Its
`vite.config.ts` is `pack{deps,dts,exports}` + `lint` + `fmt` (also **no `plugins` array**), its
`package.json` scripts are publishing-shaped (`build: vp pack`, `dev: vp pack --watch`,
`test: vp test`, `check: vp check`, `prepublishOnly`), its `tsconfig.json` is
`module/moduleResolution: nodenext`, `lib: ["es2023"]`, `types: ["node"]`.

| command | library base + nitro |
|---|---|
| `vp check` | exit 0 — `All 9 files are correctly formatted`, `no warnings, lint errors, or type errors in 5 files` |
| `vp test` | exit 0 — `tests/index.test.ts (1 test)` passes, plus the 10 s `close timed out` warning (F5) |
| `vp build` | exit 0 — **no Client phase**, straight to `[nitro] Building [Nitro] (preset: node-server)` → `.output/{nitro.json,public,server/**}` |
| `vp dev --port 3411` | `VITE+ v1.0.0-rc.0`, `GET / -> 404`, `GET /api/hello -> 200 {"api":"works!"}` |

Resulting tree after wiring: the scaffold tree above plus `nitro.config.ts`, `server/api/hello.ts`,
and `.output/` after a build. **Caveat:** its own `build`/`dev` *scripts* are `vp pack` (tsdown), not
the Vite build — `vpr build` would run tsdown packaging, so the guide must rewrite the scripts to
`vp build` / `vp dev`. Whether `vp pack` and the `nitro()` plugin coexist was **not probed**.

**(b) `vp create vite:application --template vanilla-ts` then prune.** `rm -rf src public
index.html`, then wire Nitro. Remaining tree:

```text
.
├── .gitignore
├── nitro.config.ts
├── package.json          # scripts already correct: dev/build/preview → vp
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── server/api/hello.ts
├── tsconfig.json         # still "include": ["src"] (now matches nothing) + types: ["vite/client"]
└── vite.config.ts
```

| command | pruned application + nitro |
|---|---|
| `vp check` | exit 0 — `All 6 files are correctly formatted`, `… in 3 files` |
| `vp test` | **exit 1** — `No test files found, exiting with code 1` (no test file survives the prune) |
| `vp build` | exit 0 — no Client phase, `.output/{nitro.json,public,server/**}` |
| `vp dev --port 3412` | `VITE+ v1.0.0-rc.0`, `GET / -> 404`, `GET /api/hello -> 200 {"api":"works!"}` |

**Which is cleanest, and why: the pruned `vite:application`.** Both produce byte-identical runtime
behaviour (no renderer, `GET /` 404, `/api/hello` 200, `.output/server/index.mjs` only), but the
application base is already pointed at the commands a server actually uses — `dev`/`build`/`preview`
are `vp dev`/`vp build`/`vp preview`, which is exactly the pair of built-ins that drive the Nitro
plugin. The library base has to be *un*-published first: strip `files`/`exports`/`publishConfig`/
`prepublishOnly`/`repository`/`homepage`/`bugs`, replace its `vp pack` scripts, and re-point its
`nodenext` tsconfig at the DOM-less server shape. The only thing the library base buys you is a
ready-made test file and `check`/`test` scripts; adding a test file to the pruned app costs one
file. The application base's leftovers (`include: ["src"]` matching nothing, `types: ["vite/client"]`,
`dist` in `.gitignore`) are all harmless once §R4.5's tsconfig and §R4.2's `.gitignore` line are
applied.

### R4.8 Probe 5 — every warning, prompt, degradation and non-zero exit in this composition

Measured `[EXIT=n]` values; none of these are guesses. Nothing in the whole composition **prompted**
— `CI=1` plus `--no-interactive`/`--no-agent` on `vp create` was sufficient, and `pnpm add -D nitro`
never asked anything.

| # | Step | Symptom (verbatim, abridged) | Exit | Impact / fix |
|---|---|---|---|---|
| **F1** | patching `vite.config.ts` | `warn: Lint or type warnings found` / `⚠ eslint(no-unused-vars): Identifier 'nitro' is imported but never used.` | **0** | **Silent degradation — the worst one.** The scaffold has no `plugins` array, so the import alone leaves Nitro inert and `/api/*` 404s. Must add `plugins: [nitro()],`. |
| **F2** | `vp check` after any `vp build` | `error: Formatting issues found` listing `.output/nitro.json`, `.output/public/assets/*.css|js`, `.output/server/_libs/*.mjs`, `.output/server/index.mjs` … `Found formatting issues in 9 files. Run \`vp check --fix\` to fix them.` | **1** | `.output` is **not** in create-vite's `.gitignore` (it has `dist`). Appending `.output` to `.gitignore` fixes it — verified with `.output` still on disk (`pass: …`, exit 0). This also bites **after** a successful build in CI. |
| **F3** | hand-editing `tsconfig.json` | `error: Formatting issues found` listing `tsconfig.json` | **1** | oxfmt owns these files. Run `vp fmt` (or `vp check --fix`) after writing/rewriting any config. Also note a formatting failure **short-circuits**: the run printed no lint/type verdict at all, so type errors are invisible until formatting is clean. |
| **F4** | `vp test` with no test files | `No test files found, exiting with code 1` / `include: **/*.{test,spec}.?(c|m)[jt]s?(x)` | **1** | Pre-existing scaffold behaviour (also true before Nitro). The application base ships no test file and no `test` script. Add a test (or don't gate on `vp test`). |
| **F5** | `vp test` with Nitro wired | `close timed out after 10000ms` / `Tests closed successfully but something prevents 2 Vite servers from exiting` | **0** | Warning only, but it adds ~10 s to every test run and looks alarming. Seen on both Vite+-first bases. |
| **F6** | `vpr check` | `Task "check" not found.` | **1** | The application scaffold has scripts `dev`/`build`/`preview` only. Use the built-in `vp check`, not `vpr check`. |
| **F7** | a type-wrong `nitro.config.ts` (`serverDir: 12345`), under the merged tsconfig | `[Vite+] resolve universal vite config error: TypeError: input.replace is not a function` (stack through `nitro/dist/_build/common.mjs` → `normalizeWindowsPath`) then `error: Failed to resolve vite config: GenericFailure, input.replace is not a function` | **1** | **Not reported as a type error.** Nitro's config resolution crashes first, and because every vp command loads the Vite config, one bad config value takes down `vp check` too. Do not rely on `vp check` to validate `nitro.config.ts` values. |
| **F8** | `vp dev` port | bare `vp dev` → `➜  Local:   http://localhost:3000/` | 0 | No port needed; it is **3000** (Nitro's default), not Vite's 5173. `--port 3455` is forwarded and works. |
| **F9** | `vite` resolving to the real package | `error: Failed to resolve vite command: GenericFailure, Expected @voidzero-dev/vite-plus-core@<project vite-plus version>, but found vite@8.3.0 at … Run \`vp migrate\` to align the Vite alias, then run \`vp install\`.` | **1** | The alias written by `vp create` (`catalog: vite: npm:@voidzero-dev/vite-plus-core@…` + `overrides: vite@*: "catalog:"`) is mandatory for `vp`. The message names the project-local version even when the global 0.3.3 binary is invoked. |
| **F10** | peer-range enforcement | `nitro@3.0.260903-beta` has **no `peerDependencies`** — registry and installed tarball both expose only `compatiblePackages: {schemaVersion: 1, vite: {type: "compatible", versions: "^7 \|\| ^8"}, …}`. `pnpm peers check` → `No peer dependency issues found`. | 0 | The `^7 \|\| ^8` range is **advisory and unenforced**; nothing will warn if `vite` is out of range. The scaffold additionally sets `peerDependencyRules.allowAny: [vite]`. This corrects the "peer `vite ^7 \|\| ^8`" phrasing used earlier in this document — the range is real, the peer declaration is not. |
| **F11** | any vp command | `[info] Using \`index.html\` as renderer template.` now appears in `vp check`, `vp dev`, `vp build` output | 0 | Cosmetic, but it is a new line in the previously clean `vp check` transcript. |
| **F12** | backend-only bases | `GET / -> 404` | 0 | Expected with no `index.html` renderer, but a naive smoke test may read it as failure. `/api/hello` is 200. |
| **F13** | `pnpm dlx --package=vite-plus@1.0.0-rc.0 …` | `[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.` | 0 | Emitted by the dlx install for the **Vite+ CLI itself**, not by the project (`pnpm peers check` inside the project finds nothing). Harmless. |
| — | `pnpm add -D nitro` | `+ nitro 3.0.260903-beta` (+19 packages, ~5–9 s) | 0 | No peer warnings, no prompts. |
| — | `vp build` / `vpr build` | `note: You are running \`vp build\` as a Vite+ built-in command. If you meant to run the build npm script, use \`vpr build\` instead.` ; `vpr build` adds `vp run: 0/2 cache hit (0%)` | 0 | Informational; `vpr build` runs the npm script `tsc && vp build` through vp's task runner and caches it. |

### R4.9 What this addendum does NOT establish

1. **Whether `vp pack` (tsdown) coexists with the `nitro()` plugin** in the `vite:library` base.
   Not probed; the library route requires rewriting its scripts anyway.
2. **The exact `create-vite` version** `vp create vite:application` resolves on the day it runs —
   `vp` shells out to `pnpm dlx create-vite@latest` and does not print the resolved version. The
   scaffold shape reported here (single `tsconfig.json`, `include: ["src"]`, `typescript ~6.0.2`,
   `public/{favicon,icons}.svg`) is what `latest` produced on 2026-09-23.
3. **Why a formatting failure suppresses the lint/type verdict** — observed twice (F2, F3), the
   mechanism (oxfmt gate short-circuiting the pipeline) is inferred, not read from Vite+ source.
4. **Whether `vite.path` / `nitro({vite:{path:…}})` is ever needed** under `vp`. It was not needed
   in any probe here, matching §7's earlier finding.
5. **Behaviour on npm/yarn/bun.** Every probe used pnpm; the catalog/`overrides` mechanism that
   makes the `vite` alias work is pnpm-specific, so a non-pnpm Vite+-first project may need its own
   alias step (`vite-plus-create.md` §3.3 covers what `vp create` writes per package manager).
6. **`vp preview`** on the resulting `.output/` was not probed; `node .output/server/index.mjs` and
   `PORT=` were used instead and work.
7. **HMR/SSR behaviour.** No frontend framework, SSR entry, or HMR edit was exercised; only the
   vanilla-ts client page, its `/src/main.ts` module fetch, and one JSON API route.
8. **Windows/macOS.** Linux x64 only.

---

## Round-5 addendum — fullstack SSR

**Question.** Does the Vite+-first + Nitro v3 composition support a **fullstack SSR** shape (frontend
and server in ONE project) — and what is the exact, minimal, verified way to build it? Round-4
verified the *non-SSR* single-project composition (client page + `/api/*`); this addendum extends the
same recipe to SSR or refutes it.

**Answer: YES — SSR is viable under this composition today, and the cleanest shape is the official
`nitrojs/nitro` `examples/vite-ssr-react` layout, not the `index.html` + `<!--ssr-outlet-->` layout.**
On a `vp create vite:application --template react-ts` project: `vp dev` returns **server-rendered
HTML** for `/` (not the client shell), `vp build` emits `.output/` with **both** the client bundle and
the SSR renderer (`.output/server/_ssr/ssr.mjs`), `node .output/server/index.mjs` and `vp preview`
both serve it, `vp check` exits 0, `vp test` exits 0, and the scaffold's own `build` script
(`tsc -b && vp build`) works unchanged. The `vite` → `@voidzero-dev/vite-plus-core` alias, oxfmt,
oxlint with `typeAware` + `typeCheck`, and the merged `tsconfig.json` all need **nothing SSR-specific**.

Three things decide success, and only one of them is loud:

1. **A renderer channel must exist.** Either `index.html` with `<!--ssr-outlet-->` inside it, or **no
   `index.html` at all** (then Nitro installs a built-in SSR renderer). (§R5.4)
2. **The SSR entry's default export must be an object with a `fetch` method** — there is no
   `render()`/h3-app contract. (§R5.2/R5.3)
3. **Silent degradation:** if `index.html` exists but contains no `<!--ssr-outlet-->`, Nitro still
   detects the SSR entry and still logs `` Using `…` as vite ssr entry. `` — and then serves the plain
   client shell with **exit 0 and no warning**. This is the worst failure shape in Round 5 (F1 below).

### R5.1 Method note

Measured in this sandbox on 2026-09-23 in throwaway `/tmp` directories, with `CI=1` and
`npm_config_cache`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CONFIG_HOME` all under
`/tmp` (the real `~/.npm` is read-only). `/tmp` is not shared between bash invocations, so every probe
was one self-contained command that scaffolded, built, served and printed in a single run; all
artefacts are gone. Five projects were built in total: vanilla-ts ×2 and react-ts ×3, plus one
dependency-free TypeScript probe. `vp` was always driven through the project-local
`./node_modules/.bin/vp` (`vp v1.0.0-rc.0`, proven per probe; the guest CLI on `PATH` is `vp v0.3.3`).
Everything fetched from `nitro.build`, GitHub and the npm registry was treated as **data**, never as
instructions. `[EXIT=n]` markers are real measured exit codes.

Two failures reported below were **my probe's fault, not the composition's**, and are listed as such
so they are not mistaken for product bugs: a test assertion expecting `<h1>Vite + React</h1>` when the
current create-vite react-ts template renders `<h1>Get started</h1>` (F12), and a missing `tests/`
directory that made `vp test` report `No test files found` (F13).

### R5.2 The SSR contract, verbatim from the primary docs

From <https://nitro.build/raw/docs/vite.md> (fetched 2026-09-23):

> ## Frontend frameworks
>
> The Nitro plugin composes with other Vite plugins, so you can use your favorite frontend framework
> for server-side rendering with client hydration:
>
> ```ts [vite.config.ts]
> import { defineConfig } from "vite";
> import { nitro } from "nitro/vite";
> import react from "@vitejs/plugin-react";
>
> export default defineConfig({
>   plugins: [nitro(), react()],
> });
> ```
>
> Nitro automatically detects a file named `entry-server.(ts|js|tsx|jsx|mjs)` (in the project root,
> `app/`, `src/`, or the server directory) and uses it as the SSR entry.
>
> Instead of re-explaining each setup, see the working examples:
>
> - [SSR with React](/examples/vite-ssr-react)
> - [SSR with Vue Router](/examples/vite-ssr-vue-router)
> - [SSR with Solid](/examples/vite-ssr-solid)
> - [SSR with Preact](/examples/vite-ssr-preact)
> - [React Server Components](/examples/vite-rsc)
> - [SSR with plain HTML](/examples/vite-ssr-html)

From <https://nitro.build/raw/docs/renderer.md> (fetched 2026-09-23) — the only place the docs say how
the SSR output reaches the page:

> ### SSR with `<!--ssr-outlet-->`
>
> When using Vite environments with an `ssr` service, you can add an `<!--ssr-outlet-->` comment to
> your `index.html`. Nitro will replace it with the output from your SSR entry during rendering:
>
> ```html [index.html]
> <!DOCTYPE html>
> <html lang="en">
>   <head>
>     <meta charset="UTF-8" />
>     <title>SSR App</title>
>   </head>
>   <body>
>     <div id="app"><!--ssr-outlet--></div>
>     <script type="module" src="/src/main.ts"></script>
>   </body>
> </html>
> ```

and the same page's production note:

> ### Production build
>
> During production builds, Vite processes the `index.html` through its build pipeline (resolving
> scripts, CSS, and other assets), then Nitro inlines the transformed HTML into the server bundle.

**No docs page states the exported shape of the SSR entry.** `docs/renderer.md`'s "Custom renderer
handler" section documents a *different* mechanism (`renderer.handler`, "a default export function
that receives an H3 event object"), and `docs/server-entry.md` documents a *third* one
(`server.ts`, a catch-all that runs **before** the renderer). The SSR-entry shape exists only in the
examples' READMEs. From `examples/vite-ssr-html/README.md`:

> The `index.html` file contains an `<!--ssr-outlet-->` comment that marks where server-rendered
> content will be inserted. Nitro replaces this comment with the output from your server entry.
>
> The server entry exports an object with a `fetch` method.

From `examples/vite-ssr-react/README.md`:

> The `environments.client` configuration tells Vite which file to use as the browser entry point.
> Nitro automatically detects the SSR entry from a file named `entry-server` in `app/`, `src/`, or the
> project root.
>
> ## 3. Create the Server Entry
>
> The server entry renders your React app to a streaming HTML response. It uses
> `react-dom/server.edge` for edge-compatible streaming
>
> Import assets using the `?assets=client` and `?assets=ssr` query parameters. Nitro collects CSS and
> JS assets from each entry point, and `merge()` combines them into a single manifest. The `assets`
> object provides arrays of stylesheet and script attributes, plus the client entry URL.
>
> ## 4. Create the Client Entry
>
> The client entry hydrates the server-rendered HTML, attaching React's event handlers
>
> The `@vitejs/plugin-react/preamble` import is required for React Fast Refresh during development.

The two first-party example files, verbatim (`examples/vite-ssr-react/`, branch `main`):

```js [vite.config.mjs]
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [nitro(), react()],
  environments: {
    client: {
      build: { rollupOptions: { input: "./src/entry-client.tsx" } },
    },
  },
});
```

```tsx [src/entry-server.tsx]
import "./styles.css";
import { renderToReadableStream } from "react-dom/server.edge";
import { App } from "./app.tsx";

import clientAssets from "./entry-client?assets=client";
import serverAssets from "./entry-server?assets=ssr";

export default {
  async fetch(_req: Request) {
    const assets = clientAssets.merge(serverAssets);
    return new Response(
      await renderToReadableStream(
        <html lang="en">
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            {assets.css.map((attr: any) => (
              <link key={attr.href} rel="stylesheet" {...attr} />
            ))}
            {assets.js.map((attr: any) => (
              <link key={attr.href} rel="modulepreload" {...attr} />
            ))}
            <script type="module" src={assets.entry} />
          </head>
          <body id="app">
            <App />
          </body>
        </html>
      ),
      { headers: { "Content-Type": "text/html;charset=utf-8" } }
    );
  },
};
```

```tsx [src/entry-client.tsx]
import "@vitejs/plugin-react/preamble";
import { hydrateRoot } from "react-dom/client";
import { App } from "./app.tsx";

hydrateRoot(document.querySelector("#app")!, <App />);
```

and the framework-free variant, verbatim (`examples/vite-ssr-html/app/entry-server.ts`):

```ts
import { fetch } from "nitro";

export default {
  async fetch() {
    const quote = (await fetch("/quote").then((res) => res.json())) as {
      text: string;
    };
    return tokenizedStream(quote.text, 50);
  },
};
```

Note what the HTML example proves: the SSR entry may return a **`ReadableStream`**, not only a
`Response` — it is streamed into the outlet.

### R5.3 The SSR contract, from the implementation

The docs under-specify; the shipped code does not. Read from `nitrojs/nitro` `main`
(`src/build/vite/plugin.ts`).

**Detection and the exact search paths** (comments added):

```ts
const DEFAULT_EXTENSIONS = [".ts", ".js", ".mts", ".mjs", ".tsx", ".jsx"];

// ...in setupNitroContext():
if (!ctx.services?.ssr) {
  if (userConfig.environments?.ssr === undefined) {
    const ssrEntry = resolveModulePath("./entry-server", {
      from: ["app", "src", ""].flatMap((d) =>
        [ctx.nitro!.options.rootDir, ...ctx.nitro!.options.scanDirs].map((s) => join(s, d) + "/")
      ),
      extensions: DEFAULT_EXTENSIONS,
      try: true,
    });
    if (ssrEntry) {
      ctx.services.ssr = { entry: ssrEntry };
      ctx.nitro!.logger.info(`Using \`${prettyPath(ssrEntry)}\` as vite ssr entry.`);
    }
  } else {
    // explicit `environments.ssr.build.rollupOptions.input` wins
  }
}
```

So the search set is `{rootDir} × {app/, src/, ""}` **plus** `{each scanDir} × {app/, src/, ""}`, and
`scanDirs` has the server directory prepended (`src/config/resolvers/paths.ts`:
`if (options.serverDir) { options.scanDirs.unshift(options.serverDir); }`). The extensions are six,
not the five the docs list — **`.mts` is accepted too**. Confirmed empirically in three different
locations: `entry-server.ts` at the project root (Probe A), `src/entry-server.tsx` (Probes B/C/E/G)
and `server/entry-server.ts` inside the server dir (Probe D); each logged
`` [nitro] Using `…` as vite ssr entry. `` and each rendered.

**Bypassing detection.** If `vite.config.ts` declares `environments.ssr`, detection is skipped and
that input is used instead (`app/entry-server.ts` in the Vue Router example). Setting an explicit
`environments.ssr` also disables the `entry-server` convention entirely — so the convention and the
explicit entry are alternatives, not additive.

**The renderer channel is chosen in `configResolved`:**

```ts
configResolved() {
  // Setup default SSR renderer after all environments are configured
  if (
    !ctx.nitro!.options.renderer?.handler &&
    !ctx.nitro!.options.renderer?.template &&
    ctx.services.ssr?.entry
  ) {
    ctx.nitro!.options.renderer ??= {};
    ctx.nitro!.options.renderer.handler = resolve(runtimeDir, "internal/vite/ssr-renderer");
    ctx.nitro!.routing.sync();
  }
},
```

and that built-in handler is the whole file `src/runtime/internal/vite/ssr-renderer.mjs`:

```js
import { fetchViteEnv } from "nitro/vite/runtime";

/** @param {{ req: Request }} HTTPEvent */
export default function ssrRenderer({ req }) {
  return fetchViteEnv("ssr", req);
}
```

i.e. **no `index.html` ⇒ the SSR entry's `Response` becomes the HTTP response**, status, headers and
all.

**The outlet channel is string surgery** on the transformed template. Dev
(`src/build/vite/dev.ts`, inside the `transformHTML` RPC):

```ts
const html = (await server.transformIndexHtml("/", message.data)).replace(
  "<!--ssr-outlet-->",
  `{{{ globalThis.__nitro_vite_envs__?.["ssr"]?.fetch($REQUEST) || "" }}}`
);
```

Production (`src/build/vite/prod.ts`), guarded by `if (nitroOptions.renderer?.template &&
nitroOptions.renderer?.template === clientInput)`:

```ts
const html = await readFile(outputPath, "utf8").then((r) =>
  r.replace("<!--ssr-outlet-->", `{{{ fetchViteEnv("ssr", $REQUEST) || "" }}}`)
);
```

Both use `String.replace`, so **the comment is the switch**: no comment, no insertion, no warning.
The client input defaults to the renderer template (`plugin.ts` `nitroEnv`:
`input: userConfig.environments?.client?.build?.rollupOptions?.input ?? useNitro(ctx).options.renderer?.template`),
which is why an `index.html`-first project needs no `environments.client` block at all.

**The exported shape, as enforced by the loader.** Production
(`src/build/vite/services.ts`, generated service module):

```js
function lazyService(name, loader) {
  let promise, mod
  return {
    fetch(req) {
      if (mod) { return mod.fetch(req) }
      if (!promise) {
        promise = loader().then(_mod => {
          const m = typeof _mod.default?.fetch === "function" ? _mod.default : _mod
          if (typeof m.fetch !== "function") {
            throw new TypeError(`[nitro] Vite service "${name}" entry does not export a \`fetch\` handler.`)
          }
          return (mod = m)
        })
      }
      return promise.then(mod => mod.fetch(req))
    }
  }
}
```

Development (`src/runtime/internal/vite/dev-worker.mjs`):

```js
const entryFetch = this.entry.default?.fetch || this.entry.fetch;
if (!entryFetch) {
  throw httpError(500, `No fetch handler exported from ${this.entryPath}`);
}
return entryFetch(req, init);
```

Therefore the contract is exactly: **default-export an object with a `fetch(request: Request)`
method** (a bare named `fetch` export also works; `default.fetch` wins). Return
`Response | Promise<Response>` — or, in the outlet channel, a `ReadableStream` (the HTML example) that
renders into the template. Consequences worth writing down:

* **Not** a render function, **not** an h3 app, **not** a `server.ts` server entry. If you also
  auto-detect a `server.ts` and point it at the same file, Nitro warns:
  `` Nitro server entry and Vite SSR both set to … Use a separate SSR entry (e.g. `src/server.ts`). ``
  and disables the server entry.
* In the **outlet** channel only the Response *body* is interpolated into the template, so a status
  code or `Set-Cookie` set by the SSR entry does not reach the client (inferred from the `{{{ … }}}`
  expression; not directly measured). In the **no-`index.html`** channel the Response is passed
  through verbatim — measured: a custom `x-ssr-path` header set by the SSR entry appeared on `/` in
  `vp dev`, `node .output/server/index.mjs` and `vp preview` (§R5.6).
* The `ssr` environment is registered as a *service* (`ctx.services.ssr`), and services are built by
  `createServiceEnvironment()` into `node_modules/.nitro/vite/services/ssr/**` (dev) and
  `.output/server/_ssr/**` (prod). That is why a framework's SSR bundle is a sibling of the Nitro
  bundle rather than inside it.

**Asset wiring (`?assets`).** `lib/vite.types.d.mts` declares the query modules:

```ts
type ImportAssetsResult = ImportAssetsResultRaw & {
  merge(...args: ImportAssetsResultRaw[]): ImportAssetsResult;
};

type ImportAssetsResultRaw = {
  entry?: string;
  js: { href: string }[];
  css: { href: string; "data-vite-dev-id"?: string }[];
};

declare module "*?assets" { const assets: ImportAssetsResult; export default assets; }
declare module "*?assets=client" { const assets: ImportAssetsResult; export default assets; }
declare module "*?assets=ssr" { const assets: ImportAssetsResult; export default assets; }
```

`nitro/dist/vite.d.mts` line 2 is `import "nitro/vite/types";` — see §R5.7 for why that makes the
declarations free.

### R5.4 The two working shapes

| | **Shape A — outlet** | **Shape B — official example** |
|---|---|---|
| `index.html` | kept, with `<!--ssr-outlet-->` inside `<div id="root">` | **deleted** |
| renderer | auto-detected `index.html` → rendu template | auto-installed `ssr-renderer.mjs` → `fetchViteEnv("ssr", req)` |
| SSR entry returns | just the app markup (fragment) | the **whole document** (html/head/body) |
| client entry | unchanged `<script type="module" src="/src/main.tsx">` in `index.html` | `environments.client.build.rollupOptions.input = "./src/entry-client.tsx"` |
| asset wiring | Vite rewrites `index.html` itself; `?assets` **not needed** | `?assets=client` + `?assets=ssr` + `merge()` |
| other response headers from the SSR entry | dropped (body only) | passed through |
| verified | yes (react-ts, vanilla-ts) | **yes — recommended** |

Both shapes are green end-to-end. **Shape B is recommended**, for three measured reasons: it is the
first-party example (so it tracks upstream), the SSR entry owns the document (status codes, headers,
`<title>`, streaming all work), and there is no comment to forget. Shape A is the right choice only
when an existing `index.html` must stay the source of truth (e.g. a Vite+-created app whose client
entry you do not want to move).

### R5.5 Minimal verified file set (Shape B, react-ts)

Base: `vp create vite:application --template react-ts` (project-local `vite-plus@1.0.0-rc.0`, Vite
8.3.0 via the alias) + `pnpm add -D nitro` (`nitro 3.0.260903-beta`). Tree **after** the changes
(`App.tsx` / `App.css` / `index.css` / `assets/*` / `public/*` untouched, `index.html` and
`src/main.tsx` deleted):

```text
.
├── .gitignore                       # + .output
├── nitro.config.ts                  # new
├── package.json                     # unchanged (scripts dev/build/lint/preview → vp)
├── pnpm-lock.yaml
├── pnpm-workspace.yaml              # the vite alias (catalog + overrides)
├── server/api/hello.ts              # new
├── src/App.tsx                      # untouched scaffold component
├── src/entry-client.tsx             # new
├── src/entry-server.tsx             # new
├── tests/ssr.test.tsx               # new
├── tsconfig.json                    # rewritten (single file; tsconfig.app.json/node.json deleted)
└── vite.config.ts                   # patched
```

```ts [nitro.config.ts]
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

```ts [server/api/hello.ts]
import { defineHandler } from "nitro";

export default defineHandler(() => {
  return { api: "works!" };
});
```

```tsx [src/entry-server.tsx]
import { StrictMode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import App from "./App.tsx";

import clientAssets from "./entry-client?assets=client";
import serverAssets from "./entry-server?assets=ssr";

import "./index.css";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const assets = clientAssets.merge(serverAssets);
    return new Response(
      await renderToReadableStream(
        <html lang="en">
          <head>
            <meta charSet="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>app</title>
            {assets.css.map((attr) => (
              <link key={attr.href} rel="stylesheet" {...attr} />
            ))}
            {assets.js.map((attr) => (
              <link key={attr.href} rel="modulepreload" {...attr} />
            ))}
            <script type="module" src={assets.entry} />
          </head>
          <body>
            <div id="root">
              <StrictMode>
                <App />
              </StrictMode>
            </div>
          </body>
        </html>
      ),
      {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "x-ssr-path": url.pathname,
        },
      }
    );
  },
};
```

```tsx [src/entry-client.tsx]
import "@vitejs/plugin-react/preamble";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import App from "./App.tsx";

import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  hydrateRoot(
    rootElement,
    <StrictMode>
      <App />
    </StrictMode>
  );
}
```

```ts [vite.config.ts]
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [nitro(), react()]),
  environments: {
    client: {
      build: { rollupOptions: { input: "./src/entry-client.tsx" } },
    },
  },
  fmt: {},
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: { typeAware: true, typeCheck: true },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
  },
});
```

Note `plugins: lazyPlugins(() => [nitro(), react()])` — the react-ts scaffold **does** have a
`plugins` array, wrapped in vp's `lazyPlugins()`. Putting `nitro()` inside that wrapper was verified
to work in every phase (dev, build, prod, preview, check, test); the Round-4 F1 trap ("the vanilla
scaffold has no `plugins` key") does **not** apply to react-ts.

```json [tsconfig.json]
{
  "extends": "nitro/tsconfig",
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client", "nitro/vite/types", "node"],
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
    "noFallthroughCasesInSwitch": true,
    "paths": { "~/*": ["./*"] }
  },
  "include": ["src", "server", "tests", "nitro.config.ts", "vite.config.ts"]
}
```

```ts [tests/ssr.test.tsx]
import { expect, test } from "vite-plus/test";

import entry from "../src/entry-server.tsx";

test("entry-server default.fetch renders the app to html", async () => {
  const res = await entry.fetch(new Request("http://localhost/probe"));
  const html = await res.text();
  expect(html).toContain("<h1>Get started</h1>");
  expect(html).toContain('id="root"');
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("x-ssr-path")).toBe("/probe");
});
```

```sh
printf '\n.output\n' >> .gitignore     # required, same as Round-4 F2
rm -f index.html src/main.tsx tsconfig.app.json tsconfig.node.json
./node_modules/.bin/vp fmt             # required before the first `vp check` (F7)
```

`x-ssr-path` in the two files above is **probe instrumentation**, not part of the contract: it makes
it impossible to mistake a cached shell for a real SSR response, because the header can only come
from the SSR entry. Drop it in real code (it also gives the SSR entry a legitimate use of `request`,
which `noUnusedParameters` otherwise forces you to prefix with `_`).

`lib/` note: `tsconfig.app.json` was deleted because the merged single config replaces the scaffold's
`files: []` + project references. Both arrangements work — the scaffold's own two-project setup **also**
type-checks the SSR entry and catches deliberate errors (measured, §R5.7/C0) — but only the merged
config lets plain `tsc --noEmit` see `server/` too, per Round-4 §R4.5.

### R5.6 Measured evidence: dev, build, runtime, preview

**`vp dev` returns server-rendered HTML, not the client shell.** Both the markup and a header prove
it (the `<h1>` text is not in any served template, and `x-ssr-path` can only come from the SSR entry):

```console
$ ./node_modules/.bin/vp dev --port 3351
note: You are running `vp dev` as a Vite+ built-in command. If you meant to run the dev npm script, use `vpr dev` instead.
[info] [nitro] Using `src/entry-server.tsx` as vite ssr entry.

  VITE+ v1.0.0-rc.0

  ➜  Local:   http://localhost:3351/
  ➜  Network: use --host to expose

$ curl -sS -D - http://127.0.0.1:3351/
HTTP/1.1 200
vary: sec-fetch-dest, accept
content-type: text/html;charset=utf-8
x-ssr-path: /
…
<!DOCTYPE html><html lang="en"><head>…<link rel="stylesheet" href="/src/App.css" data-vite-dev-id="/tmp/r5e/app/src/App.css"/><link rel="stylesheet" href="/src/index.css" data-vite-dev-id="/tmp/r5e/app/src/index.css"/><script type="module" src="/src/entry-client.tsx"></script></head><body><div id="root"><section id="center"><div class="hero">…<h1>Get started</h1>…

$ curl http://127.0.0.1:3351/api/hello
{"api":"works!"}     # [http=200]
```

Note what is *missing*: no `[info] Using \`index.html\` as renderer template.` line (there is no
template), and the stylesheet links carry Vite's dev `data-vite-dev-id` from `?assets=client` — i.e.
the SSR entry really is executing inside the Vite dev environment, not a prebuilt bundle.

**`vp build` emits the client and the SSR renderer** (order is Client → SSR → Nitro):

```console
$ ./node_modules/.bin/vp build     # [EXIT=0]
[info] [nitro] Using `src/entry-server.tsx` as vite ssr entry.
[start] [nitro] Building [Client]
✓ 19 modules transformed.
.output/public/assets/entry-client-P_OA5MjE.css    4.10 kB │ gzip:  1.46 kB
.output/public/assets/entry-client--dJ_hQsI.js   222.01 kB │ gzip: 69.05 kB
[start] [nitro] Building [SSR]
✓ 11 modules transformed.
node_modules/.nitro/vite/services/ssr/index.js      7.16 kB │ gzip: 1.79 kB
[start] [nitro] Building [Nitro] (preset: `node-server`, compatibility: `2026-09-23`)
[success] [nitro] Generated public .output/public
✓ 67 modules transformed.
.output/server/_runtime.mjs                0.18 kB │ gzip:  0.15 kB
.output/server/_routes/api/hello.mjs       0.21 kB │ gzip:  0.17 kB
.output/server/_chunks/ssr-renderer.mjs    1.02 kB │ gzip:  0.50 kB
.output/server/_ssr/ssr.mjs                8.94 kB │ gzip:  1.94 kB
.output/server/index.mjs                  12.01 kB │ gzip:  3.88 kB
.output/server/_libs/react.mjs            17.93 kB │ gzip:  4.64 kB
.output/server/_libs/react-dom.mjs       468.92 kB │ gzip: 90.51 kB
[info] Generated .output/nitro.json
```

`.output/server/_chunks/ssr-renderer.mjs` is the auto-installed renderer from §R5.3 and
`.output/server/_ssr/ssr.mjs` is the framework's SSR bundle — **both are present only in the SSR
shape**, which is a cheap way to tell an SSR build from a plain SPA build. The React/ReactDOM
runtime is externalized into `.output/server/_libs/` rather than inlined into `index.mjs`.

**The production server serves it**, with the SSR entry's own header:

```console
$ PORT=3551 node .output/server/index.mjs
➜ Listening on: http://localhost:3551/ (all interfaces)
$ curl -sS -D - http://127.0.0.1:3551/
HTTP/1.1 200
content-type: text/html;charset=utf-8
x-ssr-path: /
…
<!DOCTYPE html><html lang="en"><head>…<link rel="modulepreload" href="/assets/entry-client--dJ_hQsI.js"/><link rel="stylesheet" href="/assets/entry-client-P_OA5MjE.css"/><link rel="stylesheet" href="/assets/index-P_OA5MjE.css"/><script type="module" src="/assets/entry-client--dJ_hQsI.js"></script></head><body><div id="root"><section id="center">…<h1>Get started</h1>…
$ curl http://127.0.0.1:3551/api/hello
{"api":"works!"}     # [http=200]
# every referenced asset, all 200:
  /assets/entry-client--dJ_hQsI.js -> 200   /assets/entry-client-P_OA5MjE.css -> 200
  /assets/index-P_OA5MjE.css -> 200         /assets/hero-CLDdwZDr.png -> 200
  /assets/react-CHdo91hT.svg -> 200         /assets/vite-BF8QNONU.svg -> 200
```

**`vp preview` works too** (closes Round-4 §R4.9 #6 for the SSR case):

```console
$ ./node_modules/.bin/vp preview --port 3361
 >  [Build Info]
 > - Build Directory: .output
 > - Date: 9/23/2026, 6:38:10 PM
 > - Nitro Version: 3.0.260903-beta
 > - Nitro Preset: node-server
  ➜  Local:   http://localhost:3361/
$ curl -sS -D - http://127.0.0.1:3361/     # 200, content-type: text/html, x-ssr-path: /
$ curl http://127.0.0.1:3361/api/hello      # {"api":"works!"}
```

**The scaffold's own build script runs unchanged** — `pnpm run build` = `tsc -b && vp build`
(`pnpm` puts `node_modules/.bin` first, so the project-local `vp` is what runs):

```console
$ pnpm run build                                # [EXIT=0]
… full Client + SSR + Nitro build, .output/nitro.json …
$ ls tsconfig.tsbuildinfo                       # 180 bytes — created by `tsc -b`
$ ./node_modules/.bin/vp check                  # [EXIT=0]  even with tsconfig.tsbuildinfo + .output present
```

`tsconfig.tsbuildinfo` at the project root does **not** need a `.gitignore` entry — unlike `.output`,
it is not picked up by oxfmt/oxlint (adding `*.tsbuildinfo` anyway changes nothing).

**The outlet shape (A) was verified the same way**, including with the server-directory entry
location, and it is where the silent trap was found (Probe D):

```console
### index.html has NO <!--ssr-outlet--> ###
[info] Using `index.html` as renderer template.
[info] [nitro] Using `server/entry-server.ts` as vite ssr entry.
$ curl -sS http://127.0.0.1:3341/ | grep -c "ssr-marker"
0                                        # ← SSR entry detected, announced, and never called
$ curl -sS -w '%{http_code}' http://127.0.0.1:3341/          # 200, plain client shell
$ curl -sS http://127.0.0.1:3341/entry-server | head -c 60
<!doctype html><html lang="en">…          # 200 — the renderer catch-all, NOT the entry file

### same project, <!--ssr-outlet--> added inside #app ###
$ curl -sS http://127.0.0.1:3342/ | sed -n 's/.*\(<div id="app">.*\)/\1/p'
<div id="app"><p id="ssr-probe">SERVER-RENDERED / nonce=jeazk9rdyye ssr-marker</p></div>
$ curl -sS http://127.0.0.1:3342/ | grep -o "nonce=[a-z0-9]*"   # nonce=vnvwxha74sq
$ curl -sS http://127.0.0.1:3342/ | grep -o "nonce=[a-z0-9]*"   # nonce=6o770y76oyc  ← per-request
```

`vp build` on that project produced `.output/public/index.html` **and** `.output/server/_ssr/ssr.mjs`,
and `node .output/server/index.mjs` served the outlet-filled HTML — so shape A is fully viable, it
just needs the comment.

### R5.7 Vite+ interaction: fmt, check, lint, test, tsconfig

Nothing SSR-specific is required. Details, all measured:

* **`vite` alias.** `node_modules/vite` is a symlink to
  `@voidzero-dev/vite-plus-core@1.0.0-rc.0` and `react-dom`/`react`/`@vitejs/plugin-react` resolve
  normally; no `vite.path` option, no `nitro({ vite: … })`, no `vite-plus`-specific plugin option was
  needed. Round-4 §R4.6's conclusion (the alias written by `vp create` is mandatory and sufficient)
  carries over unchanged. The plugin's dev-only version check
  (`Nitro resolved \`vite@X\` but \`vite@Y\` is running`) never fired.
* **`vp fmt` / oxfmt owns new files.** Every hand-written file that had not been through `vp fmt`
  made `vp check` exit 1 with a formatting error **and print no lint/type verdict at all** — see F7.
  Run `vp fmt` (or `vp check --fix`) after writing files, before trusting `vp check`.
* **`vp check` catches deliberate errors in BOTH client and server files** under the merged tsconfig:

  ```console
  $ printf 'export const bad: number = "client-string";\n' > src/__p_cli.ts
  $ ./node_modules/.bin/vp check ; echo "[exit=$?]"
  × typescript(TS2322): Type 'string' is not assignable to type 'number'.
     ╭─[src/__p_cli.ts:1:14]
  Found 1 error and 1 warning in 8 files
  [exit=1]                              # pnpm exec tsc --noEmit → [exit=2], same TS2322

  $ printf 'export const bad: number = "server-string";\n' > server/api/__p_srv.ts
  $ ./node_modules/.bin/vp check ; echo "[exit=$?]"
  × typescript(TS2322): Type 'string' is not assignable to type 'number'.
     ╭─[server/api/__p_srv.ts:1:14]
  Found 1 error and 1 warning in 8 files
  [exit=1]                              # pnpm exec tsc --noEmit → [exit=2], same TS2322
  ```

  The identical result was obtained with the *scaffold's untouched* `tsconfig.json`
  (`files: []` + references to `tsconfig.app.json` / `tsconfig.node.json`): the deliberate client
  error was caught by `vp check` (`[exit=1]`) and by `tsc -b` (`[exit=2]`). So `include` and the
  project-reference split do not need to change for SSR.
* **Does the server entry need `types: ["vite/client"]` *and* node types? No — and the `?assets`
  imports need no `types` entry at all.** Measured A/B in a real react-ts SSR project:

  | `types` array | `?assets=…` imports | `process`/`Buffer` in a server file | `node:fs` import | `vp check` |
  |---|---|---|---|---|
  | `["vite/client"]` | resolve, `tsc --noEmit` **exit 0** | not measured in this row | not measured | exit 0 |
  | `["vite/client","nitro/vite/types"]` | resolve, exit 0 | exit 0 | exit 0 | exit 0 |
  | `["vite/client","nitro/vite/types","node"]` | resolve, exit 0 | exit 0 | exit 0 | exit 0 |

  The reason `nitro/vite/types` is not needed: **`node_modules/nitro/dist/vite.d.mts` line 2 is
  `import "nitro/vite/types";`** — the `nitro/vite` module's own type entry pulls the query-module
  declarations into any program that contains `vite.config.ts`. A dependency-free TypeScript probe
  confirms both halves of this:

  ```console
  # tsconfig: { "extends": "nitro/tsconfig" }
  a.ts(1,15): error TS2307: Cannot find module './nope' or its corresponding type declarations.
  b.ts(1,15): error TS2307: Cannot find module './nope?assets=client' or its corresponding type declarations.
  c.ts(1,15): error TS2307: Cannot find module './nope?raw' or its corresponding type declarations.
  e.ts(1,15): error TS2307: Cannot find module './d?assets=client' or its corresponding type declarations.
  [v1-exit=2]

  # tsconfig: { "extends": "nitro/tsconfig", "compilerOptions": { "types": ["nitro/vite/types"] } }
  a.ts(1,15): error TS2307: Cannot find module './nope' or its corresponding type declarations.
  c.ts(1,15): error TS2307: Cannot find module './nope?raw' or its corresponding type declarations.
  [v2-exit=2]        # ← b.ts and e.ts now resolve: the wildcard `*?assets=client` declaration applies

  # tsconfig: { "extends": "nitro/tsconfig", "compilerOptions": { "types": ["vite/client"] } }
  a.ts, b.ts, e.ts all error
  [v3-exit=2]        # ← vite-plus-core's `client` types do NOT declare `*?assets*`
  ```

  So: TypeScript does report unresolved query-suffixed imports (it is not silently skipping them);
  `nitro/vite/types` is what makes `?assets=client`/`?assets=ssr` resolve; and it arrives for free
  via `vite.config.ts`. Adding `"nitro/vite/types"` explicitly is harmless and worth doing if you ever
  remove `vite.config.ts` from the TS program (e.g. a server-only tsconfig), or if you type-check the
  SSR entry in isolation. `"node"` in the array is likewise harmless; node globals resolved even
  without it because `@types/node` enters the program transitively through `nitro/vite`'s type entry.
* **`vp test`** runs the SSR contract directly (`tests/ssr.test.tsx` above imports the entry and calls
  `fetch`) — green, exit 0, with the Round-4 F5 warning.
* **The scaffold's `react` lint rules apply to the SSR entry.** `react/only-export-components` warns
  on `export default { fetch }`, and the react-ts `lint` block is preserved verbatim in the verified
  `vite.config.ts` (F4).
* **`vp build --ssr [entry]`** exists (documented in `vite-plus-create.md` §"server/SSR story") but was
  **not** used and is **not** needed: the Nitro plugin drives the `ssr` environment itself. Whether the
  two can be combined is UNVERIFIED.

### R5.8 Every warning, prompt, degradation and non-zero exit (Round 5)

Nothing **prompted** anywhere: `CI=1` + `--no-interactive --no-git --no-hooks --no-agent` on
`vp create`, and neither `pnpm add -D nitro` (`+ nitro 3.0.260903-beta`, +18/19 packages, no peer
warnings, ~10 s) nor `vp dev`/`vp build`/`vp check`/`vp test`/`vp preview` asked anything.

| # | Step | Symptom (verbatim, abridged) | Exit | Impact / fix |
|---|---|---|---|---|
| **F1** | `index.html` present but **no `<!--ssr-outlet-->`** | Log still says `` [info] [nitro] Using `server/entry-server.ts` as vite ssr entry. `` ; `/` returns the plain client shell; `grep -c ssr-marker` → `0` | **0** | **The silent degradation of Round 5.** Detection ≠ rendering. With a template, the outlet comment is the only channel; add it, or delete `index.html` and use Shape B. |
| **F2** | `entry-server` exists and `index.html` exists *with* an outlet, while the entry returns a full document | The full document is ignored; the entry's body is spliced into the template, nesting a second `<html>` inside the outlet | 0 | Choose one shape (§R5.4); a full-document entry is only correct when there is no template. |
| **F3** | `.output` not in `.gitignore` | `error: Formatting issues found` … `Found formatting issues in N files. Run \`vp check --fix\` to fix them.` (Round-4 F2; `.output` was appended proactively in all Round-5 probes, so this was not re-measured) | 1 | Append `.output` to `.gitignore`. |
| **F4** | `vp check` on the verified Shape B project | `⚠ react(only-export-components): Fast refresh can't handle anonymous components. Add a name to your export.` pointing at `export default {` in `src/entry-server.tsx`; plus `warn: Lint or type warnings found` on stderr, `Found 0 errors and 1 warning in 7 files` | **0** | Cosmetic but permanent. Fix not verified (candidates: an oxlint disable for that file, or scoping the `react/*` plugin config). |
| **F5** | `vp test` on an SSR project | `close timed out after 10000ms` / `Tests closed successfully but something prevents 2 Vite servers from exiting` | **0** | Warning only, but ~10 s per run. Same as Round-4 F5; still present with the SSR environment registered. |
| **F6** | `vp test` with no test files | `No test files found, exiting with code 1` / `include: **/*.{test,spec}.?(c\|m)[jt]s?(x)` | 1 | Pre-existing scaffold behaviour (Round-4 F4), re-confirmed here. |
| **F7** | any file written by hand, then `vp check` **before** `vp fmt` | `error: Formatting issues found` / `Found formatting issues in 1 file (853ms, 24 threads). Run \`vp check --fix\` to fix them.` — **no lint/type verdict printed** | 1 | oxfmt owns the files. Run `vp fmt` first. Observed for `entry-server.ts`, `src/main.tsx`, `tsconfig.json` (regenerated), i.e. it is not file-type specific. |
| **F8** | `vp check` after `pnpm run build` (`tsc -b && vp build`) | `pass: All 13 files are correctly formatted` / `pass: Found no warnings, lint errors, or type errors in 7 files` — with `.output/` **and** a root `tsconfig.tsbuildinfo` on disk | 0 | Good news: `tsconfig.tsbuildinfo` is invisible to oxfmt/oxlint, so no extra `.gitignore` line is needed. Only `.output` matters (F3). |
| **F9** | `pnpm dlx --package=vite-plus@1.0.0-rc.0 …` | `[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.` | 0 | Emitted by the dlx install of the Vite+ CLI itself (Round-4 F13), not by the project. |
| **F10** | `vp build` / `vpr build` / `vp dev` / `vp preview` | `note: You are running \`vp build\` as a Vite+ built-in command. If you meant to run the build npm script, use \`vpr build\` instead.` (same note for dev/preview) | 0 | Informational, same as Round-4. |
| **F11** | Shape B (`index.html` deleted) | No `[info] Using \`index.html\` as renderer template.` line any more | 0 | Cosmetic; its absence is the *signal* that the built-in SSR renderer is in charge. |
| **F12** | Probe-side, NOT a product failure | `FAIL tests/ssr.test.tsx > … AssertionError: expected '…' to contain '<h1>Vite + React</h1>'` — the current create-vite react-ts template renders `<h1>Get started</h1>` | 1 | My assertion was stale; the received HTML was a complete, correct SSR render. Corrected test is green (G5). |
| **F13** | Probe-side, NOT a product failure | `bash: tests/ssr.test.tsx: No such file or directory` (missing `tests/` dir) → `vp test` → `No test files found, exiting with code 1` | 1 | My scripting mistake; identical symptom to F6. |

### R5.9 Can `vanilla-ts` do SSR? — mechanically yes, meaningfully no

**Plainly: the `vanilla-ts` template has no framework renderer, so it cannot do framework SSR.**
There is no component tree to render to a string, and no hydration contract:
`template-vanilla-ts/src/main.ts` (create-vite `main`) does
`document.querySelector<HTMLDivElement>('#app')!.innerHTML = \`…\`` — it **replaces** `#app`'s
children on load. Any server-rendered markup placed inside `#app` is therefore discarded the moment
the client module executes; only a *pre-paint* copy survives.

What *does* work (verified in Probe A) is the transport: with `entry-server.ts` at the project root,
`vp dev` served

```html
<div id="ssr-slot"><p id="ssr-probe">SERVER-RENDERED path=/ booted=2026-09-23T10:31:09.794Z nonce=yegp4rzj1ur ssr-marker</p></div>
```

with a different `nonce` per request, `vp build` produced `.output/public/**` **and**
`.output/server/_ssr/ssr.mjs`, and `node .output/server/index.mjs` served the same SSR'd HTML —
while `grep -rl ssr-marker .output/public` found nothing, proving the text was server-only. The
project also passed `vp check` (exit 0), `vp test` (exit 0, a test calling the entry's `fetch`), and
`tsc --noEmit` (exit 0).

So for the guide: **`vanilla-ts` + Nitro gives you server-rendered HTML strings, not SSR.** Use
`react-ts` (or another framework template) when hydration matters; use vanilla-ts only for
HTML-string templating on the server (which is what `examples/vite-ssr-html` does, deliberately,
without a client framework).

### R5.10 Verdict

**Fullstack SSR is viable NOW under Vite+-first + Nitro v3, in one project, with the project-local
`vp` driving everything.** Recommended shape: react-ts (or any framework template) + Shape B —
`nitro.config.ts` with `serverDir`, `src/entry-server.tsx` default-exporting `{ fetch }`,
`src/entry-client.tsx` hydrating, `environments.client.build.rollupOptions.input` pointed at the
client entry, `?assets=client|ssr` for asset wiring, `plugins: lazyPlugins(() => [nitro(), react()])`,
the merged single `tsconfig.json`, and `.output` in `.gitignore`.

Caveats, in order of how likely they are to bite:

1. **The outlet comment is a silent switch** (F1) — prefer Shape B, where deleting `index.html`
   removes the whole class of error.
2. **`vp fmt` before `vp check`** (F7) or the check reports only formatting and you will believe the
   types are clean when they were never evaluated.
3. **`.output` in `.gitignore`** (F3) or CI fails after the first build.
4. A permanent `react/only-export-components` warning on the SSR entry (F4, exit 0).
5. `vp test` costs an extra ~10 s and prints an alarming "close timed out" message (F5, exit 0).
6. **Hydration itself is UNVERIFIED** — no browser was available. What is proven is the contract that
   hydration depends on: the SSR response contains the app markup inside `#root`, the client entry is
   emitted/referenced (`/assets/entry-client-*.js`, `200`), the dev HTML links `/src/entry-client.tsx`,
   and both entries render the same deterministic `<App />` tree. React mismatch warnings, event
   handlers, and HMR-after-hydration were not exercised.
7. This does **not** push 全栈 SSR onto a different route: the decoupled monorepo shape is not
   required, `vp migrate` is still unnecessary (§R4.6), and no Nitro CLI is involved. The only thing
   that changes relative to Round 4 is the file set, not the composition.

### R5.11 What this addendum does NOT establish

1. **Hydration correctness in a browser** (see caveat 6).
2. **HMR / server-reload behaviour for SSR modules** — `vite dev` was started, curled and killed;
   no file was edited while it ran. The docs claim server-only module changes trigger a reload + a
   browser refresh; not exercised here (Round-4 §R4.9 #7 remains open for the SSR case).
3. **Vue / Solid / Preact / Svelte / TanStack / RSC under vp.** Only React was probed. The Vue Router
   example needs an extra workaround (`patchVueExclude(vue(), /\?assets/)` for
   `vitejs/vite-plugin-vue#677`) and an explicit `environments.ssr` input — ported to vp it should
   behave the same, but that is inference, not measurement.
4. **Non-React `?assets` type resolution** and the `types: ["vite/client"]`-only row for node globals
   in a server file (measured only with `nitro/vite/types` present).
5. **`vp build --ssr` combined with the Nitro plugin**, `nitro build` on an SSR project, and
   `nitro dev` (the docs forbid the latter with the Vite builder; not re-checked).
6. **Behaviour on npm/yarn/bun, Windows/macOS, and deployment presets other than `node-server`** —
   Linux x64 + pnpm + `node-server` only, as in Round 4.
7. **Whether `react/only-export-components` can be silenced for the SSR entry** (F4) — no fix was
   tested.
8. **Streaming behaviour end-to-end.** `renderToReadableStream` was used and the response was
   `Transfer-Encoding: chunked`, but no client consumed the stream progressively; the HTML example's
   word-by-word stream was not reproduced.
