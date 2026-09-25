
```bash guide:exec id=agents-rules-backend-monorepo when=mode:backend&layout:monorepo
set -euo pipefail

cat >> AGENTS.md <<'BACKENDWORKSPACE'

### Workspace (monorepo)

- The workspace root is a package, and it owns the server: `defaultPackage: "."` in the root
  `vite.config.ts` is what lets `vp dev` and `vp build` act on it. Without it vp refuses at the
  root — ``error: `vp dev` at the workspace root needs a target package.``, exit 1.
- The root manifest registers the commands that matter: `vp run dev:server`, `vp run check`,
  `vp run test`, `vp run build`, `vp run ready`. There is no `dev:website`: this project has no
  frontend, and the app the template wrote was deleted during initialization.
- **No command may name a package by its task** (`"dev": "vp run website#dev"`). A script that names
  a package the workspace does not have exits 0 and runs nothing — the failure looks like success.
  The template's own `dev` script is that form and was replaced for exactly this reason.
- `vp run -r <task>` is the cross-package form, and a package that does not define the task is
  **skipped silently** (exit 0). That is the contract, not an oversight. Selecting a package
  explicitly (`vp run -F <pkg> <task>`, `vp run -w <task>`) turns the missing task into an error
  instead, which is why orchestration uses `-r`.
- Every dependency version lives in the `catalog:` block of `pnpm-workspace.yaml`, and every
  package references it as `"<name>": "catalog:"`. A version literal in a `package.json` is a
  version nothing else shares; `vp install` is what turns the catalog into `node_modules`.
- Only `vp` commands, everywhere: `vp run -r …` across packages, `vp -C <pkg> …` for one package,
  `vp install` after a manifest change, `vp run <script>` for the root's scripts, and
  `vp add -w -D <name>` (root) or `vp -C <pkg> add -D <name>` (a package) to add a dependency —
  with `catalogMode: prefer` the version lands in the catalog and the manifest keeps `catalog:`.
  Do not reach for pnpm, npm, yarn or bun: one toolchain, one way to operate it.
- `vp check` at the root covers **every** package, including `server/`; `vp run -r check` runs each
  package's own `check` script and skips the packages without one. `vp run -r test` would run the
  root's workspace-wide scan *and* each package's own test script — the same file twice — so the
  test command is `vp run test`.
- The workspace build is `vp run -r build`, and it includes the root: `dist/server/index.mjs` and
  `dist/nitro.json` come out of it. A build that schedules nothing means the root's build script is
  missing or was renamed.

### Server

- The server is **Nitro v3 as a Vite plugin** in the **root** `vite.config.ts`, called in the
  `plugins` array beside `defaultPackage: "."`. An import without that call is silently inert:
  `vp check` still exits 0 and every route 404s.
- Routes are files under `server/routes/`, and their URL is the file path with **no prefix**
  (`server/routes/hello.ts` → `/hello`). `server/api/` — the directory that adds the `/api` prefix
  implicitly — is not used here: this project has no frontend for a prefix to belong to.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already cover.
  A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check` fail on the
  build's own artefacts, because those commands take their file set from the ignore rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports, so
  an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro` is a
  devDependency of the root, like the rest of the toolchain.

### Tests

- Tests live in `tests/` at the workspace root — or a package's own `tests/` — and never under
  `server/`: Nitro compiles every file under `server/routes/` and `server/api/` into a route, so a
  test in there would be served instead of run.
- The root's runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files.
  That is the configured state, not coverage — a green test command means the runner works.
BACKENDWORKSPACE
echo "ok  backend/monorepo (workspace) rules appended"
```

```markdown guide:file path=.vite-plus-inherited-adrs/0004-backend-workspace.md when=mode:backend&layout:monorepo
# The backend lives in a workspace whose root is the server

This project is a pnpm workspace with exactly one package that matters: the root, which *is* the
Nitro v3 server (a Vite plugin, `serverDir: "./server"`, `output: { dir: "dist" }`, routes whose URL
is their file path with no prefix). The layout is a workspace because the project may grow a second
package, not because it has two halves today; the client the monorepo template wrote was deleted in
the same run, because a backend project has no frontend. The placeholder package the layout offered
is a decision: kept as the home for future shared code, or removed.

## Considered Options

- **The single layout** — a perfectly good backend project, and the smaller one. It is rejected here
  only because a workspace was asked for: when the second package arrives, moving the server into one
  afterwards is a different change with its own risks.
- **Keeping `apps/website` as a stub** — rejected: a backend project has no client, and an empty or
  token frontend is a package that something will eventually try to build, deploy, or serve.
- **A second package for the server, with a shell root** — rejected: it buys nothing here. The root
  is a package in a workspace, and `defaultPackage: "."` lets the app commands act on it directly
  instead of every command naming a package.
- **A root script that delegates by package name (`vp run <pkg>#<task>`)** — rejected: the template's
  own `"dev": "vp run website#dev"` is that form, and with `apps/website` deleted it exits 0 having
  run nothing (`vp run: 0/0 cache hit`, measured). Every root command names what the workspace
  actually has, and the rule is checked rather than remembered.
- **`build: "vp run -r build"` as the root's build** — rejected: the root's own build is the server's,
  and a self-referential script is pruned along with the root's entry in that run.

## Consequences

- `vp run -r build` is the workspace build and it includes the root: the root's `build` script
  (`vp build`) runs, and `dist/server/index.mjs` + `dist/nitro.json` come out of it. A build that
  schedules nothing is the failure this arrangement is most likely to have silently, so it is
  asserted.
- The root manifest registers `dev:server`, `check`, `test`, `build` and `ready`; there is no
  `dev:website`, because there is no website. `ready` runs the root's own `vp test` rather than
  `vp run -r test` — the root's test script already scans the whole workspace, and the `-r` form
  would run each package's test scripts on top of that scan.
- Every dependency version lives in the workspace catalog (`pnpm-workspace.yaml`) and every manifest
  references it as `"catalog:"`; `vp install` turns the catalog into `node_modules`.
- `tests/` sits at the workspace root and never under `server/`: Nitro compiles every file under
  `server/routes/` and `server/api/` into a route, so a test in there would be served, not run.
- The production artefact is `dist/server/index.mjs`, started with `node dist/server/index.mjs`
  (the `PORT` environment variable is honoured).
```
