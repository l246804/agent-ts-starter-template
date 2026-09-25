# GUIDE.md — turn an empty directory into a Vite+-managed TypeScript project

This guide is written for an agent (or a careful human) to execute **inside an empty target
directory**. Every command is non-interactive, every version is pinned explicitly, no global
tool is installed, and the toolchain lives in the project. At the end the project proves
itself: format, static check, build script, tests when the profile has them, and a smoke test
of what the arrangement actually serves — the dev proxy's route in a frontend project, the
server's own route plus the built artefact in a backend one, the workspace root server plus the
proxy chain that reaches it from the frontend's port in a split one, the server-rendered page
plus the same-origin API in an SSR one, the root server alone in a backend workspace, and the
app's page plus its proxy in a frontend workspace.

Two properties are deliberate, because this project exists to prevent them:

- **No silent success.** A green result has to mean something happened. Removing the
  configuration that makes `vp check` type-aware turns it into a formatter that prints
  `pass` — so this guide proves type checking is live instead of assuming it.
- **Stop, don't repair.** If any step or verification fails, stop and report. Do not adjust
  the check until it agrees with the code.

## The router — which parts this run takes

`GUIDE.md` is delivered as an index plus parts: this index (the head, the answer table, Phase 0–2
and this table) and one file per `when=` gate. A run fetches the index and then **only the parts its
own answers select** — the other shapes' text is not read at all, rather than skimmed and skipped.

The table below is the whole routing decision. Read the row for your `GUIDE_MODE`/`GUIDE_LAYOUT`,
fetch exactly the files it names, and run exactly the steps it lists, in that order. Each entry is
the token that finds that step in the text — `id=…` for a step, `path=…` for a document to write.
Print that list before you start: it is the receipt this delivery is checked against. If a file or a
step is missing, **stop and report which one** — fetching the whole `GUIDE.md` instead would throw
away the one property the split exists for.

```text router
[frontend/single]
fetch: guide/index.md guide/parts/10-core.md guide/parts/80-mode-frontend-and-layout-single.md
steps: id=preflight id=profile-guard id=pins id=bootstrap id=manifest id=config-trim id=config-controls id=install id=proxy id=ports id=skills id=setup-guard id=adr-convention id=agents-md id=agents-rules-frontend-single id=agents-md-tail path=.vite-plus-inherited-adrs/0001-toolchain.md path=.vite-plus-inherited-adrs/0002-code-locality.md id=adr-land path=docs/agent-notes.md id=notes-proxy id=prov-frontend-single id=provenance id=report-frontend-single id=verify

[frontend/monorepo]
fetch: guide/index.md guide/parts/10-core.md guide/parts/50-layout-monorepo.md guide/parts/60-mode-frontend-or-fullstack-and-layout-monorepo.md guide/parts/120-mode-frontend-and-layout-monorepo.md
steps: id=preflight id=profile-guard id=pins id=bootstrap id=manifest id=config-trim id=config-controls id=install id=workspace-skeleton id=workspace-app id=proxy-workspace id=ports id=skills id=setup-guard id=adr-convention id=agents-md id=agents-rules-frontend-monorepo id=agents-md-tail path=.vite-plus-inherited-adrs/0001-toolchain.md path=.vite-plus-inherited-adrs/0002-code-locality.md path=.vite-plus-inherited-adrs/0004-frontend-workspace.md id=adr-land path=docs/agent-notes.md id=notes-proxy-app id=notes-workspace id=prov-frontend-monorepo id=provenance id=report-frontend-monorepo id=verify

[backend/single]
fetch: guide/index.md guide/parts/10-core.md guide/parts/30-mode-backend-and-layout-single.md guide/parts/130-mode-backend-or-fullstack.md guide/parts/140-mode-backend-or-fullstack-and-layout-single.md guide/parts/150-mode-backend.md
steps: id=preflight id=profile-guard id=pins id=bootstrap id=manifest id=config-trim id=config-controls id=install id=backend-skeleton id=backend-manifest id=backend-plugin id=ports id=skills id=setup-guard id=adr-convention id=agents-md id=agents-rules-backend-single id=agents-md-tail path=.vite-plus-inherited-adrs/0001-toolchain.md path=.vite-plus-inherited-adrs/0002-code-locality.md path=.vite-plus-inherited-adrs/0003-server-foundation.md id=adr-land path=docs/agent-notes.md id=notes-server id=notes-merged-tsconfig id=notes-backend id=prov-backend-single id=provenance id=report-backend-single id=verify

[backend/monorepo]
fetch: guide/index.md guide/parts/10-core.md guide/parts/50-layout-monorepo.md guide/parts/70-mode-backend-or-fullstack-and-layout-monorepo.md guide/parts/110-mode-backend-and-layout-monorepo.md guide/parts/130-mode-backend-or-fullstack.md guide/parts/150-mode-backend.md
steps: id=preflight id=profile-guard id=pins id=bootstrap id=manifest id=config-trim id=config-controls id=install id=workspace-skeleton id=workspace-plugin id=ports id=skills id=setup-guard id=adr-convention id=agents-md id=agents-rules-backend-monorepo id=agents-md-tail path=.vite-plus-inherited-adrs/0001-toolchain.md path=.vite-plus-inherited-adrs/0002-code-locality.md path=.vite-plus-inherited-adrs/0003-server-foundation.md path=.vite-plus-inherited-adrs/0004-backend-workspace.md id=adr-land path=docs/agent-notes.md id=notes-server id=notes-workspace id=notes-workspace-root-server id=notes-backend id=prov-backend-monorepo id=provenance id=report-backend-monorepo id=verify

[fullstack/single]
fetch: guide/index.md guide/parts/10-core.md guide/parts/40-mode-fullstack-and-layout-single.md guide/parts/130-mode-backend-or-fullstack.md guide/parts/140-mode-backend-or-fullstack-and-layout-single.md
steps: id=preflight id=profile-guard id=pins id=bootstrap id=manifest id=config-trim id=config-controls id=install id=ssr-skeleton id=ssr-manifest id=ssr-plugin id=ports id=skills id=setup-guard id=adr-convention id=agents-md id=agents-rules-fullstack-single id=agents-md-tail path=.vite-plus-inherited-adrs/0001-toolchain.md path=.vite-plus-inherited-adrs/0002-code-locality.md path=.vite-plus-inherited-adrs/0003-server-foundation.md path=.vite-plus-inherited-adrs/0004-ssr-shape.md id=adr-land path=docs/agent-notes.md id=notes-server id=notes-merged-tsconfig id=notes-ssr id=prov-fullstack-single id=provenance id=report-fullstack-single id=verify

[fullstack/monorepo]
fetch: guide/index.md guide/parts/10-core.md guide/parts/50-layout-monorepo.md guide/parts/60-mode-frontend-or-fullstack-and-layout-monorepo.md guide/parts/70-mode-backend-or-fullstack-and-layout-monorepo.md guide/parts/100-mode-fullstack-and-layout-monorepo.md guide/parts/130-mode-backend-or-fullstack.md
steps: id=preflight id=profile-guard id=pins id=bootstrap id=manifest id=config-trim id=config-controls id=install id=workspace-skeleton id=workspace-app id=workspace-plugin id=proxy-workspace id=ports id=skills id=setup-guard id=adr-convention id=agents-md id=agents-rules-fullstack-monorepo id=agents-md-tail path=.vite-plus-inherited-adrs/0001-toolchain.md path=.vite-plus-inherited-adrs/0002-code-locality.md path=.vite-plus-inherited-adrs/0003-server-foundation.md path=.vite-plus-inherited-adrs/0004-split-shape.md id=adr-land path=docs/agent-notes.md id=notes-server id=notes-workspace id=notes-workspace-root-server id=notes-proxy-split id=prov-fullstack-monorepo id=provenance id=report-fullstack-monorepo id=verify

unrun tnb:yes: fetch: guide/parts/20-tnb-yes.md; steps: id=manifest-tnb (after id=manifest)
setup:yes: fetch: guide/parts/90-setup-yes.md; steps: id=setup-flow (after id=setup-guard)
```

What each row builds, in one line:

- `frontend/single` — the scaffolded app, plus a dev proxy to a backend somebody else runs.
- `frontend/monorepo` — the app under `apps/website`, under a root that is a shell owning the
  catalog and the commands.
- `backend/single` — a Nitro server at the project root, with no client: the base the generator
  writes is scaffolded and its client deleted in the same run.
- `backend/monorepo` — the same server as a workspace root, the template's app deleted and the root
  commands re-pointed at what is left.
- `fullstack/single` — the SSR shape: one project renders the page and serves the API on one origin,
  so there is no dev proxy.
- `fullstack/monorepo` — the split shape: the server at the workspace root, the app in
  `apps/website`, and a dev proxy that reproduces the production reverse proxy.

Two answers are not part of any row: `GUIDE_SETUP=yes` and `GUIDE_TNB=yes` add the file and the step
their lines name, and nothing else changes. `unrun` marks the one gate this revision's harness never
exercises — `GUIDE_TNB=yes`, the TypeScript 6 bridge that `vue-ts` and `svelte-ts` need — so treat a
green run there as unproven until it has been run once. The other unexercised branches are refused
by a guard rather than declared here, because no unattended run can take them: every package manager
but `pnpm`, every SSR base but `react-ts`, every app base but the `vanilla-ts` app the monorepo
template writes, and `GUIDE_TRACKER=other`.

`GUIDE_PLACEHOLDER` (the monorepo layout's keep-or-delete decision) changes what a step keeps,
never which steps run — which is why six rows stand for the nine runs this revision supports: the
three modes × the two layouts, plus both answers of that decision in every arrangement that has it.
Those nine runs are `frontend-single`, `frontend-monorepo` / `frontend-monorepo-placeholder-yes`,
`backend-single`, `backend-monorepo` / `backend-monorepo-placeholder-no`, `fullstack-single`, and
`fullstack-monorepo` / `fullstack-monorepo-placeholder-no`.

The shape of the run behind those rows is the same everywhere: preflight → decisions (Phase 1, 2,
3.5 and 4.5) → initialize → skills → documents → verify → handoff. Only the decision points stop to
ask, and the profile guard refuses a combination this revision does not implement rather than
half-building it.

## How to read this guide

- Run everything from the **root of the target project** — the directory that starts empty.
- A fenced block marked **`guide:exec`** is a step: run that shell text **verbatim**, in one
  shell, from the project root. Every block starts with `set -euo pipefail` and stops on the
  first failure.
- A fenced block marked **`guide:file`** is a document to write **verbatim** to the given
  path. The traps list is shipped as text on purpose: the wording is the deliverable, not
  something to improvise. The inherited ADRs are shipped the same way but into a **staging
  directory** (`.vite-plus-inherited-adrs/`): where they *land* is this project's decision, read
  from its own convention in Phase 5, so the path in their markers is not their final one.
- A fenced block marked **`guide:verify`** is the verification step. It is the assertion set for
  what this run built — the project's code, and the documents Phase 5 wrote. Run it as-is, and
  treat a red result as a stop.
- A step whose marker carries a **`when=…`** clause belongs to the answers it names and is skipped
  otherwise: `when=mode:backend` is a step for backend projects, and an alternative list such as
  `when=mode:backend|fullstack` covers either of those modes. A `&` joins clauses that must all
  hold: `when=mode:fullstack&layout:single` is the SSR shape, and
  `when=mode:fullstack&layout:monorepo` is the split one. Every step without one applies to the
  profile you are initializing.
- Blocks **without** a `guide:` marker are explanation and examples.
- If a step fails, **stop and report** — do not repair the project, and do not continue in place. The
  directory then carries a `.guide-incomplete` file saying so, and the only supported recovery is to
  delete the whole directory and run this guide again in an empty one. Running the verification step
  (`guide:verify`) there first names what is missing; it fails on a directory that never finished.

## Answers — decision points, asked once and pre-answerable

The guide stops at five decision points: mode/layout/framework/package manager, versions (which
include the server foundation in the modes that have one), the dev-proxy target (`frontend` mode
only, in both layouts — the split shape's target is its own workspace root server, so it is written
rather than asked for), whether to keep the monorepo layout's placeholder package, and whether to
run the skills setup now — which is the one decision point whose *questions* are asked by a skill
rather than by this guide, so its three answers are listed separately below. Ask them, then record
the answers as environment
variables; every step below fails loudly if an answer it needs is missing. That is also what makes
an unattended run possible.

Every decision point asks in the same four parts, and **all four are owed** — a point that skipped
one is not answered:

1. **Ask** the question with its options, in one place, and do not start writing while it is open.
2. **Recommend** one answer and say why. A point that is open and unanswered is a stopped run, not
   a licence to choose silently on the user's behalf.
3. **Disclose** what changes the user's picture: a prerelease pin (Phase 2), the placeholder
   address a proxy falls back to and the `502` it answers (Phase 3.5), and the fact that only the
   user can start the setup skill (Phase 4.5).
4. **Print the receipt.** Each point's guard step prints the `ok …` line that says the answer was
   accepted — `ok  profile …` and `ok  placeholder package …` (Phase 1, `profile-guard`),
   `ok  pinned: …` (Phase 2, `pins`), `ok  dev proxy wired …` (Phase 3.5, the proxy step),
   `ok  setup …` (Phase 4.5, `setup-guard`). That line is the point's completion criterion: no
   receipt, no answer.

| Variable | Meaning | Accepted values |
| --- | --- | --- |
| `GUIDE_MODE` | project mode | `frontend`, `backend`, `fullstack` (this revision) |
| `GUIDE_LAYOUT` | single repo or monorepo | `single`, `monorepo`; in `fullstack` mode the layout names the shape: `single` is SSR, `monorepo` is the split frontend/backend. All three modes support both layouts |
| `GUIDE_FRAMEWORK` | create-vite template id; in `backend` mode the client is deleted, so only `vanilla-ts` — a base with no framework to unpick — is accepted, in `fullstack` SSR the entry renders a component tree, so only `react-ts` is implemented, and in the monorepo layouts the app is the one the monorepo template writes (create-vite's `vanilla-ts`), which this revision does not re-scaffold on another base | `vanilla-ts` (backend, fullstack monorepo, frontend monorepo); `react-ts` (fullstack SSR); `react-ts`, `vue-ts`, `svelte-ts`, `solid-ts`, `preact-ts`, `lit-ts`, `vanilla-ts`, … (frontend single) |
| `GUIDE_PLACEHOLDER` | keep or delete the placeholder package the monorepo template writes (`packages/utils`, monorepo layout only — asked when only the layout is wanted and no other package is named) | `yes` (keep it as the home for future shared code), `no` (delete it) |
| `GUIDE_PM` | package manager | `pnpm` (verified), `npm`, `yarn`, `bun` |
| `GUIDE_VP_VERSION` | pinned `vite-plus` | e.g. `1.0.0-rc.0` (prerelease — disclose this) |
| `GUIDE_TS_VERSION` | pinned TypeScript line | `^7.0.2` |
| `GUIDE_TNB` | bridge TypeScript 6's API for tools that still need it | `yes` for `vue-ts`/`svelte-ts`, else `no` |
| `GUIDE_TNB_VERSION` | pinned bridge package | `6.0.3-bridge.17.tsgo.7.0.2` |
| `GUIDE_NITRO_VERSION` | pinned `nitro` (modes with a server) | e.g. `3.0.260903-beta` (prerelease — disclose this) |
| `GUIDE_SKILLS_VERSION` | pinned `skills` CLI | `1.7.0` |
| `GUIDE_DEV_PROXY` | backend the dev server proxies `/api/*` to (`frontend` mode, both layouts; in the single layout it is the project's own backend, in the monorepo layout the app's) | default placeholder `http://127.0.0.1:3000` when the backend is not known yet; in the split shape this is not an answer — the target is this workspace's own root server, written from `GUIDE_DEV_PORT` |
| `GUIDE_PROXY_SMOKE_PATH` | route the proxy smoke test calls — must exist on that backend (`frontend` mode) | e.g. `/hello` |
| `GUIDE_DEV_PORT` | port the smoke tests use for the dev server; in the monorepo layouts whose root is a server, the port that server binds, and therefore the port the split shape's `DEV_PROXY` points at | default `5173`; `3000` in the monorepo layouts, where a root server keeps Nitro's default and an app takes 5173 |
| `GUIDE_WEBSITE_PORT` | port the frontend app's dev server binds (monorepo layouts with an app: the split shape and `frontend` × `monorepo`) | default `5173` |
| `GUIDE_SETUP` | run the skills setup now? The user answers this one: the setup skill is user-invocable only (see Phase 4.5) | `no` when nobody is there to answer the skill's questions; `yes` when the user is running `/setup-matt-pocock-skills` |
| `GUIDE_TRACKER` | issue tracker the setup flow settles — Section A of that skill | `github`, `gitlab`, `local` — its three seed templates; `other` is answered in the conversation and refused by the flow (its file is the user's own paragraph); read only when `GUIDE_SETUP=yes` |
| `GUIDE_DOMAIN_LAYOUT` | domain-doc layout the setup flow settles — Section C | `single` (default: named without asking), `multi` (offered when the repo shows monorepo signals); read only when `GUIDE_SETUP=yes` |
| `GUIDE_ADR_DIR` | the directory the confirmed domain-doc convention puts this repo's ADRs in — the landing point Phase 5 reads back out of that file | a project-relative directory; default `docs/adr`; read only when `GUIDE_SETUP=yes` |

An answer that only one mode reads is only needed in that mode: the steps that read it are the
same steps the mode gates, so a `backend` run never needs `GUIDE_DEV_PROXY` and a `frontend` run
never needs `GUIDE_NITRO_VERSION`. In the SSR shape neither the proxy nor its smoke path is
answered — the page and the API are the same origin, which is also why no `.env` is written. In the
monorepo layout every mode answers `GUIDE_PLACEHOLDER`, because that is the layout asking about the
package the mode did not; a single-layout run never answers it. The split shape answers
`GUIDE_WEBSITE_PORT` and `GUIDE_PLACEHOLDER` instead of `GUIDE_DEV_PROXY`: its proxy target is the workspace's own root
server rather than someone else's backend.

The dev-proxy target is the one answer with a **default placeholder**. A frontend's backend is
somebody else's, and it may not exist yet; leaving the default writes a proxy that answers `502`
until it does — which is the loud half of "there is no backend there", never an HTML `200`. Say
plainly what the placeholder is, and ask for the real address when it is known.

The three setup answers are read by the `yes` branch of Phase 4.5 only; a run that declines setup
never needs them, and a run that takes it needs `GUIDE_TRACKER` and may rely on the two defaults —
the domain-doc layout the skill asks about (`single`), and the ADR directory the confirmed
convention ends up naming (`docs/adr`).

If the user has pre-answered everything, export the whole table and the run needs no further
input.

---

## Phase 0 — Preflight (no questions, writes nothing)

Four checks, all of them about facts that must be true before a single file is written:

1. the target directory is **completely empty**, hidden files and `.git` included;
2. Node is at least **24.14.0** — older Node cannot resolve the `#/…` import specifier this
   project uses for path aliases, and falling back to a different alias mechanism is a
   silent-failure trap, not a fix;
3. which package managers are **really** available — `pnpm`, `yarn`, `vp` and `vpx` are all
   often the same Vite+ shim, so presence on `PATH` proves nothing;
4. whether a **global `vp`** exists, so the run can avoid it: the toolchain must be
   project-local.

```bash guide:exec id=preflight
set -euo pipefail

fail() { printf 'preflight: %s\n' "$*" >&2; exit 1; }

# 1. the target directory must be completely empty -----------------------------
# A directory that carries the unfinished-run marker is not a directory to move files out of: the
# run that wrote it stopped before its verification passed, and the only supported recovery is to
# delete the directory and start over. Say that, rather than the generic "not empty" message.
entries=$(ls -A .)
if [ -n "$entries" ]; then
  printf 'preflight: the target directory is not empty:\n%s\n' "$entries" >&2
  if [ -f .guide-incomplete ]; then
    sed 's/^/preflight: /' .guide-incomplete >&2
    fail "this directory holds an initialization that never reached a passing verification; delete the whole directory and run this guide again in an empty one. To see what it is missing, run the guide's verification step (guide:verify) here first"
  fi
  fail "run this guide in an empty directory, or move these files away first"
fi
echo "ok  target directory is empty"

# 2. Node must resolve the '#/...' import specifier (>= 24.14.0) ----------------
node_version=$(node -v 2>/dev/null) || fail "node is not on PATH"
major=${node_version#v}; major=${major%%.*}
rest=${node_version#v}; rest=${rest#*.}; minor=${rest%%.*}
case "$major$minor" in *[!0-9]*) fail "cannot parse the Node version: $node_version" ;; esac
if [ "$major" -lt 24 ] || { [ "$major" -eq 24 ] && [ "$minor" -lt 14 ]; }; then
  fail "Node $node_version is too old: path aliases use the '#/...' import specifier, which needs Node >= 24.14.0; upgrade Node instead of switching alias mechanism"
fi
echo "ok  Node $node_version (>= 24.14.0)"

# 3. which package managers really work ---------------------------------------
# A Vite+ shim answers 'pnpm --version' with a managed pnpm version, so what the name
# resolves to is what tells a real binary from a chameleon. A shim without a managed
# tool answers nothing useful and exits non-zero; that is a report, not a failure.
echo "package managers:"
for pm in pnpm npm yarn bun; do
  bin=$(command -v "$pm" 2>/dev/null) || { printf '  %-5s absent\n' "$pm"; continue; }
  real=$(readlink -f "$bin" 2>/dev/null || printf '%s' "$bin")
  version=$("$pm" --version 2>/dev/null | head -1) || version=""
  case "$version" in
    *[0-9].[0-9]*) : ;;
    *) version="<no usable --version>" ;;
  esac
  case "$(basename "$real")" in
    vp|vpr) note=" <- Vite+ shim, not an independent $pm" ;;
    *) note="" ;;
  esac
  printf '  %-5s %s  %s%s\n' "$pm" "$version" "$real" "$note"
done
echo "ok  package manager inventory above; pnpm is the recommended choice"

# 4. a global vp must not be what this project runs ----------------------------
if command -v vp >/dev/null 2>&1; then
  echo "note: a global vp is installed at $(readlink -f "$(command -v vp)")"
  echo "note: this run never calls it; the project gets its own vite-plus devDependency"
else
  echo "ok  no global vp on PATH"
fi
```

## Phase 1 — Decision point: mode, layout, framework, package manager

Ask these together, then stop asking:

- **Mode** — which kind of project: a pure frontend, a backend, or a fullstack project. This
  revision implements all three, in both layouts; the guard below refuses anything else rather
  than half-building it.
- **Layout** — single repository or monorepo. Layout is orthogonal to mode: a monorepo is a
  way of arranging a mode, never a fourth mode. In **`fullstack` mode the layout is the shape
  decision**: `single` is the SSR shape (one project, one origin, no proxy), while `monorepo` is
  the split frontend/backend shape — the workspace root hosts the server, `apps/website` is the
  frontend, and a dev proxy stands in for the production reverse proxy. Both are implemented. In
  the other two modes the layout is only the layout: `backend` puts the same server at the
  workspace root (the template's app is deleted, and the placeholder decision is the workspace's
  other package), and `frontend` puts the same app in `apps/website` under a workspace root that
  owns the catalog and the commands.
- **Framework** — for a frontend, which create-vite TypeScript template; it decides the
  dependencies, the config, and the entry point that the generator writes. A `backend` project
  has no framework: the guide still scaffolds a client base, because every mode starts from the
  same `vp create` step, and then deletes it in the same run — answer `vanilla-ts` there, since
  a framework base writes a `plugins` array and dependencies that a backend project would only
  have to unpick. The guard below refuses anything else before a file is written. The SSR shape
  is the mirror image: it renders a component tree on the server and hydrates it in the browser,
  so it needs a framework base rather than a plain one, and this revision implements the entry
  for `react-ts` only. The monorepo layouts take their app from the monorepo template itself
  (create-vite's `vanilla-ts` app in `apps/website`), so `vanilla-ts` is the only answer there —
  this revision does not re-scaffold the app on another base.
- **Placeholder package** — monorepo layout only: the monorepo template writes a second package,
  `packages/utils` (a small TS library with a test), as the home for future shared code. Answer
  `yes` to keep it or `no` to delete it. Either way the workspace is complete — the layout, the
  catalog and the root commands do not depend on it — but the decision is asked once, here, so an
  unattended run has it up front.
- **Package manager** — recommend `pnpm`. In this revision only `pnpm` has been verified end
  to end; the other choices run the same steps through their own `dlx`/`install` spellings. In the
  monorepo layout `pnpm` is also what the workspace catalog and the generated lockfile belong to,
  so it is the only manager this revision claims: the app's `vite` resolves through a pnpm
  catalog alias, which no other manager reads.

Record the answers as `GUIDE_MODE`, `GUIDE_LAYOUT`, `GUIDE_FRAMEWORK`, `GUIDE_PLACEHOLDER`
(monorepo only) and `GUIDE_PM`.

```bash guide:exec id=profile-guard
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"

# The monorepo layouts do not choose a base: their app is the one `vp create vite:monorepo`
# writes (create-vite's vanilla-ts template, in apps/website), and this revision does not
# re-scaffold it on another framework. A backend project in either layout answers vanilla-ts for a
# different reason: it deletes the client the generator writes, so all the base has to be is a
# base — a framework template writes its own `plugins` array (which the backend wiring would have
# to unpick) and dependencies nothing in the project uses. Both cases are refusals rather than
# warnings: a mismatched base is discovered after the whole project exists.
require_vanilla_base() {  # require_vanilla_base <why>
  case "${GUIDE_FRAMEWORK:-}" in
    vanilla-ts) : ;;
    *)
      printf '%s\n' "$1" >&2
      printf 'Answer GUIDE_FRAMEWORK=vanilla-ts, or stop and report — nothing has been written.\n' >&2
      exit 1
      ;;
  esac
}

case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single)
    # The one shape whose framework is a free choice, and the only one where the TypeScript 6 bridge
    # can be needed: `vue-ts` and `svelte-ts` ship checkers that still consume TypeScript 6's
    # programmatic API, and `manifest` would pin the bridge for them. A pair that cannot work is
    # refused here, before a file is written, rather than several minutes later at the build.
    case "${GUIDE_FRAMEWORK:-}" in
      vue-ts|svelte-ts)
        if [ "${GUIDE_TNB:-no}" != yes ]; then
          printf '%s needs the TypeScript 6 API bridge: answer GUIDE_TNB=yes (and GUIDE_TNB_VERSION) so manifest pins it.\n' "${GUIDE_FRAMEWORK:-<unanswered>}" >&2
          printf 'Stop here and report — nothing has been written.\n' >&2
          exit 1
        fi
        ;;
    esac
    echo "ok  profile frontend/single"
    ;;
  frontend/monorepo)
    require_vanilla_base "the monorepo template writes the app from create-vite's vanilla-ts template, and this revision does not re-scaffold it; ${GUIDE_FRAMEWORK:-<unanswered>} is not available here."
    echo "ok  profile frontend/monorepo (workspace shell at the root, apps/website is the app)"
    ;;
  backend/single)
    require_vanilla_base "backend mode scaffolds the vanilla-ts base and deletes its client; ${GUIDE_FRAMEWORK:-<unanswered>} is not a base this profile can prune."
    echo "ok  profile backend/single (base template vanilla-ts, pruned below)"
    ;;
  backend/monorepo)
    require_vanilla_base "backend mode scaffolds the vanilla-ts base and deletes the client it writes — apps/website included; ${GUIDE_FRAMEWORK:-<unanswered>} is not a base this profile can prune."
    echo "ok  profile backend/monorepo (workspace root is the server, the template's app is deleted)"
    ;;
  fullstack/single)
    # The SSR shape is the opposite requirement: it renders a component tree on the server and
    # hydrates the same tree in the browser, so the base has to be a framework template. A plain
    # base has no renderer — the server could only produce an HTML string, and the client module
    # would then wipe the server's markup out of the page. Frameworks other than react-ts need
    # their own SSR entry (and, for Vue, a plugin workaround that has not been verified here), so
    # they are refused rather than silently given a React renderer.
    case "${GUIDE_FRAMEWORK:-}" in
      react-ts) echo "ok  profile fullstack/single (SSR shape: the document is rendered by src/entry-server.tsx)" ;;
      vanilla-ts)
        printf 'fullstack mode renders a component tree on the server and hydrates it in the browser; vanilla-ts has no framework renderer, so its server output would be overwritten by the client module.\n' >&2
        printf 'Answer GUIDE_FRAMEWORK=react-ts, or stop and report — nothing has been written.\n' >&2
        exit 1
        ;;
      *)
        printf 'the SSR shape is implemented for the react-ts base in this revision; %s needs its own SSR entry, which this guide does not write.\n' \
          "${GUIDE_FRAMEWORK:-<unanswered>}" >&2
        printf 'Answer GUIDE_FRAMEWORK=react-ts, or stop and report — nothing has been written.\n' >&2
        exit 1
        ;;
    esac
    ;;
  fullstack/monorepo)
    require_vanilla_base "the monorepo template writes the frontend app from create-vite's vanilla-ts template, and this revision does not re-scaffold it; ${GUIDE_FRAMEWORK:-<unanswered>} is not available here."
    echo "ok  profile fullstack/monorepo (split shape: server at the workspace root, apps/website is the frontend)"
    ;;
  *)
    printf 'this revision implements frontend/single, frontend/monorepo, backend/single, backend/monorepo, fullstack/single and fullstack/monorepo; asked for %s/%s.\n' \
      "$GUIDE_MODE" "$GUIDE_LAYOUT" >&2
    printf 'Stop here and report — do not improvise a partially generated project.\n' >&2
    exit 1
    ;;
esac

# The placeholder decision is the layout's own, in every mode: the template ships
# `packages/utils`, and keeping or deleting it changes what the workspace-wide commands have to
# run. It is read with a default so that the single layouts never have to answer it, and required
# here — an unanswered question would otherwise be resolved by whatever the scaffold happened to
# write.
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  case "${GUIDE_PLACEHOLDER:-}" in
    yes|no) echo "ok  placeholder package packages/utils: ${GUIDE_PLACEHOLDER:-}" ;;
    *)
      printf 'the monorepo layout must answer GUIDE_PLACEHOLDER: keep the scaffolded packages/utils (yes) or delete it (no).\n' >&2
      printf 'Stop here and report — nothing has been written.\n' >&2
      exit 1
      ;;
  esac
fi
```

## Phase 2 — Decision point: versions

Nothing in the generated project may sit on a floating version. This is a decision point like every
other: report what will be used, recommend the pins below and say why, **disclose** the prereleases
as prereleases rather than as "latest stable", and finish with the receipt the step below prints —
`ok  pinned: …` is this point's completion criterion, not the absence of an error.

What is pinned, and why each pin is the one to recommend:

- **`vite-plus`** — pinned, e.g. `1.0.0-rc.0`. It is a **prerelease**: the only alternatives
  are older prereleases, and the rc keeps its `devEngines`/`catalog` behaviour consistent.
  The unversioned `pnpm dlx vite-plus` form is not usable (the package ships several binaries
  and pnpm refuses to guess), so the version is always explicit.
- **TypeScript** — `^7.0.2`. TypeScript 7 is the Go-native compiler and the only 7.x line;
  older scaffolds pin `~6.0.2`, so the dependency gets replaced during initialization.
- **TypeScript bridge** — `vue-tsc` (and the checkers for Svelte, Astro, Glint) still consume
  TypeScript 6's programmatic API, which 7.0 does not ship. For those frameworks set
  `GUIDE_TNB=yes` and pin `6.0.3-bridge.17.tsgo.7.0.2` as both the `typescript` dependency
  and a pnpm override, so every consumer resolves the bridged package. Vue + TypeScript 6 has
  this exact failure signature, which is why the bridge exists:
  `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc'`.
  Under the bridge `tsc --version` prints `6.0.3` — that is the classic API's version, and it
  must never be used to assert the TypeScript version.
- **`skills` CLI** — `1.7.0`, pinned, because its `--skill` parsing has a
  silently-wrong form (`--skill=name` installs every skill in the repository with exit 0).
- **`nitro`** — pinned, e.g. `3.0.260903-beta`, as `GUIDE_NITRO_VERSION` (modes with a server
  only). It is a **prerelease, and there is no stable line to fall back to**: every published v3
  version carries a `-beta` or `-alpha` suffix, and `latest` itself resolves to a prerelease — so
  leaving `latest` here means a dependency that moves underneath the project. The alternative is
  not a safer version of the same thing: v2 is a different package (`nitropack`) with a different
  API, so pinning v3 exactly is the choice that keeps the record honest. v3 also scans nothing by
  default (`serverDir` defaults to `false`), so the server directory is something this guide sets
  deliberately, not something the framework assumes.

```bash guide:exec id=pins
set -euo pipefail
# The version decision point's own step. Every pin this run uses is asserted here, once, with the
# prereleases named as prereleases — the disclosure the point owes the user — and the receipt this
# run can check: `ok  pinned: …`.
: "${GUIDE_VP_VERSION:?Phase 2 must answer GUIDE_VP_VERSION}"
: "${GUIDE_TS_VERSION:?Phase 2 must answer GUIDE_TS_VERSION}"
: "${GUIDE_SKILLS_VERSION:?Phase 2 must answer GUIDE_SKILLS_VERSION}"
# The bridge is optional and its default is the documented one ("yes for vue-ts/svelte-ts, else
# no"), so it is read with a default and asserted only where it changes something: a framework that
# needs it is refused by the profile guard without it, and its pin is required below when it is yes.
GUIDE_TNB=${GUIDE_TNB:-no}
case "$GUIDE_TNB" in
  yes|no) : ;;
  *) echo "GUIDE_TNB must be yes or no, got '$GUIDE_TNB'" >&2; exit 1 ;;
esac
if [ "$GUIDE_TNB" = yes ]; then
  tnb_version=${GUIDE_TNB_VERSION:-}
  [ -n "$tnb_version" ] || { echo "GUIDE_TNB=yes pins the bridge, so Phase 2 must answer GUIDE_TNB_VERSION" >&2; exit 1; }
fi

# The server foundation belongs to the modes that have a server. It is read with a default so a
# frontend run does not have to answer it, and required in the modes that do.
nitro_pin=${GUIDE_NITRO_VERSION:-}
case "$GUIDE_MODE" in
  backend|fullstack)
    [ -n "$nitro_pin" ] || {
      echo "GUIDE_NITRO_VERSION was never answered: every mode with a server pins nitro (Phase 2)" >&2
      exit 1
    }
    ;;
esac

if [ "$GUIDE_TNB" = yes ]; then
  echo "note: the TypeScript bridge is in use — tsc --version prints 6.0.3, the classic API's version, and must never be used to assert the TypeScript version"
fi
echo "ok  pinned: vite-plus $GUIDE_VP_VERSION (prerelease), TypeScript $GUIDE_TS_VERSION, skills $GUIDE_SKILLS_VERSION, bridge ${GUIDE_TNB_VERSION:-not used}"
if [ -n "$nitro_pin" ]; then
  echo "ok  the server foundation is pinned: nitro $nitro_pin (prerelease, no stable v3 line to fall back to)"
fi
```

## Phase 3 — Initialize the skeleton (automatic)

The generator runs through the chosen package manager, ephemerally, with the version pinned:
`pnpm dlx --package=vite-plus@<version> vp create …`. That is the one place in this guide where a
package-manager command appears anywhere in a monorepo run, and it is not a style choice: at this
point the project's own toolchain does not exist yet, which is why the bootstrap is ephemeral and
version-pinned (ADR-0001 in the generated project). Everything after it — installs included — runs
through the project's own `vp`. The template is `vite:application` for the single layouts, which
scaffolds the framework through create-vite and then adds the Vite+ layer (`vite.config.ts`, the
workspace catalog, `devEngines`); the monorepo layout uses `vite:monorepo` instead, which writes
the workspace (root `package.json`, `vite.config.ts`, `pnpm-workspace.yaml` with its catalog, a
`create-vite` app under `apps/website` and the TS package under `packages/utils`) and installs it
in the same run. `--no-git --no-hooks` keep the run from deciding your version control and commit
hooks for you.

