
```bash guide:exec id=agents-rules-fullstack-monorepo when=mode:fullstack&layout:monorepo
set -euo pipefail

cat >> AGENTS.md <<'SPLIT'

### Workspace (monorepo)

- The workspace root is a package, and it owns the server: `defaultPackage: "."` in the root
  `vite.config.ts` is what lets `vp dev` and `vp build` act on it. Without it vp refuses at the
  root — ``error: `vp dev` at the workspace root needs a target package.``, exit 1 — and a
  command that "worked" elsewhere in the workspace silently does nothing here.
- `vp run -r <task>` is the cross-package form, and a package that does not define the task is
  **skipped silently** (exit 0). That is the contract, not an oversight: `apps/website` has no
  `check` and no `test` script, so those two tasks never run there. Selecting a package
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
- The commands that matter are registered in the root `package.json`: `vp run dev:server`,
  `vp run dev:website`, `vp run check`, `vp run test`, `vp run build`, `vp run ready`.
- `vp check` at the root covers **every** package, including `server/` and the app's `src/`;
  `vp run -r check` runs each package's own `check` script and skips the packages without one.
  `vp run -r test` would run the root's workspace-wide scan *and* each package's own test script —
  the same file twice — so the test command is `vp run test`.
- The root server does not serve the frontend's build: `apps/website/dist` is the app's own
  output, and production is a reverse proxy in front of the two.

### Server

- The server is **Nitro v3 as a Vite plugin** in the **root** `vite.config.ts`, called in the
  `plugins` array beside `defaultPackage: "."`. An import without that call is silently inert:
  `vp check` still exits 0 and every route 404s.
- Routes are files under `server/routes/`, and their URL is the file path with **no prefix**
  (`server/routes/hello.ts` → `/hello`). The `/api` prefix belongs to the frontend's dev proxy and
  to the production reverse proxy; the server never sees it, and `server/api/` — the directory
  that adds the prefix implicitly — is not used here.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already cover.
  A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check` fail on the
  build's own artefacts, because those commands take their file set from the ignore rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports, so
  an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro` is a
  devDependency of the root, like the rest of the toolchain.

### Development proxy (apps/website)

- The proxy lives in the frontend package: `apps/website/vite.config.ts` and
  `apps/website/.env` (committed; personal overrides go in `apps/website/.env.local`).
  `DEV_PROXY` names this workspace's own root server, and the two have to agree — a target on a
  port nothing listens on answers `502`, not this app's HTML.
- The one-line guard is deliberate and unconditional: without it a missing variable makes `/api/*`
  answer `200` with this app's HTML instead of failing. It must fire in every mode, which is why
  the variable lives in `.env` (loaded for a production build too) rather than
  `.env.development`.
- The proxy prefix is a regular expression and is written `/api/` with the trailing slash.
- Inside `/api/`, Vite's single-page fallback never applies: an unknown `/api/…` path is the
  server's `404`, a dead target a `502`. Outside `/api/`, an unknown path is this app's HTML —
  that difference is what the proxy is for, so a `200 text/html` on an `/api/` path is a failure
  signal, never a success.

### Tests

- Tests live in `tests/` at the workspace root — or a package's own `tests/` — and never under
  `server/`: Nitro compiles every file under `server/routes/` and `server/api/` into a route, so a
  test in there would be served instead of run.
- The root's runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files.
  That is the configured state, not coverage.
- The frontend app ships no test harness by decision — a page-iteration loop is faster without a
  suite that goes stale — and that is exactly the case `vp run -r` is built to skip.
SPLIT
echo "ok  fullstack/monorepo (split) rules appended"
```

```markdown guide:file path=.vite-plus-inherited-adrs/0004-split-shape.md when=mode:fullstack&layout:monorepo
# The split shape keeps the server at the workspace root and the frontend beside it

This project is a pnpm workspace with two packages that deploy separately: the workspace root is
the server (Nitro v3 as a Vite plugin, `serverDir: "./server"`, production output in `dist/`,
routes whose URL is their file path with no `/api` prefix) and `apps/website` is the frontend (the
create-vite `vanilla-ts` app the monorepo template writes). The dev proxy in the frontend package
is the deliberate reproduction of the production edge: `/api/*` from the frontend's port is
forwarded to the root server with the prefix stripped, so the server sees `/hello`, exactly as it
will behind the reverse proxy that serves this shape in production.

The alternative shape for a fullstack project — server-side rendering in one project — is what the
`single` layout builds. This shape exists for the deployments where the two halves are separate
artifacts: two builds, two outputs, one API.

## Considered Options

- **One project, server-rendered (the SSR shape)** — rejected here: it is a different deployment.
  The two shapes are the `fullstack` mode's layout switch, not two implementations of one thing.
- **The root server serving `apps/website/dist`** — rejected: the halves build and deploy
  separately, and a server that also serves a stale copy of the frontend is a second, silently
  diverging delivery path. In production a reverse proxy in front of both owns that job.
- **Merging the server's and the app's TypeScript programs into one tsconfig** — rejected: the
  layout exists to keep the two packages apart; the root check still type-checks both, because
  `vp check` walks every package's own program. One merged program would erase the boundary and
  would have to grow an `include` list naming files in packages that own their own tsconfig.
- **Writing version literals in the package manifests** — rejected: `catalogMode: prefer` and the
  `catalog:` block are what the scaffold ships, and one version per dependency in one file is what
  keeps the root and its packages resolving the same thing.
- **A framework app in `apps/website`** — not this revision's work: the template writes the
  `vanilla-ts` app, and re-scaffolding it on another framework is a different decision with its own
  verification. The profile guard refuses the request before anything is written.
- **Deleting the scaffolded `packages/utils`** — a decision point, not a default: it is kept as the
  home for future shared code (with the library starter's publishing shape pruned) unless the
  answer is `no`, in which case the workspace is identical minus that package.
- **Using a package manager directly in the workspace** — rejected: one toolchain, one way to
  operate it. `vp install`, `vp run -r`, `vp -C` and `vp add` cover what `pnpm install`,
  `pnpm -r` and `pnpm --filter` would do here, and a project with two sets of commands is a
  project where the second set is the one that is wrong.

## Consequences

- The two halves are two dev servers on two ports (the root server keeps Nitro's `3000`, the app
  takes Vite's `5173`), started by the root scripts `dev:server` and `dev:website`.
- The root server is a workspace package that acts on itself: `defaultPackage: "."` in the root
  `vite.config.ts`, or vp refuses to run at the root (`needs a target package`, exit 1).
- `apps/website/.env` holds `DEV_PROXY` and is committed; the guard in
  `apps/website/vite.config.ts` makes a missing variable a stop instead of an HTML `200`, in every
  mode — which is why the variable is in `.env` and not `.env.development`.
- `apps/website` has no `check` and no `test` script and no `tests/` directory: a frontend page
  iteration loop is faster without a suite that goes stale. `vp run -r` skips a package without the
  task silently; the root's `vp check` still covers the app's sources, and `vp run ready` chains
  the workspace-wide check, tests and build.
- `vp run -r build` builds all three packages into their own `dist/` directories (the root's
  `dist/server/index.mjs` + `dist/nitro.json`, `apps/website/dist`, and the placeholder package's
  `packages/utils/dist` when it is kept).
- Production topology is out of scope, with one thing fixed by this shape: the edge strips the
  `/api` prefix before the server sees the path, and the dev proxy is measured to do the same.
```

```bash guide:exec id=notes-proxy-split when=mode:fullstack&layout:monorepo
set -euo pipefail

# The dev-proxy traps of the split shape: the same mechanism as a pure frontend's, wired in a
# different package, against this workspace's own server.
cat >> docs/agent-notes.md <<'NOTES'

## The development proxy (apps/website)

- `DEV_PROXY` lives in `apps/website/.env` and is read by `loadEnv(mode, process.cwd(), "")`; the
  app's own `.gitignore` ignores only `*.local`, so the file is committed and a personal override
  goes in `apps/website/.env.local`. Root-relative paths matter here: the variable is read by the
  app's config, from the app's working directory.
- The guard `if (!env.DEV_PROXY) throw …` is deliberate and unconditional, and it fires in every
  mode: with the variable missing, `vp -C apps/website dev` stops with
  `Error: DEV_PROXY is not set — see .env` instead of serving `/api/*` as this app's HTML, and a
  build whose config cannot load fails too (which is why the variable sits in `.env`, not
  `.env.development`).
- The proxy target and the root server's port have to agree. They are separate settings — the
  port the server binds and the address in this file — and a mismatch is not silent: the proxy
  answers `502` and the dev log names the proxied path.
- The prefix is compiled as a regular expression, so `/api/` with the trailing slash is what
  keeps `/apix/…` out of the proxy.
- Inside `/api/`, Vite's single-page fallback never applies: an unknown `/api/…` path is the
  server's `404` (JSON, or Nitro's error page under a browser `Accept` header), and a dead target
  is a `502`. Outside `/api/`, an unknown path is the app's HTML `200` — so a `200 text/html` on
  an `/api/` path means the proxy is not running.
- The proxied path reaches the server **without** the prefix, which is the whole point: the root
  server's routes carry no `/api`, and the production reverse proxy is expected to strip the same
  prefix before it forwards. A route mounted under `server/api/` would answer `/hello` here and
  only look right behind a proxy that does not strip anything.
NOTES
echo "ok  split-shape proxy traps appended to docs/agent-notes.md"
```

```bash guide:exec id=prov-fullstack-monorepo when=mode:fullstack&layout:monorepo
set -euo pipefail
: "${GUIDE_FRAMEWORK:?Phase 1 must answer GUIDE_FRAMEWORK}"
nitro_pin=${GUIDE_NITRO_VERSION:-}
[ -n "$nitro_pin" ] || { echo "GUIDE_NITRO_VERSION was never answered (Phase 2)" >&2; exit 1; }
nitro_version=$(node -p 'require("./node_modules/nitro/package.json").version')
installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
placeholder_answer=${GUIDE_PLACEHOLDER:-not applicable}
dev_port_answer=${GUIDE_DEV_PORT:-}

choice_rows="| Scaffold template | \`vite:monorepo\` (the frontend app is create-vite's \`${GUIDE_FRAMEWORK}\` app in \`apps/website\`) |
| Placeholder package | ${placeholder_answer} (\`packages/utils\`) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease), at the workspace root |
| Frontend | \`apps/website\`, a separate build and a separate dev server |
| API origin | the frontend's own dev proxy (\`/api/\` → \`http://127.0.0.1:${dev_port_answer}\`, prefix stripped); production is a reverse proxy with the same rule |"
scaffold_line="3. Skeleton: \`vp create vite:monorepo\`, the workspace catalog extended with \`nitro\` and every dependency spec pointed at \`catalog:\`, the root server and the app pruned and wired, dependencies installed with \`vp install\`."
server_step="4. Split shape: the root's \`nitro.config.ts\` (\`serverDir: \"./server\"\`, \`output: { dir: \"dist\" }\`) and \`server/routes/hello.ts\`, \`nitro()\` in the root \`vite.config.ts\` beside \`defaultPackage: \".\"\`, the app pruned to a minimal page, and the app's own \`vite.config.ts\` + \`.env\` carrying the dev proxy with its guard. Root commands \`dev:server\`, \`dev:website\`, \`check\`, \`test\`, \`build\`, \`ready\`."
verify_step="8. Verification: format, the workspace-wide static check (\`vp check\`) and \`vp run -r check\`, the workspace build (\`vp run -r build\`) with the root server's \`dist/server/index.mjs\` and the app's \`apps/website/dist\`, and smoke tests of the built server and of both dev servers, asserting the app's page, the same-origin \`/api/hello\` on the root port, and the proxied \`/api/hello\` from the app's port arriving as \`/hello\`. Recorded ${installed_at}."

printf '%s\n' "$choice_rows" > .vite-plus-prov-choice
printf '%s\n' "$scaffold_line" > .vite-plus-prov-scaffold
printf '%s\n' "$server_step" > .vite-plus-prov-server
printf '%s\n' "$verify_step" > .vite-plus-prov-verify
echo "ok  provenance arm fullstack/monorepo: choices, skeleton, server and verification rows written"
```

```bash guide:exec id=report-fullstack-monorepo when=mode:fullstack&layout:monorepo
set -euo pipefail
# The lines Phase 7's report repeats, and only this shape's. See report-backend-single for why they
# live next to the shape rather than in the shared Phase 7.
cat <<'REPORT'
Deliberate — two dev servers on two ports, and the app reaches the workspace's own root server through a dev proxy that strips `/api/` exactly as the production reverse proxy does: the server never learns the prefix exists.
Deliberate — one version per dependency in the workspace catalog; the app's `.env` is committed while `*.local` stays personal; the placeholder package is kept or deleted as answered.
Deliberate — the root commands name only what the workspace has: a script naming a deleted package would exit 0 having run nothing.
Not covered — the one route and the one page; the production reverse proxy is out of scope (the dev proxy is the measured reproduction of its rule, not a deployment); browser hydration after the first paint.
REPORT
echo "ok  handoff lines for fullstack/monorepo are above"
```
