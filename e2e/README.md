# E2E harness

The guide's only seam is a full execution of the guide: an empty directory goes in, a
verifiable project comes out. This directory is that execution, made repeatable.

```bash
bash e2e/run.sh --help
```

That prints the flags and the ordered list of what the harness does — the header of `run.sh`
is the one place that list lives, so this file does not keep a copy of it. A run exits
non-zero at the first failure and prints where its logs went.

## What the harness guarantees

- **The plan comes from `GUIDE.md`, not from here.** `e2e/extract.mjs` owns the marker
  grammar (`guide:exec` steps, `guide:file` documents, the single `guide:verify` assertion
  set); every step the harness runs is the guide's own text, byte for byte, so a step cannot
  exist in the test and not in the document.
- **The verify block is the assertion set.** It is extracted and run as-is; the harness does
  not keep a second copy of those checks.
- **Outcomes are checked from outside**: `e2e/assert.mjs` inspects the produced project — the
  file tree, where the documents landed, the ignore rules (probed with `git check-ignore` in a
  throwaway repository so the target need not be one), the alias mechanism, the dev-proxy
  wiring, and the installed skill set compared against the upstream manifest re-resolved at
  assertion time. In the backend profile it also checks what that mode's silent failures look
  like at the artefact level: the client is gone, `nitro()` is called in a `plugins` array
  rather than merely imported, the routes live outside `server/api/`, `tests/` is outside the
  route scan, and the build output is `dist/` with no `.output/` beside it. In the SSR profile
  the same is checked for the shape that cannot degrade quietly: no `index.html` and no SPA
  entry, both SSR entries present, `nitro()` called inside the scaffold's `lazyPlugins` array,
  the client entry declared for the client environment, `server/routes/api/` answering with no
  proxy and no `.env`, and a build that emits the client bundle *and* `dist/server/_ssr/ssr.mjs`.
  The SSR verify block then follows the document's own `<script src>` and requires it to answer
  `200` with a javascript type, so "the server serves the client it renders" is asserted rather
  than assumed.
- **A check that cannot fail is not a check.** The negative controls make the preflight refuse
  a non-empty target and an old Node (a `node` shim on `PATH` reports `v24.13.0`), make the
  profile guard refuse an unimplemented profile, a backend project on a framework base, and an
  SSR project on a plain base (all without writing anything), make the route-scan assertion
  catch a test file planted next to the routes — a rule a freshly initialized project has no way
  to violate, so it is made to fail on purpose — and make the verify block go red on a planted
  type error, planted in `src/` for a frontend profile and in `server/` for a backend one, i.e.
  where that profile's source lives. In the SSR profile two more controls keep the two layers
  honest: an `index.html` planted with no `<!--ssr-outlet-->` — the shape's silent degradation,
  where Nitro still detects and logs the SSR entry, `/` still answers `200` with the plain client
  shell, and the build quietly stops being an SSR build — must make verify fail naming the missing
  SSR renderer (`client-only build`); and the render marker itself must be what the smoke reads,
  so removing it from the rendered page makes verify fail on the marker, with the shape otherwise
  intact.
- **Profiles are explicit.** A profile is a pre-answered answers file plus assertions;
  `frontend/single`, `backend/single` and `fullstack/single` have both, and `assert.mjs` fails
  rather than pass quietly for a profile it has no checks for.

## What it deliberately does not do

**It is not a substitute for an agent reading the guide.** The harness reproduces the
mechanical half; the guide is written for the half that needs judgement:

- **Answering the decision points.** The harness pre-answers them from a profile file. The
  guide asks them, offers options with a recommendation, and discloses the prerelease
  toolchain and the version pins — a person (or an agent relaying to a person) still decides.
- **Driving the user-invocable setup skill** (Phase 4.5). `GUIDE_SETUP=yes` is refused loudly
  in an unattended run, because the setup skill is user-invocable and interactive; the
  attended path is a conversation, not a command.
- **Handling a machine that differs from this one.** The harness runs with whatever Node,
  package managers and network this machine has; the guide's preflight reports what is really
  available (including Vite+ shims masquerading as `pnpm`, `yarn` and `vpx`) so a human can
  choose sensibly.
- **Judgement inside the steps.** Every step is a deterministic script, but a step that fails
  is a report to read, not a script to tweak. The harness stops at exactly the same point the
  guide tells an agent to stop.
- **Profiles that are not implemented yet.** `frontend/single`, `backend/single` and
  `fullstack/single` have both a profile file and assertions. `assert.mjs` fails rather than pass
  silently for any profile it has no checks for, so a `fullstack` run in another layout — or a
  layout no profile covers — is a report, never a green run.

## Environment notes

- **Caches are localized.** The harness points npm, pnpm and XDG caches inside the work
  directory, so it can run where `$HOME` is not writable (CI sandboxes) without mutating the
  machine. One cache it cannot move: pnpm resolves its content-addressable store to the root of
  the repository it runs in, so a `<repo>/.pnpm-store/` appears and is ignored by `.gitignore`.
  The guide itself does not depend on any of this.
- **The target gets its own git repository** right after the guide's bootstrap step. Vite+'s
  file discovery is gitignore-driven, and this harness runs the target inside this repository's
  work tree, which ignores `e2e/.work/`; a project nested in a repository that ignores it looks
  empty to the toolchain. A standalone directory — what a real user has — needs no such step.
  It cannot happen earlier than the bootstrap step: `vp create` refuses a non-empty directory,
  and a `.git` directory counts as content. One visible consequence: the scaffold's own final
  formatting step prints `Format failed … may have been excluded by ignore rules` inside the
  harness, because at that moment the target is still nested in the ignored work tree. It is
  harmless here — the guide formats the project itself and verification proves the result —
  and it does not happen in a standalone directory.
- **Network is required**: the scaffold, the dependencies, and the skills are fetched from the
  npm registry and GitHub at run time.
- **A global `vp` cannot be what the run uses.** From the second step onwards (the preflight
  reports the machine as it really is, global Vite+ included), the harness puts a `vp` that
  refuses to work first on `PATH`. The guide's promise is that everything runs through the
  project's own toolchain; with this in place, a step that reached for the global one fails
  loudly instead of passing on a binary the project does not own. `pnpm dlx` is unaffected — it
  runs the binary of the package it downloaded, not the one on `PATH`, which was measured before
  relying on it.
- **Ports**: the harness picks a free port for the dev server, and for a profile whose answers
  name a proxy target (`__STUB_PORT__` in the profile file) it starts a deterministic stand-in
  (`e2e/stub-backend.mjs`) on another. That stub is what makes the proxy assertion meaningful: it
  serves `/hello` and 404s everything else, so a `200` on `/api/hello` through the dev server can
  only mean the prefix was stripped. The server profiles need no stub: their own project serves
  the routes, and the smoke test starts both the dev server and the built server on
  `GUIDE_DEV_PORT` — in the SSR profile it asserts the rendered marker and the same-origin API on
  that one port, which is what "no proxy" means.
