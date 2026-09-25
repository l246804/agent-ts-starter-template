
```bash guide:exec id=agents-rules-frontend-monorepo when=mode:frontend&layout:monorepo
set -euo pipefail

cat >> AGENTS.md <<'FRONTENDWORKSPACE'

### Workspace (monorepo)

- The workspace root is a shell: it owns the catalog of versions and the commands, and it is not an
  application. The application is `apps/website`, which has its own `dev`/`build`/`preview` scripts
  and its own tsconfig.
- The root manifest registers `vp run dev:website` (the app's dev server),
  `vp run check` (the workspace's static check) and `vp run ready` (`vp check && vp run -r build`).
  The workspace build is `vp run -r build`: the root defines no `build` task of its own, and the
  runner skipping it is the contract, not a failure.
- **No command may name a package by its task** (`"dev": "vp run website#dev"`). A script that names
  a package the workspace does not have exits 0 and runs nothing — the failure looks like success.
- `vp run -r <task>` is the cross-package form, and a package that does not define the task is
  **skipped silently** (exit 0). Selecting a package explicitly (`vp run -F <pkg> <task>`,
  `vp run -w <task>`) turns the missing task into an error instead, which is why orchestration uses
  `-r`.
- `vp check` at the root covers **every** package, including `apps/website/src` — the app has no
  `check` script of its own, so the root check is what type-checks it.
- Every dependency version lives in the `catalog:` block of `pnpm-workspace.yaml`, and every
  package references it as `"<name>": "catalog:"`. A version literal in a `package.json` is a
  version nothing else shares; `vp install` is what turns the catalog into `node_modules`.
- Only `vp` commands, everywhere: `vp run -r …` across packages, `vp -C <pkg> …` for one package,
  `vp install` after a manifest change, and `vp add -w -D <name>` (root) or
  `vp -C <pkg> add -D <name>` (a package) to add a dependency — with `catalogMode: prefer` the
  version lands in the catalog and the manifest keeps `catalog:`. Do not reach for pnpm, npm, yarn
  or bun: one toolchain, one way to operate it.

### Development proxy (apps/website)

- The proxy lives in the frontend package: `apps/website/vite.config.ts` and `apps/website/.env`
  (committed; personal overrides go in `apps/website/.env.local`). `DEV_PROXY` names a backend this
  project does not own — it was answered at initialization, and `http://127.0.0.1:3000` is the
  placeholder that was written when nothing better was known.
- The one-line guard is deliberate and unconditional: without it a missing variable makes `/api/*`
  answer `200` with this app's HTML instead of failing. It must fire in every mode, which is why
  the variable lives in `.env` (loaded for a production build too) rather than `.env.development`.
- The proxy prefix is a regular expression and is written `/api/` with the trailing slash.
- A target nothing listens on answers `502` — which is what the placeholder does until the real
  backend exists, and the loud half of pointing the proxy at the wrong address. A `200 text/html`
  on an `/api/` path means the proxy is not running at all.

### Tests

- The frontend app ships no test harness by decision: a page-iteration loop is faster without a
  suite that goes stale. Adding one is an explicit decision — say what it is for, and record the
  reason in an ADR.
- A package that does need tests keeps them in its own `tests/` with its own script;
  `vp run -r test` runs the packages that define one and skips the rest silently.
FRONTENDWORKSPACE
echo "ok  frontend/monorepo (workspace) rules appended"
```

```markdown guide:file path=.vite-plus-inherited-adrs/0004-frontend-workspace.md when=mode:frontend&layout:monorepo
# The frontend lives in a workspace whose root is a shell

This project is a pnpm workspace, and the application is the package the monorepo template wrote:
`apps/website`, a create-vite `vanilla-ts` app with its own `dev`/`build`/`preview` scripts and its
own tsconfig. The workspace root owns the catalog of versions and the commands that operate the
workspace; it is not an application itself, and nothing in this project compiles a server. The
frontend's backend is somewhere else — the dev proxy in `apps/website` names it and strips the `/api`
prefix exactly as the production edge does.

## Considered Options

- **The single layout** — the smaller frontend project, with the proxy at the root. Rejected here
  because a workspace was asked for: the point of the layout is that the next package (a shared UI
  package, a second app) can arrive as a package rather than as a restructure.
- **Keeping the placeholder `packages/utils`** — a decision, not a default: kept as the home for
  future shared code, or deleted. Both leave the workspace complete; the layout and the commands do
  not depend on it either way.
- **Putting the proxy in the root config** — rejected: `loadEnv(mode, process.cwd(), "")` reads the
  environment from the working directory, and the dev server this proxy belongs to is the app's. A
  proxy at the root would name the wrong directory and would never run.
- **A root `build` script of its own** — rejected: the root has nothing to build, and a script that
  delegates to the workspace run under the same name is self-referential. The workspace build is
  `vp run -r build`.
- **Serving the built app from a root dev server** — rejected: there is no root application to serve
  it, and adding one would be a server this project does not have.

## Consequences

- The commands that matter are registered at the root: `dev:website` (`vp -C apps/website dev`),
  `check` (`vp check`) and `ready` (`vp check && vp run -r build`). The workspace build is
  `vp run -r build`; the root is skipped there because it defines no build task — a skip that is the
  runner's contract, not a failure.
- `vp check` at the root walks every package, so it is the workspace's type check: the app's sources
  are covered by it even though the app has no `check` script of its own.
- Every dependency version lives in the workspace catalog and every manifest references it as
  `"catalog:"` — including `vite-proxy-from-env`, the app's dev-proxy transformer.
- `apps/website/.env` holds `DEV_PROXY` and is committed (only `*.local` is ignored). The guard in
  `apps/website/vite.config.ts` is unconditional and fires in every mode: a missing variable stops
  the dev server and a build, instead of answering `/api/*` with the app's HTML at exit 0.
- The app ships no test harness, by the same decision the single-layout frontend makes: page
  iteration is faster without a suite that goes stale. A package that needs tests has its own
  `tests/` and its own script; `vp run -r test` runs those.
- Production topology is out of scope, with one thing fixed: the edge strips the `/api` prefix
  before the backend sees the path, and the app's dev proxy is measured to do the same.
```

```bash guide:exec id=notes-proxy-app when=mode:frontend&layout:monorepo
set -euo pipefail

# The dev-proxy traps of a frontend workspace: the same mechanism as a single project's, in the
# package that owns the dev server, against somebody else's backend.
cat >> docs/agent-notes.md <<'NOTES'

## The development proxy (apps/website)

- The proxy lives in the frontend package — `apps/website/vite.config.ts` and `apps/website/.env` —
  because `loadEnv(mode, process.cwd(), "")` reads the working directory, and the dev server this
  proxy belongs to runs there. The app's own `.gitignore` ignores only `*.local`, so the file is
  committed and a personal override goes in `apps/website/.env.local`.
- The guard `if (!env.DEV_PROXY) throw …` is deliberate and unconditional, and it fires in every
  mode: with the variable missing, `vp -C apps/website dev` stops with
  `Error: DEV_PROXY is not set — see .env` instead of serving `/api/*` as this app's HTML, and a
  build whose config cannot load fails too (which is why the variable sits in `.env`, not
  `.env.development`).
- `DEV_PROXY` names a backend this project does not own. It was answered at initialization and
  written down as `http://127.0.0.1:3000` when nothing better was known — a target nothing listens
  on answers `502`, never this app's HTML, so a stale placeholder is loud.
- The prefix is compiled as a regular expression, so `/api/` with the trailing slash is what keeps
  `/apix/…` out of the proxy.
- Inside `/api/`, Vite's single-page fallback never applies: an unknown `/api/…` path is the
  backend's `404`, and a dead target is a `502`. Outside `/api/`, an unknown path is this app's HTML
  `200` — so a `200 text/html` on an `/api/` path means the proxy is not running.
- The proxied path reaches the backend **without** the prefix, which is the whole point: the
  production edge strips the same prefix before it forwards, so a backend contract that expects
  `/api/…` on its own routes will look right in dev only until it is deployed.
NOTES
echo "ok  frontend-workspace proxy traps appended to docs/agent-notes.md"
```
