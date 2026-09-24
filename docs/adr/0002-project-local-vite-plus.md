# Vite+ is a project devDependency, never a global install

The guide never installs Vite+ globally and never emits a bare global `vp` command: `vite-plus` lives in the target project's devDependencies, so an initialized project cannot collide with whatever global toolchain the machine already has. This is a deliberate deviation from Vite+'s own design, which presents `vp` as a single global CLI — the deviation is what makes the guide work on a machine that has never installed Vite+.

## Considered Options

- **Global Vite+ install** — rejected: it mutates the user's machine, and the guide would silently inherit whichever version happened to be global. Measured: a global 0.3.3 and a project-local 1.0.0-rc.0 behave differently (the global one picked npm in a bare directory; the local one correctly falls back to pnpm).
- **Scaffolding with plain `create-vite` and hand-writing the Vite+ layer** — rejected: `create-vite` writes no `vite.config.ts` at all, so the guide would have to author the toolchain config by hand. That config's failure mode is silent — without `lint.options.typeAware` and `typeCheck`, a green `vp check` checks nothing.

## Consequences

- Bootstrap runs Vite+ ephemerally through the chosen package manager, with the version pinned explicitly: `pnpm dlx --package=vite-plus@<version> vp create …`. The unversioned form fails outright (`multiple binaries`), and resolving `@latest` was observed picking an old alpha here, so the version is always explicit — which is also why the guide asks the user which version to take.
- `vp` must remain resolvable on `PATH` for that run: `vp create` finishes by spawning a bare `vp fmt` / `vp install`, so under a `PATH` without `node_modules/.bin` it writes every file and then exits 1.
- Three subcommands are global-only (`vp env`, `vp upgrade`, `vp implode`) and two shipped-but-unimplemented ones exist locally (`vp list`, `vp rebuild`). The tool-authored `AGENTS.md` block tells agents to run `vp env doctor`, which is global-only — the 约束 section must correct that, not repeat it.
- Updating the toolchain is `pnpm exec vp migrate`, not `pnpm update vite-plus`: an exact pin does not move under `--latest`.
