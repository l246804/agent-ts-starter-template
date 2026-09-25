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

## Profile status

| Mode | Layout | Status in this revision |
| --- | --- | --- |
| `frontend` | `single` | **Implemented and E2E-verified** (pnpm + `react-ts`); the same steps cover the other create-vite TypeScript templates |
| `backend` | `single` | **Implemented and E2E-verified** (pnpm): a Nitro v3 server at the project root, as a Vite plugin, with no client |
| `fullstack` | `single` | **Implemented and E2E-verified** (pnpm + `react-ts`): the SSR shape — server-side rendering and the same-origin API in one project |
| `fullstack` | `monorepo` | **Implemented and E2E-verified** (pnpm + the scaffold's `vanilla-ts` app): the split shape — the workspace root hosts the Nitro server, `apps/website` is the frontend, and the dev proxy reproduces the production reverse proxy |
| `backend` | `monorepo` | **Implemented and E2E-verified** (pnpm): a workspace whose root *is* the server and whose only other package is the layout's placeholder decision — the client the template writes is deleted in the same run |
| `frontend` | `monorepo` | **Implemented and E2E-verified** (pnpm): a workspace whose root is a shell and whose app is `apps/website`, reaching an external backend through the app's dev proxy |
| any other combination | Not implemented — the guide stops at the profile guard and tells you so |

`backend/single` initializes a project whose only artefact is a server: the client that `vp create`
scaffolds is deleted in the same run, `server/` holds the routes and sits at the project root, the
routes are not `/api`-prefixed (that prefix belongs to the frontend modes' dev proxy), and Nitro's
production output goes to `dist/` — a directory the scaffold's ignore rules already cover — rather
than Nitro's default `.output/`, which they do not.

`fullstack/single` is the **SSR shape**: one project renders the page on the server and hydrates it
in the browser, and the API that page calls belongs to the same server, so there is one origin and
no dev proxy. The shape keeps **no `index.html` at all** — with no template, Nitro installs its
built-in SSR renderer and the SSR entry's own response *is* the document. That is the explicit
choice this profile makes about its failure mode: with a template in place, the
`<!--ssr-outlet-->` comment is what decides whether the entry's output reaches the page, and a
missing comment is **silent** — the entry is still detected, still logged, and `/` answers the
plain client shell with exit 0. Deleting the template removes that class of error instead of
guarding against it, and verification asserts the rendered marker on top.

`fullstack/monorepo` is the **split shape**: a pnpm workspace (one catalog, one lockfile) whose root
package *is* the server — Nitro v3 as a Vite plugin, plus `defaultPackage: "."` so `vp dev` and
`vp build` act on the root — and whose frontend is the app `vp create vite:monorepo` writes under
`apps/website`. The two halves are two dev servers on two ports (the app on 5173, the root server
on Nitro's 3000), and the app reaches the API through the same shape the production edge runs:
`DEV_PROXY` in `apps/website/.env` names the root server, the `/api/` prefix is stripped on the
way through, and the server never learns that prefix exists. The commands that matter are
registered at the workspace root (`dev:server`, `dev:website`) and are vp-form; every dependency
version lives in the workspace catalog, so the root and its packages resolve one version per
dependency; and the packages the scaffold writes are pruned the way every other profile prunes
them. The placeholder package `vp create vite:monorepo` ships (`packages/utils`) is a decision
point: keep it as the home for future shared code, or delete it — the layout is the same either
way, and the workspace-wide commands are what make either shape work.

`backend/monorepo` is the **backend in a workspace**: the same server the single layout builds — Nitro v3
as a Vite plugin at the root, `serverDir: "./server"`, `output: { dir: "dist" }`, routes without an
`/api` prefix — inside the monorepo template instead of a single project. Two things make it a
different shape rather than the same one rearranged. The **client the template writes goes**: a
backend project has no frontend, so `apps/website` is deleted and the workspace's other package is
the layout's placeholder decision (`packages/utils`, kept or deleted). And the **root commands are
re-pointed at what actually exists**: the template's `"dev": "vp run website#dev"` names a package
that no longer exists, and a root script naming a missing package is a **silent no-op** — measured:
`vp run website#dev` exits 0 with `0/0 cache hit` and does nothing. The guide replaces that script
set with `dev:server`, `check`, `test`, `build` and `ready`, and verification proves the
replacement is not a no-op by building the workspace with `vp run -r build` and requiring the
root's `dist/server/index.mjs` to come out of it.

`frontend/monorepo` is the **frontend in a workspace**: the root is a shell that owns the catalog
and the commands, and `apps/website` — the app the monorepo template writes — is the application.
There is no server anywhere in it, and the app's backend is somebody else's, so the dev proxy is a
**decision**, exactly as in the single layout: `GUIDE_DEV_PROXY` names the backend, offered with
the placeholder `http://127.0.0.1:3000` when nothing better is known. The proxy config lives in the
package that has the dev server (`apps/website/vite.config.ts` + `apps/website/.env`), and
verification smokes the app from the app's own port through that proxy.

Because both new shapes are workspaces, the placeholder package (`packages/utils`) is a decision in
all three monorepo profiles: keep it as the home for future shared code, or delete it. Keeping it
means keeping its own skeleton and configuration (its manifest, tsconfig, Vite config, source and
test) — pruned of the library starter's publishing shape, with its versions moved into the
workspace catalog. Both answers are run in every arrangement that has the decision: the split
shape is initialized with the package kept (`fullstack-monorepo`) and with it deleted
(`fullstack-monorepo-placeholder-no`), the backend workspace keeps it (`backend-monorepo`) and
deletes it (`backend-monorepo-placeholder-no`), and the frontend workspace deletes it
(`frontend-monorepo`) and keeps it (`frontend-monorepo-placeholder-yes`) — so no arrangement
carries a branch that has never been built.

Two branches are written from the research but **not exercised by this revision's harness**:
`GUIDE_TNB=yes` (the TypeScript 6 API bridge, needed by `vue-ts`/`svelte-ts`), every package
manager other than `pnpm`, every SSR base other than `react-ts` — the SSR entry is framework
code, so the guard refuses those before writing anything rather than generating a project whose
renderer cannot work — every split-shape app base other than the `vanilla-ts` app the monorepo
template writes, and every monorepo app base other than that same app. Treat a green run in an
unexercised branch as unproven until it has been run once. The profiles themselves are in
`e2e/profiles/`, and the record of one full pass of all of them is `docs/verification.md`.

The setup decision point is run in both of its branches too: `frontend/single` takes `yes` — with a
GitHub tracker and a convention whose ADR directory is not the default, which is what proves the
landing point is read out of the project rather than hardcoded — and the other eight profiles take
`no`. The harness's setup controls run the remaining sub-answers once each in a scratch project: a
`local` and then a `gitlab` tracker (which is also the skill's own tracker-switch re-run), the
`multi` layout, and a convention that keeps the default `docs/adr/`. `GUIDE_TRACKER=other` is the one
answer nothing runs and nothing can run: that file is the user's own description of their workflow,
so the guard refuses it instead of inventing one.

The phase skeleton below (preflight → decisions → initialize → skills → documents → verify →
handoff) is the structure every profile fills in; the profile guard keeps unimplemented
combinations from producing a half-built project.

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
- A fenced block marked **`guide:verify`** is the verification step. It is the assertion set
  for the whole initialization: run it as-is, and treat a red result as a stop.
- A step whose marker carries a **`when=…`** clause belongs to the answers it names and is skipped
  otherwise: `when=mode:backend` is a step for backend projects, and an alternative list such as
  `when=mode:backend|fullstack` covers either of those modes. A `&` joins clauses that must all
  hold: `when=mode:fullstack&layout:single` is the SSR shape, and
  `when=mode:fullstack&layout:monorepo` is the split one. Every step without one applies to the
  profile you are initializing.
- Blocks **without** a `guide:` marker are explanation and examples.

The E2E harness in `e2e/` extracts exactly these markers and runs them from an empty
directory, so the document and the test can never drift into two truths.

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
entries=$(ls -A .)
if [ -n "$entries" ]; then
  printf 'preflight: the target directory is not empty:\n%s\n' "$entries" >&2
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
  frontend/single) echo "ok  profile frontend/single" ;;
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

Nothing in the generated project may sit on a floating version. Report what will be used,
disclose prereleases explicitly, and confirm:

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

