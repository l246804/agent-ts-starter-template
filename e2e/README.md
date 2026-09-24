# E2E harness

The guide's only seam is a full execution of the guide: an empty directory goes in, a
verifiable project comes out. This directory is that execution, made repeatable.

```bash
bash e2e/run.sh                          # the frontend/single profile
bash e2e/run.sh --profile <name>         # another profile from e2e/profiles/
bash e2e/run.sh --workdir /somewhere     # where the run directory is created
```

It exits non-zero on the first failure and prints where the run's logs are.

## What it does

1. **Loads the pre-answered decision points** from `e2e/profiles/<name>.env` — the same
   answers a user would give if the guide were run attended.
2. **Extracts the plan from `GUIDE.md`** with `e2e/extract.mjs`. A fenced block marked
   `guide:exec` is a step to run verbatim; `guide:file` is a document to write verbatim;
   `guide:verify` is the assertion set. There is no second copy of any guide step in this
   directory, so the document and the test cannot drift apart.
3. **Runs every step in document order** from an empty target directory, stopping at the
   first failure — the guide's own rule is "stop and report", never "repair until green".
4. **Runs `e2e/assert.mjs`** for what the guide does not assert about itself: the file tree,
   where the documents landed, whether the skills lockfile really matches what upstream
   declares, and the ignore-rule semantics (checked with `git check-ignore` in a throwaway
   repository, so the target does not need to be one).
5. **Runs the negative controls** — a check that cannot fail is not a check:
   - preflight must refuse a **non-empty** target and write nothing;
   - preflight must refuse **Node < 24.14** (a `node` shim on `PATH` reports the old version)
     and write nothing;
   - the extracted **verify block must go red** when a type error is planted in the project —
     otherwise a green verification proves nothing.

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
- **Profiles that are not implemented yet.** Only `frontend/single` has a profile file and
  assertions. `assert.mjs` fails rather than pass silently for any profile it has no checks
  for.

## Environment notes

- **Caches are localized.** The harness points npm, pnpm and XDG caches inside the work
  directory, so it can run where `$HOME` is not writable (CI sandboxes) without mutating the
  machine.
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
- **Ports**: the harness picks a free port for the dev server and starts a deterministic
  proxy target (`e2e/stub-backend.mjs`) on another. That stub is what makes the proxy
  assertion meaningful: it serves `/hello` and 404s everything else, so a `200` on
  `/api/hello` through the dev server can only mean the prefix was stripped.
