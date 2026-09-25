
```markdown guide:file path=.vite-plus-inherited-adrs/0003-server-foundation.md when=mode:backend|fullstack
# Nitro v3 is the server foundation, even though v3 is prerelease

Any server side in this project is built on Nitro v3 — the `nitro` package — consumed as a Vite
plugin inside the project Vite+ created, with the server directory at the project root. Nitro v3
has no stable release — every published version carries a beta or alpha suffix — and we accept
the prerelease, because the alternative is not "the same thing, more safely" but a different
package with a different API and a different name.

## Considered Options

- **`nitropack` v2 (stable)** — rejected: v3 renamed the package, so choosing v2 means building
  against v2's API rather than derisking v3.
- **A hand-rolled `node:http` server** — rejected: the fullstack modes need a server that
  shares one project and one build with the Vite frontend, which is what Nitro's Vite plugin
  provides.
- **Scaffolding with `create-nitro-app` and migrating Vite+ in afterwards** — rejected: it
  rewrites the project around Nitro's own starter, and that starter fails `vp build` until a
  migration runs.
- **Nitro's default output directory (`.output/`)** — rejected: the scaffold's ignore rules do
  not cover it, and `vp fmt` and `vp check` take their file set from those rules, so a build
  would make the static check fail on Nitro's own output. `output: { dir: "dist" }` reuses the
  `dist` rule the scaffold already ships, and the run adds no ignore rule.

## Consequences

- The prerelease is surfaced as a decision point rather than hidden, and the resolved version
  is recorded in `docs/provenance.md`; the dependency is never left at `latest`.
- The plugin is registered by **calling** `nitro()` in `vite.config.ts`'s `plugins` array: the
  scaffold writes no such key, and an import without the call is silently inert — exit 0, and
  every route 404s. Where that array comes from is the base template's business: a framework
  base wraps its own in `lazyPlugins(() => […])`, and a second top-level key there is a duplicate
  key that silently drops a plugin.
- Server code imports explicitly — v3 has no auto-imports — and server tests never live under
  the directory Nitro compiles into routes (`server/routes/` and `server/api/`): a file there is
  compiled into a route instead of being run.
- Server routes live in `server/routes/`, and their URL is their path under it: `routes/hello.ts`
  is `/hello`, and `routes/api/hello.ts` is `/api/hello` because that is where the file sits.
  Nothing adds a prefix implicitly — `server/api/` is the directory that does, and a project that
  wants `/api/…` says so in the file path instead of relying on that default.
- Build output goes to a directory the ignore rules already cover, so a fresh build cannot
  make the static check fail. The output directory is emptied on every build, so nothing else
  may be stored there.
```

```bash guide:exec id=notes-server when=mode:backend|fullstack
set -euo pipefail

# Traps that only exist once a Nitro server is part of the project.
cat >> docs/agent-notes.md <<'NOTES'

## The server (Nitro)

- Nitro v3 has no stable release: every published version carries a `-beta`/`-alpha` suffix and
  `latest` is itself a prerelease, so the pin is the only thing holding the version still.
- `serverDir` defaults to `false`: nothing is scanned until `nitro.config.ts` points at
  `./server`. Inside it, `routes/` maps a file to its path with no prefix (`routes/hello.ts` →
  `/hello`) and `api/` maps it with `/api`. A test file in either directory is compiled into a
  route instead of being run — which is why `tests/` sits at the project root.
- The plugin has to be **called** in `plugins`, not merely imported: an import without the call
  is inert — exit 0, and every route 404s. Where that array lives depends on the scaffold base,
  so the call goes where the file already keeps its plugins; adding a second top-level `plugins`
  key instead is a duplicate object key, and JS keeps one of them.
- Production output is `dist/` (`output: { dir: "dist" }`), not Nitro's default `.output/`,
  which the ignore rules do not cover — `vp fmt` and `vp check` take their file set from those
  rules and would fail on the build's own artefacts. The output directory is emptied on every
  build, so never keep anything else in `dist/`.
- Do not also set Vite's `build.outDir`: the plugin already points the client build at Nitro's
  public directory, and an explicit `build.outDir` is registered as one more public-assets
  source, so Nitro copies its own output into itself (`dist/public/public/**`, served under
  `/public/…`). The build still exits 0 while it happens.
- Remove a stale `.output/` if one ever appears: `vp preview` and `nitro preview` resolve the
  output directory through `node_modules/.nitro/last-build.json`, which a fresh clone does not
  have, and fall back to serving `.output/` silently.
- v3 has no auto-imports: handlers import `defineHandler` from `nitro` explicitly, and types
  come from the package's own exports (`nitro`, `nitro/h3`, `nitro/types`).
- The dev server's default port comes from Nitro (`3000`), not from Vite (`5173`), once the
  plugin is in play. This project does not depend on either default: every dev server's port is
  written into its own `vite.config.ts` as `server: { port, strictPort: true }`, and `PORT` in the
  environment still wins for a running process. Change the port there, in one place, rather than on
  a command line.
- The production artefact is `node dist/server/index.mjs` (the `PORT` environment variable is
  honoured by the node-server preset); the Nitro CLI is not needed to run it.
- With the plugin wired, `vp test` ends with `close timed out after 10000ms … Tests closed
  successfully but something prevents 2 Vite servers from exiting`. It costs about ten seconds
  and exits 0 — a warning, not a failure.
NOTES
echo "ok  server traps appended to docs/agent-notes.md"
```
