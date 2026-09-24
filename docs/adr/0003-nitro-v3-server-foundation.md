# Nitro v3 is the only server foundation, even though v3 is prerelease

Both the backend and fullstack 形态 build their server side on Nitro v3 — the `nitro` package, consumed as a Vite plugin inside the same project as the frontend. Nitro v3 has no stable release: its only npm dist-tag is `latest = 3.0.260903-beta`, and every v3 version carries a `-beta`/`-alpha` suffix. We accept the prerelease, because the alternative is not "the same thing, more safely" but a different package with a different API, a different docs site, and a different name.

## Considered Options

- **`nitropack@2.13.4` (v2, stable)** — rejected: the official migration guide states the package was *renamed* in v3 ("The NPM package nitropack (v2) has been renamed to nitro (v3)"). Choosing it would mean rebuilding the server side against v2's API, not derisking v3.
- **`nitro-nightly`** — rejected: a separate package that the docs say must only be consumed through the `"nitro": "npm:nitro-nightly@latest"` alias; it buys no capability the beta lacks.
- **Express, Fastify, or a hand-rolled `node:http` server** — rejected: 全栈 needs a server that shares one project and one build with a Vite frontend, and Nitro's official Vite plugin (`nitro/vite`) is what provides that. A plain HTTP server would also drag in a second, unrelated toolchain story.

## Consequences

- The prerelease is surfaced as a 决策点 rather than hidden, and the exact resolved version goes into the 出生证明.
- Never leave `"nitro": "latest"` in a generated project: `latest` currently resolves to a prerelease, so the version is always pinned explicitly.
- `serverDir` defaults to `false` in v3 — nothing is scanned until it is set. `serverDir: "./server"` is what places the server at the project root.
- v3 removed auto-imports: server code imports explicitly from `nitro` / `nitro/*`, and server types come from `nitro/types`.
- The official scaffolder (`create-nitro-app`) exits 1 without creating anything when it detects an agent environment and is given no directory and `--template` — so the guide owns the sequence rather than delegating it to the scaffolder.
