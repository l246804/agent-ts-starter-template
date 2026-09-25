
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
