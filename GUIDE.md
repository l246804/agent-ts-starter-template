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
workspace catalog.

Two branches are written from the research but **not exercised by this revision's harness**:
`GUIDE_TNB=yes` (the TypeScript 6 API bridge, needed by `vue-ts`/`svelte-ts`), every package
manager other than `pnpm`, every SSR base other than `react-ts` — the SSR entry is framework
code, so the guard refuses those before writing anything rather than generating a project whose
renderer cannot work — every split-shape app base other than the `vanilla-ts` app the monorepo
template writes, every monorepo app base other than that same app, and the placeholder answer the
harness does not take in that profile (`GUIDE_PLACEHOLDER=no` is the one the split profile does not
exercise; `backend/monorepo` runs `yes` and `frontend/monorepo` runs `no`, so both branches of the
decision are run once each, in different profiles). Treat a green run in an unexercised branch as
unproven until it has been run once.

The setup decision point is run in both of its branches too: `frontend/single` takes `yes` — with a
GitHub tracker and a convention whose ADR directory is not the default, which is what proves the
landing point is read out of the project rather than hardcoded — and the other five profiles take
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

```bash guide:exec id=bootstrap
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_FRAMEWORK:?Phase 1 must answer GUIDE_FRAMEWORK}"
: "${GUIDE_VP_VERSION:?Phase 2 must answer GUIDE_VP_VERSION}"

case "$GUIDE_PM" in
  pnpm) dlx() { pnpm dlx "$@"; } ;;
  npm) dlx() { npx --yes "$@"; } ;;
  yarn) dlx() { yarn dlx "$@"; } ;;
  bun) dlx() { bunx "$@"; } ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

# The two layouts are scaffolded by two different templates, with one flag between them: the
# application template takes a create-vite template id, and the monorepo template writes its own
# app (vanilla-ts under apps/website) — there is no framework flag to pass it, which is exactly
# why the profile guard only accepts vanilla-ts for this layout.
create_args=(
  --directory .
  --no-interactive
  --no-git
  --no-hooks
  --package-manager "$GUIDE_PM"
  --verbose
)
case "$GUIDE_LAYOUT" in
  single) create_args=(vite:application "${create_args[@]}" -- --template "$GUIDE_FRAMEWORK") ;;
  monorepo) create_args=(vite:monorepo "${create_args[@]}") ;;
  *) echo "unsupported layout: $GUIDE_LAYOUT" >&2; exit 1 ;;
esac

# The verbose output is the only place the resolved create-vite version appears; keep it for
# the provenance record, then remove it at the end of Phase 5. It is captured rather than
# streamed through `tee`, because the scaffold refuses anything but an empty directory and a
# tee target created before it runs would be enough to make the directory non-empty.
if ! create_log=$(dlx --package="vite-plus@$GUIDE_VP_VERSION" vp create "${create_args[@]}" 2>&1); then
  printf '%s\n' "$create_log" >&2
  echo "vp create failed; the target directory was left as it was" >&2
  exit 1
fi
printf '%s\n' "$create_log" > .vite-plus-create.log
printf '%s\n' "$create_log" | tail -25

for expected in package.json vite.config.ts tsconfig.json AGENTS.md; do
  [ -f "$expected" ] || { echo "the generator did not write $expected" >&2; exit 1; }
done

# The monorepo template's own shape, asserted rather than assumed: the frontend app and the
# placeholder package are the two directories every later step in this layout names.
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  for expected in apps/website/package.json apps/website/index.html packages/utils/package.json pnpm-workspace.yaml; do
    [ -f "$expected" ] || { echo "the monorepo scaffold did not write $expected" >&2; exit 1; }
  done
  case "${GUIDE_PLACEHOLDER:-}" in
    yes|no) : ;;
    *) echo "the monorepo layout must answer GUIDE_PLACEHOLDER (yes to keep packages/utils, no to delete it)" >&2; exit 1 ;;
  esac
fi

# Verify the version that actually ran, not the version that was asked for: pnpm resolves
# 'latest' unpredictably, and an older CLI would scaffold a different project silently.
ran=$(./node_modules/.bin/vp --version | head -1)
case "$ran" in
  *"$GUIDE_VP_VERSION"*) echo "ok  scaffolded with $ran" ;;
  *) echo "expected vite-plus $GUIDE_VP_VERSION, but $ran ran" >&2; exit 1 ;;
esac
echo "ok  skeleton written"
```

### Alias the project root with Node's own import map

Path aliases use exactly one mechanism: `package.json` `imports`. Not `tsconfig` `paths`, not
`resolve.alias`, not `resolve.tsconfigPaths` — with more than one of them in play, the module
the type checker sees, the module the bundler loads, and the module that actually ships can be
three different files, and nothing goes red. The `types` branch must be first: TypeScript
resolves an `imports` target exactly and never probes extensions, so without it every
extensionless `#/…` import is a `TS2307` while dev and build stay green.

In a workspace the map is per package, because `imports` resolves against the nearest
`package.json`: the root's map covers the root's own files, and every package the layout has gets
its own map for its own files — which packages those are is the arrangement's, and the steps below
write each one's. A package without a map simply has no alias — which is the honest state, not a
broken one.

```bash guide:exec id=manifest
set -euo pipefail
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_TS_VERSION:?Phase 2 must answer GUIDE_TS_VERSION}"
: "${GUIDE_TNB:?Phase 2 must answer GUIDE_TNB (yes when the framework checker needs the TS 6 API)}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const monorepo = process.env.GUIDE_LAYOUT === "monorepo";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
manifest.imports = { "#/*": { types: "./*.ts", default: "./*" } };

// The TypeScript pin belongs to the manifest only in the single layouts. In a monorepo it is the
// workspace catalog that carries it (the scaffold puts `typescript: ^7.0.2` there and the app and
// the placeholder package already reference `catalog:`), so writing a literal here would be the
// second place a version lives.
if (!monorepo) {
  manifest.devDependencies.typescript =
    process.env.GUIDE_TNB === "yes" ? "catalog:" : process.env.GUIDE_TS_VERSION;
}

// A predictable key order keeps diffs readable: identity, alias map, scripts, dependencies.
const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];

// Edit the manifest as JSON: `npm pkg set` refuses to run inside a project whose
// devEngines pin a different package manager (EBADDEVENGINES).
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
NODE

node -e 'const m = require("./package.json"); if (Object.keys(m.imports["#/*"])[0] !== "types") { throw new Error("the types branch must come first"); }'
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  echo "ok  imports alias installed; TypeScript stays in the workspace catalog ($(grep -E '^\s+typescript:' pnpm-workspace.yaml | head -1 | tr -d ' '))"
else
  echo "ok  imports alias installed, typescript set to $(node -p 'require("./package.json").devDependencies.typescript')"
fi
```

For frameworks whose checker still needs TypeScript 6's API, the bridge replaces the
`typescript` package everywhere it is resolved — both the catalog entry and the override, or
packages that depend through `catalog:` keep resolving the unbridged one.

```bash guide:exec id=manifest-tnb when=tnb:yes
set -euo pipefail
: "${GUIDE_TNB_VERSION:?Phase 2 must answer GUIDE_TNB_VERSION when GUIDE_TNB=yes}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "pnpm-workspace.yaml";
const spec = `npm:typescript-native-bridge@${process.env.GUIDE_TNB_VERSION}`;
let source = readFileSync(file, "utf8");

if (!/^catalog:/m.test(source)) source = `catalog:\n${source}`;
if (/^\s*typescript:/m.test(source)) {
  source = source.replace(/^\s*typescript:.*$/m, `  typescript: ${spec}`);
} else {
  source = source.replace(/^catalog:\n/m, `catalog:\n  typescript: ${spec}\n`);
}
if (/^overrides:/m.test(source)) {
  source = source.replace(/^overrides:\n/m, `overrides:\n  typescript: ${spec}\n`);
} else {
  source += `overrides:\n  typescript: ${spec}\n`;
}
writeFileSync(file, source);
NODE

grep -q 'typescript-native-bridge' pnpm-workspace.yaml
echo "ok  catalog and overrides both point at the TypeScript 6 API bridge"
```

### Leave each project's TypeScript layout alone (frontend modes, and the workspace layouts' programs)

A frontend mode keeps the tsconfig layout the generator wrote, because that is the layout the
template's own build script (`tsc -b`) expects: create-vite's framework templates split the
browser program and the Node-side config file into separate project references, and a pure
frontend has no second toolchain to reconcile with them. The single, merged tsconfig belongs to
the modes that compose a Nitro server into the **same** project: there `server/`, the tests
directory and `nitro.config.ts` have to join one program — and so does `src/`, in the SSR shape,
where the browser half is part of a server program too. One config extending `nitro/tsconfig` is
the layout that was proven to work; the backend section and the SSR section at the end of this
phase are that layout.

The workspace layout is the case where that reasoning inverts rather than extends: every package
keeps the program its own generator wrote — the root keeps the scaffold's `tsconfig.json`, whose
lack of an `include` list is what already covers `server/`, `tests/`, `nitro.config.ts` and
`vite.config.ts` when the root is the application, and `apps/website` keeps create-vite's
`tsconfig.json`. Merging them would erase the package boundary the layout exists for — and the root
check still type-checks both, because `vp check` walks every package's program, which is asserted
where each arrangement is built. The one package that prunes its tsconfig is the placeholder
package, and only its publishing shape; the file itself stays.

What every mode enforces about TypeScript is negative and checkable: none of those files may
carry an alias mechanism of its own. The alias control below proves the `imports` map is the one
that actually resolves, and the harness re-checks from outside that no `paths`, `resolve.alias`
or `resolve.tsconfigPaths` turned up anywhere.

### Trim the configuration, then prove the trim did not hollow out the check

The generator writes configuration that is not carrying its weight — an empty `fmt: {}` that
equals the default, for instance. Delete what is redundant, keep what has an effect, and treat
"it looks like a default" as a hypothesis to test, never as permission: a green `vp check`
means nothing if the configuration that made it type-aware is gone.

```bash guide:exec id=config-trim
set -euo pipefail

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");
const hits = before.match(/^[ \t]*fmt: \{\},\n/gm) ?? [];
if (hits.length !== 1) {
  console.error(`expected exactly one default-valued 'fmt: {}' line, found ${hits.length}`);
  process.exit(1);
}
const trimmed = before.replace(/^[ \t]*fmt: \{\},\n/gm, "");
for (const key of ["typeAware", "typeCheck"]) {
  if (!trimmed.includes(key)) {
    console.error(`trimming also removed the load-bearing ${key}; vp check would not check types`);
    process.exit(1);
  }
}
writeFileSync(file, trimmed);
NODE

echo "ok  default-valued fmt: {} removed, typeAware/typeCheck kept"
```

```bash guide:exec id=config-controls
set -euo pipefail
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"

vp_run() { ./node_modules/.bin/vp "$@"; }

# Where this profile's source lives decides where a probe can be planted. In the single layouts it
# is the scaffolded src/; in the monorepo layout the root is the server, so the probes go next to
# the root's own TypeScript — the tests directory, which is not a route directory and not an entry.
case "$GUIDE_LAYOUT" in
  single) probe_dir=src ;;
  monorepo) probe_dir=tests ;;
  *) echo "unsupported layout: $GUIDE_LAYOUT" >&2; exit 1 ;;
esac
mkdir -p "$probe_dir"

# Control 1 - the type checker is alive. Plant a type error; a check that still passes is a
# check that never looked. This is the only reason to believe the config trim above was safe.
printf 'export const __guideProbe: number = "not a number";\n' > "$probe_dir/__guide_probe.ts"
vp_run fmt > /dev/null
if vp_run check > .vite-plus-control.log 2>&1; then
  rm -f "$probe_dir/__guide_probe.ts"
  echo "vp check passed with a type error under $probe_dir - type checking is not active" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-control.log" >&2
  exit 1
}
echo "ok  planted type error was caught (TS2322)"
rm -f "$probe_dir/__guide_probe.ts" .vite-plus-control.log

# Control 2 - the alias resolves in the type checker, not only in the bundler. A wrong
# `imports` shape (for example {"#*": "./*"}) leaves dev and build green and reports TS2307
# on every aliased import, so prove the positive case instead of assuming it.
cat > "$probe_dir/__guide_alias_target.ts" <<'TS'
export const aliasProbe = "imports-alias-resolves";
TS
cat > "$probe_dir/__guide_alias_use.ts" <<TS
import { aliasProbe } from "#/$probe_dir/__guide_alias_target";

export const aliasProbeUse: string = aliasProbe;
TS
vp_run fmt > /dev/null
vp_run check
rm -f "$probe_dir/__guide_alias_target.ts" "$probe_dir/__guide_alias_use.ts"
# The probe directory was created for this control when the profile did not already have it.
# Leaving an empty directory behind would put something in the project that the profile's own
# decision says should not be there — a frontend ships no test harness, so it has no tests/.
rmdir "$probe_dir" 2>/dev/null || true
echo "ok  '#/...' resolves through package.json imports"
```

### Install, and refine the ignore rules

The ignore file keeps the project's secrets stance explicit: `.env` is committed (only
`*.local` is ignored, so `.env.local` stays personal), and editor configuration is committed
too — a team that standardises on one editor wants its settings reviewed like any other file.
The monorepo scaffold ships exactly the two rule groups this rejects — a `.env`/`.env.*` block
and a `.vscode/*` block — so the same edit is a deletion there rather than a check, and the
package-level `.gitignore` files get the same treatment (their rules apply to their own
directory, and the frontend app's `.env` lives inside `apps/website`).

```bash guide:exec id=install
set -euo pipefail
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const monorepo = process.env.GUIDE_LAYOUT === "monorepo";
const file = ".gitignore";
const before = readFileSync(file, "utf8");
let after = before;

// The scaffold's .vscode rules, removed in every layout: editor configuration is committed.
const withoutVscode = after.replace(
  /^# Editor directories and files\n(?:(?:!)?\.vscode\/[^\n]*\n)+/m,
  "",
);
after = withoutVscode.replace(/^(?:!)?\.vscode\/[^\n]*\n/gm, "");
if (after === before) {
  console.error("no '.vscode/*' ignore lines were found; inspect .gitignore before continuing");
  process.exit(1);
}

// The monorepo scaffold also ignores .env and .env.*; this guide commits the environment file,
// so those lines (and the !.env.example exception that hangs off them) go as well.
if (monorepo) {
  after = after.replace(/^# dotenv environment variable files\n(?:(?:!)?\.env[^\n]*\n)+/m, "");
  after = after.replace(/^(?:!)?\.env[^\n]*\n/gm, "");
}

const rules = after
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const envIgnore = rules.find(
  (rule) =>
    !rule.startsWith("!") &&
    [".env", ".env*", ".env.*", "*.env", "/.env", "/.env*"].includes(rule.replace(/\/$/, "")),
);
if (envIgnore) {
  console.error(`.gitignore still ignores the environment file ('${envIgnore}'); only *.local may be ignored`);
  process.exit(1);
}
for (const required of ["*.local", "dist", "node_modules"]) {
  if (!new RegExp(`^${required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(after)) {
    console.error(`.gitignore no longer ignores ${required}`);
    process.exit(1);
  }
}
writeFileSync(file, after);

// A package's own .gitignore applies to that package's directory: the app keeps the same stance
// for the .env it carries, so the same two groups are deleted there.
if (monorepo) {
  for (const pkg of ["apps/website", "packages/utils"]) {
    const path = `${pkg}/.gitignore`;
    let source = readFileSync(path, "utf8");
    source = source.replace(/^# Editor directories and files\n(?:(?:!)?\.vscode\/[^\n]*\n)+/m, "");
    source = source.replace(/^(?:!)?\.vscode\/[^\n]*\n/gm, "");
    source = source.replace(/^# dotenv environment variable files\n(?:(?:!)?\.env[^\n]*\n)+/m, "");
    source = source.replace(/^(?:!)?\.env[^\n]*\n/gm, "");
    writeFileSync(path, source);
  }
}
NODE

if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # The monorepo layout has one command for dependencies, and it is the project's own toolchain:
  # `vp install` runs the package manager the workspace pins, over the whole workspace. No pnpm
  # command appears in this shape's flow (the ephemeral `vp create` bootstrap above is the one
  # place a package manager is invoked, because the project did not exist yet).
  ./node_modules/.bin/vp install
  resolved=$(node -p 'require("./apps/website/node_modules/typescript/package.json").version')
  echo "ok  workspace dependencies installed; typescript resolves to $resolved in apps/website"
else
  case "$GUIDE_PM" in
    pnpm) pnpm install --no-frozen-lockfile ;;
    npm) npm install ;;
    yarn) yarn install ;;
    bun) bun install ;;
    *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
  esac

  resolved=$(node -p 'require("./node_modules/typescript/package.json").version')
  echo "ok  dependencies installed; typescript resolves to $resolved"
fi
```

### Backend mode: delete the client, then put the server at the project root

A `backend` project has no client, so the one the generator just wrote is waste: `src/`, `public/`
and `index.html` go. What stays is the project itself — the project-local pinned toolchain, the
`imports` alias map, the trimmed configuration, the refined ignore rules — and on top of it the
server: Nitro v3 consumed as a Vite plugin, with `serverDir` pointing at `server/` in the project
root. This is the composition ADR-0003 (one of the inherited ADRs, which land where Phase 5 resolves
this project's convention to) records, and it is
Vite+-first on purpose: `vp create` built the project, Nitro was added to it, so there is no
migration step and no second toolchain.

Three details decide whether the result is a server or a lie, and two of them fail silently:

- **The plugin must land in a `plugins` array.** The scaffold's `vite.config.ts` has `fmt` and
  `lint` and **no `plugins` key at all**, so the obvious edit — add the
  `import { nitro } from "nitro/vite"` line, forget the array — leaves an unused import:
  `vp check` still exits 0 (with a lint warning an agent can filter out) and the server is inert.
  The step below creates the array, and then asserts the final file's text, because "the patch
  ran" and "the plugin is registered" are not the same claim.
- **Routes live in `server/routes/`, not `server/api/`.** Under `serverDir`, Nitro's `api/`
  directory is URL-prefixed with `/api` by default while `routes/` is not. The `/api` prefix is
  the frontend modes' dev-proxy convention — a backend that serves its own routes has no reason
  to carry it, and a route that answers somewhere other than where the guide says it does is
  exactly the kind of quiet mismatch this project exists to prevent.
- **Production output goes to `dist/`.** Nitro's default output directory is `.output/`, which
  the scaffold's ignore rules do not cover; `vp fmt` and `vp check` take their file set from the
  ignore rules, so a build would make the static check fail on Nitro's own artefacts. `output:
  { dir: "dist" }` relocates the whole layout (`dist/public`, `dist/server`, `dist/nitro.json`)
  into the directory `.gitignore` already has, so the run adds no ignore rule — and the step
  below fails if a build creates `.output/` anyway, which is what a forgotten `output` key looks
  like.

```bash guide:exec id=backend-skeleton when=mode:backend&layout:single
set -euo pipefail

# 1. the client is not part of a backend project ---------------------------------
rm -rf src public index.html
for gone in src public index.html; do
  [ ! -e "$gone" ] || { echo "$gone survived the prune" >&2; exit 1; }
done
for kept in package.json vite.config.ts tsconfig.json .gitignore; do
  [ -f "$kept" ] || { echo "$kept did not survive the prune; stop and report" >&2; exit 1; }
done
echo "ok  client pruned (src/, public/, index.html)"

# 2. the server, at the project root ---------------------------------------------
mkdir -p server/routes tests
cat > nitro.config.ts <<'TS'
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  output: { dir: "dist" },
});
TS

cat > server/routes/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler(() => ({ hello: "world" }));
TS

# The tests directory is created here and stays outside server/: Nitro compiles every file under
# server/routes/ (and server/api/) into a route, so a test living there would be served instead
# of run. tests/.gitkeep holds the directory in version control; the test command added below is
# wired but has nothing to run yet — that is the configured state, not a passing test suite.
: > tests/.gitkeep

# 3. one TypeScript program for the whole server ---------------------------------
# Nitro's own preset, plus the file set plain `tsc` (the build script's first half) has to see:
# without `server` here, `tsc` passes while never looking at a handler.
cat > tsconfig.json <<'JSON'
{
  "extends": "nitro/tsconfig",
  "include": ["server", "tests", "nitro.config.ts", "vite.config.ts"]
}
JSON

node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

const nitro = readFileSync("nitro.config.ts", "utf8");
if (!/serverDir:\s*"\.\/server"/.test(nitro)) {
  console.error("nitro.config.ts does not point serverDir at ./server");
  process.exit(1);
}
if (!/output:\s*\{\s*dir:\s*"dist"/.test(nitro)) {
  console.error("nitro.config.ts does not send the production output to dist");
  process.exit(1);
}
for (const file of ["server/routes/hello.ts", "tests/.gitkeep", "tsconfig.json"]) {
  if (!existsSync(file)) { console.error(`${file} is missing`); process.exit(1); }
}
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
if (tsconfig.extends !== "nitro/tsconfig") {
  console.error("tsconfig.json does not extend nitro/tsconfig");
  process.exit(1);
}
for (const included of ["server", "tests", "nitro.config.ts", "vite.config.ts"]) {
  if (!(tsconfig.include ?? []).includes(included)) {
    console.error(`tsconfig.json does not include ${included}; plain tsc would not check it`);
    process.exit(1);
  }
}
console.log("ok  server skeleton: serverDir ./server, output dist, tests/ outside the route scan");
NODE
```

```bash guide:exec id=backend-manifest when=mode:backend&layout:single
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"
: "${GUIDE_NITRO_VERSION:?Phase 2 must answer GUIDE_NITRO_VERSION}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

// The pin is written as JSON rather than through the package manager: the exact spec is the
// contract (a save that normalised it to a range would look the same in the manifest and resolve
// somewhere else later), and `npm pkg set` refuses to run at all inside a project whose
// devEngines pin a package manager (EBADDEVENGINES). Every manifest edit in this guide is a JSON
// edit.
manifest.devDependencies.nitro = process.env.GUIDE_NITRO_VERSION;

// The test runner is wired at initialization and has no example test: a project is not
// initialized with someone else's guess at a test. `--passWithNoTests` is what makes an empty
// suite an exit 0 while `vp test` with no files is an exit 1.
manifest.scripts.test = "vp test --passWithNoTests";

// A predictable key order keeps diffs readable: identity, alias map, scripts, dependencies.
const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
NODE

case "$GUIDE_PM" in
  pnpm) pnpm install --no-frozen-lockfile ;;
  npm) npm install ;;
  yarn) yarn install ;;
  bun) bun install ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

# Assert what resolved, not what was asked for: a prerelease range would install something else
# and still exit 0.
resolved=$(node -p 'require("./node_modules/nitro/package.json").version')
[ "$resolved" = "$GUIDE_NITRO_VERSION" ] || {
  echo "expected nitro@$GUIDE_NITRO_VERSION, but $resolved resolved" >&2
  exit 1
}
echo "ok  nitro@$resolved pinned in devDependencies and installed"
```

```bash guide:exec id=backend-plugin when=mode:backend&layout:single
set -euo pipefail

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");
if (/^ {2}plugins\s*:/m.test(before)) {
  // Reached only if the file is not the one this step expects — the patch below would otherwise
  // add a second `plugins` key, and a duplicated key is the silent-inert failure again. The match
  // is anchored at the top level: a scaffold's own `lint` block may carry a `plugins` list, and
  // that one is not this one.
  console.error("vite.config.ts already has a top-level plugins entry, so this step would add a second one");
  process.exit(1);
}
const head = "export default defineConfig({";
if (before.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}

// Both halves of the wiring, in one edit: the import, and the array the import has to be called
// from. The scaffold has no `plugins` key, so the array is created, not appended to.
let source = before.replace(
  /(import \{[^}]*\} from "vite-plus";\n)/,
  '$1import { nitro } from "nitro/vite";\n',
);
if (source === before) {
  console.error("vite.config.ts has no vite-plus import to sit next to");
  process.exit(1);
}
source = source.replace(head, `${head}\n  plugins: [nitro()],`);
writeFileSync(file, source);
NODE

./node_modules/.bin/vp fmt

# The registration is the difference between a server and a dead import, so it is asserted on the
# formatted file rather than assumed from the patch having run.
node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
const source = readFileSync("vite.config.ts", "utf8");
if (!/import \{ nitro \} from "nitro\/vite";/.test(source)) {
  console.error("vite.config.ts does not import nitro from nitro/vite");
  process.exit(1);
}
const keys = source.match(/^ {2}plugins\s*:/gm) ?? [];
if (keys.length !== 1) {
  console.error(`expected exactly one top-level plugins entry in vite.config.ts, found ${keys.length}`);
  process.exit(1);
}
if (!/^ {2}plugins:\s*\[nitro\(\)\],$/m.test(source)) {
  console.error("the plugins array does not call nitro() — the server would be inert");
  process.exit(1);
}
console.log("ok  nitro() is registered in vite.config.ts plugins");
NODE

./node_modules/.bin/vp check

# The merged tsconfig exists so that the server is type-checked, so that is proved rather than
# trusted: a planted type error inside a route has to turn `vp check` red. Without this, a
# tsconfig that quietly excluded server/ would leave every later `vp check` green and blind.
printf 'export const __guideServerProbe: number = "not a number";\n' > server/routes/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null   # a formatting complaint would short-circuit the check
if ./node_modules/.bin/vp check > .vite-plus-server-control.log 2>&1; then
  rm -f server/routes/__guide_probe.ts
  echo "vp check passed with a type error in server/routes - the server is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-server-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-server-control.log" >&2
  exit 1
}
rm -f server/routes/__guide_probe.ts .vite-plus-server-control.log
echo "ok  a planted type error in server/routes was caught (TS2322)"

# And the wiring is proved by its product, not by the patch: the build has to come out of the
# plugin, in the directory the ignore rules cover.
./node_modules/.bin/vp build
[ -f dist/server/index.mjs ] || {
  echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2
  exit 1
}
[ ! -e .output ] || {
  echo "the build also wrote .output/; output.dir did not take effect" >&2
  exit 1
}
echo "ok  build output is dist/server/index.mjs, with no .output/ beside it"
```

### Fullstack SSR mode: the server renders the document, the browser hydrates it

The SSR shape keeps the client **and** adds a renderer for it. Three things make that work, and
the first one is the shape itself: **there is no `index.html`**. Nitro treats an `index.html` as
the renderer template, and the `<!--ssr-outlet-->` comment inside it is the only channel between
the template and the SSR entry — a `String.replace` on that comment, so no comment means no
insertion and no warning, while the entry is still detected and announced and `/` quietly answers
the client shell, at exit 0. With no template, the plugin installs its own renderer and passes the
SSR entry's `Response` through unchanged — status, headers and body are the entry's — so the
failure mode is removed rather than guarded against. Verification asserts the rendered marker on
top of that: a shape that degraded like this stops being an SSR build at all — no `_ssr/` bundle,
just an inlined renderer template — and the marker is the layer behind that.

The second is the entry contract. Nitro auto-detects `entry-server.(ts|tsx|js|jsx|mts|mjs)` in the
project root, `app/`, `src/` or the server directory, and the file must **default-export an object
with a `fetch` method**: there is no `render()` contract and no h3 app here. Ours renders the same
tree the client entry hydrates, and it needs the client's identity — the hashed asset URLs and the
CSS — to finish the document, which is what the `?assets=client` / `?assets=ssr` imports and their
`merge()` are for.

The third is the client entry. With the template gone, Vite has nothing to take the client entry
from, so the client environment has to name it: `environments.client.build.rollupOptions.input`.
Without that line the client environment falls back to the renderer template — the file this shape
deleted — and the build fails in Nitro's asset step (`TypeError: Cannot convert undefined or null
to object`, exit 1). That is the loud half of the mistake, which is the acceptable one; what the
shape refuses to do is ship a document whose client entry does not exist.

`server/` follows the same rules the backend profile uses — routes at the project root, production
output in `dist/` — with one difference: the API belongs to this project's own page, so it is
mounted where its URL says it is, `server/routes/api/hello.ts` → `/api/hello`. There is no proxy
and no `.env`: the page and the API are one origin by construction, and the verification proves it
by calling `/api/hello` on the same port that served the page.

The TypeScript config is merged into one file, like the backend profile's, and for the same
reason: the build script's `tsc` only checks what the program includes, so a config that covered
`src/` alone would leave every handler unchecked while `vp build` stayed green. One program over
`src/`, `server/`, `tests/` and the config files is what makes the build script see both halves —
and the step below proves both halves are in it with a deliberate error in each. The scaffold's
two project-reference configs are deleted with it: nothing would keep them in sync with the merged
program, and a second description of the layout is exactly the kind of thing that is read later
and believed.

```bash guide:exec id=ssr-skeleton when=mode:fullstack&layout:single
set -euo pipefail

# 1. the shape: no template to fall back to ----------------------------------------------
# An index.html is the renderer template, and the <!--ssr-outlet--> comment in it is the only
# channel into the page. With no template, Nitro installs its built-in renderer and the SSR
# entry's own Response IS the document, status and headers included. The demo files the scaffold
# wrote for its landing page have no consumer in this shape and go with it, and so do the two
# project-reference tsconfigs the merged program below replaces — leaving them would keep a
# second, contradictory description of how this project's TypeScript is laid out.
rm -f index.html src/main.tsx src/App.css public/icons.svg tsconfig.app.json tsconfig.node.json
rm -rf src/assets
for gone in index.html src/main.tsx; do
  [ ! -e "$gone" ] || { echo "$gone survived the shape change" >&2; exit 1; }
done
echo "ok  no index.html: the SSR entry owns the document"

# 2. the app both sides render -----------------------------------------------------------
cat > src/App.tsx <<'TSX'
export function App() {
  return (
    <main>
      <h1>SSR works</h1>
      <p>This page is rendered on the server and hydrated in the browser. Edit src/App.tsx.</p>
    </main>
  );
}
TSX

# 3. the two entries ---------------------------------------------------------------------
# The server entry returns the whole document: shell, asset links and app markup. The client
# entry hydrates the same tree — hydration compares the browser's tree with the server's, so
# the two have to stay the same tree.
cat > src/entry-server.tsx <<'TSX'
import { renderToReadableStream } from "react-dom/server.edge";

import { App } from "./App.tsx";

import clientAssets from "./entry-client?assets=client";
import serverAssets from "./entry-server?assets=ssr";

import "./index.css";

export default {
  async fetch(_request: Request): Promise<Response> {
    const assets = clientAssets.merge(serverAssets);
    return new Response(
      await renderToReadableStream(
        <html lang="en">
          <head>
            <meta charSet="UTF-8" />
            <link rel="icon" href="/favicon.svg" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>app</title>
            {assets.css.map((attr) => (
              <link key={attr.href} rel="stylesheet" {...attr} />
            ))}
            {assets.js.map((attr) => (
              <link key={attr.href} rel="modulepreload" {...attr} />
            ))}
          </head>
          <body>
            <div id="root">
              <App />
            </div>
            <script type="module" src={assets.entry} />
          </body>
        </html>
      ),
      { headers: { "Content-Type": "text/html;charset=utf-8" } },
    );
  },
};
TSX

cat > src/entry-client.tsx <<'TSX'
import "@vitejs/plugin-react/preamble";
import { hydrateRoot } from "react-dom/client";

import { App } from "./App.tsx";

import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("the server-rendered shell must provide #root");
hydrateRoot(root, <App />);
TSX

# 4. the server, at the project root -----------------------------------------------------
mkdir -p server/routes/api tests
cat > nitro.config.ts <<'TS'
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  output: { dir: "dist" },
});
TS

# /api/hello is where the file sits, not a prefix something added: server/api/ is the directory
# that adds one implicitly, and this project does not use it.
cat > server/routes/api/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler(() => ({ hello: "world" }));
TS

: > tests/.gitkeep

# 5. one TypeScript program over both halves ---------------------------------------------
# tsBuildInfoFile keeps the build script's cache file inside node_modules, the place the
# scaffold's own configs put theirs, instead of a stray tsconfig.tsbuildinfo at the root.
cat > tsconfig.json <<'JSON'
{
  "extends": "nitro/tsconfig",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client", "nitro/vite/types", "node"],
    "allowArbitraryExtensions": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.tsbuildinfo",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src", "server", "tests", "nitro.config.ts", "vite.config.ts"]
}
JSON

node --input-type=module - <<'NODE'
import { existsSync, readdirSync, readFileSync } from "node:fs";

for (const file of [
  "src/App.tsx",
  "src/entry-server.tsx",
  "src/entry-client.tsx",
  "nitro.config.ts",
  "server/routes/api/hello.ts",
  "tests/.gitkeep",
]) {
  if (!existsSync(file)) { console.error(`${file} is missing`); process.exit(1); }
}
// One program, and only one description of it: a split config that survived the merge would
// still be read by anything that trusts the scaffold's old layout.
const splits = readdirSync(".").filter((name) => /^tsconfig\..*\.json$/.test(name));
if (splits.length) {
  console.error(`split tsconfig files survived the merge: ${splits.join(", ")}`);
  process.exit(1);
}
const nitro = readFileSync("nitro.config.ts", "utf8");
if (!/serverDir:\s*"\.\/server"/.test(nitro) || !/output:\s*\{\s*dir:\s*"dist"/.test(nitro)) {
  console.error("nitro.config.ts does not set serverDir ./server and output dir dist");
  process.exit(1);
}
const entry = readFileSync("src/entry-server.tsx", "utf8");
if (!/export default \{/.test(entry) || !/fetch\(/.test(entry)) {
  console.error("src/entry-server.tsx does not default-export a { fetch } handler");
  process.exit(1);
}
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
if (tsconfig.extends !== "nitro/tsconfig") {
  console.error("tsconfig.json does not extend nitro/tsconfig");
  process.exit(1);
}
for (const included of ["src", "server", "tests", "nitro.config.ts", "vite.config.ts"]) {
  if (!(tsconfig.include ?? []).includes(included)) {
    console.error(`tsconfig.json does not include ${included}; plain tsc would not check it`);
    process.exit(1);
  }
}
console.log("ok  SSR skeleton: no template, both entries, server at the root, one program over src/ and server/");
NODE
```

```bash guide:exec id=ssr-manifest when=mode:fullstack&layout:single
set -euo pipefail
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"
: "${GUIDE_NITRO_VERSION:?Phase 2 must answer GUIDE_NITRO_VERSION}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

// The pin goes in as JSON for the same reason as everywhere else in this guide: the exact spec
// is the contract, and `npm pkg set` refuses to run inside a project whose devEngines pin a
// package manager (EBADDEVENGINES).
manifest.devDependencies.nitro = process.env.GUIDE_NITRO_VERSION;
manifest.scripts.test = "vp test --passWithNoTests";

const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
NODE

case "$GUIDE_PM" in
  pnpm) pnpm install --no-frozen-lockfile ;;
  npm) npm install ;;
  yarn) yarn install ;;
  bun) bun install ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

# Assert what resolved, not what was asked for: a prerelease range would install something else
# and still exit 0.
resolved=$(node -p 'require("./node_modules/nitro/package.json").version')
[ "$resolved" = "$GUIDE_NITRO_VERSION" ] || {
  echo "expected nitro@$GUIDE_NITRO_VERSION, but $resolved resolved" >&2
  exit 1
}
echo "ok  nitro@$resolved pinned in devDependencies and installed"
```

```bash guide:exec id=ssr-plugin when=mode:fullstack&layout:single
set -euo pipefail

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");

let source = before.replace(
  /(import \{[^}]*\} from "vite-plus";\n)/,
  '$1import { nitro } from "nitro/vite";\n',
);
if (source === before) {
  console.error("vite.config.ts has no vite-plus import to sit next to");
  process.exit(1);
}

// The react-ts scaffold already has a plugins array, wrapped in vp's lazyPlugins(). nitro() goes
// inside that array; a second top-level `plugins` key is a duplicate object key, and JS keeps one
// of them, dropping the other plugin without a word.
const pluginsLine = "plugins: lazyPlugins(() => [react()])";
if (!source.includes(pluginsLine)) {
  console.error(`expected ${JSON.stringify(pluginsLine)} in vite.config.ts`);
  process.exit(1);
}
source = source.replace(pluginsLine, "plugins: lazyPlugins(() => [nitro(), react()])");

// The client entry, now that no index.html names it: without this input the client environment
// falls back to the renderer template — the file the skeleton deleted.
const head = "export default defineConfig({";
if (source.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}
source = source.replace(
  head,
  `${head}\n  environments: {\n    client: { build: { rollupOptions: { input: "./src/entry-client.tsx" } } },\n  },`,
);
writeFileSync(file, source);
NODE

./node_modules/.bin/vp fmt

# Registration is asserted on the formatted file, because "the patch ran" and "the plugin is
# registered" are not the same claim. The count is anchored at the top level: the scaffold's own
# `lint` block carries a `plugins` list, so an unanchored match finds two on a correct file.
node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
const source = readFileSync("vite.config.ts", "utf8");
if (!/import \{ nitro \} from "nitro\/vite";/.test(source)) {
  console.error("vite.config.ts does not import nitro from nitro/vite");
  process.exit(1);
}
const keys = source.match(/^ {2}plugins\s*:/gm) ?? [];
if (keys.length !== 1) {
  console.error(`expected exactly one top-level plugins entry in vite.config.ts, found ${keys.length}`);
  process.exit(1);
}
if (!/^ {2}plugins: lazyPlugins\(\(\) => \[nitro\(\), react\(\)\]\),$/m.test(source)) {
  console.error("nitro() is not called inside the scaffold's lazyPlugins array — the server would be inert");
  process.exit(1);
}
if (!source.includes('input: "./src/entry-client.tsx"')) {
  console.error("the client environment does not build from ./src/entry-client.tsx");
  process.exit(1);
}
console.log("ok  nitro() registered in lazyPlugins, client entry declared for the client environment");
NODE

./node_modules/.bin/vp check

# Both halves of the merged program are proved, not trusted: a planted type error in src/ and one
# in server/routes/api/ each have to turn `vp check` red. A tsconfig that quietly covered only one
# half would leave every later `vp check` green and blind there.
printf 'export const __guideClientProbe: number = "not a number";\n' > src/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
if ./node_modules/.bin/vp check > .vite-plus-client-control.log 2>&1; then
  rm -f src/__guide_probe.ts
  echo "vp check passed with a type error in src/ — the client half is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-client-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-client-control.log" >&2
  exit 1
}
rm -f src/__guide_probe.ts .vite-plus-client-control.log
echo "ok  a planted type error in src/ was caught (TS2322)"

printf 'export const __guideServerProbe: number = "not a number";\n' > server/routes/api/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
if ./node_modules/.bin/vp check > .vite-plus-server-control.log 2>&1; then
  rm -f server/routes/api/__guide_probe.ts
  echo "vp check passed with a type error in server/routes/api/ — the server half is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-server-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-server-control.log" >&2
  exit 1
}
rm -f server/routes/api/__guide_probe.ts .vite-plus-server-control.log
echo "ok  a planted type error in server/routes/api/ was caught (TS2322)"

# The build has to produce both halves: the client bundle the document references, and the SSR
# renderer the server bundle loads. `_ssr/` exists only in an SSR build, which is what makes it
# the cheap way to tell this shape's output from a client-only one.
./node_modules/.bin/vp build
[ -f dist/server/index.mjs ] || {
  echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2
  exit 1
}
[ -f dist/server/_ssr/ssr.mjs ] || {
  echo "the build produced no SSR renderer (dist/server/_ssr/ssr.mjs) — this is a client-only build" >&2
  exit 1
}
[ -n "$(ls dist/public/assets/*.js 2>/dev/null)" ] || {
  echo "the build produced no client bundle under dist/public/assets" >&2
  exit 1
}
[ ! -e .output ] || {
  echo "the build also wrote .output/; output.dir did not take effect" >&2
  exit 1
}
echo "ok  build output: client bundles in dist/public/assets, the SSR renderer in dist/server/_ssr, no .output/"
```

### Monorepo modes: one workspace, arranged around what the mode has

The monorepo layout means one pnpm workspace — one lockfile, one catalog of versions, and commands
registered at the root — and the mode decides what lives in it:

- **`fullstack` × `monorepo` is the split shape**: the **root package is the server** (Nitro v3 as
  a Vite plugin, `serverDir: "./server"`, `output: { dir: "dist" }`, routes without an `/api`
  prefix) and **`apps/website` is the frontend**, the app the monorepo template writes.
- **`backend` × `monorepo` is the same server, without a frontend**: the root is the server, the
  app the template wrote is deleted, and the workspace's other package is the placeholder decision.
- **`frontend` × `monorepo` is the same app under a shell root**: nothing in the workspace
  compiles a server, the root owns the catalog and the commands, and the app's backend is somebody
  else's — reached through the app's dev proxy.

The template wrote every one of these files; the work is pruning and wiring what it wrote, the same
shape of work the single-layout profiles do on their base. Four things decide whether the
composition is real, and each one is a place where the wrong answer is quiet:

- **A root that is an app has to be a target.** Vite+ refuses to act on a workspace root that has
  member packages: in the two shapes whose root is a server, `vp dev`/`vp build` print
  ``error: `vp dev` at the workspace root needs a target package.`` and exit 1, listing the
  members. `defaultPackage: "."` in the **root** `vite.config.ts` is the fix (the alternative is
  `vp -C . dev` on every command), and the step below asserts it in the file rather than trusting
  the patch; verification then proves what it is for, by starting the root server and reading a
  route off it. Without the line the failure is a hard stop, not a wrong output. A **shell root** —
  `frontend` × `monorepo` — is not a Vite app at all: no root app command is registered for it, so
  it needs no `defaultPackage`, and the guide does not write one.
- **The mode does not get to leave a dead command behind.** The template's root `"dev"` script is
  `vp run website#dev`: it names a package by its task, and a script that names a package which
  does not exist is a **silent no-op** — measured: exit 0, `vp run: 0/0 cache hit`, nothing runs. A
  backend workspace deletes `apps/website`, so that script must go rather than linger; every root
  command is re-pointed at what the workspace actually has, and the step refuses to leave any
  `vp run <package>#<task>` form in a manifest.
- **Routes carry no `/api` prefix in the server shapes.** The `/api` prefix belongs to the
  production reverse proxy and to the frontend's dev proxy, which strips it: the server sees
  `/hello`, and a project whose routes were mounted under `server/api/` would answer `/api/hello`
  in dev *and* have the proxy rewrite it to `/hello` — a 404 that only appears through the proxy.
  The route the smoke test reads back its own path, so "the prefix was stripped" is an assertion
  rather than a claim.
- **Every version lives in the workspace catalog.** The scaffold already ships
  `catalogMode: prefer` and a `catalog:` block with `vite-plus`, `typescript`, `vite` (an alias for
  `@voidzero-dev/vite-plus-core`) and `@types/node`; the app and the placeholder package already
  reference them with `"…": "catalog:"`. This step adds `nitro` to that block **in the modes that
  have a server**, adds the proxy transformer in the modes that have a proxy, and rewrites the
  specs that were written as literals (`typescript`, `@types/node`), so the root and every package
  resolve one version per dependency and a version is changed in exactly one place.
- **`vp install` is the install.** In a workspace the root owns the lockfile, and the layout's
  whole point is that one toolchain operates it: the project's `vp` installs for the workspace, the
  same way `vp run -r` runs tasks across it. (A package manager does appear once, in the ephemeral
  `vp create` bootstrap above, because at that point there is no `vp` to call.)

The commands that operate the workspace are registered in the root `package.json` and every one of
them is `vp`-form. A shape whose root is a server registers `dev:server` (`vp dev`), and — when the
app survives — `dev:website` (`vp -C apps/website dev`); a `frontend` workspace registers
`dev:website` and nothing else app-shaped. All of them register `check` (`vp check`) and `ready`.
The server shapes also register `test` and `build`, and their `ready` runs the root's own `vp test`
rather than `vp run -r test`: the root's test script already scans the whole workspace, and each
package's own test script would run the same files a second time. A `frontend` workspace registers
no `build` of its own — the root has nothing to build — so its `ready` is `vp check && vp run -r
build`, and the workspace build is `vp run -r build` itself. In every layout the template's stock
`"dev": "vp run website#dev"` is gone: it would either start the app a second time and hide the
server, or no-op against a package the mode deleted.

```bash guide:exec id=workspace-skeleton when=layout:monorepo
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_TS_VERSION:?Phase 2 must answer GUIDE_TS_VERSION}"
: "${GUIDE_TNB:?Phase 2 must answer GUIDE_TNB}"
: "${GUIDE_PLACEHOLDER:?Phase 1 must answer GUIDE_PLACEHOLDER}"

# What this mode puts in the workspace, as the two facts every later step reads: whether a server
# is part of it (the arrangements whose root is a Nitro app) and whether the app the template wrote
# survives (a backend project has no client). GUIDE_NITRO_VERSION is read with a default and
# required in the branch that needs it, because a frontend workspace never answers it — the
# extractor requires every `$GUIDE_…` named without a default to have been answered, in every
# profile that runs the step.
has_server=no
case "$GUIDE_MODE" in
  backend|fullstack) has_server=yes ;;
  frontend) : ;;
  *) echo "unsupported mode: $GUIDE_MODE" >&2; exit 1 ;;
esac
if [ "$has_server" = yes ] && [ -z "${GUIDE_NITRO_VERSION:-}" ]; then
  echo "GUIDE_NITRO_VERSION was never answered (Phase 2)" >&2
  exit 1
fi

# 1. the catalog is where a version lives -----------------------------------------------
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "pnpm-workspace.yaml";
let source = readFileSync(file, "utf8");
if (!/^catalog:/m.test(source)) {
  console.error("pnpm-workspace.yaml has no catalog block; inspect the scaffold before continuing");
  process.exit(1);
}

// nitro joins the catalog in the arrangements that have a server: the root's own dependency and
// any package that later needs it resolve the same version through this line. A frontend
// workspace never installs it.
if (process.env.GUIDE_MODE !== "frontend") {
  const pin = process.env.GUIDE_NITRO_VERSION ?? "";
  if (!pin) { console.error("GUIDE_NITRO_VERSION was never answered (Phase 2)"); process.exit(1); }
  if (/^\s+nitro:/m.test(source)) {
    console.error("the catalog already lists nitro; inspect pnpm-workspace.yaml before continuing");
    process.exit(1);
  }
  source = source.replace(/^catalog:\n/m, `catalog:\n  nitro: ${pin}\n`);
}

// The scaffold ships a TypeScript line of its own; the version decision is this run's, so the
// catalog entry is rewritten to the answer rather than left as whatever the template pinned. With
// the bridge (GUIDE_TNB=yes) the TypeScript 6 API package owns both the catalog entry and the
// override — that step ran above — so this one leaves it alone.
if (process.env.GUIDE_TNB !== "yes") {
  if (!/^\s+typescript:/m.test(source)) {
    console.error("the catalog does not list typescript; inspect pnpm-workspace.yaml before continuing");
    process.exit(1);
  }
  source = source.replace(/^\s+typescript:.*$/m, `  typescript: ${process.env.GUIDE_TS_VERSION}`);
}
writeFileSync(file, source);
NODE

# 2. the root package: the commands that operate the workspace, and the server's dependency -----
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const mode = process.env.GUIDE_MODE;
const hasServer = mode === "backend" || mode === "fullstack";
// A backend project has no client, so the app the template wrote does not survive the prune below.
const app = mode !== "backend";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

// The pin goes in as the catalog reference, not the literal: the catalog is the one place the
// version lives, so the root and any package that needs nitro later resolve the same one.
if (hasServer) manifest.devDependencies.nitro = "catalog:";

// The commands someone actually runs, all vp-form, registered where the workspace is operated
// from. The stock `dev` (vp run website#dev) is deleted in every arrangement: it names a package by
// its task, and in the arrangement where that package is deleted it exits 0 having run nothing.
manifest.scripts = {};
if (hasServer) {
  manifest.scripts["dev:server"] = "vp dev";
  manifest.scripts.build = "vp build";
}
if (app) manifest.scripts["dev:website"] = "vp -C apps/website dev";
manifest.scripts.check = "vp check";
if (hasServer) {
  manifest.scripts.test = "vp test --passWithNoTests";
  // `ready` runs the root's own test rather than `vp run -r test`: the root's script already scans
  // the whole workspace, and the `-r` form would run the same files a second time per package.
  manifest.scripts.ready = "vp check && vp test && vp run -r build";
} else {
  // A frontend workspace ships no test harness of its own — the app has none by decision — and the
  // root has nothing of its own to build, so `ready` is the check and the workspace build.
  manifest.scripts.ready = "vp check && vp run -r build";
}

const order = ["name", "version", "private", "type", "imports", "scripts", "dependencies", "devDependencies", "devEngines", "engines"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync("package.json", JSON.stringify(ordered, null, 2) + "\n");
console.log(`ok  root manifest: ${Object.keys(manifest.scripts).join(", ")}${hasServer ? " (root is the server)" : " (root is a shell)"}`);
NODE

# 3. the app the template wrote: kept and wired in two arrangements, deleted in the third -------
if [ "$GUIDE_MODE" = backend ]; then
  # A backend project has no client. The app is the whole client, so it goes the way src/, public/
  # and index.html go in the single layout — and with it goes the reason the template's `dev` script
  # existed. `apps/` is left with nothing in it, so it goes too.
  rm -rf apps/website
  rmdir apps 2>/dev/null || true
  [ ! -e apps/website ] && [ ! -e apps ] || { echo "the scaffolded app survived the prune" >&2; exit 1; }
  echo "ok  the template's frontend app is deleted (a backend project has no client)"
else
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "apps/website/package.json";
const manifest = JSON.parse(readFileSync(file, "utf8"));

// `imports` resolves against the nearest package.json, so the app needs its own map: `#/src/…`
// is the app's spelling of "from this package's root", exactly as `#/server/…` is the root's.
manifest.imports = { "#/*": { types: "./*.ts", default: "./*" } };

// create-vite wrote `typescript` as a literal here while the workspace catalog carries the same
// version; the layout's rule is one version per dependency, in the catalog.
for (const name of ["typescript", "vite", "vite-plus"]) {
  if (!(name in manifest.devDependencies)) {
    console.error(`apps/website does not depend on ${name}; inspect its manifest`);
    process.exit(1);
  }
  manifest.devDependencies[name] = "catalog:";
}
manifest.devDependencies = Object.fromEntries(
  Object.entries(manifest.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log("ok  apps/website keeps its own alias map, every spec through the catalog");
NODE
fi

# 4. the placeholder package: keep it, or delete it --------------------------------------
case "$GUIDE_PLACEHOLDER" in
  no)
    rm -rf packages/utils
    rmdir packages 2>/dev/null || true
    [ ! -e packages/utils ] && [ ! -e packages ] || { echo "the placeholder package survived the deletion" >&2; exit 1; }
    echo "ok  placeholder package deleted by decision"
    ;;
  yes)
    # It stays, as the home for future shared code — so it is pruned like everything else the
    # generators wrote: the publishing shape of a library starter (bumpp, prepublishOnly, the
    # placeholder repository/author metadata) is not what a package inside an application
    # workspace is for, and its two version literals join the catalog.
    node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "packages/utils/package.json";
const manifest = JSON.parse(readFileSync(file, "utf8"));
for (const key of ["description", "homepage", "bugs", "author", "repository", "publishConfig", "files"]) {
  delete manifest[key];
}
delete manifest.devDependencies.bumpp;
delete manifest.scripts.prepublishOnly;
for (const name of ["@types/node", "typescript", "vite-plus"]) {
  if (!(name in manifest.devDependencies)) {
    console.error(`packages/utils does not depend on ${name}; inspect its manifest`);
    process.exit(1);
  }
  manifest.devDependencies[name] = "catalog:";
}
const order = ["name", "version", "private", "type", "license", "exports", "scripts", "dependencies", "devDependencies"];
const ordered = {};
for (const key of order) if (key in manifest) ordered[key] = manifest[key];
for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
writeFileSync(file, JSON.stringify(ordered, null, 2) + "\n");
NODE
    echo "ok  placeholder package kept and pruned (publishing shape removed, versions in the catalog)"
    ;;
esac

# 5. no script in this workspace may name a package by its task -------------------------
# `vp run <package>#<task>` is the template's own `dev` form: when that package does not exist the
# script exits 0 having run nothing (measured: `vp run: 0/0 cache hit`), which is the silent no-op
# this arrangement deletes a package into. The root's own set is written above; this covers every
# manifest the workspace ends up with, so nothing inherited from the template can keep the form.
node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

const manifests = ["package.json"];
if (process.env.GUIDE_MODE !== "backend") manifests.push("apps/website/package.json");
if (existsSync("packages/utils/package.json")) manifests.push("packages/utils/package.json");
for (const file of manifests) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  for (const [name, script] of Object.entries(manifest.scripts ?? {})) {
    if (/vp\s+run\s+\S*#/.test(String(script))) {
      console.error(`${file}: script \`${name}\` names a package (${script}); a package this workspace does not have would make it a silent no-op`);
      process.exit(1);
    }
  }
}
console.log(`ok  no script names a package by its task (${manifests.join(", ")})`);
NODE

# 6. install, then prove the versions are actually shared ---------------------------------
./node_modules/.bin/vp install

node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

const mode = process.env.GUIDE_MODE;
const hasServer = mode === "backend" || mode === "fullstack";
const app = mode !== "backend";
const problems = [];
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
const required = ["vite-plus", "typescript", ...(hasServer ? ["nitro"] : [])];
for (const name of required) {
  if (!new RegExp(`^\\s+"?'?${name}'?:`, "m").test(workspace)) problems.push(`${name} is not in the workspace catalog`);
}

// The version decision has to be the one the catalog carries, or the decision was made and then
// quietly ignored: the entries are the pins, and the packages resolve what is written here.
const entry = (name) => {
  const match = new RegExp(`^\\s+"?'?${name}'?:\\s*(.+?)\\s*$`, "m").exec(workspace);
  return match ? match[1] : "";
};
if (hasServer && entry("nitro") !== process.env.GUIDE_NITRO_VERSION) {
  problems.push(`the catalog pins nitro ${entry("nitro") || "<nothing>"}, the decision was ${process.env.GUIDE_NITRO_VERSION}`);
}
if (process.env.GUIDE_TNB === "yes") {
  if (!entry("typescript").includes("typescript-native-bridge")) {
    problems.push(`the catalog does not point typescript at the bridge: ${entry("typescript")}`);
  }
} else if (entry("typescript") !== process.env.GUIDE_TS_VERSION) {
  problems.push(`the catalog pins typescript ${entry("typescript")}, the decision was ${process.env.GUIDE_TS_VERSION}`);
}

// Every dependency of every manifest is a catalog reference: one version per dependency, one
// place to change it. A literal here would be a second version that nothing else shares.
const manifests = [["package.json", "."]];
if (app) manifests.push(["apps/website/package.json", "apps/website"]);
if (existsSync("packages/utils/package.json")) manifests.push(["packages/utils/package.json", "packages/utils"]);
for (const [file] of manifests) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, spec] of Object.entries(manifest[group] ?? {})) {
      if (spec !== "catalog:" && !String(spec).startsWith("workspace:")) {
        problems.push(`${file}: ${name}@${spec} is not a catalog reference`);
      }
    }
  }
}

// The catalog is only shared if the packages really resolve through it: the same dependency has
// to resolve to the same version from every package that declares it.
const version = (base, name) => JSON.parse(readFileSync(`${base}/node_modules/${name}/package.json`, "utf8")).version;
const vitePlus = manifests.map(([, base]) => [base, version(base, "vite-plus")]);
const distinct = [...new Set(vitePlus.map(([, v]) => v))];
if (distinct.length !== 1) problems.push(`vite-plus resolves to ${distinct.join(" and ")} across the workspace`);
let nitro = "";
if (hasServer) {
  nitro = version(".", "nitro");
  if (nitro !== process.env.GUIDE_NITRO_VERSION) problems.push(`nitro resolved to ${nitro}, expected ${process.env.GUIDE_NITRO_VERSION}`);
}

if (problems.length) {
  console.error("the workspace does not share one version per dependency:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`ok  catalog shared: vite-plus ${distinct[0]} in ${vitePlus.map(([base]) => base).join(", ")}${hasServer ? `; nitro ${nitro} at the root` : "; no server in this workspace"}`);
NODE
```

```bash guide:exec id=workspace-app when=mode:frontend|fullstack&layout:monorepo
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"

# The app the template writes is the create-vite vanilla-ts demo: a counter, a hero image and a
# second icon set. None of it is this project's page, so it goes the way the scaffold's demo goes
# in every other profile — and the page that replaces it is the smoke test's positive half, so it
# carries a marker rather than being empty. The marker is the mode's: the same app is a frontend
# whose backend is elsewhere, or the frontend half of a split project, and the smoke test reads the
# words the page actually carries. The `favicon.svg` the scaffold references from index.html stays;
# `index.html` itself already names `/src/main.ts`, which is the entry this rewrite keeps.
case "$GUIDE_MODE" in
  fullstack)
    page_title="Split works"
    page_line="The API lives on the workspace root server and is reached through the /api dev proxy."
    ;;
  frontend)
    page_title="Frontend works"
    page_line="This app reaches its backend through the /api dev proxy."
    ;;
  *) echo "unsupported mode for the workspace app: $GUIDE_MODE" >&2; exit 1 ;;
esac
rm -f apps/website/src/counter.ts apps/website/public/icons.svg
rm -rf apps/website/src/assets

cat > apps/website/src/main.ts <<TS
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("index.html must provide #app");
root.innerHTML = \`
  <main>
    <h1>${page_title}</h1>
    <p>${page_line}</p>
  </main>
\`;
TS

cat > apps/website/src/style.css <<'CSS'
:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
}

main {
  margin: 3rem auto;
  max-width: 40rem;
}
CSS

MARKER="$page_title" node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

for (const gone of ["apps/website/src/counter.ts", "apps/website/public/icons.svg", "apps/website/src/assets"]) {
  if (existsSync(gone)) { console.error(`${gone} survived the prune`); process.exit(1); }
}
const marker = process.env.MARKER;
const main = readFileSync("apps/website/src/main.ts", "utf8");
if (!main.includes(marker)) {
  console.error(`apps/website/src/main.ts does not carry the marker the smoke test reads (${marker})`);
  process.exit(1);
}
const html = readFileSync("apps/website/index.html", "utf8");
if (!html.includes('src="/src/main.ts"')) {
  console.error("apps/website/index.html no longer names /src/main.ts as the entry");
  process.exit(1);
}
console.log(`ok  frontend app pruned to a minimal page that carries the smoke marker (${marker})`);
NODE
```

```bash guide:exec id=workspace-plugin when=mode:backend|fullstack&layout:monorepo
set -euo pipefail

# The server is the root's Vite app, so its plugin goes in the root config — in a `plugins` array
# that the scaffold's root config does not have, next to the `defaultPackage` that lets the root
# act on itself. Both halves in one edit, because "the patch ran" and "the plugin is registered"
# are different claims.
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
const before = readFileSync(file, "utf8");
if (/^ {2}plugins\s*:/m.test(before)) {
  console.error("vite.config.ts already has a top-level plugins entry, so this step would add a second one");
  process.exit(1);
}
if (/^ {2}defaultPackage\s*:/m.test(before)) {
  console.error("vite.config.ts already sets defaultPackage; inspect it before continuing");
  process.exit(1);
}
const head = "export default defineConfig({";
if (before.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}
let source = before.replace(
  /(import \{[^}]*\} from ['"]vite-plus['"];\n)/,
  '$1import { nitro } from "nitro/vite";\n',
);
if (source === before) {
  console.error("vite.config.ts has no vite-plus import to sit next to");
  process.exit(1);
}
source = source.replace(head, `${head}\n  defaultPackage: ".",\n  plugins: [nitro()],`);
writeFileSync(file, source);
NODE

cat > nitro.config.ts <<'TS'
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  output: { dir: "dist" },
});
TS

mkdir -p server/routes tests
: > tests/.gitkeep

# The route is deliberately self-describing in the split shape: it answers with the path it
# received, which is the only way "the /api prefix was stripped on the way in" can be asserted
# instead of assumed. A backend workspace has no proxy in front of it, so its route answers the same
# payload its single-layout sibling does.
if [ "$GUIDE_MODE" = fullstack ]; then
cat > server/routes/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler((event) => ({
  hello: "world",
  from: "root-nitro-server",
  route: "server/routes/hello.ts",
  serverSawPath: new URL(event.req.url).pathname,
  serverSawHost: event.req.headers.get("host"),
}));
TS
else
cat > server/routes/hello.ts <<'TS'
import { defineHandler } from "nitro";

export default defineHandler(() => ({ hello: "world" }));
TS
fi

./node_modules/.bin/vp fmt

node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";

const source = readFileSync("vite.config.ts", "utf8");
if (!/import \{ nitro \} from "nitro\/vite";/.test(source)) {
  console.error("vite.config.ts does not import nitro from nitro/vite");
  process.exit(1);
}
const keys = source.match(/^ {2}plugins\s*:/gm) ?? [];
if (keys.length !== 1) {
  console.error(`expected exactly one top-level plugins entry in vite.config.ts, found ${keys.length}`);
  process.exit(1);
}
if (!/^ {2}plugins:\s*\[nitro\(\)\],$/m.test(source)) {
  console.error("the plugins array does not call nitro() — the server would be inert");
  process.exit(1);
}
if (!/^ {2}defaultPackage:\s*"\.",$/m.test(source)) {
  console.error('vite.config.ts does not set defaultPackage: "." — vp would refuse to act on the root');
  process.exit(1);
}
const nitro = readFileSync("nitro.config.ts", "utf8");
if (!/serverDir:\s*"\.\/server"/.test(nitro) || !/output:\s*\{\s*dir:\s*"dist"/.test(nitro)) {
  console.error("nitro.config.ts does not set serverDir ./server and output dir dist");
  process.exit(1);
}
for (const file of ["server/routes/hello.ts", "tests/.gitkeep"]) {
  if (!existsSync(file)) { console.error(`${file} is missing`); process.exit(1); }
}
console.log("ok  root server wired: defaultPackage ., plugins [nitro()], serverDir ./server, output dist");
NODE

./node_modules/.bin/vp check

# The server's own code is type-checked, which is the claim the merged program makes in the other
# server profiles. It cannot be inherited from them: here the server is the root's own program,
# and the whole workspace is what the root check walks.
printf 'export const __guideServerProbe: number = "not a number";\n' > server/routes/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
if ./node_modules/.bin/vp check > .vite-plus-server-control.log 2>&1; then
  rm -f server/routes/__guide_probe.ts
  echo "vp check passed with a type error in server/routes - the server is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-server-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-server-control.log" >&2
  exit 1
}
rm -f server/routes/__guide_probe.ts .vite-plus-server-control.log
echo "ok  a planted type error in server/routes was caught (TS2322)"

# The same for the app, whose program belongs to the app's own tsconfig: the root check has to
# cover it, because the app has no `check` script of its own for `vp run -r check` to run. Only the
# split shape has an app; a backend workspace deleted it above.
if [ "$GUIDE_MODE" = fullstack ]; then
printf 'export const __guideAppProbe: number = "not a number";\n' > apps/website/src/__guide_probe.ts
./node_modules/.bin/vp fmt > /dev/null
if ./node_modules/.bin/vp check > .vite-plus-app-control.log 2>&1; then
  rm -f apps/website/src/__guide_probe.ts
  echo "vp check passed with a type error in apps/website/src - the app is not type-checked" >&2
  exit 1
fi
grep -q 'TS2322' .vite-plus-app-control.log || {
  echo "vp check failed, but not with the planted TS2322; inspect .vite-plus-app-control.log" >&2
  exit 1
}
rm -f apps/website/src/__guide_probe.ts .vite-plus-app-control.log
echo "ok  a planted type error in apps/website/src was caught (TS2322)"

# And the app's own alias map, in the app's program: the app's tsc runs inside `vp run -r build`,
# so this proves the map resolves for the build script too, not only for the root check.
cat > apps/website/src/__guide_alias_target.ts <<'TS'
export const aliasProbe = "imports-alias-resolves";
TS
cat > apps/website/src/__guide_alias_use.ts <<'TS'
import { aliasProbe } from "#/src/__guide_alias_target";

export const aliasProbeUse: string = aliasProbe;
TS
./node_modules/.bin/vp fmt > /dev/null
./node_modules/.bin/vp check
rm -f apps/website/src/__guide_alias_target.ts apps/website/src/__guide_alias_use.ts
echo "ok  '#/...' resolves inside apps/website through its own package.json imports"
fi

# The composition is proved by its product: the root's build has to come out of the plugin, in
# the directory the ignore rules cover, and in the split shape the workspace build has to cover the
# app as well.
./node_modules/.bin/vp build
[ -f dist/server/index.mjs ] || {
  echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2
  exit 1
}
[ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
[ ! -e .output ] || {
  echo "the build also wrote .output/; output.dir did not take effect" >&2
  exit 1
}
echo "ok  root build output is dist/server/index.mjs + dist/nitro.json, with no .output/ beside it"

# In the backend arrangement the client is gone, so the workspace has nothing else to build — which
# is exactly when a root command that was re-pointed wrongly turns into a no-op. The check is the
# workspace form of the build, from an empty output directory: `vp run -r build` has to schedule
# and run the root's own `build` task, and the artefact has to come back. (`0/0 cache hit` with no
# `#build` task in the summary is what the failure looks like.)
if [ "$GUIDE_MODE" = backend ]; then
  rm -rf dist
  ./node_modules/.bin/vp run --no-cache -r -v build > .vite-plus-workspace-build.log 2>&1 || {
    cat .vite-plus-workspace-build.log >&2
    echo "vp run -r build failed" >&2
    exit 1
  }
  grep -q '#build' .vite-plus-workspace-build.log || {
    cat .vite-plus-workspace-build.log >&2
    echo "vp run -r build scheduled no build task at all" >&2
    exit 1
  }
  [ -f dist/server/index.mjs ] || {
    echo "vp run -r build produced no dist/server/index.mjs — the root's build is a no-op" >&2
    exit 1
  }
  rm -f .vite-plus-workspace-build.log
  echo "ok  vp run -r build builds the workspace root (the re-pointed commands are not a no-op)"
fi
```

## Phase 3.5 — Dev proxy: only when a frontend is not same-origin as its backend

A frontend that is not served by its backend needs a dev proxy, and there are three such
arrangements: a pure frontend in a single repository, whose backend is somewhere else entirely; the
same pure frontend in a workspace, whose app is the package with the dev server and whose backend is
still somebody else's; and the split shape, whose backend is the workspace's own root server on
another port. The production edge strips the `api` prefix before
the server sees the path; the dev server has to reproduce that exactly, or `/api/*` will work in
dev and 404 in production. The phase is skipped where the page and the API share one origin — a
backend project has a server and no page, and the SSR shape serves both from one project — because
in those a proxy would be a second mechanism for a problem that does not exist.

Three details are load-bearing, in every arrangement:

- `DEV_PROXY` lives in **`.env`**, not `.env.development`: `loadEnv` reads files per mode, and
  a production build would not see a development-mode file — the guard below would then throw
  during `vp build` and kill the build for a variable the build does not need.
- the **guard is a single unconditional line**. Without it, an unset variable makes
  `proxyTransformer` return an empty config: `/api/*` quietly returns `200` with the app's
  HTML, and the dev log says nothing.
- the **prefix is a regular expression**, so write `/api/` with the trailing slash unless you
  want `/apix/…` proxied too.

Where all of that lives follows the package that owns the dev server. A pure frontend in a single
repository has one project, so the proxy config is the root `vite.config.ts` and the target is a
decision (`GUIDE_DEV_PROXY`) — the backend is somebody else's. The two workspace arrangements keep
the proxy in the **frontend package**: `apps/website/vite.config.ts` (which the template does not
write — the app has no config of its own until this step) and `apps/website/.env`. The split shape's
target is derived from the root server's own port rather than asked for; a pure frontend workspace
has no root server, so its target is the same decision the single layout asks — with the
`http://127.0.0.1:3000` placeholder when the backend is not known yet. The first script below is the
single layout's; the second is both workspace arrangements', and the one thing it branches on is
where the target comes from.

```bash guide:exec id=proxy when=mode:frontend&layout:single
set -euo pipefail
# The dev-proxy target is the one answer with a placeholder: a pure frontend's backend is somebody
# else's, and it may not exist yet. Ask for it, offer http://127.0.0.1:3000 — a proxy pointed at a
# port nothing listens on answers 502, which is the loud half of "there is no backend there" — and
# write what the answer is, falling back to the placeholder when the run was not told. (Every use
# below goes through this local, so the answer really is optional — naming the bare answer variable
# would make the extractor require it, and the documented default would be unreachable.)
dev_proxy_answer=${GUIDE_DEV_PROXY:-http://127.0.0.1:3000}
export GUIDE_DEV_PROXY="$dev_proxy_answer"
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"

cat > .env <<ENV
# Dev proxy: the nginx-equivalent for local development. The /api/ prefix is stripped, so
# /api/hello reaches the backend as /hello. Committed on purpose: only *.local is ignored.
DEV_PROXY="[ ['/api/','${dev_proxy_answer}',''] ]"
ENV

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "vite.config.ts";
let source = readFileSync(file, "utf8");

// 1. `loadEnv` comes from vite-plus, which is where the project's Vite flavor lives.
const vpImport = /import \{([^}]*)\} from "vite-plus";/.exec(source);
if (!vpImport) {
  console.error("vite.config.ts has no vite-plus import to extend");
  process.exit(1);
}
const names = vpImport[1].split(",").map((name) => name.trim()).filter(Boolean);
if (!names.includes("loadEnv")) names.push("loadEnv");
names.sort();
source = source.replace(vpImport[0], `import { ${names.join(", ")} } from "vite-plus";`);
source = source.replace(
  /(import \{[^}]*\} from "vite-plus";\n)/,
  '$1import { proxyTransformer } from "vite-proxy-from-env";\n',
);

// 2. Wrap the exported config so the proxy target can be read per mode, and keep the guard
//    one line long: it is here to turn a silent fallback into a loud failure.
const head = "export default defineConfig({";
if (source.split(head).length !== 2) {
  console.error(`expected exactly one ${JSON.stringify(head)} in vite.config.ts`);
  process.exit(1);
}
source = source.replace(
  head,
  [
    "export default defineConfig(({ mode }) => {",
    '  const env = loadEnv(mode, process.cwd(), "");',
    '  if (!env.DEV_PROXY) throw new Error("DEV_PROXY is not set — see .env");',
    "  return {",
  ].join("\n"),
);
if (!source.trimEnd().endsWith("});")) {
  console.error("vite.config.ts does not end with '});'");
  process.exit(1);
}
source = source.replace(
  /\n\}\);\s*$/,
  "\n  server: {\n    proxy: proxyTransformer(env.DEV_PROXY),\n  },\n  };\n});\n",
);

// 3. Pin the transformer, which never reads the environment itself.
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
manifest.devDependencies["vite-proxy-from-env"] = "1.1.0";
manifest.devDependencies = Object.fromEntries(
  Object.entries(manifest.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(file, source);
NODE

case "$GUIDE_PM" in
  pnpm) pnpm install --no-frozen-lockfile ;;
  npm) npm install ;;
  yarn) yarn install ;;
  bun) bun install ;;
  *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
esac

./node_modules/.bin/vp fmt
./node_modules/.bin/vp check
echo "ok  dev proxy wired: /api/* -> $dev_proxy_answer with the prefix stripped"
```

```bash guide:exec id=proxy-workspace when=mode:frontend|fullstack&layout:monorepo
set -euo pipefail
: "${GUIDE_MODE:?Phase 1 must answer GUIDE_MODE}"

# The proxy config belongs to the package that has a dev server of its own — the app — and where
# its target comes from is the arrangement's:
case "$GUIDE_MODE" in
  fullstack)
    # The split shape's backend is this workspace's own root server, so the target is written from
    # its port rather than asked for. Change that port in one place and this file follows — a target
    # on a port nothing listens on answers 502, which is the loud half of getting it wrong.
    # (Read with a default and required inside this branch: a frontend workspace has no root server,
    # so it never answers this, and the extractor requires every `$GUIDE_…` named without a default
    # to have been answered in every profile that runs the step.)
    dev_port_answer=${GUIDE_DEV_PORT:-}
    [ -n "$dev_port_answer" ] || { echo "the split shape needs GUIDE_DEV_PORT (the port the workspace root server binds)" >&2; exit 1; }
    dev_proxy_answer="http://127.0.0.1:${dev_port_answer}"
    proxy_target="the workspace root server"
    ;;
  frontend)
    # A pure frontend workspace has no server of its own: the backend is somebody else's, and it may
    # not exist yet. Ask for the address, offer http://127.0.0.1:3000 — a proxy pointed at a port
    # nothing listens on answers 502, which is the loud half of "there is no backend there" — and
    # write what the answer is, falling back to the placeholder when the run was not told.
    dev_proxy_answer=${GUIDE_DEV_PROXY:-http://127.0.0.1:3000}
    proxy_target="the backend named here"
    ;;
  *) echo "unsupported mode for a workspace proxy: $GUIDE_MODE" >&2; exit 1 ;;
esac

cat > apps/website/.env <<ENV
# Dev proxy: the nginx-equivalent for local development. The /api/ prefix is stripped, so
# /api/hello reaches ${proxy_target} as /hello. Committed on purpose: only *.local is ignored.
DEV_PROXY="[ ['/api/','${dev_proxy_answer}',''] ]"
ENV

# The app has no config of its own until now (the template writes none for it), so this is a new
# file, not a patch: the Vite config whose whole content is the proxy, and the guard that turns a
# missing variable into a stop instead of an HTML page.
cat > apps/website/vite.config.ts <<'TS'
import { proxyTransformer } from "vite-proxy-from-env";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Without this line a missing DEV_PROXY makes proxyTransformer return an empty config: /api/*
  // then answers 200 with this app's HTML and the dev log stays silent.
  //
  // The variable lives in `.env`, not `.env.development`, and that is what makes this guard
  // affordable: `loadEnv` reads files per mode, so a value in `.env.development` would be
  // invisible to `vp build` and this line would stop the build over a variable that was set.
  // Put it where every mode sees it, and a missing variable really is missing — a loud stop in
  // dev and in a build, never a quiet HTML 200.
  if (!env.DEV_PROXY) throw new Error("DEV_PROXY is not set — see .env");
  return {
    server: {
      proxy: proxyTransformer(env.DEV_PROXY),
    },
  };
});
TS

# The transformer is the app's dependency — but its version still lives in the workspace catalog,
# like every other version in this layout.
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const workspace = "pnpm-workspace.yaml";
let source = readFileSync(workspace, "utf8");
if (!/^catalog:/m.test(source)) {
  console.error("pnpm-workspace.yaml has no catalog block; inspect the scaffold before continuing");
  process.exit(1);
}
if (!/^\s+"?vite-proxy-from-env"?:/m.test(source)) {
  source = source.replace(/^catalog:\n/m, 'catalog:\n  "vite-proxy-from-env": 1.1.0\n');
  writeFileSync(workspace, source);
}

const file = "apps/website/package.json";
const manifest = JSON.parse(readFileSync(file, "utf8"));
manifest.devDependencies["vite-proxy-from-env"] = "catalog:";
manifest.devDependencies = Object.fromEntries(
  Object.entries(manifest.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log("ok  vite-proxy-from-env pinned in the workspace catalog, referenced by the app");
NODE

./node_modules/.bin/vp install

./node_modules/.bin/vp fmt

# Assert the wiring on the formatted file rather than on the patch: "the config was written" and
# "the app proxies /api/*" are different claims, and the difference is exactly the silent one.
EXPECTED_TARGET="$dev_proxy_answer" node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";

const config = readFileSync("apps/website/vite.config.ts", "utf8");
if (!/import \{ proxyTransformer \} from "vite-proxy-from-env";/.test(config)) {
  console.error("apps/website/vite.config.ts does not import proxyTransformer");
  process.exit(1);
}
if (!/proxyTransformer\(env\.DEV_PROXY\)/.test(config)) {
  console.error("apps/website/vite.config.ts does not build the proxy from env.DEV_PROXY");
  process.exit(1);
}
if (!/if\s*\(\s*!env\.DEV_PROXY\s*\)\s*throw/.test(config)) {
  console.error("the DEV_PROXY guard is missing: /api/* would answer the app's HTML with exit 0");
  process.exit(1);
}
if (/(command\s*===\s*["']serve["'])/.test(config)) {
  console.error("the guard is conditional on the dev command; it must fire for every mode");
  process.exit(1);
}
const env = readFileSync("apps/website/.env", "utf8");
const target = process.env.EXPECTED_TARGET;
if (!env.includes(target)) {
  console.error(`apps/website/.env does not point at the target this arrangement uses (${target})`);
  process.exit(1);
}
if (!env.includes("'/api/'")) {
  console.error("the proxy prefix is not '/api/' — without the trailing slash /apix/... is proxied too");
  process.exit(1);
}
console.log("ok  the app's dev proxy is wired, with the guard in place");
NODE

./node_modules/.bin/vp check
echo "ok  dev proxy wired in apps/website: /api/* -> $dev_proxy_answer with the prefix stripped"
```
## Phase 4 — Agent skills (automatic, then verified)

Install the promoted skill set from the toolkit's upstream repository. The set is resolved
from upstream **at run time** — never frozen in this guide — so a renamed or newly promoted
skill is picked up instead of silently pinned to today's list. The count is not asserted
anywhere: the contract is that the installed set equals the set the upstream manifest
declares, whatever that set is today.

The install command has a trap worth naming: `skills` 1.7.0 only understands the bare
`--skill` token. Its own documentation shows `--skill=<name>`, which the parser ignores, so
the CLI installs all 38 skills and exits 0. The exit code is not evidence here — the lockfile's
name set is.

```bash guide:exec id=skills
set -euo pipefail
: "${GUIDE_LAYOUT:?Phase 1 must answer GUIDE_LAYOUT}"
: "${GUIDE_PM:?Phase 1 must answer GUIDE_PM}"
: "${GUIDE_SKILLS_VERSION:?Phase 2 must answer GUIDE_SKILLS_VERSION}"

node --input-type=module -e '
const response = await fetch("https://raw.githubusercontent.com/mattpocock/skills/main/.claude-plugin/plugin.json");
if (!response.ok) { console.error(`could not read the upstream manifest (${response.status})`); process.exit(1); }
const manifest = await response.json();
const names = manifest.skills.map((path) => path.replace(/\/+$/, "").split("/").pop());
if (names.length === 0) { console.error("the upstream manifest declares no promoted skills"); process.exit(1); }
process.stdout.write(names.join(" "));
' > .vite-plus-skill-names

names=$(cat .vite-plus-skill-names)
echo "upstream declares $(echo "$names" | wc -w) promoted skills"

# The installer runs ephemerally either way. In the monorepo layout it runs through the
# project's own toolchain (`vp dlx` downloads the CLI and runs it, exactly as `pnpm dlx` would),
# because that layout's rule is that no package-manager command appears in its flow; in the
# single layouts it runs through the chosen package manager's dlx.
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  ./node_modules/.bin/vp dlx "skills@$GUIDE_SKILLS_VERSION" add mattpocock/skills -y -a universal --json --skill $names > .vite-plus-skills.log 2>&1
else
  case "$GUIDE_PM" in
    pnpm) dlx() { pnpm dlx "$@"; } ;;
    npm) dlx() { npx --yes "$@"; } ;;
    yarn) dlx() { yarn dlx "$@"; } ;;
    bun) dlx() { bunx "$@"; } ;;
    *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
  esac
  dlx "skills@$GUIDE_SKILLS_VERSION" add mattpocock/skills -y -a universal --json --skill $names > .vite-plus-skills.log 2>&1
fi

# Record the commit that upstream was on while installing: the lockfile carries content
# hashes, not a revision.
git ls-remote https://github.com/mattpocock/skills.git refs/heads/main | cut -f1 > .vite-plus-skills-commit

node --input-type=module - <<'NODE'
import { readFileSync, existsSync } from "node:fs";

const raw = readFileSync(".vite-plus-skills.log", "utf8");
const start = raw.indexOf("[");
if (start < 0) { console.error("the installer printed no JSON result; see .vite-plus-skills.log"); process.exit(1); }
let depth = 0, end = -1;
for (let i = start; i < raw.length; i += 1) {
  if (raw[i] === "[") depth += 1;
  else if (raw[i] === "]") { depth -= 1; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) { console.error("the installer's JSON result is truncated"); process.exit(1); }
const results = JSON.parse(raw.slice(start, end));
const failed = results.filter((entry) => entry.status !== "installed");
if (failed.length) {
  console.error("skills that did not install:", failed.map((entry) => `${entry.name} (${entry.status})`).join(", "));
  process.exit(1);
}
console.log(`installer reported ${results.length} skills installed`);

const want = readFileSync(".vite-plus-skill-names", "utf8").trim().split(/\s+/).sort();
const lock = JSON.parse(readFileSync("skills-lock.json", "utf8"));
const got = Object.keys(lock.skills).sort();
const missing = want.filter((name) => !got.includes(name));
const extra = got.filter((name) => !want.includes(name));
if (missing.length || extra.length) {
  console.error(`lockfile does not match the upstream set: missing [${missing}] unexpected [${extra}]`);
  process.exit(1);
}
for (const name of got) {
  const entry = lock.skills[name];
  if (!entry.skillPath || !entry.computedHash) { console.error(`lockfile entry ${name} is incomplete`); process.exit(1); }
  if (!existsSync(`.agents/skills/${name}/SKILL.md`)) { console.error(`.agents/skills/${name}/SKILL.md is missing`); process.exit(1); }
}
console.log(`ok  ${got.length} skills installed, lockfile matches the upstream declaration`);
NODE
```

## Phase 4.5 — Decision point: run the skills setup now?

The installed set has one skill that configures the project *for* the other skills:
`/setup-matt-pocock-skills`. It is a prompt-driven conversation, not a script — it explores the
repo, presents what it found, asks for confirmation, and only then writes — and it asks about:

- the **issue tracker** — where issues and specs live for this project: GitHub (the `gh` CLI,
  proposed when a remote points there), GitLab (`glab`), local markdown files under
  `.scratch/<feature>/`, or a workflow the user describes in a paragraph (Jira, Linear, …);
- the **triage label vocabulary** — keep the five canonical role names (`needs-triage`,
  `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) or map them to names the
  tracker already uses (asked only when the `triage` skill is installed, which the promoted set
  is);
- the **domain-doc layout** — single-context (one `CONTEXT.md` and one ADR directory at the repo
  root: the default, recorded without asking) or multi-context (a root `CONTEXT-MAP.md` pointing
  at one `CONTEXT.md` per context, with per-context ADR directories; offered only when the repo
  shows monorepo signals);
- the **agent brief** — the `## Agent skills` block it adds to the file the repo already has
  (`CLAUDE.md` when it exists, otherwise `AGENTS.md`).

**Only the user can start it.** That skill carries `disable-model-invocation: true`: a
user-invocable skill is one an agent may *execute* once the user asks for it, and may not
*originate* — an agent cannot decide on its own that this project should be configured, so it
cannot take this branch by itself. So **ask the question, and say both of those things out loud**:
what the skill will ask (the four items above) and why only the user can start it. The answer
picks the branch.

- **Yes** — the user runs `/setup-matt-pocock-skills`; the agent then follows that skill's own
  process: **explore** the repo (remote, `AGENTS.md`/`CLAUDE.md`, `CONTEXT.md`, existing `docs/`),
  **present** what it found and what each section will say, **confirm** with the user — the user's
  edits during confirmation, including the ADR directory the convention ends up naming, *are* the
  decision — and **write** the files. It must not overwrite document sections that already exist:
  the `## Agent skills` block is updated in place when the file has one and nothing above or below
  it is rewritten. The `docs/agents/` files are the skill's generated output, so — as that skill's
  own text says — a re-run regenerates them from its seeds; that is exactly why a hand patch to one
  is lost, and why the trap that belongs with a tracker goes into the traps list instead.
- **No** — continue. No convention is negotiated, so the inherited ADRs (Phase 5) take the
  default landing point, `docs/adr/`, and the assumption is written into the birth certificate
  (`docs/provenance.md`) rather than left implicit: a project that adopts a convention later has
  to know those ADRs were placed by default, not by a decision.

The questions that skill asks map onto answers a run can carry in advance, which is what makes this
decision point testable: `GUIDE_TRACKER` (Section A), `GUIDE_DOMAIN_LAYOUT` (Section C), and
`GUIDE_ADR_DIR` — the ADR directory the confirmed convention ends up naming, which is Section C's
output and the field a user edits during confirmation. The triage vocabulary is written as the
canonical five; a non-default vocabulary is the user's own edit to the generated table (and, like
every generated file here, that edit is regenerated from the skill's seed when the skill runs
again). One answer is not pre-answerable: `other`, the tracker written from the user's own
paragraph, needs the conversation itself — this flow refuses it rather than inventing a file. In an
unattended run answer `no`, or answer `yes` with all three; a `yes` with a missing or unwritable
answer stops at the guard below rather than guessing at it.

```bash guide:exec id=setup-guard
set -euo pipefail
: "${GUIDE_SETUP:?Phase 4.5 must answer GUIDE_SETUP}"

# Both branches are checked before either one touches the project: a `no` is complete on its own,
# and a `yes` is only runnable when the questions the skill would ask have answers — the user's
# own, or the ones a pre-answered run supplied.
case "$GUIDE_SETUP" in
  no)
    echo "ok  setup deferred to the user; the inherited ADRs take the default landing point and"
    echo "ok  docs/provenance.md records that as an assumption rather than a decision"
    ;;
  yes)
    # Read with a default and required here: the answer only belongs to this branch, and the
    # extractor's rule is that a `$GUIDE_…` without a default must be answered by every profile.
    tracker=${GUIDE_TRACKER:-}
    adr_dir=${GUIDE_ADR_DIR:-docs/adr}
    adr_dir=${adr_dir%/}
    domain_layout=${GUIDE_DOMAIN_LAYOUT:-single}
    case "$tracker" in
      github|gitlab|local) : ;;
      "") echo "GUIDE_TRACKER must be answered when the setup flow runs: it is the issue tracker that flow settles (Phase 4.5)" >&2; exit 1 ;;
      other)
        echo "GUIDE_TRACKER=other cannot be written by this step: that file is written from the user's" >&2
        echo "own description of their workflow, which comes from the setup skill's conversation and" >&2
        echo "cannot be pre-answered. Run /setup-matt-pocock-skills attended, or answer github," >&2
        echo "gitlab or local." >&2
        exit 1
        ;;
      *) echo "GUIDE_TRACKER must be github, gitlab, local or other, got '$tracker'" >&2; exit 1 ;;
    esac
    case "$domain_layout" in
      single|multi) : ;;
      *) echo "GUIDE_DOMAIN_LAYOUT must be single or multi, got '$domain_layout'" >&2; exit 1 ;;
    esac
    case "$adr_dir" in
      /*|*..*|"") echo "GUIDE_ADR_DIR must be a project-relative directory without '..', got '$adr_dir'" >&2; exit 1 ;;
    esac
    echo "ok  setup runs now: tracker=$tracker, domain docs=$domain_layout (ADRs in $adr_dir/)"
    ;;
  *) echo "GUIDE_SETUP must be yes or no, got '$GUIDE_SETUP'" >&2; exit 1 ;;
esac
```

The agent does the skill's first half — explore, present, confirm — in the conversation, and this
step does its second half, the write, from the answers that conversation settled. The files it
writes are the skill's own seed templates, read out of the installed skill at run time, so a
renamed or restructured upstream skill fails here loudly instead of drifting.

```bash guide:exec id=setup-flow when=setup:yes
set -euo pipefail
: "${GUIDE_TRACKER:?Phase 4.5 must answer GUIDE_TRACKER when the setup flow runs}"
adr_dir=${GUIDE_ADR_DIR:-docs/adr}
adr_dir=${adr_dir%/}
domain_layout=${GUIDE_DOMAIN_LAYOUT:-single}

seeds=.agents/skills/setup-matt-pocock-skills
[ -d "$seeds" ] || { echo "$seeds is not installed; Phase 4 installs the skill set" >&2; exit 1; }

# Step 1 of the skill (explore), as the two facts this half of the flow needs: which file the
# brief goes into — the skill's own selection rule, CLAUDE.md first — and whether the label
# vocabulary is written at all (it is only written when the `triage` skill is installed).
if [ -f CLAUDE.md ]; then brief=CLAUDE.md; else brief=AGENTS.md; fi
[ -f "$brief" ] || {
  echo "neither CLAUDE.md nor AGENTS.md exists; the skill asks the user which one to create," >&2
  echo "and an unattended run cannot choose for them" >&2
  exit 1
}

case "$GUIDE_TRACKER" in
  github) tracker_seed=issue-tracker-github.md ;;
  gitlab) tracker_seed=issue-tracker-gitlab.md ;;
  local) tracker_seed=issue-tracker-local.md ;;
  *) echo "GUIDE_TRACKER must be github, gitlab or local; Phase 4.5 refuses 'other' because that file is written from the user's own paragraph" >&2; exit 1 ;;
esac
[ -f "$seeds/$tracker_seed" ] || {
  echo "the installed setup skill ships no $tracker_seed (upstream restructured the skill?)" >&2
  exit 1
}

triage=no
if [ -f .agents/skills/triage/SKILL.md ]; then triage=yes; fi

# Steps 2 and 3 of the skill (present and confirm), said out loud instead of asked again: this run
# already holds the answers the conversation would have produced.
if [ "$triage" = yes ]; then
  echo "setup: issue tracker = $GUIDE_TRACKER; triage labels = the canonical five; domain docs ="
else
  echo "setup: issue tracker = $GUIDE_TRACKER; no triage skill, so no label vocabulary; domain docs ="
fi
echo "setup: $domain_layout-context, ADRs in $adr_dir/; brief = $brief"

# Step 4 (write). The convention and the brief are composed first — everything that can fail on a
# seed's shape fails before the first project file is written — and the two files that are the
# skill's seeds verbatim are installed after. Those two are generated output: the skill regenerates
# them from its seeds (which is its own "re-run to switch issue trackers"), and a hand patch to one
# is silently dropped, which is why the trap that belongs with a tracker goes into the traps list
# (Phase 5, `notes-setup`) instead of into these files.
node --input-type=module - <<'NODE'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const tracker = process.env.GUIDE_TRACKER;
// Read the way the shell reads them (`${VAR:-default}`): an empty answer is an absent one, and
// `??` would take the empty string as a value and compose a convention with no directory at all.
const layout = process.env.GUIDE_DOMAIN_LAYOUT || "single";
const adrDir = (process.env.GUIDE_ADR_DIR || "docs/adr").replace(/\/+$/, "");
const briefPath = existsSync("CLAUDE.md") ? "CLAUDE.md" : "AGENTS.md";
const seedRoot = ".agents/skills/setup-matt-pocock-skills";
const triageInstalled = existsSync(".agents/skills/triage/SKILL.md");

function fail(message) {
  console.error(`setup-flow: ${message}`);
  process.exit(1);
}

mkdirSync("docs/agents", { recursive: true });

// --- the convention file: the skill's seed, with this repo's confirmed layout and ADR directory ---
const seed = readFileSync(`${seedRoot}/domain.md`, "utf8");
if (!seed.includes("docs/adr/")) {
  fail("the installed domain-doc seed no longer names docs/adr/, so the composition below needs re-reading");
}
const layoutLine =
  layout === "multi"
    ? "This repo is **multi-context**: a root `CONTEXT-MAP.md` points at one `CONTEXT.md` per context, and the repo's system-wide decisions live in the ADR directory below."
    : "This repo is **single-context**: one `CONTEXT.md` at the repo root, and this repo's decisions in the ADR directory below.";
const headingAt = seed.search(/\n## /);
if (headingAt < 0) fail("the installed domain-doc seed has no sections to insert the layout into");
const domain = seed.slice(0, headingAt) + `\n${layoutLine}\n` + seed.slice(headingAt).split("docs/adr/").join(`${adrDir}/`);
const domainPath = "docs/agents/domain.md";
const previous = existsSync(domainPath) ? readFileSync(domainPath, "utf8") : null;
if (previous === domain) {
  console.log(`ok  ${domainPath} already matches this run's answers; left as it is`);
} else {
  writeFileSync(domainPath, domain);
  console.log(
    previous === null
      ? `ok  wrote ${domainPath} (the skill's seed, ${layout}-context, ADRs in ${adrDir}/)`
      : `note: ${domainPath} existed and was regenerated from the skill's seed (${layout}-context, ADRs in ${adrDir}/)`,
  );
}

// --- the brief -----------------------------------------------------------------------------
const trackerSummary = {
  github: "Issues and specs for this project live as GitHub issues; read and write them with the `gh` CLI.",
  gitlab: "Issues and specs for this project live as GitLab issues; read and write them with the `glab` CLI.",
  local: "Issues live as **local markdown** files under `.scratch/<feature>/` in this repo.",
}[tracker];
const sections = [
  "## Agent skills",
  "",
  "### Issue tracker",
  "",
  `${trackerSummary} See \`docs/agents/issue-tracker.md\`.`,
];
if (triageInstalled) {
  sections.push(
    "",
    "### Triage labels",
    "",
    "The five canonical triage roles map to labels of the same names. See `docs/agents/triage-labels.md`.",
  );
}
sections.push(
  "",
  "### Domain docs",
  "",
  `${layout === "multi" ? "Multi-context" : "Single-context"}: this repo's decisions live in \`${adrDir}/\`. See \`docs/agents/domain.md\`.`,
);
const block = `${sections.join("\n")}\n`;

// In place when the file already has the block, appended when it does not — and never a second
// copy. Everything outside the block's own section is left exactly as it was.
const brief = readFileSync(briefPath, "utf8");
const existing = /^## Agent skills[ \t]*$/m.exec(brief);
let next;
if (!existing) {
  next = `${brief.replace(/\n*$/, "\n")}\n${block}`;
} else {
  const before = brief.slice(0, existing.index);
  const rest = brief.slice(existing.index + existing[0].length);
  const nextHeading = /^## /m.exec(rest);
  const after = nextHeading ? rest.slice(nextHeading.index) : "";
  next = `${before}${block}${after ? `\n${after}` : ""}`;
}
if (!next.includes("<!--VITE PLUS START-->")) fail("the tool-owned block in the brief is gone; it is not this flow's to rewrite");
if ((next.match(/^## Agent skills[ \t]*$/gm) ?? []).length !== 1) fail(`${briefPath} would end up with more than one ## Agent skills block`);
writeFileSync(briefPath, next);

console.log(`ok  the convention records ${layout}-context and ADRs in ${adrDir}/`);
console.log(`ok  ${briefPath}: the ## Agent skills block is in place, and the rest of the file is untouched`);
NODE

# The two files that are the skill's seeds verbatim, byte for byte — written only once everything
# above has succeeded, so a failure on a seed's shape leaves no half-written project behind.
install_from_seed() {
  if [ -e "$2" ] && cmp -s "$1" "$2"; then
    echo "ok  $2 already matches the skill's seed; left as it is"
    return 0
  fi
  if [ -e "$2" ]; then
    echo "note: $2 existed; regenerated from the skill's seed (a hand patch to a generated file does not survive that)"
  fi
  cp "$1" "$2"
  echo "ok  wrote $2 (the skill's seed)"
}

install_from_seed "$seeds/$tracker_seed" docs/agents/issue-tracker.md
if [ "$triage" = yes ]; then
  install_from_seed "$seeds/triage-labels.md" docs/agents/triage-labels.md
fi

grep -q '<!--VITE PLUS START-->' "$brief"
grep -q '### Domain docs' "$brief"
grep -q "docs/agents/domain.md" "$brief"
echo "ok  the brief points at the convention file it wrote"
```

## Phase 5 — Documents: constraints, reasons, traps, provenance

Four documents, each with one job:

- **`AGENTS.md`** — what to do. The generator's own marked block stays exactly as written,
  with one correction appended below it: `vp env doctor` exists only in the global CLI, which
  this project deliberately does not use. The rules that only one arrangement has are appended only
  in that arrangement: the frontend modes get the dev-proxy rules, the server modes the server ones,
  the SSR shape the rendering ones on top, and each workspace arrangement the workspace rules plus
  its own (the proxy's, in the package that owns the dev server; the root-as-application rules,
  where the root is one). Nothing describes a package or a file this project does not have.
- **the inherited ADRs** — why, and what would change the decision. They land in the directory this
  project's own convention names (Phase 4.5 wrote that convention when the setup flow ran, and the
  step below reads it back out); the guide's default, `docs/adr/`, applies when there is no
  convention to read.
- **`docs/agent-notes.md`** — what is already known to bite, as facts rather than rules, in the
  same shape: the traps every mode shares, plus the ones this mode's stack brings with it.
- **`docs/provenance.md`** — what was actually installed and chosen, so a future anomaly can
  be attributed to a version instead of guessed at.

The ADR landing point comes first, because the documents that point at it are written after it.

```bash guide:exec id=adr-convention
set -euo pipefail

# Where the inherited ADRs land is the project's decision, not this guide's. The setup flow records
# it in the convention file the project's own brief points at (`docs/agents/domain.md`), so this
# step reads that file — the same way an agent reading the project would — and writes down what it
# resolved. No convention (the setup flow was deferred, or the file names none) means the default,
# and the deferred case is recorded in the birth certificate precisely because it is an assumption
# rather than a decision.
node --input-type=module - <<'NODE'
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function fail(message) {
  console.error(`adr-convention: ${message}`);
  process.exit(1);
}

// The convention file the project's own brief names. The brief is whichever of CLAUDE.md/AGENTS.md
// the repo has, its `### Domain docs` section is where the file is named, and the setup flow's own
// path is the fallback when nothing names one.
function conventionFromBrief(brief) {
  const lines = readFileSync(brief, "utf8").split("\n");
  const at = lines.findIndex((line) => /^### Domain docs[ \t]*$/.test(line));
  if (at < 0) return null;
  const section = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    if (/^#{1,3} /.test(lines[i])) break;
    section.push(lines[i]);
  }
  const paths = (section.join("\n").match(/`[^`]+\.md`/g) ?? [])
    .map((token) => token.slice(1, -1))
    .filter((path) => path.includes("/"));
  return paths.length ? paths[paths.length - 1] : null;
}

let convention = null;
for (const brief of ["CLAUDE.md", "AGENTS.md"]) {
  if (!existsSync(brief)) continue;
  convention = conventionFromBrief(brief);
  if (convention) break;
}
convention ??= "docs/agents/domain.md";

// The convention shows this repo's layout as a directory tree, and the inherited (system-wide)
// decisions belong in the directory that tree gives for the numbered NNNN-*.md files. A tree line
// may carry an annotation after the path (`docs/adr/    ← system-wide decisions`) — the skill's own
// seed writes multi-context exactly that way — so only the first token of a line is the name. The
// directory holding the numbered files is the answer; a tree that shows the layout only as
// annotations, with no files beneath, answers with the annotated directory instead.
function adrDirFromConvention(text) {
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  let annotated = null;
  for (const block of text.matchAll(fence)) {
    const stack = [];
    for (const raw of block[1].split("\n")) {
      const match = /^([\s│├└─]*)(.*?)\s*$/.exec(raw);
      const rest = match[2];
      if (!rest) continue;
      const name = rest.split(/\s+/)[0];
      const annotation = rest.slice(name.length);
      const level = Math.floor(match[1].length / 4);
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].path : "";
      if (name === "/") { stack.push({ level, path: "" }); continue; }
      if (name.endsWith("/")) {
        const path = `${parent}${name.slice(0, -1)}`;
        stack.push({ level, path });
        if (annotated === null && /[←#]|\s--/.test(annotation)) annotated = path;
        continue;
      }
      if (/^\d{4}-.*\.md$/.test(name) && parent) return parent;
    }
  }
  return annotated;
}

let dir = "docs/adr";
let source = "the guide's default (no convention names one)";
if (existsSync(convention)) {
  const resolved = adrDirFromConvention(readFileSync(convention, "utf8"));
  if (resolved) {
    if (resolved.startsWith("/") || resolved.split("/").includes("..")) {
      fail(`${convention} names ${resolved}, which is not a directory inside this project`);
    }
    dir = resolved.replace(/\/+$/, "");
    source = `the project's convention, ${convention}`;
  } else {
    source = `the guide's default (${convention} names no ADR directory)`;
  }
} else {
  source = `the guide's default (${convention} does not exist: the setup flow was deferred)`;
}

writeFileSync(".vite-plus-adr-dir", `${dir}\n`);
writeFileSync(".vite-plus-adr-source", `${source}\n`);
console.log(`ok  the inherited ADRs land in ${dir}/ — ${source}`);
NODE
```

```bash guide:exec id=agents-md
set -euo pipefail

# The landing point the convention resolved: the constraints' closing line points at it, and this
# step runs before the ADRs are installed there.
adr_dir=$(cat .vite-plus-adr-dir)
[ -n "$adr_dir" ] || { echo "adr-convention resolved no landing point" >&2; exit 1; }

# The constraints section is appended, never merged: the marked block above it belongs to the
# tool and gets rewritten on upgrade, so anything written inside it would be silently lost.
cat >> AGENTS.md <<'AGENTS'

## Project constraints

Engineering rules for this project. They are not suggestions, and each one exists because the
alternative fails quietly.

### Toolchain

- The toolchain is **project-local**: `vite-plus` is a devDependency and every command is
  `./node_modules/.bin/vp …` or a package script. Never install Vite+ globally, and never run
  a bare `vp` from another project's toolchain.
- **Pin every version.** `latest` is not a version. Upgrade the toolchain with `vp migrate`,
  not with a package-manager update, and re-read `docs/provenance.md` afterwards.
- Read the documentation for the **installed** version — the provenance record says which one
  that is. Other versions' documentation describes other behaviour.
- Do not hand-write toolchain configuration: it is generated, and after any hand edit run
  `vp fmt` before trusting any other command's output.
- `vp env doctor` (mentioned in the tool's own instructions above) does **not** exist in a
  project-local setup. Use `vp --version` and `vp toolchain` instead.
- A green result has to be meaningful: a `vp check` without type-aware linting checks no
  types, and a `vp test` with no test files proves nothing. Fix the configuration, not the
  expectation.

### Path aliases

- Import cross-directory modules as `#/…` (extensionless), resolved from the **package** root: the
  project root in a single project, and each package's own root in a workspace — a file is reached
  as `#/<path-from-that-package's-root>`, and a package with no map simply has no aliases. The only
  alias mechanism is the `imports` map in that package's `package.json`. Never add `paths` to a
  tsconfig, `resolve.alias` to the Vite config, or `resolve.tsconfigPaths` — each one silently
  out-ranks `imports` for some consumer, so the type checker and the bundler can disagree without
  either going red.
- Keep the `types` branch first in that map: TypeScript never probes extensions, so a
  `default`-only map makes every aliased import a type error while dev and build stay green.

### Configuration

- Configuration must earn its place: delete what equals a default, keep what has an effect.
- Deleting configuration requires re-running the verification **and** re-proving that type
  checking still catches a deliberate error. "Looks like a default" is a hypothesis, not
  evidence.
AGENTS

# The mode-specific rules are appended as their own block: a frontend project has no server to
# describe and a backend project has no dev proxy, so each profile gets the rules that are true of
# it instead of the union of all of them. The layout is part of the case because a fullstack
# project has two shapes: SSR (server and page in one project) and split (server at the workspace
# root, page in apps/website) — the same mode, two different sets of truths.
case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single)
    cat >> AGENTS.md <<'FRONTEND'

### Development proxy

- `DEV_PROXY` lives in `.env` and is committed; personal overrides go in `.env.local` or
  `.env.development.local`. The one-line guard in `vite.config.ts` is deliberate: without it,
  a missing variable makes `/api/*` answer `200` with this app's HTML instead of failing.
- The proxy prefix is a regular expression and is written `/api/` with the trailing slash.
- Verification of the proxy means a request through the **frontend** port, asserting JSON —
  an HTML answer on an `/api` path is the failure mode, not a success.

### Tests

- This profile ships no test harness by decision: a page-iteration loop is faster without a
  suite that goes stale. Adding one is an explicit decision — say what it is for, and record
  the reason in an ADR.
FRONTEND
    ;;
  backend/single)
    cat >> AGENTS.md <<'BACKEND'

### Server

- The server is **Nitro v3 as a Vite plugin**, registered in the `plugins` array of
  `vite.config.ts`. An import without that call is silently inert: `vp check` still exits 0 and
  every route 404s.
- Routes are files under `server/routes/`, and their URL is the file path without any prefix.
  `server/api/` carries an `/api` prefix by default; do not move a route there unless that
  prefix is what you want.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already
  cover. A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check`
  fail on the build's own artefacts, because those commands take their file set from the ignore
  rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports,
  so an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro`
  itself is a devDependency, like the rest of the toolchain.

### Tests

- The runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files. That
  is the configured state, not coverage — a green test command means the runner works.
- Tests live in `tests/` at the project root, never under `server/`: Nitro compiles every file
  under `server/routes/` and `server/api/` into a route, so a test in there would be served
  rather than run.
BACKEND
    ;;
  fullstack/single)
    cat >> AGENTS.md <<'FULLSTACK'

### Server

- The server is **Nitro v3 as a Vite plugin**, registered inside the scaffold's `lazyPlugins`
  array in `vite.config.ts`: `plugins: lazyPlugins(() => [nitro(), react()])`. A second
  top-level `plugins` key is a duplicate object key — JS keeps one of them, and the plugin it
  drops is silently gone.
- The API is **same-origin**: routes live under `server/routes/api/`, which is why they answer
  `/api/…`. There is no `DEV_PROXY` and no proxy in this project — the page and the API are one
  origin, and a proxy here would be a second mechanism for a problem that does not exist.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already
  cover. A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check`
  fail on the build's own artefacts, because those commands take their file set from the ignore
  rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports,
  so an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro`
  itself is a devDependency, like the rest of the toolchain.

### Rendering (SSR)

- The page is rendered by `src/entry-server.tsx` and hydrated by `src/entry-client.tsx`; the two
  must render the same tree, because hydration compares the browser's tree with the server's.
- There is deliberately **no `index.html`**. Nitro uses that file as the renderer template, and
  the `<!--ssr-outlet-->` comment inside it is the only channel into the page: a template without
  the comment is still detected, still logged, and still answers `/` with the plain client shell
  at exit 0. Adding a template back re-introduces a silent failure whose only warning is the
  smoke test's missing render marker.
- The SSR entry default-exports an object with a `fetch` method — there is no `render()`
  contract — and the document it returns must carry the client's assets (`?assets=client` and
  `?assets=ssr`, merged), which is why `environments.client.build.rollupOptions.input` names
  `src/entry-client.tsx`: without it Vite has no client entry to build.
- The SSR entry is the catch-all: any path no route claims is rendered by it, including an
  unknown `/api/…` path. API routes still answer first.

### Tests

- The runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files. That
  is the configured state, not coverage — a green test command means the runner works.
- Tests live in `tests/` at the project root, never under `server/`: Nitro compiles every file
  under `server/routes/` and `server/api/` into a route, so a test in there would be served
  rather than run.
FULLSTACK
    ;;
  fullstack/monorepo)
    cat >> AGENTS.md <<'SPLIT'

### Workspace (monorepo)

- The workspace root is a package, and it owns the server: `defaultPackage: "."` in the root
  `vite.config.ts` is what lets `vp dev` and `vp build` act on it. Without it vp refuses at the
  root — ``error: `vp dev` at the workspace root needs a target package.``, exit 1 — and a
  command that "worked" elsewhere in the workspace silently does nothing here.
- `vp run -r <task>` is the cross-package form, and a package that does not define the task is
  **skipped silently** (exit 0). That is the contract, not an oversight: `apps/website` has no
  `check` and no `test` script, so those two tasks never run there. Selecting a package
  explicitly (`vp run -F <pkg> <task>`, `vp run -w <task>`) turns the missing task into an error
  instead, which is why orchestration uses `-r`.
- Every dependency version lives in the `catalog:` block of `pnpm-workspace.yaml`, and every
  package references it as `"<name>": "catalog:"`. A version literal in a `package.json` is a
  version nothing else shares; `vp install` is what turns the catalog into `node_modules`.
- Only `vp` commands, everywhere: `vp run -r …` across packages, `vp -C <pkg> …` for one package,
  `vp install` after a manifest change, `vp run <script>` for the root's scripts, and
  `vp add -w -D <name>` (root) or `vp -C <pkg> add -D <name>` (a package) to add a dependency —
  with `catalogMode: prefer` the version lands in the catalog and the manifest keeps `catalog:`.
  Do not reach for pnpm, npm, yarn or bun: one toolchain, one way to operate it.
- The commands that matter are registered in the root `package.json`: `vp run dev:server`,
  `vp run dev:website`, `vp run check`, `vp run test`, `vp run build`, `vp run ready`.
- `vp check` at the root covers **every** package, including `server/` and the app's `src/`;
  `vp run -r check` runs each package's own `check` script and skips the packages without one.
  `vp run -r test` would run the root's workspace-wide scan *and* each package's own test script —
  the same file twice — so the test command is `vp run test`.
- The root server does not serve the frontend's build: `apps/website/dist` is the app's own
  output, and production is a reverse proxy in front of the two.

### Server

- The server is **Nitro v3 as a Vite plugin** in the **root** `vite.config.ts`, called in the
  `plugins` array beside `defaultPackage: "."`. An import without that call is silently inert:
  `vp check` still exits 0 and every route 404s.
- Routes are files under `server/routes/`, and their URL is the file path with **no prefix**
  (`server/routes/hello.ts` → `/hello`). The `/api` prefix belongs to the frontend's dev proxy and
  to the production reverse proxy; the server never sees it, and `server/api/` — the directory
  that adds the prefix implicitly — is not used here.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already cover.
  A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check` fail on the
  build's own artefacts, because those commands take their file set from the ignore rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports, so
  an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro` is a
  devDependency of the root, like the rest of the toolchain.

### Development proxy (apps/website)

- The proxy lives in the frontend package: `apps/website/vite.config.ts` and
  `apps/website/.env` (committed; personal overrides go in `apps/website/.env.local`).
  `DEV_PROXY` names this workspace's own root server, and the two have to agree — a target on a
  port nothing listens on answers `502`, not this app's HTML.
- The one-line guard is deliberate and unconditional: without it a missing variable makes `/api/*`
  answer `200` with this app's HTML instead of failing. It must fire in every mode, which is why
  the variable lives in `.env` (loaded for a production build too) rather than
  `.env.development`.
- The proxy prefix is a regular expression and is written `/api/` with the trailing slash.
- Inside `/api/`, Vite's single-page fallback never applies: an unknown `/api/…` path is the
  server's `404`, a dead target a `502`. Outside `/api/`, an unknown path is this app's HTML —
  that difference is what the proxy is for, so a `200 text/html` on an `/api/` path is a failure
  signal, never a success.

### Tests

- Tests live in `tests/` at the workspace root — or a package's own `tests/` — and never under
  `server/`: Nitro compiles every file under `server/routes/` and `server/api/` into a route, so a
  test in there would be served instead of run.
- The root's runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files.
  That is the configured state, not coverage.
- The frontend app ships no test harness by decision — a page-iteration loop is faster without a
  suite that goes stale — and that is exactly the case `vp run -r` is built to skip.
SPLIT
    ;;
  backend/monorepo)
    cat >> AGENTS.md <<'BACKENDWORKSPACE'

### Workspace (monorepo)

- The workspace root is a package, and it owns the server: `defaultPackage: "."` in the root
  `vite.config.ts` is what lets `vp dev` and `vp build` act on it. Without it vp refuses at the
  root — ``error: `vp dev` at the workspace root needs a target package.``, exit 1.
- The root manifest registers the commands that matter: `vp run dev:server`, `vp run check`,
  `vp run test`, `vp run build`, `vp run ready`. There is no `dev:website`: this project has no
  frontend, and the app the template wrote was deleted during initialization.
- **No command may name a package by its task** (`"dev": "vp run website#dev"`). A script that names
  a package the workspace does not have exits 0 and runs nothing — the failure looks like success.
  The template's own `dev` script is that form and was replaced for exactly this reason.
- `vp run -r <task>` is the cross-package form, and a package that does not define the task is
  **skipped silently** (exit 0). That is the contract, not an oversight. Selecting a package
  explicitly (`vp run -F <pkg> <task>`, `vp run -w <task>`) turns the missing task into an error
  instead, which is why orchestration uses `-r`.
- Every dependency version lives in the `catalog:` block of `pnpm-workspace.yaml`, and every
  package references it as `"<name>": "catalog:"`. A version literal in a `package.json` is a
  version nothing else shares; `vp install` is what turns the catalog into `node_modules`.
- Only `vp` commands, everywhere: `vp run -r …` across packages, `vp -C <pkg> …` for one package,
  `vp install` after a manifest change, `vp run <script>` for the root's scripts, and
  `vp add -w -D <name>` (root) or `vp -C <pkg> add -D <name>` (a package) to add a dependency —
  with `catalogMode: prefer` the version lands in the catalog and the manifest keeps `catalog:`.
  Do not reach for pnpm, npm, yarn or bun: one toolchain, one way to operate it.
- `vp check` at the root covers **every** package, including `server/`; `vp run -r check` runs each
  package's own `check` script and skips the packages without one. `vp run -r test` would run the
  root's workspace-wide scan *and* each package's own test script — the same file twice — so the
  test command is `vp run test`.
- The workspace build is `vp run -r build`, and it includes the root: `dist/server/index.mjs` and
  `dist/nitro.json` come out of it. A build that schedules nothing means the root's build script is
  missing or was renamed.

### Server

- The server is **Nitro v3 as a Vite plugin** in the **root** `vite.config.ts`, called in the
  `plugins` array beside `defaultPackage: "."`. An import without that call is silently inert:
  `vp check` still exits 0 and every route 404s.
- Routes are files under `server/routes/`, and their URL is the file path with **no prefix**
  (`server/routes/hello.ts` → `/hello`). `server/api/` — the directory that adds the `/api` prefix
  implicitly — is not used here: this project has no frontend for a prefix to belong to.
- `nitro.config.ts` sets `output: { dir: "dist" }`, the directory the ignore rules already cover.
  A build that writes Nitro's default `.output/` instead makes `vp fmt` and `vp check` fail on the
  build's own artefacts, because those commands take their file set from the ignore rules.
- Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`): v3 has no auto-imports, so
  an undeclared global is a type error instead of a runtime surprise.
- The production artefact is the built bundle — `node dist/server/index.mjs` — and `nitro` is a
  devDependency of the root, like the rest of the toolchain.

### Tests

- Tests live in `tests/` at the workspace root — or a package's own `tests/` — and never under
  `server/`: Nitro compiles every file under `server/routes/` and `server/api/` into a route, so a
  test in there would be served instead of run.
- The root's runner is wired and empty: `vp test --passWithNoTests` exits 0 with no test files.
  That is the configured state, not coverage — a green test command means the runner works.
BACKENDWORKSPACE
    ;;
  frontend/monorepo)
    cat >> AGENTS.md <<'FRONTENDWORKSPACE'

### Workspace (monorepo)

- The workspace root is a shell: it owns the catalog of versions and the commands, and it is not an
  application. The application is `apps/website`, which has its own `dev`/`build`/`preview` scripts
  and its own tsconfig.
- The root manifest registers `vp run dev:website` (the app's dev server),
  `vp run check` (the workspace's static check) and `vp run ready` (`vp check && vp run -r build`).
  The workspace build is `vp run -r build`: the root defines no `build` task of its own, and the
  runner skipping it is the contract, not a failure.
- **No command may name a package by its task** (`"dev": "vp run website#dev"`). A script that names
  a package the workspace does not have exits 0 and runs nothing — the failure looks like success.
- `vp run -r <task>` is the cross-package form, and a package that does not define the task is
  **skipped silently** (exit 0). Selecting a package explicitly (`vp run -F <pkg> <task>`,
  `vp run -w <task>`) turns the missing task into an error instead, which is why orchestration uses
  `-r`.
- `vp check` at the root covers **every** package, including `apps/website/src` — the app has no
  `check` script of its own, so the root check is what type-checks it.
- Every dependency version lives in the `catalog:` block of `pnpm-workspace.yaml`, and every
  package references it as `"<name>": "catalog:"`. A version literal in a `package.json` is a
  version nothing else shares; `vp install` is what turns the catalog into `node_modules`.
- Only `vp` commands, everywhere: `vp run -r …` across packages, `vp -C <pkg> …` for one package,
  `vp install` after a manifest change, and `vp add -w -D <name>` (root) or
  `vp -C <pkg> add -D <name>` (a package) to add a dependency — with `catalogMode: prefer` the
  version lands in the catalog and the manifest keeps `catalog:`. Do not reach for pnpm, npm, yarn
  or bun: one toolchain, one way to operate it.

### Development proxy (apps/website)

- The proxy lives in the frontend package: `apps/website/vite.config.ts` and `apps/website/.env`
  (committed; personal overrides go in `apps/website/.env.local`). `DEV_PROXY` names a backend this
  project does not own — it was answered at initialization, and `http://127.0.0.1:3000` is the
  placeholder that was written when nothing better was known.
- The one-line guard is deliberate and unconditional: without it a missing variable makes `/api/*`
  answer `200` with this app's HTML instead of failing. It must fire in every mode, which is why
  the variable lives in `.env` (loaded for a production build too) rather than `.env.development`.
- The proxy prefix is a regular expression and is written `/api/` with the trailing slash.
- A target nothing listens on answers `502` — which is what the placeholder does until the real
  backend exists, and the loud half of pointing the proxy at the wrong address. A `200 text/html`
  on an `/api/` path means the proxy is not running at all.

### Tests

- The frontend app ships no test harness by decision: a page-iteration loop is faster without a
  suite that goes stale. Adding one is an explicit decision — say what it is for, and record the
  reason in an ADR.
- A package that does need tests keeps them in its own `tests/` with its own script;
  `vp run -r test` runs the packages that define one and skips the rest silently.
FRONTENDWORKSPACE
    ;;
esac

cat >> AGENTS.md <<'AGENTS'

### Code organisation

- Business code stays where it is used: one directory per feature — a page, in a frontend
  project — private until something else needs it. Shared code only when the deletion test
  (removing it scatters complexity back into N callers) or the cross-cutting test (auth, error
  contract, data access, telemetry, i18n) says it must exist.
- Dependencies point one way: features → shared. Shared code never imports a feature, and
  features never import each other.

### Defensive code

- Write a guard only for a state that has actually been observed and whose failure is silent.
  "It might happen" is not a reason; a loud failure for a state that cannot occur is noise.
AGENTS

# The closing line names the directory the convention actually resolved. It is printed here rather
# than shipped inside the heredoc above because that path is not known until the convention has
# been read, and a constraints document pointing at the wrong directory is worse than one pointing
# at none.
printf '\nSee `docs/agent-notes.md` for the traps behind these rules, and `%s/` for the reasoning.\n' "$adr_dir" >> AGENTS.md

grep -q '<!--VITE PLUS START-->' AGENTS.md
grep -q '## Project constraints' AGENTS.md
grep -qF "\`$adr_dir/\`" AGENTS.md
echo "ok  constraints section appended, tool-owned block preserved, ADR directory named as $adr_dir/"
```

The inherited ADRs are shipped as text below, into a staging directory, because their landing
point is the one `adr-convention` just resolved: `adr-land` installs them where that step said,
and stops rather than overwriting a document that is already there — a file at that path is
somebody's decision, not a place to write over.

```markdown guide:file path=.vite-plus-inherited-adrs/0001-toolchain.md
# The toolchain is project-local and pinned

Every project generated by this guide carries its own Vite+ toolchain as a devDependency, with
every version pinned, and resolves path aliases through a single mechanism. Nothing is
installed globally, so an initialized project cannot be changed by whatever toolchain the
machine happens to have, and a build three weeks from now resolves exactly what it resolved
today.

## Considered Options

- **A global `vp` install** — rejected: it mutates the machine and makes the project inherit
  an arbitrary version. Measured: a global 0.3.3 and a project-local 1.0.0-rc.0 behave
  differently on the same directory.
- **`latest` version ranges** — rejected: `latest` has resolved to prereleases and to older
  alphas, and the difference shows up as behaviour, not as an error.
- **Scaffolding with plain `create-vite` and writing the toolchain config by hand** —
  rejected: `create-vite` writes no `vite.config.ts`, so the config that makes the check
  type-aware would be hand-written, and its absence is silent — a green check that checks
  nothing.
- **`tsconfig` `paths` or a Vite `resolve.alias` for path aliases** — rejected: two mechanisms
  can point at two different files, and the type checker, the bundler and the shipped output
  each follow a different one without any of them failing.

## Consequences

- Bootstrap is ephemeral and explicit: `pnpm dlx --package=vite-plus@<version> vp create …`,
  and everything afterwards runs `./node_modules/.bin/vp`.
- The prerelease nature of the toolchain is disclosed at the version decision point and
  recorded in `docs/provenance.md`.
- `vp env doctor`, `vp upgrade` and `vp implode` are global-only subcommands and are therefore
  absent here; `vp migrate` is how the toolchain moves forward.
- Configuration is trimmed to what has an effect, and every removal is re-proved with a
  deliberate type error, because a check that no longer type-checks reports success.
```

```markdown guide:file path=.vite-plus-inherited-adrs/0002-code-locality.md
# Business code stays local; sharing has to earn its keep

Business code is written where it is used: each page or feature owns its implementation. A
shared module exists only after passing one of two tests — the deletion test (removing it
scatters complexity back across N callers, rather than making complexity vanish) or the
cross-cutting test (auth, the error contract, data access, telemetry and i18n must be
identical everywhere). We trade leverage for locality on purpose: in agent-driven iteration
the scarce resources are context and blast radius, duplication is cheap to consolidate once
real examples exist, and a premature abstraction built from two examples is expensive to undo.

## Considered Options

- **Extract on the second caller (DRY first)** — rejected: it optimises for a maintainer who
  already knows the codebase, at the cost of each page's independence, and freezes a guess the
  moment it has N callers.
- **No shared code at all** — rejected: cross-cutting concerns would be re-implemented per page
  and drift, so pages would disagree about 401 handling, error shape and telemetry — a
  correctness and security problem, not a style preference.

## Consequences

- A page can be changed or deleted without reading another page; the unit of change,
  knowledge and verification is one directory.
- The costs are accepted knowingly: real duplication, and no test-level enforcement — the
  static check cannot see code locality.
- The only machine-checkable half is dependency direction: pages may import shared code, never
  the reverse, and never each other.
- Architecture-level code is an explicit list, not a judgement call: routing and the app shell,
  the API client with its auth and error contract, telemetry, design primitives, API type
  contracts, and server framework plumbing.
```

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

```markdown guide:file path=.vite-plus-inherited-adrs/0004-ssr-shape.md when=mode:fullstack&layout:single
# The SSR shape renders the document on the server, and keeps no `index.html`

This project renders its page on the server: `src/entry-server.tsx` default-exports an object
with a `fetch` method that returns the whole document, `src/entry-client.tsx` hydrates the same
tree in the browser, and the API the page calls belongs to the same server — one origin, so there
is no dev proxy and no `DEV_PROXY`. The shape keeps **no `index.html`**: with no template, Nitro
installs its built-in renderer and passes the SSR entry's `Response` through, status, headers and
body included.

The alternative — keeping an `index.html` with an `<!--ssr-outlet-->` comment — was rejected
because its failure is silent. Nitro replaces that comment with the entry's output using a string
replace, so a template without the comment gets no insertion and no warning, while the entry is
still detected and announced: `/` answers the plain client shell and everything exits 0. Deleting
the template removes that class of error instead of guarding against it, and verification asserts
the rendered marker on top.

## Considered Options

- **`index.html` with `<!--ssr-outlet-->`** — rejected: it makes one comment the switch between a
  rendered page and a client-only shell, and the failure is silent. It is the right choice only
  when an existing `index.html` has to remain the source of truth.
- **A plain base with server-side string templating** — rejected: there is no component tree to
  render or hydrate, and the client module would replace the server's markup as soon as it runs.
- **A separate frontend and backend, joined by a proxy** — rejected: this project is one
  deployment; a proxy would exist only to undo a split it does not have.
- **Setting Vite's `build.outDir` as well** — rejected: the Nitro plugin already points the client
  build at its public directory, and a second output directory duplicates assets into a nested,
  publicly reachable tree.

## Consequences

- The client entry is named in `environments.client.build.rollupOptions.input`; with no template,
  that config is the only thing that says which file the browser entry is. The document is
  assembled from two asset lists — `?assets=client` and `?assets=ssr` — combined with `merge()`.
- The SSR entry is the catch-all: any path no route claims renders the same document, including
  an unknown `/api/…` path, while routes under `server/routes/api/` answer first.
- One TypeScript program covers both halves (`src/`, `server/`, `tests/` and the config files),
  because the build script's `tsc` only checks what the program includes.
- The build emits the client bundle in `dist/public/assets/` and the SSR renderer in
  `dist/server/_ssr/`; `_ssr/` exists only in this shape's build, and
  `node dist/server/index.mjs` serves both.
- Browser hydration itself is not verified here: verification asserts the server-rendered
  document, the render marker, and that the client bundle is emitted and referenced.
```

```markdown guide:file path=.vite-plus-inherited-adrs/0004-split-shape.md when=mode:fullstack&layout:monorepo
# The split shape keeps the server at the workspace root and the frontend beside it

This project is a pnpm workspace with two packages that deploy separately: the workspace root is
the server (Nitro v3 as a Vite plugin, `serverDir: "./server"`, production output in `dist/`,
routes whose URL is their file path with no `/api` prefix) and `apps/website` is the frontend (the
create-vite `vanilla-ts` app the monorepo template writes). The dev proxy in the frontend package
is the deliberate reproduction of the production edge: `/api/*` from the frontend's port is
forwarded to the root server with the prefix stripped, so the server sees `/hello`, exactly as it
will behind the reverse proxy that serves this shape in production.

The alternative shape for a fullstack project — server-side rendering in one project — is what the
`single` layout builds. This shape exists for the deployments where the two halves are separate
artifacts: two builds, two outputs, one API.

## Considered Options

- **One project, server-rendered (the SSR shape)** — rejected here: it is a different deployment.
  The two shapes are the `fullstack` mode's layout switch, not two implementations of one thing.
- **The root server serving `apps/website/dist`** — rejected: the halves build and deploy
  separately, and a server that also serves a stale copy of the frontend is a second, silently
  diverging delivery path. In production a reverse proxy in front of both owns that job.
- **Merging the server's and the app's TypeScript programs into one tsconfig** — rejected: the
  layout exists to keep the two packages apart; the root check still type-checks both, because
  `vp check` walks every package's own program. One merged program would erase the boundary and
  would have to grow an `include` list naming files in packages that own their own tsconfig.
- **Writing version literals in the package manifests** — rejected: `catalogMode: prefer` and the
  `catalog:` block are what the scaffold ships, and one version per dependency in one file is what
  keeps the root and its packages resolving the same thing.
- **A framework app in `apps/website`** — not this revision's work: the template writes the
  `vanilla-ts` app, and re-scaffolding it on another framework is a different decision with its own
  verification. The profile guard refuses the request before anything is written.
- **Deleting the scaffolded `packages/utils`** — a decision point, not a default: it is kept as the
  home for future shared code (with the library starter's publishing shape pruned) unless the
  answer is `no`, in which case the workspace is identical minus that package.
- **Using a package manager directly in the workspace** — rejected: one toolchain, one way to
  operate it. `vp install`, `vp run -r`, `vp -C` and `vp add` cover what `pnpm install`,
  `pnpm -r` and `pnpm --filter` would do here, and a project with two sets of commands is a
  project where the second set is the one that is wrong.

## Consequences

- The two halves are two dev servers on two ports (the root server keeps Nitro's `3000`, the app
  takes Vite's `5173`), started by the root scripts `dev:server` and `dev:website`.
- The root server is a workspace package that acts on itself: `defaultPackage: "."` in the root
  `vite.config.ts`, or vp refuses to run at the root (`needs a target package`, exit 1).
- `apps/website/.env` holds `DEV_PROXY` and is committed; the guard in
  `apps/website/vite.config.ts` makes a missing variable a stop instead of an HTML `200`, in every
  mode — which is why the variable is in `.env` and not `.env.development`.
- `apps/website` has no `check` and no `test` script and no `tests/` directory: a frontend page
  iteration loop is faster without a suite that goes stale. `vp run -r` skips a package without the
  task silently; the root's `vp check` still covers the app's sources, and `vp run ready` chains
  the workspace-wide check, tests and build.
- `vp run -r build` builds all three packages into their own `dist/` directories (the root's
  `dist/server/index.mjs` + `dist/nitro.json`, `apps/website/dist`, and the placeholder package's
  `packages/utils/dist` when it is kept).
- Production topology is out of scope, with one thing fixed by this shape: the edge strips the
  `/api` prefix before the server sees the path, and the dev proxy is measured to do the same.
```

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

```markdown guide:file path=.vite-plus-inherited-adrs/0004-frontend-workspace.md when=mode:frontend&layout:monorepo
# The frontend lives in a workspace whose root is a shell

This project is a pnpm workspace, and the application is the package the monorepo template wrote:
`apps/website`, a create-vite `vanilla-ts` app with its own `dev`/`build`/`preview` scripts and its
own tsconfig. The workspace root owns the catalog of versions and the commands that operate the
workspace; it is not an application itself, and nothing in this project compiles a server. The
frontend's backend is somewhere else — the dev proxy in `apps/website` names it and strips the `/api`
prefix exactly as the production edge does.

## Considered Options

- **The single layout** — the smaller frontend project, with the proxy at the root. Rejected here
  because a workspace was asked for: the point of the layout is that the next package (a shared UI
  package, a second app) can arrive as a package rather than as a restructure.
- **Keeping the placeholder `packages/utils`** — a decision, not a default: kept as the home for
  future shared code, or deleted. Both leave the workspace complete; the layout and the commands do
  not depend on it either way.
- **Putting the proxy in the root config** — rejected: `loadEnv(mode, process.cwd(), "")` reads the
  environment from the working directory, and the dev server this proxy belongs to is the app's. A
  proxy at the root would name the wrong directory and would never run.
- **A root `build` script of its own** — rejected: the root has nothing to build, and a script that
  delegates to the workspace run under the same name is self-referential. The workspace build is
  `vp run -r build`.
- **Serving the built app from a root dev server** — rejected: there is no root application to serve
  it, and adding one would be a server this project does not have.

## Consequences

- The commands that matter are registered at the root: `dev:website` (`vp -C apps/website dev`),
  `check` (`vp check`) and `ready` (`vp check && vp run -r build`). The workspace build is
  `vp run -r build`; the root is skipped there because it defines no build task — a skip that is the
  runner's contract, not a failure.
- `vp check` at the root walks every package, so it is the workspace's type check: the app's sources
  are covered by it even though the app has no `check` script of its own.
- Every dependency version lives in the workspace catalog and every manifest references it as
  `"catalog:"` — including `vite-proxy-from-env`, the app's dev-proxy transformer.
- `apps/website/.env` holds `DEV_PROXY` and is committed (only `*.local` is ignored). The guard in
  `apps/website/vite.config.ts` is unconditional and fires in every mode: a missing variable stops
  the dev server and a build, instead of answering `/api/*` with the app's HTML at exit 0.
- The app ships no test harness, by the same decision the single-layout frontend makes: page
  iteration is faster without a suite that goes stale. A package that needs tests has its own
  `tests/` and its own script; `vp run -r test` runs those.
- Production topology is out of scope, with one thing fixed: the edge strips the `/api` prefix
  before the backend sees the path, and the app's dev proxy is measured to do the same.
```

```bash guide:exec id=adr-land
set -euo pipefail

adr_dir=$(cat .vite-plus-adr-dir)
source=$(cat .vite-plus-adr-source)
stage=.vite-plus-inherited-adrs

[ -d "$stage" ] || { echo "the inherited ADRs are not staged in $stage" >&2; exit 1; }
[ -n "$adr_dir" ] || { echo "adr-convention resolved no landing point" >&2; exit 1; }
staged=$(find "$stage" -maxdepth 1 -name '*.md' | wc -l)
[ "$staged" -gt 0 ] || { echo "no inherited ADR is staged in $stage" >&2; exit 1; }

# Install, never overwrite: a document already at the landing point is somebody else's decision,
# and an inherited document is not allowed to replace one. This is the rule the setup flow follows
# for the brief as well — a file that already has a section is edited where it is.
mkdir -p "$adr_dir"
landed=0
for file in "$stage"/*.md; do
  name=$(basename "$file")
  if [ -e "$adr_dir/$name" ]; then
    echo "$adr_dir/$name already exists; the inherited ADRs never overwrite a document that is" >&2
    echo "already there — read it, keep whichever version is right, and re-run this step" >&2
    exit 1
  fi
  cp "$file" "$adr_dir/$name"
  # Prove the landing instead of trusting the copy: byte-identical, at the resolved directory.
  cmp -s "$file" "$adr_dir/$name" || { echo "$adr_dir/$name does not match the inherited document $file" >&2; exit 1; }
  landed=$((landed + 1))
done

# The staging directory goes: the documents live at the landing point, not in a scratch directory.
rm -rf "$stage"
echo "ok  $landed inherited ADRs installed in $adr_dir/ — $source"
```

```markdown guide:file path=docs/agent-notes.md
# Agent notes — known traps and version facts

Facts about this project's stack, recorded because each one has already cost someone time.
Rules live in `AGENTS.md`; the ADRs behind them live in the directory `docs/provenance.md`
records — shipped text cannot name a path this run decides.

## Two engines, one green light

- `vp check` type-checks with the TypeScript Go engine (`oxlint-tsgolint`), while the build
  script runs `tsc -b` — two different engines. A green `vp check` does not imply a green
  build, and vice versa, which is why verification runs both.
- `vp check` reports formatting problems *before* it reports lint or type problems, and stops
  there: a run that fails on formatting tells you nothing about types. Run `vp fmt` first.
- `vp check` only type-checks when `lint.options.typeAware` and `typeCheck` are both `true`
  in `vite.config.ts`. Without them it prints `pass` while checking nothing.

## Modules and aliases

- Path aliases are `package.json` `imports` only. If a `paths` block, `resolve.alias` or
  `resolve.tsconfigPaths` ever appears, the type checker and the bundler can resolve the same
  specifier to different files and nothing goes red.
- The `types` branch must be the first key of the `#/*` entry. TypeScript never probes
  extensions: with a `default`-only map, every extensionless `#/…` import is `TS2307` in the
  type checker while dev, tests and build keep working.
- `#/…` specifiers need Node >= 24.14.0. Plain `node` cannot execute an extensionless aliased
  import — only the bundler and the test runner can — so scripts run directly by Node use
  `#/path/file.ts`.

## Versions

- TypeScript is 7.x (`^7.0.2`); `tsc --version` prints `7.0.2`.
- If this project uses the TypeScript 6 API bridge (`typescript-native-bridge`, needed by
  `vue-tsc` and friends), `tsc --version` prints `6.0.3` while the package version carries
  `-bridge…`. Never assert the TypeScript version from that string; check the resolved package
  instead.
- `vite-plus` is a devDependency, never a global install. `vp env`, `vp upgrade` and
  `vp implode` do not exist in a project-local setup — the tool's own instructions suggest
  `vp env doctor`, which is one of them.

## Package managers

- The project declares its package manager in `devEngines`. Running another one inside the
  project fails with `EBADDEVENGINES` — including `npx` — so use the project's own manager
  (`pnpm dlx …`, `pnpm install`, `pnpm run …`).
- `pnpm install` under `CI=1` uses a frozen lockfile and fails when the manifest changed; pass
  `--no-frozen-lockfile` in that case.
- Do not move `vite-plus` with a package-manager update: an exact pin does not move, and the
  supported path is `vp migrate`.

## Skills and setup

- Skills install through the `skills` CLI with `--skill name1 name2` (a space). The
  `--skill=name` spelling is silently ignored by 1.7.0: it installs every skill in the source
  repository with exit 0. Exit codes lie here — verify the lockfile's name set instead.
- `skills-lock.json` records content hashes, not a commit. If you need to know which upstream
  revision is installed, compare the hashes or read the revision recorded in
  `docs/provenance.md`.
- `vp test` exits 1 when it finds no test files, which is why a project that has a test script
  passes `--passWithNoTests` until there is something to run. A green test command over an empty
  suite means the runner is wired, not that anything is covered.
```

```bash guide:exec id=notes-setup when=setup:yes
set -euo pipefail
: "${GUIDE_TRACKER:?Phase 4.5 must answer GUIDE_TRACKER when the setup flow runs}"

# The trap the chosen tracker brings, and only the chosen tracker's: a project tracked in GitHub
# reads blocking edges through the REST summary or a CLI field, never through the generated file's
# wording — that file is regenerated from the skill's seed and a hand patch to it is lost silently.
if [ "$GUIDE_TRACKER" = github ]; then
  cat >> docs/agent-notes.md <<'NOTES'

## The issue tracker (GitHub)

- Read blocking edges with `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary`
  (the REST summary: open blockers only) or `gh issue view <n> --json blockedBy`. The generated
  `docs/agents/issue-tracker.md` shows a REST field name that `gh issue view --json` rejects; do not
  patch that generated file — re-running the setup skill regenerates it from its seed, so the patch
  is silently dropped.
NOTES
  echo "ok  the GitHub tracker's blocking-edge trap is in docs/agent-notes.md"
else
  echo "ok  tracker is $GUIDE_TRACKER; no GitHub-specific trap belongs in docs/agent-notes.md"
fi
```

```bash guide:exec id=notes-proxy when=mode:frontend&layout:single
set -euo pipefail

# Traps that only exist in a project whose backend is somewhere else.
cat >> docs/agent-notes.md <<'NOTES'

## The development proxy

- `DEV_PROXY` is read from `.env` by `loadEnv(mode, process.cwd(), "")`, so it is visible to
  both `dev` and `build`. A `production`-mode build must not miss it: put the value in `.env`,
  and any personal override in `.env.local` or `.env.development.local` (both ignored).
- The guard `if (!env.DEV_PROXY) throw …` is deliberate and unconditional. Without it an unset
  variable makes `/api/*` return `200` with this app's HTML and the dev log stays silent.
- The proxy prefix is a regular expression: `/api/` with the trailing slash, or `/apix/…` gets
  proxied too.
- A dead backend produces `502`, and an unknown `/api/*` path produces `404` — never the
  single-page-app fallback. A `200` with `text/html` on an `/api` path means the proxy is not
  running.
- The proxy target has a placeholder (`http://127.0.0.1:3000`) because the backend may not exist
  yet. The placeholder is a starting point, not a working backend: until a real one answers there,
  every `/api/*` call is a `502`.
NOTES
echo "ok  dev-proxy traps appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-proxy-app when=mode:frontend&layout:monorepo
set -euo pipefail

# The dev-proxy traps of a frontend workspace: the same mechanism as a single project's, in the
# package that owns the dev server, against somebody else's backend.
cat >> docs/agent-notes.md <<'NOTES'

## The development proxy (apps/website)

- The proxy lives in the frontend package — `apps/website/vite.config.ts` and `apps/website/.env` —
  because `loadEnv(mode, process.cwd(), "")` reads the working directory, and the dev server this
  proxy belongs to runs there. The app's own `.gitignore` ignores only `*.local`, so the file is
  committed and a personal override goes in `apps/website/.env.local`.
- The guard `if (!env.DEV_PROXY) throw …` is deliberate and unconditional, and it fires in every
  mode: with the variable missing, `vp -C apps/website dev` stops with
  `Error: DEV_PROXY is not set — see .env` instead of serving `/api/*` as this app's HTML, and a
  build whose config cannot load fails too (which is why the variable sits in `.env`, not
  `.env.development`).
- `DEV_PROXY` names a backend this project does not own. It was answered at initialization and
  written down as `http://127.0.0.1:3000` when nothing better was known — a target nothing listens
  on answers `502`, never this app's HTML, so a stale placeholder is loud.
- The prefix is compiled as a regular expression, so `/api/` with the trailing slash is what keeps
  `/apix/…` out of the proxy.
- Inside `/api/`, Vite's single-page fallback never applies: an unknown `/api/…` path is the
  backend's `404`, and a dead target is a `502`. Outside `/api/`, an unknown path is this app's HTML
  `200` — so a `200 text/html` on an `/api/` path means the proxy is not running.
- The proxied path reaches the backend **without** the prefix, which is the whole point: the
  production edge strips the same prefix before it forwards, so a backend contract that expects
  `/api/…` on its own routes will look right in dev only until it is deployed.
NOTES
echo "ok  frontend-workspace proxy traps appended to docs/agent-notes.md"
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
  plugin is in play. Pass `--port` when the port matters.
- The production artefact is `node dist/server/index.mjs` (the `PORT` environment variable is
  honoured by the node-server preset); the Nitro CLI is not needed to run it.
- With the plugin wired, `vp test` ends with `close timed out after 10000ms … Tests closed
  successfully but something prevents 2 Vite servers from exiting`. It costs about ten seconds
  and exits 0 — a warning, not a failure.
NOTES
echo "ok  server traps appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-merged-tsconfig when=mode:backend|fullstack&layout:single
set -euo pipefail

# The trap that belongs to the shapes that merge the server into one TypeScript program.
cat >> docs/agent-notes.md <<'NOTES'

## One program, and who checks it

- The build script's `tsc` only checks what the tsconfig `include` lists. The config here
  extends `nitro/tsconfig` and lists the file set this shape needs; without `server` in that
  list, `tsc` passes while never looking at a handler.
NOTES
echo "ok  merged-program trap appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-workspace when=layout:monorepo
set -euo pipefail

# Traps that only exist because this project is a workspace — true of all three arrangements, so
# the ones that are about a root that *is* an app live in their own block below.
cat >> docs/agent-notes.md <<'NOTES'

## The workspace

- The workspace root is a package of the workspace, and that is what makes the root manifest the
  place the workspace's commands are registered. What those commands need from vp depends on whether
  the root is an application, which the arrangement's own note below covers.
- A root script that names a package by its task (`"dev": "vp run website#dev"`) is a **silent
  no-op** when that package does not exist: it exits 0 with `vp run: 0/0 cache hit` and runs
  nothing. Every root command names something the workspace actually has; a script left pointing at
  a package the layout deleted is worse than a broken command, because nothing goes red.
- `vp run -r <task>` skips a package that does not define the task: no warning, no mention,
  exit 0. `vp run -F <pkg> <task>` and `vp run -w <task>` are the opposite — the missing task is
  `error: Task "<task>" not found`, exit 1 — and a task no package defines is exit 1 as well.
- `vp check` at the root walks every package, so it is the workspace's type check;
  `vp run -r check` runs each package's own `check` script instead — and a package that defines
  none is skipped by that form, silently, by contract. The two forms are not interchangeable.
- `vp run -r test` runs the root's workspace-wide Vitest scan and then each package's own test
  script: the same test file runs twice, and nothing warns. A root whose test script is that scan
  calls `vp test` instead, and a workspace with no root test script at all has `vp run -r test` as
  the only form — which runs the packages that define one.
- `vp run -r check -v` fails: extra arguments after the task name are passed to the task
  (`error: Invalid vite task command`). Put the flag before the task — `vp run -r -v check`.
- A root script and a vite.config.ts task may not share a name; the collision
  (`Task … conflicts with a package.json script`) poisons every `vp run` in the workspace.
- The catalog is the only place a version lives, and `catalogMode: prefer` is what the scaffold
  set: adding a dependency with `vp add -w -D <name>` (or `vp -C <pkg> add -D <name>`) writes the
  version into the catalog and leaves `"<pkg>": "catalog:"` in the manifest. `pnpm install` is not
  the command here — `vp install` is, and it installs the workspace.
- `vp add -D <name>` at the root without `-w` is refused (`ERR_PNPM_ADDING_TO_ROOT`): the root
  package of a workspace has to be named explicitly.
- Task caching is per task input: `vp run -r build` replaying a cached build does not re-read
  the files that are not part of its inputs (`.env` included), so a config error can look green
  until `--no-cache`. When a result matters, re-run the task with `--no-cache`.
NOTES
echo "ok  workspace traps appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-workspace-root-server when=mode:backend|fullstack&layout:monorepo
set -euo pipefail

# The workspace traps that are only true when the root is the application: the server's program,
# and the guard the app commands hit.
cat >> docs/agent-notes.md <<'NOTES'

## The workspace root as an application

- `defaultPackage: "."` in the root `vite.config.ts` is what lets `vp dev` and `vp build` act on the
  root; the sign it applied is the `using . (defaultPackage in vite.config.ts)` note on the command
  that runs. Without it the failure is a hard stop (`needs a target package`, exit 1), not a wrong
  output.
- The root's TypeScript program is the scaffold's `tsconfig.json`, which has no `include` list and
  therefore covers every TypeScript file at the root — `server/`, `tests/`, `vite.config.ts` and
  `nitro.config.ts` alike. That is why no second, merged program is written here, and why a planted
  type error inside a route still turns `vp check` red.
- Deleting a package is not enough: every command that referred to it has to be re-pointed. A root
  script of the form `vp run <package>#<task>` exits 0 and does nothing once that package is gone —
  measured. The root manifest here registers `dev:server`, `check`, `test`, `build` and `ready`, and
  `ready` chains the workspace-wide check, tests and build.
NOTES
echo "ok  root-application workspace traps appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-proxy-split when=mode:fullstack&layout:monorepo
set -euo pipefail

# The dev-proxy traps of the split shape: the same mechanism as a pure frontend's, wired in a
# different package, against this workspace's own server.
cat >> docs/agent-notes.md <<'NOTES'

## The development proxy (apps/website)

- `DEV_PROXY` lives in `apps/website/.env` and is read by `loadEnv(mode, process.cwd(), "")`; the
  app's own `.gitignore` ignores only `*.local`, so the file is committed and a personal override
  goes in `apps/website/.env.local`. Root-relative paths matter here: the variable is read by the
  app's config, from the app's working directory.
- The guard `if (!env.DEV_PROXY) throw …` is deliberate and unconditional, and it fires in every
  mode: with the variable missing, `vp -C apps/website dev` stops with
  `Error: DEV_PROXY is not set — see .env` instead of serving `/api/*` as this app's HTML, and a
  build whose config cannot load fails too (which is why the variable sits in `.env`, not
  `.env.development`).
- The proxy target and the root server's port have to agree. They are separate settings — the
  port the server binds and the address in this file — and a mismatch is not silent: the proxy
  answers `502` and the dev log names the proxied path.
- The prefix is compiled as a regular expression, so `/api/` with the trailing slash is what
  keeps `/apix/…` out of the proxy.
- Inside `/api/`, Vite's single-page fallback never applies: an unknown `/api/…` path is the
  server's `404` (JSON, or Nitro's error page under a browser `Accept` header), and a dead target
  is a `502`. Outside `/api/`, an unknown path is the app's HTML `200` — so a `200 text/html` on
  an `/api/` path means the proxy is not running.
- The proxied path reaches the server **without** the prefix, which is the whole point: the root
  server's routes carry no `/api`, and the production reverse proxy is expected to strip the same
  prefix before it forwards. A route mounted under `server/api/` would answer `/hello` here and
  only look right behind a proxy that does not strip anything.
NOTES
echo "ok  split-shape proxy traps appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-backend when=mode:backend
set -euo pipefail

# The one trap that is only true of a project with no client at all.
cat >> docs/agent-notes.md <<'NOTES'

## No client

- There is no client build phase in this project (no `index.html`), and `/` answers `404`
  because nothing renders a page — that is the configured state, not a broken project.
NOTES
echo "ok  no-client trap appended to docs/agent-notes.md"
```

```bash guide:exec id=notes-ssr when=mode:fullstack&layout:single
set -euo pipefail

# Traps that only exist once the project renders a page on the server.
cat >> docs/agent-notes.md <<'NOTES'

## Rendering (SSR)

- There is no `index.html` on purpose. With no template, Nitro installs its built-in renderer at
  build time and the SSR entry's `Response` is passed through — status, headers and body. That
  shape's fingerprint in the output is `dist/server/_ssr/ssr.mjs` next to a
  `_chunks/ssr-renderer.mjs` chunk. A build that used a template emits neither: its server bundle
  carries an inlined `_chunks/renderer-template.mjs`, and the SSR service it built stays in
  `node_modules/.nitro/vite/services/ssr/`. The shape is therefore checkable at the artefact
  level, not only by looking at `/`.
- The template channel is a silent switch. If an `index.html` is present, Nitro uses it as the
  renderer template and replaces the `<!--ssr-outlet-->` comment in it with the SSR entry's
  output — a `String.replace`, so a template without the comment gets no insertion and no
  warning. The entry is still announced (``Using `src/entry-server.tsx` as vite ssr entry.``),
  `/` answers the plain client shell, and everything exits 0. The render marker
  (`<h1>SSR works</h1>` in the skeleton) is what notices that: a 200 is not evidence.
- The SSR entry's contract is `export default { fetch(request) }` — no `render()`, no h3 app, no
  `server.ts` entry. The service loader throws
  ``[nitro] Vite service "ssr" entry does not export a `fetch` handler.`` when the default
  export has no callable `fetch`.
- `environments.client.build.rollupOptions.input` must name `src/entry-client.tsx`: with no
  `index.html`, that config is the only thing that says which file is the client entry, and
  `?assets=client` would have nothing to describe without it. The `*?assets` module declarations
  ship with `nitro/vite/types`, which `nitro/vite` itself imports, so having `vite.config.ts` in
  the program is enough.
- The document is assembled from two asset lists — `?assets=client` (the browser entry and its
  CSS) and `?assets=ssr` (the CSS the server render itself pulled in) — combined with `merge()`.
  In dev the links point at source modules with `data-vite-dev-id`; in a build they are hashed
  `/assets/…` URLs.
- The SSR bundle lands in `dist/server/_ssr/ssr.mjs` and the client bundle in
  `dist/public/assets/`; `_ssr/` exists only in an SSR build, which is the cheap way to tell
  this shape's output from a client-only one. `node dist/server/index.mjs` serves both the
  document and the client's hashed assets on one port.
- One tsconfig covers both halves: it extends `nitro/tsconfig` and includes `src`, `server`,
  `tests` and the config files, with `tsBuildInfoFile` under `node_modules/.tmp/` so the build
  script's cache file stays out of the tree. The build script's `tsc` only checks what that
  program includes, so a config that dropped `server` would leave every handler unchecked while
  `vp build` stayed green.
- The SSR entry is the catch-all route: any path no route claims renders the same document —
  including an unknown `/api/…` path, which answers the page rather than a 404. Routes under
  `server/routes/api/` answer first, so a route that exists is never shadowed.
- `react(only-export-components)` warns on `export default {` in the SSR entry. It is a warning
  at exit 0, naming the export does not silence it, and the whole project should not be silenced
  for it — expected noise.
- Hydration is **not verified** in this project's verification: it asserts the server-rendered
  document, the render marker, that the client bundle is emitted, and that the document
  references it. What a browser does with that — mismatches, event handlers, HMR after
  hydration — needs a browser this project does not check with.
NOTES
echo "ok  SSR traps appended to docs/agent-notes.md"
```

```bash guide:exec id=provenance
set -euo pipefail
: "${GUIDE_MODE:?}"; : "${GUIDE_LAYOUT:?}"; : "${GUIDE_FRAMEWORK:?}"
: "${GUIDE_PM:?}"; : "${GUIDE_VP_VERSION:?}"; : "${GUIDE_TS_VERSION:?}"
: "${GUIDE_SKILLS_VERSION:?}"; : "${GUIDE_SETUP:?}"

# The landing point the convention resolved, and where that resolution came from: the birth
# certificate is the one document that says *why* the inherited ADRs are where they are, which is
# what makes moving them later (or leaving them) a decision instead of a guess.
adr_dir=$(cat .vite-plus-adr-dir)
adr_source=$(cat .vite-plus-adr-source)
[ -n "$adr_dir" ] || { echo "adr-convention resolved no landing point" >&2; exit 1; }

vite_plus_version=$(node -p 'require("./node_modules/vite-plus/package.json").version')
# In the monorepo layout TypeScript belongs to the packages that compile; the root's own program is
# type-checked by the toolchain's checker, and the root manifest has no typescript dependency to
# read a version from. Which package that is depends on the arrangement: the app in the shapes that
# have one, the placeholder package in a backend workspace that kept it — and a backend workspace
# that deleted the placeholder has no compiled package at all, which is a fact this record states
# rather than one it guesses at.
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  typescript_pin=$(grep -E '^[ \t]+typescript:' pnpm-workspace.yaml | head -1 | sed -E 's/^[ \t]+typescript:[ \t]*//')
  if [ -d apps/website/node_modules/typescript ]; then
    typescript_version=$(node -p 'require("./apps/website/node_modules/typescript/package.json").version')
  elif [ -d packages/utils/node_modules/typescript ]; then
    typescript_version=$(node -p 'require("./packages/utils/node_modules/typescript/package.json").version')
  else
    typescript_version="not installed in a package of this workspace (the root's program is checked by the toolchain)"
  fi
else
  typescript_version=$(node -p 'require("./node_modules/typescript/package.json").version')
  typescript_pin="$GUIDE_TS_VERSION"
fi
create_vite_version=$(grep -oE 'create-vite[ @]+[0-9]+\.[0-9]+\.[0-9]+' .vite-plus-create.log | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)
skills_commit=$(cat .vite-plus-skills-commit)
skill_count=$(node -p 'Object.keys(require("./skills-lock.json").skills).length')
installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Read with defaults: these answers belong to the monorepo layout, and this step runs in every
# profile — the extractor requires every `$GUIDE_…` a step names without a default to be answered,
# so a profile-specific answer is read here the same way GUIDE_NITRO_VERSION is below.
placeholder_answer=${GUIDE_PLACEHOLDER:-not applicable}
dev_port_answer=${GUIDE_DEV_PORT:-}

# What the record says depends on the profile: a backend project has a server and no proxy, a
# frontend project the other way round, the SSR shape has both halves in one origin, the split shape
# has both halves in two packages, a backend workspace has the server and no client package, and a
# frontend workspace has the app and no server. Naming another profile's fact here — a proxy target
# that does not exist, a frontend package that was deleted, or a server that was never installed —
# would put a wrong fact in the one document whose whole job is to be the record.
toolchain_rows="| vite-plus | ${vite_plus_version} | \`${GUIDE_VP_VERSION}\` (prerelease) |
| TypeScript | ${typescript_version} | \`${typescript_pin}\` |
| create-vite | ${create_vite_version:-see note below} | \`create-vite@latest\`, unpinnable upstream |"
if [ "$GUIDE_MODE" = "backend" ] || [ "$GUIDE_MODE" = "fullstack" ]; then
  nitro_version=$(node -p 'require("./node_modules/nitro/package.json").version')
  # The extractor's rule is that a `$GUIDE_…` without a default must be answered by every
  # profile, and this step runs in every profile; the answer is only needed in this branch, so it
  # is read into a local with a default and then required here.
  nitro_pin=${GUIDE_NITRO_VERSION:-}
  [ -n "$nitro_pin" ] || { echo "GUIDE_NITRO_VERSION was never answered (Phase 2)" >&2; exit 1; }
  toolchain_rows="${toolchain_rows}
| nitro | ${nitro_version} | \`${nitro_pin}\` (prerelease) |"
fi
scaffold_line="3. Skeleton: \`vp create vite:application\` + \`--template ${GUIDE_FRAMEWORK}\`, alias map, configuration trimmed, ignore rules refined, dependencies installed."
if [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "backend/single" ]; then  choice_rows="| Scaffold base | ${GUIDE_FRAMEWORK} (the client it writes is pruned in the same run: a backend project has no frontend) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease) |"
  server_step="4. Server: the scaffold's client pruned (\`src/\`, \`public/\`, \`index.html\`), \`nitro\` pinned and installed, \`serverDir: \"./server\"\` with \`output: { dir: \"dist\" }\` in \`nitro.config.ts\`, and \`nitro()\` registered in the \`plugins\` array of \`vite.config.ts\`."
  verify_step="8. Verification: format, static check with a live type checker, the build script with its output in \`dist/\`, and smoke tests of the dev server and of the built \`dist/server/index.mjs\`. Recorded ${installed_at}."
elif [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "fullstack/single" ]; then
  choice_rows="| Scaffold base | ${GUIDE_FRAMEWORK} |
| Rendering | SSR: the document is rendered by \`src/entry-server.tsx\` and hydrated by \`src/entry-client.tsx\` (there is no \`index.html\` template) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease) |
| API origin | same origin as the page (\`/api/…\`); no dev proxy, no \`.env\` |"
  server_step="4. SSR shape: \`index.html\` and the SPA entry deleted, \`src/entry-server.tsx\` + \`src/entry-client.tsx\` + \`src/App.tsx\` written, \`nitro\` pinned and installed, \`serverDir: \"./server\"\` with \`output: { dir: \"dist\" }\`, \`nitro()\` registered inside the scaffold's \`lazyPlugins\` array, and the client entry declared in the client environment. No dev proxy: the page and the API share one origin."
  verify_step="8. Verification: format, static check with a live type checker over both \`src/\` and \`server/\`, the build script with its client bundle in \`dist/public/assets\` and its SSR renderer in \`dist/server/_ssr\`, and smoke tests of the built \`dist/server/index.mjs\` and of the dev server, asserting the render marker and the same-origin \`/api/hello\`. Recorded ${installed_at}."
elif [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "fullstack/monorepo" ]; then
  choice_rows="| Scaffold template | \`vite:monorepo\` (the frontend app is create-vite's \`${GUIDE_FRAMEWORK}\` app in \`apps/website\`) |
| Placeholder package | ${placeholder_answer} (\`packages/utils\`) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease), at the workspace root |
| Frontend | \`apps/website\`, a separate build and a separate dev server |
| API origin | the frontend's own dev proxy (\`/api/\` → \`http://127.0.0.1:${dev_port_answer}\`, prefix stripped); production is a reverse proxy with the same rule |"
  scaffold_line="3. Skeleton: \`vp create vite:monorepo\`, the workspace catalog extended with \`nitro\` and every dependency spec pointed at \`catalog:\`, the root server and the app pruned and wired, dependencies installed with \`vp install\`."
  server_step="4. Split shape: the root's \`nitro.config.ts\` (\`serverDir: \"./server\"\`, \`output: { dir: \"dist\" }\`) and \`server/routes/hello.ts\`, \`nitro()\` in the root \`vite.config.ts\` beside \`defaultPackage: \".\"\`, the app pruned to a minimal page, and the app's own \`vite.config.ts\` + \`.env\` carrying the dev proxy with its guard. Root commands \`dev:server\`, \`dev:website\`, \`check\`, \`test\`, \`build\`, \`ready\`."
  verify_step="8. Verification: format, the workspace-wide static check (\`vp check\`) and \`vp run -r check\`, the workspace build (\`vp run -r build\`) with the root server's \`dist/server/index.mjs\` and the app's \`apps/website/dist\`, and smoke tests of the built server and of both dev servers, asserting the app's page, the same-origin \`/api/hello\` on the root port, and the proxied \`/api/hello\` from the app's port arriving as \`/hello\`. Recorded ${installed_at}."
elif [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "backend/monorepo" ]; then
  choice_rows="| Scaffold base | ${GUIDE_FRAMEWORK} (the app it writes is deleted in the same run: a backend project has no frontend) |
| Placeholder package | ${placeholder_answer} (\`packages/utils\`) |
| Server foundation | nitro@${nitro_version} — \`${nitro_pin}\` (prerelease), at the workspace root |"
  scaffold_line="3. Skeleton: \`vp create vite:monorepo\`, the workspace catalog extended with \`nitro\` and every dependency spec pointed at \`catalog:\`, the template's app deleted, the root server wired, dependencies installed with \`vp install\`."
  server_step="4. Backend workspace: the root's \`nitro.config.ts\` (\`serverDir: \"./server\"\`, \`output: { dir: \"dist\" }\`) and \`server/routes/hello.ts\`, \`nitro()\` in the root \`vite.config.ts\` beside \`defaultPackage: \".\"\`, and the root commands re-pointed — \`dev:server\`, \`check\`, \`test\`, \`build\`, \`ready\`, none of them naming the deleted package."
  verify_step="8. Verification: format, the workspace-wide static check (\`vp check\`) and \`vp run -r check\`, the workspace build (\`vp run -r build\`, which builds the root server) leaving \`dist/server/index.mjs\` with no \`.output/\`, and smoke tests of the built artefact and of the root dev server. Recorded ${installed_at}."
elif [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "frontend/monorepo" ]; then
  choice_rows="| Scaffold template | \`vite:monorepo\` (the app is create-vite's \`${GUIDE_FRAMEWORK}\` app in \`apps/website\`) |
| Placeholder package | ${placeholder_answer} (\`packages/utils\`) |
| Dev proxy target | \`${GUIDE_DEV_PROXY:-http://127.0.0.1:3000}\` (\`apps/website/.env\`; the \`/api/\` prefix is stripped) |
| Server | none: the backend is the address above, and this workspace has no server of its own |"
  scaffold_line="3. Skeleton: \`vp create vite:monorepo\`, the workspace catalog extended and every dependency spec pointed at \`catalog:\`, the app pruned and given its dev proxy, dependencies installed with \`vp install\`."
  server_step="4. Frontend workspace: no server in this project — the app under \`apps/website\` reaches the backend named by \`DEV_PROXY\` through the \`/api/\` proxy in \`apps/website/vite.config.ts\`, whose guard turns a missing variable into a stop instead of an HTML page. Root commands \`dev:website\`, \`check\`, \`ready\`."
  verify_step="8. Verification: format, the workspace-wide static check (\`vp check\`) and \`vp run -r check\`, the workspace build (\`vp run -r build\`) with the app's \`apps/website/dist\`, and a dev-server smoke test from the app's port asserting the app's page and the proxied \`/api/…\` route arriving at the backend without its prefix. Recorded ${installed_at}."
elif [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "frontend/single" ]; then
  choice_rows="| Framework template | ${GUIDE_FRAMEWORK} |
| Dev proxy target | ${GUIDE_DEV_PROXY:-http://127.0.0.1:3000} |"
  server_step="4. Dev proxy: \`DEV_PROXY\` in \`.env\`, transformer wired with a guard."
  verify_step="8. Verification: format, static check with a live type checker, build script, and a dev-server smoke test through the proxy. Recorded ${installed_at}."
else
  echo "no provenance branch is implemented for $GUIDE_MODE/$GUIDE_LAYOUT; stop and report" >&2
  exit 1
fi

# The setup decision point's record, and — in the deferred branch — the assumption it leaves
# behind. The paragraph is what makes the landing point above revisitable: it names the documents
# that carry the directory, so a project that adopts a convention later knows what to update.
# `$(cat …)` strips the trailing newline, so the template below keeps a blank line after
# `${assumptions}`: without it the last line of that paragraph is glued to the next heading, and a
# `##` that does not start a line is not a heading.
if [ "$GUIDE_SETUP" = yes ]; then
  setup_row="yes — the skill's flow ran, and the convention it wrote (Phase 4.5) named the landing point"
  assumptions=""
else
  setup_row="no — deferred to the user, so no convention was negotiated"
  assumptions=$(cat <<'ASSUMPTIONS'
## Assumptions worth revisiting

- **The skills setup was deferred** at Phase 4.5 (`GUIDE_SETUP=no`), so this project never
  negotiated its domain-doc convention and the inherited ADRs took the guide's default landing
  point — an assumption, not a decision. When a convention does arrive, run
  `/setup-matt-pocock-skills` (or write `docs/agents/domain.md` yourself) and move the ADRs to the
  directory it names; the three documents that carry the directory are `AGENTS.md` (the closing
  line of the constraints), `docs/agent-notes.md` (its header) and this file.

ASSUMPTIONS
)
fi

mkdir -p docs
cat > docs/provenance.md <<PROVENANCE
# Provenance — how this project was generated

One initialization, recorded so that a future anomaly can be attributed to a version or a
choice instead of guessed at. Versions here are the ones that actually resolved.

## Choices made at initialization

| Decision | Answer |
| --- | --- |
| Mode | ${GUIDE_MODE} |
| Layout | ${GUIDE_LAYOUT} |
${choice_rows}
| Package manager | ${GUIDE_PM} |
| Skills setup run now | ${setup_row} |
| Inherited ADR landing point | \`${adr_dir}/\` — ${adr_source} |

## Toolchain that resolved

| Component | Version | Pinned as |
| --- | --- | --- |
${toolchain_rows}

create-vite is the one unpinnable piece: \`vp create\` resolves it from \`create-vite@latest\`, and
upstream offers no way to pin it (the version this run used is recorded above when the package
manager printed it, which it only does on a fresh resolve).

Everything is a project dependency: no global CLI is required to build, check or run this
project. Read documentation for the versions above, not for \`latest\`.

## Agent skills

| Fact | Value |
| --- | --- |
| Source | \`mattpocock/skills\` (https://github.com/mattpocock/skills) |
| Revision at install time | \`${skills_commit}\` |
| Skills installed | ${skill_count} (the promoted set declared by the upstream plugin manifest) |
| Installer | \`skills@${GUIDE_SKILLS_VERSION}\` |
| Lockfile | \`skills-lock.json\` (content hashes; no revision recorded by the installer) |

The skill names are resolved from the upstream manifest at initialization time rather than
frozen in the guide, so an upstream rename or promotion is picked up instead of pinned.
Installed content lives in \`.agents/skills/\`.

## Steps executed

1. Preflight: empty target, Node version, package managers actually available, global Vite+ detected and avoided.
2. Decision points: mode/layout/framework/package manager; versions (prereleases disclosed).
${scaffold_line}
${server_step}
5. Skills: upstream set resolved at run time, installed, lockfile verified against that set.
6. Setup decision: recorded above.
7. Documents: constraints in \`AGENTS.md\`, inherited ADRs in \`${adr_dir}/\`, traps in \`docs/agent-notes.md\`, this file.
${verify_step}

${assumptions}

## If something looks wrong

Start here before changing code: the version table above is the shortest path to the right
documentation, and \`docs/agent-notes.md\` lists the failures that are known to be silent.
PROVENANCE

rm -f .vite-plus-create.log .vite-plus-skills.log .vite-plus-skill-names .vite-plus-skills-commit .vite-plus-adr-dir .vite-plus-adr-source
echo "ok  docs/provenance.md written"
```

## Phase 6 — Verify (the assertion set)

Run this as one script and stop if any part of it fails. A red result is a report, not a task
list: do not adjust the project until the verification agrees with it. This is the assertion
set for one initialization; the E2E harness runs this exact text rather than keeping its own
copy of these checks, because a second copy would be a second truth.

The proxy part of the frontend smoke test calls the backend named by `GUIDE_DEV_PROXY` (a pure
frontend) or this workspace's own root server (the split shape), so that backend has to be
reachable while this runs. If it is not, the proxy answers `502` and verification fails — which is
the correct outcome, not a reason to skip the check. The server-side smokes need nothing external:
they start the artefact the build just produced, then the dev server, and assert what each one
answers. In the SSR shape that assertion is the **render marker** — markup only the server-side
render can produce — because a `200` alone is exactly what the silent client-shell degradation
returns; in the split shape it is the **path the server received** — `/hello` rather than
`/api/hello` — because that is what "the prefix was stripped" means, and a proxy that forwards the
prefix unconsumed answers a 404 that looks like a missing route.

```bash guide:verify id=verify
set -euo pipefail
: "${GUIDE_MODE:?}"; : "${GUIDE_LAYOUT:?}"; : "${GUIDE_PM:?}"
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # A root server keeps Nitro's default port in this layout, and an app keeps Vite's.
  dev_port=${GUIDE_DEV_PORT:-3000}
else
  dev_port=${GUIDE_DEV_PORT:-5173}   # Vite's own default; override only to dodge a busy port
fi
# The smoke script reads the port from the environment, and the extractor's rule is that every
# `$GUIDE_…` named without a default has to have been answered — the port is an answer with a
# default, so it is read once here and used under a local name from there on.
GUIDE_DEV_PORT="$dev_port"
# Read into a local with a default: the app's port belongs to the monorepo layout, and this step
# runs in every profile, where the extractor requires every `$GUIDE_…` named without a default to
# have been answered.
website_port=${GUIDE_WEBSITE_PORT:-5173}
export GUIDE_DEV_PORT GUIDE_MODE GUIDE_LAYOUT

VP=./node_modules/.bin/vp
pm_run() {
  case "$GUIDE_PM" in
    pnpm) pnpm "$@" ;;
    npm) npm "$@" ;;
    yarn) yarn "$@" ;;
    bun) bun "$@" ;;
    *) echo "unsupported package manager: $GUIDE_PM" >&2; exit 1 ;;
  esac
}

step() { printf '\n== %s ==\n' "$*"; }

# An answer only one profile reads is checked in that profile: the frontend smokes go through a
# proxy to a backend this project does not own, the split shape's page and API are two servers, and
# the server smokes call their own server on one port. The proxy target is read with the placeholder
# default, because the answer is allowed to be the placeholder.
case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single|frontend/monorepo)
    GUIDE_DEV_PROXY=${GUIDE_DEV_PROXY:-http://127.0.0.1:3000}
    [ -n "${GUIDE_PROXY_SMOKE_PATH:-}" ] || { echo "GUIDE_PROXY_SMOKE_PATH was never answered (Phase 3.5)" >&2; exit 1; }
    export GUIDE_DEV_PROXY GUIDE_PROXY_SMOKE_PATH
    ;;
  backend/single|backend/monorepo|fullstack/single|fullstack/monorepo) ;;
  *) echo "no verification is implemented for profile '$GUIDE_MODE/$GUIDE_LAYOUT'" >&2; exit 1 ;;
esac

step "format"
$VP fmt

step "static check (format + lint + types)"
# At the workspace root this is the workspace's static check: `vp check` walks every package, and
# the controls that proved it were run in Phase 3.
$VP check

step "the workspace form of the static check, and what it skips"
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # `vp run -r check` runs each package's own `check` script. apps/website has none — create-vite
  # writes a dev/build/preview app — so it is skipped silently, by contract. That skip is not
  # invisible: the task summary of `-v` lists every scheduled task, so its absence from that list
  # is the assertion. (`-v` goes before the task name; after it, the flag is forwarded to the task
  # and vp fails.)
  $VP run -r -v check > .vite-plus-check-all.log 2>&1 || {
    cat .vite-plus-check-all.log >&2
    echo "vp run -r check failed" >&2
    exit 1
  }
  grep -q '#check' .vite-plus-check-all.log || {
    echo "vp run -r check scheduled no check task at all" >&2
    exit 1
  }
  if grep -q 'apps/website' .vite-plus-check-all.log; then
    cat .vite-plus-check-all.log >&2
    echo "vp run -r check scheduled apps/website, which has no check script" >&2
    exit 1
  fi
  rm -f .vite-plus-check-all.log
  if [ "$GUIDE_MODE" = frontend ] || [ "$GUIDE_MODE" = fullstack ]; then
    echo "ok  vp run -r check ran the packages that define a check script and skipped apps/website"
  else
    echo "ok  vp run -r check ran the packages that define a check script"
  fi
else
  echo "single project: the vp check above is the whole check"
fi

step "build (the project's own build script)"
if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # One command, every package: the root server, the app, and the placeholder package each build
  # into their own dist/. This is the workspace form of the build script, and the reason the
  # packages do not each need to be remembered. `--no-cache` because a task runner replays what it
  # has already built, and a verification step has to make the build happen rather than trust a
  # cache entry.
  $VP run --no-cache -r build
else
  pm_run run build
fi

step "the build output is where it belongs"
case "$GUIDE_MODE/$GUIDE_LAYOUT" in
  frontend/single)
    [ -f dist/index.html ] || { echo "the build produced no dist/index.html" >&2; exit 1; }
    echo "ok  dist/index.html"
    ;;
  backend/single)
    [ -f dist/server/index.mjs ] || { echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/, and the ignore rules do not cover it" >&2; exit 1; }
    echo "ok  dist/server/index.mjs and dist/nitro.json, with no .output/ beside them"
    ;;
  fullstack/single)
    # Both halves have to be in the output: the client bundle the document references, and the SSR
    # renderer the server bundle loads. `_ssr/` exists only in an SSR build — a client-only build
    # leaves it out even when everything else about the server looks right.
    [ -f dist/server/index.mjs ] || { echo "the build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the build produced no dist/nitro.json" >&2; exit 1; }
    [ -f dist/server/_ssr/ssr.mjs ] || { echo "the build produced no SSR renderer (dist/server/_ssr/ssr.mjs) — this is a client-only build" >&2; exit 1; }
    [ -n "$(ls dist/public/assets/*.js 2>/dev/null)" ] || { echo "the build produced no client bundle under dist/public/assets" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/, and the ignore rules do not cover it" >&2; exit 1; }
    echo "ok  client bundle in dist/public/assets, the SSR renderer in dist/server/_ssr, no .output/ beside them"
    ;;
  fullstack/monorepo)
    # Three packages, three outputs, and the root's output is the server's. The app's build is
    # asserted here too: the workspace build is one command, so "it passed" has to mean every
    # package produced what it is for.
    [ -f dist/server/index.mjs ] || { echo "the root build produced no dist/server/index.mjs — the nitro plugin did not run" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the root build produced no dist/nitro.json" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/ at the root; output.dir did not take effect" >&2; exit 1; }
    [ -f apps/website/dist/index.html ] || { echo "the app build produced no apps/website/dist/index.html" >&2; exit 1; }
    if [ "${GUIDE_PLACEHOLDER:-}" = yes ]; then
      [ -f packages/utils/dist/index.mjs ] || { echo "the placeholder package build produced no packages/utils/dist/index.mjs" >&2; exit 1; }
      echo "ok  root dist/server/index.mjs + dist/nitro.json, apps/website/dist, packages/utils/dist, no .output/"
    else
      echo "ok  root dist/server/index.mjs + dist/nitro.json, apps/website/dist, no .output/"
    fi
    ;;
  backend/monorepo)
    # One package that matters — the root, whose output is the server's — and one that may exist.
    # The workspace build is one command, so "it passed" has to mean the root produced its artefact:
    # a root build task that is missing or was left pointing at the deleted app builds nothing.
    [ -f dist/server/index.mjs ] || { echo "the workspace build produced no dist/server/index.mjs — the root's build is not covering the server" >&2; exit 1; }
    [ -f dist/nitro.json ] || { echo "the workspace build produced no dist/nitro.json" >&2; exit 1; }
    [ ! -e .output ] || { echo "the build also wrote .output/ at the root; output.dir did not take effect" >&2; exit 1; }
    [ ! -e apps ] || { echo "a backend workspace has no client, and apps/ exists" >&2; exit 1; }
    if [ "${GUIDE_PLACEHOLDER:-}" = yes ]; then
      [ -f packages/utils/dist/index.mjs ] || { echo "the placeholder package build produced no packages/utils/dist/index.mjs" >&2; exit 1; }
      echo "ok  root dist/server/index.mjs + dist/nitro.json, packages/utils/dist, no .output/, no apps/"
    else
      echo "ok  root dist/server/index.mjs + dist/nitro.json, no .output/, no apps/"
    fi
    ;;
  frontend/monorepo)
    # The app is the only artefact that matters, and there is no server anywhere in this workspace:
    # a `dist/server/index.mjs` at the root would mean the layout grew a server the mode did not ask
    # for.
    [ -f apps/website/dist/index.html ] || { echo "the app build produced no apps/website/dist/index.html" >&2; exit 1; }
    [ ! -e dist/server/index.mjs ] || { echo "this workspace has no server, but the root built one" >&2; exit 1; }
    if [ "${GUIDE_PLACEHOLDER:-}" = yes ]; then
      [ -f packages/utils/dist/index.mjs ] || { echo "the placeholder package build produced no packages/utils/dist/index.mjs" >&2; exit 1; }
      echo "ok  apps/website/dist, packages/utils/dist, no root server output"
    else
      echo "ok  apps/website/dist, no root server output"
    fi
    ;;
esac

step "static check after the build"
# `vp fmt` and `vp check` take their file set from the ignore rules, so this second check is also
# the assertion that the build output really landed somewhere ignored — which in this layout means
# the root's `dist/`, the app's `apps/website/dist` and the placeholder's `packages/utils/dist`
# alike.
$VP check

step "tests"
if node -e 'process.exit(require("./package.json").scripts?.test ? 0 : 1)'; then
  if [ "$GUIDE_LAYOUT" = monorepo ]; then
    # The root's test script scans the workspace, so this runs every package's tests once. The `-r`
    # form would run the root's scan *and* each package's own test script — the same file twice.
    $VP run test
  else
    pm_run run test
  fi
else
  echo "no test script in this profile - nothing to run"
fi

step "smoke: the server that was built, and the dev server"

prod_pid=""
dev_pid=""
website_pid=""
cleanup() {
  if [ -n "$prod_pid" ]; then kill "$prod_pid" 2>/dev/null || true; wait "$prod_pid" 2>/dev/null || true; fi
  if [ -n "$dev_pid" ]; then kill "$dev_pid" 2>/dev/null || true; wait "$dev_pid" 2>/dev/null || true; fi
  if [ -n "$website_pid" ]; then kill "$website_pid" 2>/dev/null || true; wait "$website_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT

wait_ready() {  # wait_ready <url> <log>
  for _ in $(seq 150); do
    if node -e "fetch('$1').then(() => process.exit(0)).catch(() => process.exit(1))" 2>/dev/null; then
      return 0
    fi
    sleep 0.4
  done
  echo "nothing answered at $1" >&2
  tail -20 "$2" >&2
  return 1
}

smoke() {  # smoke <base-url> <description-of-the-server> [frontend-url]
  BASE_URL="$1" WHAT="$2" WEBSITE_URL="${3:-}" node --input-type=module - <<'NODE'
const base = process.env.BASE_URL;
const website = process.env.WEBSITE_URL;
const what = process.env.WHAT;
const path = process.env.GUIDE_PROXY_SMOKE_PATH ?? "";
const failures = [];
const get = async (url) => {
  const response = await fetch(url);
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
};

// The app answers its own page, and the page loads this project's entry module. A browser is not
// part of this verification, so the marker cannot be read from the served HTML (the module injects
// it when it runs) — it is read from the module the document names, which is the same "the server
// serves what it points at" claim the SSR shape's smoke makes. Every script the document asks for
// is followed, because the dev server injects its own client module ahead of the app's entry.
async function checkApp(url, marker) {
  const page = await get(`${url}/`);
  if (page.status !== 200 || !page.type.includes("text/html")) {
    failures.push(`the app at / answered ${page.status} ${page.type}, expected 200 text/html`);
    return;
  }
  const scripts = [...page.body.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  if (scripts.length === 0) {
    failures.push("the app's document has no module entry to load");
    return;
  }
  let found = "";
  const broken = [];
  for (const src of scripts) {
    const module = await get(new URL(src, url).href);
    if (module.status !== 200 || !module.type.includes("javascript")) {
      broken.push(`${src} (${module.status} ${module.type})`);
    } else if (module.body.includes(marker)) {
      found = src;
    }
  }
  if (!found) {
    failures.push(
      broken.length
        ? `the app's scripts do not all load: ${broken.join(", ")}`
        : `none of the app's scripts (${scripts.join(", ")}) carries the page marker — this is not the page the skeleton wrote`,
    );
  }
}

if (process.env.GUIDE_MODE === "frontend") {
  // The app is whatever the dev server of this shape serves: the project itself in the single
  // layout, the app package in the workspace layout.
  const appUrl = website || base;
  if (process.env.GUIDE_LAYOUT === "monorepo") {
    // The workspace arrangement's app is the one this guide pruned and wrote a marker into, so the
    // marker is what proves the page is that page.
    await checkApp(appUrl, "Frontend works");
  } else {
    // A single frontend keeps the app its scaffold wrote; the claim here is that its dev server
    // serves a document, and the marker belongs to the page this guide writes.
    const page = await get(`${appUrl}/`);
    if (page.status !== 200 || !page.type.includes("text/html")) {
      failures.push(`the app at / answered ${page.status} ${page.type}, expected 200 text/html`);
    }
  }

  // The whole point of the proxy: the backend sees the path WITHOUT the /api prefix. A proxy
  // that forwards the prefix unconsumed answers 404 here, and a missing proxy answers 200 with
  // this app's HTML - so require JSON and require the route to exist behind the prefix.
  const proxied = await get(`${appUrl}/api${path}`);
  if (proxied.status !== 200 || !proxied.type.includes("application/json")) {
    failures.push(`/api${path} answered ${proxied.status} ${proxied.type}, expected 200 application/json from the backend`);
  } else if (!proxied.body.includes(path)) {
    failures.push(`/api${path} did not reach the backend as ${path}: ${proxied.body.slice(0, 160)}`);
  }

  const unknown = await get(`${appUrl}/api/definitely-not-a-route`);
  if (unknown.status !== 404 || unknown.type.includes("text/html")) {
    failures.push(`an unknown /api path answered ${unknown.status} ${unknown.type}, expected 404 rather than the app's HTML`);
  }

  // Outside /api/, the app's own fallback answers — that contrast is what makes the check above
  // meaningful rather than incidental.
  if (process.env.GUIDE_LAYOUT === "monorepo") {
    const outside = await get(`${appUrl}/definitely-not-a-route`);
    if (outside.status !== 200 || !outside.type.includes("text/html")) {
      failures.push(`an unknown non-/api path answered ${outside.status} ${outside.type}, expected the app's HTML fallback`);
    }
  }
} else if (process.env.GUIDE_MODE === "fullstack" && process.env.GUIDE_LAYOUT === "monorepo") {
  // The split shape on its own server (no frontend URL given): the routes carry no /api prefix,
  // and the server answers JSON because no page is rendered in this package.
  const direct = await get(`${base}/hello`);
  if (direct.status !== 200 || !direct.type.includes("application/json")) {
    failures.push(`/hello answered ${direct.status} ${direct.type}, expected 200 application/json from the handler`);
  } else {
    let payload;
    try {
      payload = JSON.parse(direct.body);
    } catch {
      failures.push(`/hello did not answer JSON: ${direct.body.slice(0, 160)}`);
    }
    // The handler reports the path it received. On this server it must be /hello: the prefix
    // belongs to the proxy in front of it, and a route mounted under server/api/ would answer
    // /api/hello here instead.
    if (payload && payload.serverSawPath !== "/hello") {
      failures.push(`the server received ${JSON.stringify(payload.serverSawPath)}, expected /hello — this route carries no /api prefix`);
    }
  }

  const prefixed = await get(`${base}/api/hello`);
  if (prefixed.status !== 404) {
    failures.push(`/api/hello answered ${prefixed.status} on the server itself; its routes carry no /api prefix`);
  }

  if (!website) {
    // The built artefact and the dev server are the same server here; the app's half of the smoke
    // is the run with the frontend URL.
  } else {
    await checkApp(website, "Split works");

    // The whole point of the proxy chain: a request to the *frontend's* port on /api/* is answered
    // by the workspace root server as /hello. A missing proxy answers 200 with this app's HTML, a
    // proxy that forwards the prefix unconsumed answers 404, and a dead target answers 502 — so
    // require JSON, and require the server to report the stripped path.
    const proxied = await get(`${website}/api/hello`);
    if (proxied.status !== 200 || !proxied.type.includes("application/json")) {
      failures.push(
        `${website}/api/hello answered ${proxied.status} ${proxied.type}, expected 200 application/json from the workspace root server`,
      );
    } else {
      let payload;
      try {
        payload = JSON.parse(proxied.body);
      } catch {
        failures.push(`${website}/api/hello did not answer JSON: ${proxied.body.slice(0, 160)}`);
      }
      if (payload && payload.serverSawPath !== "/hello") {
        failures.push(
          `through the proxy the server received ${JSON.stringify(payload.serverSawPath)}, expected /hello — the /api/ prefix was not stripped`,
        );
      }
      if (payload && !String(payload.serverSawHost ?? "").includes(String(process.env.GUIDE_DEV_PORT))) {
        failures.push(
          `through the proxy the server reported host ${JSON.stringify(payload.serverSawHost)}, expected the root server on port ${process.env.GUIDE_DEV_PORT}`,
        );
      }
    }

    // Inside /api/, Vite's single-page fallback must not apply: an unknown path is the server's
    // 404, not this app's HTML.
    const unknownApi = await get(`${website}/api/definitely-not-a-route`);
    if (unknownApi.status !== 404 || unknownApi.type.includes("text/html")) {
      failures.push(
        `an unknown /api/ path through the proxy answered ${unknownApi.status} ${unknownApi.type}, expected 404 rather than the app's HTML`,
      );
    }

    // Outside /api/, the app's own fallback answers — that contrast is what makes the check above
    // meaningful rather than incidental.
    const unknown = await get(`${website}/definitely-not-a-route`);
    if (unknown.status !== 200 || !unknown.type.includes("text/html")) {
      failures.push(`an unknown non-/api path answered ${unknown.status} ${unknown.type}, expected the app's HTML fallback`);
    }
  }
} else if (process.env.GUIDE_MODE === "fullstack") {
  // The render marker is the assertion, not the status code: a client-only shell answers 200
  // text/html with an empty #root and never contains this markup, which is exactly the
  // degradation the shape exists to make impossible. An HTML answer without it is a failure even
  // though it is a 200.
  const marker = "<h1>SSR works</h1>";
  const page = await get(`${base}/`);
  if (page.status !== 200 || !page.type.includes("text/html") || !page.body.includes(marker)) {
    failures.push(
      `the render marker ${marker} was not in the response from /: got ${page.status} ${page.type} (${page.body.length} bytes) — an empty #root or a client-only shell looks exactly like this`,
    );
  } else {
    // The document has to reference the client entry, and the server has to serve what it
    // references: "a bundle exists on disk" and "the page can hydrate from this URL" are two
    // different claims, and this one is the second.
    const entry = /<script[^>]+src="([^"]+)"/.exec(page.body);
    if (!entry) {
      failures.push("the rendered document has no client script to hydrate from");
    } else {
      const asset = await get(new URL(entry[1], base).href);
      if (asset.status !== 200 || !asset.type.includes("javascript")) {
        failures.push(
          `the document's client entry ${entry[1]} answered ${asset.status} ${asset.type}, expected 200 and a javascript type`,
        );
      }
    }
  }

  // Same port, same origin: the API is this project's own server, not a proxy in front of one.
  const api = await get(`${base}/api/hello`);
  if (api.status !== 200 || !api.type.includes("application/json")) {
    failures.push(`/api/hello answered ${api.status} ${api.type}, expected 200 application/json from the handler`);
  } else if (!api.body.includes("hello")) {
    failures.push(`/api/hello did not answer with the handler's payload: ${api.body.slice(0, 160)}`);
  }
} else {
  // The backend serves its own routes and none of them carries an /api prefix - that prefix is
  // what the frontend modes' proxy strips. A 200 on /api/hello would mean the route is mounted
  // somewhere other than where this guide says, and an HTML answer would mean something is
  // rendering a page in a project that has no client.
  const served = await get(`${base}/hello`);
  if (served.status !== 200 || !served.type.includes("application/json")) {
    failures.push(`/hello answered ${served.status} ${served.type}, expected 200 application/json from the handler`);
  } else if (!served.body.includes("hello")) {
    failures.push(`/hello did not answer with the handler's payload: ${served.body.slice(0, 160)}`);
  }

  const prefixed = await get(`${base}/api/hello`);
  if (prefixed.status !== 404) {
    failures.push(`/api/hello answered ${prefixed.status}; this project's routes carry no /api prefix`);
  }

  const unknown = await get(`${base}/nope`);
  if (unknown.status !== 404 || unknown.type.includes("text/html")) {
    failures.push(`an unknown path answered ${unknown.status} ${unknown.type}, expected 404 rather than a page`);
  }
}

if (failures.length) {
  console.error(`${what} smoke failures:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`${what}: ok`);
NODE
}

# What this shape runs, read once: a server artefact exists in the modes that have a server, and
# the root is that server in the monorepo layout; an app package exists in the modes that keep the
# frontend the template wrote.
has_server=no
case "$GUIDE_MODE" in
  backend|fullstack) has_server=yes ;;
  frontend) : ;;
  *) echo "unsupported mode: $GUIDE_MODE" >&2; exit 1 ;;
esac
has_app=no
case "$GUIDE_MODE" in
  frontend|fullstack) has_app=yes ;;
  backend) : ;;
esac

# The artefact first: it is a plain node process, so it starts and stops deterministically, and
# stopping it frees GUIDE_DEV_PORT for the dev server that follows.
if [ "$has_server" = yes ]; then
  PORT="$dev_port" node dist/server/index.mjs > prod.log 2>&1 &
  prod_pid=$!
  # Every one of these answers on the same port its dev server will use; the readiness path is the
  # one each profile is guaranteed to serve (the SSR shape's renderer answers `/`, the others'
  # route answers `/hello`).
  if [ "$GUIDE_MODE/$GUIDE_LAYOUT" = "fullstack/single" ]; then
    wait_ready "http://127.0.0.1:$dev_port/" prod.log
  else
    wait_ready "http://127.0.0.1:$dev_port/hello" prod.log
  fi
  smoke "http://127.0.0.1:$dev_port" "built server (node dist/server/index.mjs)"
  kill "$prod_pid" 2>/dev/null || true
  wait "$prod_pid" 2>/dev/null || true
  prod_pid=""
fi

if [ "$GUIDE_LAYOUT" = monorepo ]; then
  # The dev servers are the packages this arrangement has: the root (the dev form of the artefact
  # above) when the root is an application, and the app where there is one. The proxy chain only
  # exists while both ends are up, so when both exist they are started together and the smoke reads
  # the app's port.
  if [ "$has_server" = yes ]; then
    $VP dev --port "$dev_port" --strictPort > server-dev.log 2>&1 &
    dev_pid=$!
    wait_ready "http://127.0.0.1:$dev_port/hello" server-dev.log
  fi
  if [ "$has_app" = yes ]; then
    $VP -C apps/website dev --port "$website_port" --strictPort > website-dev.log 2>&1 &
    website_pid=$!
    wait_ready "http://127.0.0.1:$website_port/" website-dev.log
  fi
  if [ "$has_server" = yes ] && [ "$has_app" = yes ]; then
    smoke "http://127.0.0.1:$dev_port" "dev server (workspace root)" "http://127.0.0.1:$website_port"
  elif [ "$has_app" = yes ]; then
    # The app is the only dev server in this workspace, so its port is the one the smoke reads.
    smoke "http://127.0.0.1:$website_port" "dev server (apps/website)"
  else
    smoke "http://127.0.0.1:$dev_port" "dev server (workspace root)"
  fi
else
  $VP dev --port "$dev_port" --strictPort > dev.log 2>&1 &
  dev_pid=$!
  wait_ready "http://127.0.0.1:$dev_port/" dev.log
  smoke "http://127.0.0.1:$dev_port" "dev server"
fi

step "verification passed"
```

## Phase 7 — Handoff

Report, in this order:

1. **What was built** — the mode, layout, framework (frontend, SSR and split modes, and the
   workspace layouts' app base) and package
   manager that were chosen, and the versions that actually resolved: `docs/provenance.md` is the
   record.
2. **What was verified** — the Phase 6 result, and the fact that the type checker was proven
   live with a deliberate error rather than assumed. A frontend run verified the dev proxy end
   to end; a backend run verified the Vite plugin by making it serve a route, and verified the
   built `dist/server/index.mjs` by running it; an SSR run verified the render marker on the
   built server *and* on the dev server, with the same-origin API answered on the same port; a
   split run verified the workspace build and check, and the proxy chain — the app's page from the
   app's port, `/api/hello` from that same port arriving at the root server as `/hello`, and an
   unknown `/api/…` path answering the server's 404 rather than the app's HTML. A backend workspace
   run verified that the workspace build builds the root (`dist/server/index.mjs` out of
   `vp run -r build`) and that the dev server answers the route with no `/api` prefix; a frontend
   workspace run verified the app's page from the app's port and the proxied `/api/…` route
   arriving at the answered backend without the prefix.
3. **What is deliberate** — the pinned prerelease toolchain, and the pinned prerelease Nitro in
   the modes that have a server; `.env` being committed while `*.local` is not (the profiles with a
   proxy); the constraints in `AGENTS.md` correcting the tool's own `vp env doctor` advice
   and carrying only the rules this profile has; the frontend app shipping no test harness at all,
   against the server profiles' wired-but-empty `tests/`; Nitro's output living in `dist/` (server
   modes), which is why the run added no ignore rule; in the SSR shape, the absence of
   `index.html` — the template is what makes the outlet comment a silent switch, so the shape
   deletes it and verification asserts the render marker instead; and, in the workspace layouts, one
   version per dependency in the workspace catalog, a proxy in the frontend package where there is
   one, a server that never learns the `/api` prefix exists, root commands that name only what the
   workspace has (a script naming a deleted package would exit 0 having run nothing), and — when the
   placeholder package was kept — a sub-package that carries its own skeleton, configuration and
   build. And say which branch of the setup decision point ran: with `yes`, the `## Agent skills`
   brief it wrote — tracker, label vocabulary, domain-doc layout — and the ADR landing point that
   brief's convention named (`docs/provenance.md` records both); with `no`, the default landing
   point and the assumption the provenance spells out — revisitable, not decided.
4. **What is not covered** — browser hydration is not verified (the smoke test asserts the
   server's response, not the browser's), and production deployment topology is out of scope. In
   backend mode only the one initialized route is verified: a real route table is something
   the project adds later, under the same rules. In the SSR shape only the one page and the one
   API route are verified, and anything the browser does after the first paint — hydration
   mismatches, event handlers, HMR — is outside this verification by construction. In the split
   shape only the one route and the one page are verified, and the reverse proxy that stands in
   front of both in production is out of scope: the dev proxy is the measured reproduction of its
   rule, not a deployment. The backend workspace verifies the root server the same way the backend
   mode does, and nothing about the workspace changes that; the frontend workspace verifies the app
   and its proxy against the backend that was answered at the decision point, and if that is the
   placeholder address then the proxy is as verified as the address is — a `502` is the honest
   result, and pointing `DEV_PROXY` at the real backend is the first thing to fix.
5. **Next steps** — put the project under version control yourself (`git init`; this guide
   deliberately does not touch version control), then start the first feature with
   `/grill-with-docs` so the design conversation happens before the code.
6. **Commands to live with** — the project's own toolchain, in vp form:
   `./node_modules/.bin/vp dev` (dev server, port `GUIDE_DEV_PORT`),
   `./node_modules/.bin/vp check` (format, lint, types),
   `./node_modules/.bin/vp run build` (the project's build script),
   `./node_modules/.bin/vp preview`, and `./node_modules/.bin/vp migrate` when it is time to
   move the toolchain forward. In the server modes, `./node_modules/.bin/vp test` runs the suite
   (empty by design until the first test), and the build's artefact is started with
   `node dist/server/index.mjs` — which, in the SSR shape, serves the rendered page and the
   `/api/…` routes on the same port. In the workspace layouts the commands are the ones registered
   in the
   root manifest: `./node_modules/.bin/vp run dev:server` (the root server on `GUIDE_DEV_PORT`,
   where the root is an application), `./node_modules/.bin/vp run dev:website` (the app on
   `GUIDE_WEBSITE_PORT`, where there is one),
   `./node_modules/.bin/vp run check` / `./node_modules/.bin/vp run test` /
   `./node_modules/.bin/vp run build`, `./node_modules/.bin/vp run ready` as the one-command gate,
   `./node_modules/.bin/vp run -r <task>` for a task across every package, and
   `./node_modules/.bin/vp add -w -D <name>` to add a dependency — pnpm, npm, yarn and bun
   commands are not part of this project's operation.
