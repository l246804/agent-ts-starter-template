
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
