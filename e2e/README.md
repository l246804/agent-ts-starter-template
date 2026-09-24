# E2E harness

The guide's only seam is a full execution of the guide: an empty directory goes in, a
verifiable project comes out. This directory is that execution, made repeatable.

```bash
bash e2e/run.sh --help          # one profile
bash e2e/matrix.sh              # every profile, then rewrite docs/verification.md
```

`run.sh --help` prints the flags and the ordered list of what the harness does — the header of
`run.sh` is the one place that list lives, so this file does not keep a copy of it. A run exits
non-zero at the first failure and prints where its logs went. `matrix.sh` runs the profiles in
order, captures each run's output under `e2e/.work/matrix/`, rewrites the record from what
actually happened, and exits non-zero unless every profile passed.

## What the harness guarantees

- **The plan comes from `GUIDE.md`, not from here.** `e2e/extract.mjs` owns the marker
  grammar (`guide:exec` steps, `guide:file` documents, the single `guide:verify` assertion
  set); every step the harness runs is the guide's own text, byte for byte, so a step cannot
  exist in the test and not in the document.
- **The verify block is the assertion set.** It is extracted and run as-is; the harness does
  not keep a second copy of those checks.
- **Outcomes are checked from outside**: `e2e/assert.mjs` inspects the produced project — the
  file tree, where the documents landed (the ADR landing point the profile's answer makes the
  convention resolve, the `## Agent skills` brief the setup flow writes when its branch runs, the
  three documents that point at that directory, and that the run left no `.vite-plus-*` scratch
  behind), the ignore rules (probed with `git check-ignore` in a
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
  than assumed. In the split profile the shape is checked the same way: the workspace root is the
  server (no `index.html`, no `src/` there), `apps/website` is the frontend with the demo pruned
  and no `check`/`test` script, `defaultPackage: "."` and `plugins: [nitro()]` are in the root
  config, every dependency spec in every manifest is a `catalog:` reference resolving to one
  version per dependency, no script in any package calls a package manager, the app's proxy and
  its guard live in `apps/website`, and the workspace build produced the root's `dist/server`,
  the app's `apps/website/dist` and the placeholder package's `packages/utils/dist`. The other two
  monorepo arrangements are checked as what they are rather than as the split shape minus something:
  the backend workspace has no client at all (`apps/` is gone), its root is still the server
  (`defaultPackage: "."`, `plugins: [nitro()]`, `serverDir: ./server`, `output: dist`), its command
  set is the server's (`dev:server`, `check`, `test`, `build`, `ready` — no `dev:website`), its
  build is the workspace build's (`vp run -r build` schedules the root and leaves
  `dist/server/index.mjs`), and the placeholder package it kept carries its own skeleton
  (`package.json`, `tsconfig.json`, `vite.config.ts`, `tests/`) and its own built `dist/`; the
  frontend workspace has a shell root (no root page, no server output, no `nitro` dependency), the
  app as the only application with its own `dist/`, a command set without `dev:server`/`test`/
  `build`, and its proxy target — the answered backend, or the placeholder when nothing was
  answered — wired in `apps/website` with the same guard.
- **A check that cannot fail is not a check.** The negative controls make the preflight refuse
  a non-empty target and an old Node (a `node` shim on `PATH` reports `v24.13.0`), make the
  profile guard refuse an unimplemented mode, a backend project on a framework base, an
  SSR project on a plain base, a split project on a base the monorepo template does not write,
  either workspace variant on a base it does not re-scaffold, and a monorepo without its
  placeholder answer (all without writing anything), make the
  route-scan assertion catch a test file planted next to the routes — a rule a freshly
  initialized project has no way to violate, so it is made to fail on purpose — make the
  coverage table fail in both directions (a planted bullet no source item declares, and a declared
  bullet removed from the document) — make the
  verify block go red on a planted type error, planted in the app's `src/` for a frontend profile,
  in `src/` or `server/` where those exist, i.e. where that profile's source lives, and make the
  package-name rule fail: in any workspace a control plants the template's own
  `"dev": "vp run website#dev"` back into the root manifest and requires `assert.mjs` to reject it
  naming the rule, because that form is the silent no-op — in the arrangement that deletes the
  package it exits 0 having run nothing (`vp run: 0/0 cache hit`, measured), and in the other two
  workspaces it is the same form the guide's root commands are re-pointed not to use. In the
  profiles whose app carries the
  proxy — the split shape and the frontend workspace — a
  further control removes `DEV_PROXY` from `apps/website/.env` and requires **both** halves of the
  failure to be loud: the verify block must fail naming `DEV_PROXY` (it reaches the workspace build
  first), and the app's dev server must refuse to start rather than come up and answer `/api/*`
  with the app's HTML — the state the guard exists to make impossible. In the SSR profile two more controls keep the two layers
  honest: an `index.html` planted with no `<!--ssr-outlet-->` — the shape's silent degradation,
  where Nitro still detects and logs the SSR entry, `/` still answers `200` with the plain client
  shell, and the build quietly stops being an SSR build — must make verify fail naming the missing
  SSR renderer (`client-only build`); and the render marker itself must be what the smoke reads,
  so removing it from the rendered page makes verify fail on the marker, with the shape otherwise
  intact.
- **Both branches of the setup decision point (Phase 4.5) are run, by the profiles themselves.**
  `frontend-single` answers `yes` — with a GitHub tracker and a convention whose ADR directory is
  not the guide's default — and the other eight answer `no`. So one end-to-end run proves the flow's
  writes (the skill's seed files, the `## Agent skills` brief in `AGENTS.md`), the ADR landing point
  that comes out of the convention, and the provenance sentence that records the convention as the
  source; the other eight prove the deferred branch (no `docs/agents/`, no brief, the default landing
  point recorded as an assumption). The controls then prove what no single pass can: the guard refuses a `yes` whose
  questions were never answered and the one answer no step can write (`other`, the user's own
  paragraph); the landing point follows a *planted* convention that disagrees with the answer — in
  the shape the skill's own seed writes, path then annotation, and in the annotation-only
  multi-context shape — so it cannot be hardcoded and cannot be the answer either; a document
  already at the landing point is refused rather than overwritten; and — in the `yes` profile — the
  flow's other answers (a local tracker, the default ADR directory, then a GitLab switch that also
  records the multi-context layout) run once each in a scratch project, where the re-run regenerates
  the skill's generated files and a section the flow never wrote comes through untouched.
- **Profiles are explicit.** A profile is a pre-answered answers file plus assertions;
  `frontend/single`, `backend/single`, `fullstack/single`, `fullstack/monorepo`,
  `fullstack/monorepo-placeholder-no`, `backend/monorepo`, `backend/monorepo-placeholder-no`,
  `frontend/monorepo` and `frontend/monorepo-placeholder-yes` have both, and `assert.mjs` fails
  rather than pass quietly for a profile it has no checks for. Every monorepo arrangement is run
  both ways the placeholder decision can go, so no arrangement carries a branch that has never
  been built.
- **The shipped documents are aligned with the master list, both ways.** `e2e/coverage.mjs`
  declares, for every item in `docs/constraints.md` (and for the inherited ADRs), which shipped
  bullet — of `AGENTS.md`'s constraints section or of `docs/agent-notes.md` — carries it in which
  shapes. `assert.mjs` then requires, per profile, that every declared row is present in the
  section it names (no rule the project was not told) and that every bullet the project carries is
  claimed by a row (no text without a source item — bullets, prose paragraphs and headings alike,
  so a sentence added to a shipped section fails too); the shape filter is inside both directions,
  so trimming is proved rather than assumed. `node e2e/coverage.mjs --self-check` proves the table
  itself — every master-list item ships or is declared not-shipped, every id exists, every marker
  is a fragment of the guide's own text — and `run.sh` runs it before the first step.
- **One full pass is one artifact.** `bash e2e/matrix.sh` runs every profile, then
  `e2e/record.mjs` rewrites `docs/verification.md` from the runs' own results, logs and produced
  provenance — the record cannot claim more than those runs prove, and a profile that is missing
  or not `PASS` is written as such and makes the command exit non-zero.

## What it deliberately does not do

**It is not a substitute for an agent reading the guide.** The harness reproduces the
mechanical half; the guide is written for the half that needs judgement:

- **Answering the decision points.** The harness pre-answers them from a profile file. The
  guide asks them, offers options with a recommendation, and discloses the prerelease
  toolchain and the version pins — a person (or an agent relaying to a person) still decides.
- **Talking to the user for the setup skill (Phase 4.5).** The harness never drives
  `/setup-matt-pocock-skills` as a conversation: the `yes` branch's questions are pre-answered — by
  a profile in the end-to-end run, by a control in the scratch project — which is exactly the
  stand-in every other decision point uses. What the harness exercises is the flow's write half:
  the files the skill's own seeds produce, the brief it edits into `AGENTS.md`, the convention it
  leaves behind. The explore/present/confirm conversation an agent has with a person is not run, and
  the one answer that only that conversation can produce (`other`) is refused rather than invented.
  The skill stays user-invocable: answers stand in for the user's answers, never for the user's
  invocation.
- **Handling a machine that differs from this one.** The harness runs with whatever Node,
  package managers and network this machine has; the guide's preflight reports what is really
  available (including Vite+ shims masquerading as `pnpm`, `yarn` and `vpx`) so a human can
  choose sensibly.
- **Judgement inside the steps.** Every step is a deterministic script, but a step that fails
  is a report to read, not a script to tweak. The harness stops at exactly the same point the
  guide tells an agent to stop.
- **Covering a shape with a profile it has no assertions for.** `assert.mjs` fails rather than pass
  silently for a profile it has no checks for, and the coverage self-check keeps the profile set
  complete in the other direction: every (mode, layout) the profile guard implements has a profile
  file, and every monorepo arrangement runs both answers of the placeholder decision. A new
  arrangement is a failing check until it has a profile, never a quiet gap.

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
  that one port, which is what "no proxy" means. The split profile is the one that needs two of its
  own servers at once — the workspace root server (`__FREE_PORT__`, which the guide also writes
  into the app's `DEV_PROXY`) and the frontend app (`__FREE_PORT2__`) — and the smoke test reads
  the app's port, so a `200` with the server's JSON there can only mean the proxy chain carried the
  request and stripped the prefix. The other two monorepo profiles need one server each: the backend
  workspace runs the root server (`__FREE_PORT__`), and the frontend workspace runs only the app
  (`__FREE_PORT2__`), whose port the smoke reads.

---

## The nine profiles

The three modes and the two layouts give six (mode, layout) combinations, and the layout's
placeholder decision doubles the three monorepo ones: **every arrangement is run both ways the
decision can go**, so a branch that has never been built cannot hide behind its sibling.

| Profile | What it initializes | The stub it needs |
| --- | --- | --- |
| `frontend-single` | a single-project frontend (`react-ts`) with the dev proxy at the root, and the **setup flow run now** (`yes`, GitHub tracker, ADRs in `docs/decisions/`) | `__STUB_PORT__` (its backend is external) |
| `backend-single` | a Nitro v3 server at the project root, no client | none |
| `fullstack-single` | the SSR shape: server-rendered page + same-origin API, no `index.html` | none |
| `fullstack-monorepo` | the split shape: root server + `apps/website` + proxy chain, placeholder kept | none (the root server is the target) |
| `fullstack-monorepo-placeholder-no` | the same split shape with the placeholder package deleted | none |
| `backend-monorepo` | a backend workspace: the root is the server, `apps/` deleted, placeholder kept | none |
| `backend-monorepo-placeholder-no` | the same backend workspace with the placeholder deleted too — the workspace's only package is the root | none |
| `frontend-monorepo` | a frontend workspace: shell root + `apps/website`, placeholder deleted | `__STUB_PORT__` (the app proxies to it) |
| `frontend-monorepo-placeholder-yes` | the same frontend workspace with the placeholder kept: the shell root's second package, with its own skeleton and build | `__STUB_PORT__` |

The placeholder branches are all run, in every arrangement: keeping `packages/utils` is asserted
where it is kept (its own skeleton, config and build; `backend-monorepo`,
`frontend-monorepo-placeholder-yes`, `fullstack-monorepo`), and deleting it is asserted where it is
deleted (`apps/` and `packages/` gone, the command set re-pointed; `backend-monorepo-placeholder-no`,
`frontend-monorepo`, `fullstack-monorepo-placeholder-no`). `backend-monorepo-placeholder-no` is also
the one profile whose workspace has no compiled package at all, so the birth certificate's
TypeScript line is the stated fact rather than a version read out of a package.

The setup decision point is run once per branch the same way: `frontend-single` is the `yes`
profile (with a convention whose ADR directory is not the guide's default, so the landing point is
proven to come from the project), and the other eight are the `no` profiles. The sub-answers no
profile takes are run once each by that profile's controls, in a scratch project that has the
installed skill's seeds: a `local` tracker, the default ADR directory, then a `gitlab` switch that
also records the `multi` layout. The one answer nothing runs is `other`, whose file is the user's
own paragraph: the guard refuses it, and the guide says so.
