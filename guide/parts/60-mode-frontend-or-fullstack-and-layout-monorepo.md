
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
