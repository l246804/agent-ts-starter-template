
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

This is a decision point, and it asks for two things at once — both belong in the same question,
before anything is written:

- **the backend address** (`GUIDE_DEV_PROXY`), recommended as the `http://127.0.0.1:3000`
  placeholder when nothing better is known, with the disclosure that a proxy pointed at a port
  nothing listens on answers `502` rather than serving the page.
- **the route the smoke test should call** (`GUIDE_PROXY_SMOKE_PATH`, e.g. `/hello`). It must be a
  route the backend really serves: it is the proof that the proxy strips the `/api/` prefix, and it
  has no default, because a guessed path turns the check into a failed verification. (Not asked in
  the split shape: there the smoke path is this workspace's own route, which the guide writes.)

The receipt for this point is the proxy step's own `ok  dev proxy wired …` line.

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

The rules that only one arrangement needs are appended by that arrangement's own step: the shape
is in the marker (`when=`), so a run executes exactly one of the six below, and its `ok` line names
which set the project received.

```bash guide:exec id=agents-rules-frontend-single when=mode:frontend&layout:single
set -euo pipefail

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
echo "ok  frontend/single rules appended"
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

```bash guide:exec id=prov-frontend-single when=mode:frontend&layout:single
set -euo pipefail
: "${GUIDE_FRAMEWORK:?Phase 1 must answer GUIDE_FRAMEWORK}"
installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

choice_rows="| Framework template | ${GUIDE_FRAMEWORK} |
| Dev proxy target | ${GUIDE_DEV_PROXY:-http://127.0.0.1:3000} |"
scaffold_line="3. Skeleton: \`vp create vite:application\` + \`--template ${GUIDE_FRAMEWORK}\`, alias map, configuration trimmed, ignore rules refined, dependencies installed."
server_step="4. Dev proxy: \`DEV_PROXY\` in \`.env\`, transformer wired with a guard."
verify_step="8. Verification: format, static check with a live type checker, build script, and a dev-server smoke test through the proxy. Recorded ${installed_at}."

printf '%s\n' "$choice_rows" > .vite-plus-prov-choice
printf '%s\n' "$scaffold_line" > .vite-plus-prov-scaffold
printf '%s\n' "$server_step" > .vite-plus-prov-server
printf '%s\n' "$verify_step" > .vite-plus-prov-verify
echo "ok  provenance arm frontend/single: choices, skeleton, server and verification rows written"
```

```bash guide:exec id=report-frontend-single when=mode:frontend&layout:single
set -euo pipefail
# The lines Phase 7's report repeats, and only this shape's. See report-backend-single for why they
# live next to the shape rather than in the shared Phase 7.
cat <<'REPORT'
Deliberate — the toolchain is a pinned prerelease, and the dev proxy's guard is one unconditional line: an unset `DEV_PROXY` stops the dev server instead of silently answering the app's HTML at exit 0.
Deliberate — `.env` is committed while `*.local` stays personal, and the proxied prefix is a regular expression (`/api/`, trailing slash included).
Not covered — the backend the proxy points at is somebody else's: the placeholder address answers `502`, which is the loud half of "there is no backend there". Browser behaviour and production deployment topology are out of scope.
REPORT
echo "ok  handoff lines for frontend/single are above"
```
