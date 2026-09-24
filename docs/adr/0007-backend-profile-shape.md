# The backend profile is a pruned application base, with Nitro's output in `dist/`

The `backend`/`single` profile initializes its server from a `vp create vite:application
--template vanilla-ts` base whose client (`src/`, `public/`, `index.html`) is deleted in the same
run, then adds Nitro v3 as a Vite plugin with `serverDir: "./server"` and `output: { dir: "dist" }`,
one `tsconfig.json` extending `nitro/tsconfig`, and `tests/` + `.gitkeep` with a wired but empty
test runner (`vp test --passWithNoTests`). The client is generated and thrown away because the
application base is the only base whose scripts (`dev`/`build`/`preview`) and tsconfig shape are
already the ones a server uses; what a backend project needs from the scaffold is the *project*,
not the page.

This supersedes the `.output` consequence of ADR-0004 (the composition verdict of that ADR is
unchanged): Nitro's production output is `dist/`, the directory create-vite's `.gitignore` already
covers, so a build cannot make `vp fmt` / `vp check` fail and the run adds no ignore rule. Nitro's
default `.output/` is not ignored by those rules, and both commands take their file set from them.

## Considered Options

- **`vp create vite:library` as the base** — rejected: its scripts are publishing-shaped
  (`vp pack`, `prepublishOnly`, `files`/`exports`), so the profile would have to un-publish it and
  repoint its `nodenext` tsconfig at a server shape, and the library base's only advantage — a
  ready-made test file — is something this profile deliberately does not want.
- **`create-nitro-app`, then migrate Vite+ in** (ADR-0004) — rejected for the same reasons as
  there, and it stays rejected: the guide's first phase is `vp create`, and a second scaffolder
  would have to be reconciled with it.
- **Keeping the client** — rejected: the mode is a backend. A page that nothing serves is exactly
  the kind of leftover the guide exists to prune, and it would drag the frontend's dependencies
  and second tsconfig into the project.
- **Leaving Nitro's output at `.output/` and adding an ignore line** — rejected: the ignore rules
  are a contract (`docs/constraints.md`), and adding a line to satisfy a generator default is the
  same class of change as adding one to silence a check. `output.dir` is the documented option and
  relocates the whole layout (`dist/public`, `dist/server`, `dist/nitro.json`).
- **Shipping an example test in `tests/`** — rejected (constraints 12/13): initializing a project
  is not the moment to invent a test, so the runner is wired and empty, and `vp test` reporting no
  test files is the configured state.

## Consequences

- The profile's steps are mode-gated in `GUIDE.md` (`when=mode:backend`), and so are the
  mode-specific halves of `AGENTS.md`, `docs/agent-notes.md`, the inherited server ADR and the
  provenance record: a frontend run must not describe a server, and a backend run must not
  describe a dev proxy.
- The plugin registration is asserted on the artefact, not on the patch: the scaffold writes no
  `plugins` key, so an import without a call exits 0 and serves nothing (the worst failure shape
  in this composition). The verify block then proves it behaviourally — a route answered by the
  dev server, and the built `dist/server/index.mjs` started and queried.
- Two installs happen in a backend run (`vp create`'s own, then the pinned `nitro`): the pin is an
  exact prerelease written into the manifest as JSON, because the exact spec is the contract — a
  save that normalised it to a range would look the same in `package.json` and resolve somewhere
  else later. (`pnpm add -D nitro@3.0.260903-beta` was measured to save the exact spec; the other
  managers are not what this decision rides on.)
- `vp test` prints a ~10 s `close timed out` warning once the plugin is wired (exit 0). It is
  recorded in the generated project's `agent-notes.md` rather than filtered out.
- The E2E harness's `--profile backend-single` asserts the artefacts of these decisions (client
  gone, `nitro()` called in `plugins`, routes outside `server/api/`, `tests/` outside the route
  scan, output in `dist/` with no `.output/`), in addition to running the guide's own verify block.
