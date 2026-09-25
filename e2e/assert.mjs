#!/usr/bin/env node
/**
 * External-behaviour assertions for an initialized target project.
 *
 * These are the checks the harness owns because the guide does not make them:
 * the produced file tree, where the documents landed, and whether the skills
 * lockfile really agrees with what upstream declares. The guide's verify block is
 * deliberately NOT re-implemented here — it is extracted from GUIDE.md and run
 * verbatim by run.sh, so there is exactly one copy of those assertions.
 *
 *   node e2e/assert.mjs --target <dir> --answers <answers.env>
 *
 * Any failed check exits 1: a green E2E run has to mean the whole contract holds.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAnswers } from "./lib/answers.mjs";
import { shapeOf } from "./lib/shape.mjs";
import { escapeRegExp } from "./lib/text.mjs";
import { audit as auditCoverage } from "./coverage.mjs";

const args = { target: null, answers: null, summary: null };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === "--target") args.target = process.argv[++i];
  else if (process.argv[i] === "--answers") args.answers = process.argv[++i];
  else if (process.argv[i] === "--summary") args.summary = process.argv[++i];
  else {
    console.error(`assert: unknown argument ${process.argv[i]}`);
    process.exit(2);
  }
}
if (!args.target || !args.answers) {
  console.error("usage: assert.mjs --target <dir> --answers <answers.env> [--summary <file>]");
  process.exit(2);
}

const target = args.target;
let answers;
try {
  answers = readAnswers(args.answers);
} catch (error) {
  console.error(`assert: ${error.message}`);
  process.exit(2);
}

const failures = [];
const pending = [];
let checked = 0;
let coverage = null;

function settle(name, detail) {
  console.log(`ok    ${name}${detail ? `  (${detail})` : ""}`);
}

function reject(name, error) {
  failures.push(`${name}: ${error.message}`);
  console.log(`FAIL  ${name}\n        ${error.message}`);
}

function check(name, fn) {
  checked += 1;
  try {
    const result = fn();
    if (result instanceof Promise) {
      pending.push(result.then((detail) => settle(name, detail), (error) => reject(name, error)));
      return;
    }
    settle(name, result);
  } catch (error) {
    reject(name, error);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relative) {
  const path = join(target, relative);
  assert(existsSync(path), `missing ${relative}`);
  return readFileSync(path, "utf8");
}

function readJson(relative) {
  try {
    return JSON.parse(read(relative));
  } catch (error) {
    throw new Error(`${relative} is not valid JSON: ${error.message}`);
  }
}

/**
 * create-vite writes its tsconfig files as JSONC — block comments and friends — so the
 * comment syntax has to come out (outside of strings) before they can be parsed as JSON.
 */
function stripJsonComments(source) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inLine) {
      if (char === "\n") { inLine = false; out += char; }
      continue;
    }
    if (inBlock) {
      if (char === "*" && next === "/") { inBlock = false; i += 1; }
      continue;
    }
    if (inString) {
      out += char;
      if (char === "\\") { out += next ?? ""; i += 1; continue; }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; out += char; continue; }
    if (char === "/" && next === "/") { inLine = true; i += 1; continue; }
    if (char === "/" && next === "*") { inBlock = true; i += 1; continue; }
    out += char;
  }
  return out;
}

function readTsconfig(relative) {
  try {
    return JSON.parse(stripJsonComments(read(relative)));
  } catch (error) {
    throw new Error(`${relative} is not valid JSON after removing comments: ${error.message}`);
  }
}

const manifest = readJson("package.json");
// 形态 × 布局 and the facts that follow from them live in `e2e/lib/shape.mjs` — the same module the
// coverage table's `when` filter and the runner's control gates read, so the three cannot drift
// apart about what shape this run is.
const shape = shapeOf(answers);
const { mode, layout, isMono, isSsr, isSplit, hasServer, hasApp, hasProxy, usesCatalog } = shape;
// The setup decision point (Phase 4.5) is a branch, and each branch leaves a different project
// behind — so every check about it is driven by the answer, never by what the target happens to
// contain. `yes` writes the skill's brief and its docs/agents/ files, and the ADR landing point is
// the directory the confirmed convention names; `no` writes none of that and the inherited ADRs
// take the guide's default, recorded as an assumption in the provenance.
const setupRan = answers.GUIDE_SETUP === "yes";
const adrDir = setupRan ? (answers.GUIDE_ADR_DIR || "docs/adr") : "docs/adr";
// Package directories of the workspace layout, in the order the guide names them. The app and the
// placeholder package are the profile's shape and decision, so they are only part of the workspace
// when they exist.
const workspacePackages = [
  [".", "package.json"],
  ...(hasApp ? [["apps/website", "apps/website/package.json"]] : []),
  ...(existsSync(join(target, "packages/utils/package.json")) ? [["packages/utils", "packages/utils/package.json"]] : []),
];
// The package that carries a resolved TypeScript in a workspace: the app where there is one, the
// placeholder package otherwise. A backend workspace may have neither.
const compiledPackage = hasApp && existsSync(join(target, "apps/website/node_modules/typescript"))
  ? "apps/website"
  : existsSync(join(target, "packages/utils/node_modules/typescript"))
    ? "packages/utils"
    : null;

function resolvedVersion(base, name) {
  const path = join(target, base, "node_modules", name, "package.json");
  assert(existsSync(path), `${base}/node_modules/${name} is not installed`);
  return JSON.parse(readFileSync(path, "utf8")).version;
}

// ---------------------------------------------------------------- guard rails
check("package.json pins every version (no `latest`)", () => {
  const offenders = [];
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, spec] of Object.entries(manifest[group] ?? {})) {
      if (String(spec).includes("latest")) offenders.push(`${name}@${spec}`);
    }
  }
  assert(offenders.length === 0, `unpinned: ${offenders.join(", ")}`);
  return `${Object.keys(manifest.devDependencies ?? {}).length} devDependencies`;
});

check("vite-plus is a project devDependency, not a global", () => {
  const spec = manifest.devDependencies?.["vite-plus"];
  assert(spec, "vite-plus is not in devDependencies");
  assert(!spec.includes("latest"), `vite-plus is unpinned: ${spec}`);
  assert(existsSync(join(target, "node_modules", "vite-plus")), "node_modules/vite-plus is not installed");
  return `vite-plus@${spec}`;
});

check("TypeScript is on the decided v7 line", () => {
  const expected = answers.GUIDE_TS_VERSION;
  if (usesCatalog) {
    // In the workspace layout TypeScript lives in the catalog, and the packages that compile
    // reference it there — the root manifest does not name it at all, because the root's own
    // program is checked by the toolchain rather than by a `tsc` the root owns.
    const workspace = read("pnpm-workspace.yaml");
    const catalogEntry = (name) => {
      const match = new RegExp(`^\\s+"?'?${name}'?:\\s*(.+?)\\s*$`, "m").exec(workspace);
      return match ? match[1] : "";
    };
    const pinned = catalogEntry("typescript");
    if (answers.GUIDE_TNB === "yes") {
      assert(pinned.includes("typescript-native-bridge"), `the catalog does not point typescript at the bridge: ${pinned}`);
    } else {
      // The catalog entry is the version decision: it has to be the answer, not just any 7.x.
      assert(
        pinned === answers.GUIDE_TS_VERSION,
        `the workspace catalog pins typescript ${JSON.stringify(pinned)}, the decision was ${answers.GUIDE_TS_VERSION}`,
      );
    }
    for (const [dir, file] of workspacePackages) {
      if (dir === ".") continue;
      const own = readJson(file);
      const names = Object.keys({ ...own.dependencies, ...own.devDependencies });
      if (!names.includes("typescript")) continue;
      assert(own.devDependencies?.typescript === "catalog:", `${dir} says typescript@${own.devDependencies?.typescript}`);
    }
    // A backend workspace may have deleted both packages that compile; then there is no resolved
    // version to read, and the catalog entry above is the whole record.
    if (compiledPackage) {
      const resolved = resolvedVersion(compiledPackage, "typescript");
      assert(/^7\./.test(resolved), `${compiledPackage} resolves typescript@${resolved}, expected the 7.x line`);
      return `typescript@${resolved} via the workspace catalog (${pinned})`;
    }
    return `typescript pinned in the workspace catalog (${pinned}); no package of this workspace compiles TypeScript`;
  }
  const spec = manifest.devDependencies?.typescript;
  if (answers.GUIDE_TNB === "yes") {
    assert(
      spec === "catalog:" || String(spec).includes("typescript-native-bridge"),
      `expected the TNB bridge or a catalog entry, found ${spec}`,
    );
    const workspace = read("pnpm-workspace.yaml");
    assert(workspace.includes("typescript-native-bridge"), "pnpm-workspace.yaml has no bridge catalog/override entry");
    return `bridged via ${spec}`;
  }
  assert(spec === expected, `package.json says typescript@${spec}, the decision was ${expected}`);
  const resolved = JSON.parse(
    readFileSync(join(target, "node_modules", "typescript", "package.json"), "utf8"),
  ).version;
  return `typescript@${resolved}`;
});

// -------------------------------------------------------------------- aliases
check("path aliases exist only as package.json `imports`", () => {
  const maps = [[".", manifest]];
  if (hasApp) maps.push(["apps/website", readJson("apps/website/package.json")]);
  for (const [base, own] of maps) {
    const imports = own.imports;
    assert(imports && imports["#/*"], `${base}/package.json has no \`#/*\` imports entry`);
    const entry = imports["#/*"];
    assert(entry.types === "./*.ts", `${base}: imports types branch is ${JSON.stringify(entry.types)}`);
    assert(entry.default === "./*", `${base}: imports default branch is ${JSON.stringify(entry.default)}`);
    const keys = Object.keys(entry);
    assert(keys[0] === "types", `${base}: the types branch must come first, key order is ${keys.join(",")}`);
  }

  // Every tsconfig in the workspace is checked, root and packages alike: an alias mechanism of its
  // own anywhere is the failure this rule exists to prevent.
  const tsconfigs = [];
  const skip = new Set(["node_modules", "dist", ".git", ".agents"]);
  const walk = (dir) => {
    for (const entry of readdirSync(join(target, dir), { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full);
      else if (/^tsconfig.*\.json$/.test(entry.name)) tsconfigs.push(full);
    }
  };
  walk("");
  for (const name of tsconfigs) {
    const config = readTsconfig(name);
    assert(!("paths" in (config.compilerOptions ?? {})), `${name} still has compilerOptions.paths`);
    assert(!("baseUrl" in (config.compilerOptions ?? {})), `${name} still has compilerOptions.baseUrl (removed in TS7)`);
  }
  const viteConfigs = ["vite.config.ts", ...(hasApp ? ["apps/website/vite.config.ts"] : [])];
  for (const name of viteConfigs) {
    if (!existsSync(join(target, name))) continue;
    const viteConfig = read(name);
    assert(!viteConfig.includes("resolve.alias"), `${name} uses resolve.alias`);
    assert(!viteConfig.includes("tsconfigPaths"), `${name} uses resolve.tsconfigPaths`);
  }
  return `${tsconfigs.length} tsconfig(s), ${viteConfigs.length} vite config(s), maps in ${maps.map(([base]) => base).join(" + ")}`;
});

// ------------------------------------------------------------- configuration
// Artifact-level only: a TypeScript config cannot be inspected without reading its text, and
// the behavioural half — that a planted type error still fails the check — is proven by the
// guide's own control (GUIDE.md, "prove the trim did not hollow out the check") and again by
// this harness's verify-red negative control. This check exists to catch the artifact side:
// a default-valued `fmt: {}` that was not trimmed, or a type-aware check that was hollowed out.
check("vite.config.ts keeps only load-bearing configuration", () => {
  const config = read("vite.config.ts");
  assert(/typeAware:\s*true/.test(config), "lint.options.typeAware is missing — vp check would not check types");
  assert(/typeCheck:\s*true/.test(config), "lint.options.typeCheck is missing");
  assert(!/fmt:\s*\{\s*\}/.test(config), "the default-valued `fmt: {}` was not trimmed");
  return "typeAware + typeCheck present, fmt: {} trimmed";
});

if (mode === "frontend") {
  check("the frontend profile writes no test script and no tests/ directory", () => {
    assert(!manifest.scripts?.test, "frontend profile must not define a test script");
    assert(!existsSync(join(target, "tests")), "frontend profile must not create tests/");
    return "absent by decision";
  });
}

// ------------------------------------------------------------------ the server
if (mode === "backend") {
  check("the backend profile has no client", () => {
    const survivors = ["src", "public", "index.html"].filter((name) => existsSync(join(target, name)));
    assert(survivors.length === 0, `${survivors.join(", ")} survived the prune — a backend project has no client`);
    if (isMono) {
      // In the workspace layout the client is a package, and the whole package goes with it.
      assert(!existsSync(join(target, "apps")), "apps/ survived the prune — a backend workspace has no client package");
    }
    assert(existsSync(join(target, "package.json")), "the prune took package.json with it");
    return isMono ? "src/, public/, index.html absent, apps/ deleted" : "src/, public/, index.html absent";
  });
}

if (hasServer) {
  check("nitro is pinned to the decided prerelease and installed", () => {
    const spec = manifest.devDependencies?.nitro;
    assert(spec, "nitro is not in devDependencies");
    assert(!String(spec).includes("latest"), `nitro is unpinned: ${spec}`);
    if (usesCatalog) {
      // In the workspace layout the pin lives in the catalog and the manifest references it; the
      // catalog's own entry is what has to carry the exact prerelease (checked in the workspace
      // checks below as well, from the manifests' side).
      assert(spec === "catalog:", `the root says nitro@${spec}, expected the catalog reference`);
      const workspace = read("pnpm-workspace.yaml");
      assert(
        new RegExp(`^\\s+"?nitro"?:\\s*${escapeRegExp(answers.GUIDE_NITRO_VERSION)}\\s*$`, "m").test(workspace),
        `the workspace catalog does not pin nitro to ${answers.GUIDE_NITRO_VERSION}`,
      );
    } else {
      assert(
        spec === answers.GUIDE_NITRO_VERSION,
        `package.json says nitro@${spec}, the decision was ${answers.GUIDE_NITRO_VERSION}`,
      );
    }
    // The repo's ADR-0003 fixes Nitro v3, and v3 has no stable release: a pin that had drifted
    // off the 3.x prerelease line would mean the decision record and the project disagree.
    assert(/^3\.\d/.test(answers.GUIDE_NITRO_VERSION), `ADR-0003 fixes Nitro v3; the pin is ${answers.GUIDE_NITRO_VERSION}`);
    assert(/-(beta|alpha|rc)/i.test(answers.GUIDE_NITRO_VERSION), `Nitro v3 is prerelease-only; ${answers.GUIDE_NITRO_VERSION} does not look like one`);
    const resolved = JSON.parse(
      readFileSync(join(target, "node_modules", "nitro", "package.json"), "utf8"),
    ).version;
    assert(resolved === answers.GUIDE_NITRO_VERSION, `node_modules/nitro resolved to ${resolved}`);
    return `nitro@${resolved} (v3 prerelease, pinned${usesCatalog ? " through the catalog" : ""})`;
  });

  check("tests/ is generated with its placeholder and stays out of the route scan", () => {
    assert(existsSync(join(target, "tests", ".gitkeep")), "tests/.gitkeep is missing");
    const script = manifest.scripts?.test;
    assert(
      script === "vp test --passWithNoTests",
      `the test script is ${JSON.stringify(script)}, expected "vp test --passWithNoTests"`,
    );
    const strays = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(test|spec)\./.test(entry.name)) strays.push(full.slice(target.length + 1));
      }
    };
    if (existsSync(join(target, "server"))) walk(join(target, "server"));
    assert(strays.length === 0, `test files under server/ would be compiled into routes: ${strays.join(", ")}`);
    return "tests/.gitkeep + wired runner, none under server/";
  });

  check("the build output is Nitro's dist, not the unignored .output", () => {
    // The build itself (dist/server/index.mjs) is asserted by the generic build-output check
    // below, which every profile runs; this one is about where Nitro put it.
    assert(existsSync(join(target, "dist", "nitro.json")), "dist/nitro.json is missing");
    assert(!existsSync(join(target, ".output")), ".output/ exists — output.dir did not take effect");
    return "dist/nitro.json, no .output/";
  });
}

if (mode === "backend") {
  // The silent failure this catches: the scaffold writes no `plugins` key at all, so an import
  // without a call exits 0 while every route 404s. The verify block catches it behaviourally;
  // this catches it in the artefact, where the cause is visible.
  check("the Nitro plugin is registered, not merely imported", () => {
    const config = read("vite.config.ts");
    assert(/from\s+["']nitro\/vite["']/.test(config), "vite.config.ts does not import from nitro/vite");
    const keys = config.match(/^ {2}plugins\s*:/gm) ?? [];
    assert(keys.length === 1, `expected exactly one top-level plugins entry in vite.config.ts, found ${keys.length}`);
    assert(/^ {2}plugins:\s*\[nitro\(\)\],$/m.test(config), "the plugins array does not call nitro() — the server would be inert");
    if (isMono) {
      // Without this the workspace root refuses to act on itself: `vp dev`/`vp build` exit 1 with
      // "needs a target package", and the root would not be an application at all.
      assert(/^ {2}defaultPackage:\s*["']\.["'],$/m.test(config), 'the root vite.config.ts does not set defaultPackage: "."');
    }
    return isMono ? "plugins: [nitro()] beside defaultPackage: ." : "plugins: [nitro()]";
  });

  check("the server sits at the project root and its routes carry no /api prefix", () => {
    assert(existsSync(join(target, "server", "routes", "hello.ts")), "server/routes/hello.ts is missing");
    assert(!existsSync(join(target, "server", "api")), "server/api/ exists — those routes are /api-prefixed");
    const nitro = read("nitro.config.ts");
    assert(/serverDir:\s*["']\.\/server["']/.test(nitro), "nitro.config.ts does not set serverDir: './server'");
    assert(/output:\s*\{\s*dir:\s*["']dist["']/.test(nitro), "nitro.config.ts does not send the output to dist");
    if (!isMono) {
      // The single layout merges the server into one program extending Nitro's preset. The
      // workspace layout keeps the scaffold's own root tsconfig, which has no `include` list and
      // therefore already covers server/, tests/ and the config files — a second program there
      // would be a second description of the same layout.
      const tsconfig = readTsconfig("tsconfig.json");
      assert(tsconfig.extends === "nitro/tsconfig", `tsconfig.json extends ${JSON.stringify(tsconfig.extends)}`);
      for (const included of ["server", "tests"]) {
        assert((tsconfig.include ?? []).includes(included), `tsconfig.json does not include ${included}`);
      }
    } else {
      const tsconfig = readTsconfig("tsconfig.json");
      assert(
        !("include" in tsconfig) || (tsconfig.include ?? []).includes("server"),
        `tsconfig.json has an include list that does not cover server/: ${JSON.stringify(tsconfig.include)}`,
      );
    }
    return isMono
      ? "server/routes/hello.ts, serverDir ./server, output dist, the root's own program"
      : "server/routes/hello.ts, serverDir ./server, output dist, one tsconfig program";
  });
}

if (isMono) {
  // The workspace root is never a page: in the shapes whose root is an application it is the
  // server, and in the frontend arrangement it is a shell. Either way a root index.html or src/
  // means the template's app was staged in the wrong place.
  check("the workspace root is not a client project", () => {
    assert(!existsSync(join(target, "index.html")), "index.html exists at the workspace root — the app lives in apps/website");
    assert(!existsSync(join(target, "src")), "src/ exists at the workspace root — the app lives in apps/website");
    return mode === "backend" ? "no root page (a backend workspace has none)" : "root holds no page; the app is a package";
  });

  if (hasApp) {
    check("apps/website is the app, pruned to the page the smoke reads", () => {
      for (const file of ["apps/website/index.html", "apps/website/src/main.ts", "apps/website/package.json"]) {
        assert(existsSync(join(target, file)), `${file} is missing`);
      }
      // The scaffold's demo is pruned in this layout, exactly as in the others; the minimal page is
      // what the smoke test reads its marker from, and the marker is the mode's.
      for (const gone of ["apps/website/src/counter.ts", "apps/website/src/assets", "apps/website/public/icons.svg"]) {
        assert(!existsSync(join(target, gone)), `${gone} survived the prune`);
      }
      const marker = mode === "frontend" ? "Frontend works" : "Split works";
      const page = read("apps/website/src/main.ts");
      assert(page.includes(marker), `apps/website/src/main.ts does not carry the page marker the smoke reads (${marker})`);
      // A frontend app has no test harness in this project, and `vp run -r` is what makes that a
      // skip instead of a failure.
      const app = readJson("apps/website/package.json");
      assert(!app.scripts?.test, "apps/website must not define a test script");
      assert(!app.scripts?.check, "apps/website must not define a check script (create-vite writes none)");
      assert(!existsSync(join(target, "apps/website/tests")), "apps/website must not create tests/");
      return `apps/website is the page (marker: ${marker}), no test/check script`;
    });
  }

  if (hasServer) {
    check("the Nitro server sits at the workspace root with no /api prefix", () => {
      assert(existsSync(join(target, "server", "routes", "hello.ts")), "server/routes/hello.ts is missing");
      assert(!existsSync(join(target, "server", "api")), "server/api/ exists — those routes are /api-prefixed");
      const nitro = read("nitro.config.ts");
      assert(/serverDir:\s*["']\.\/server["']/.test(nitro), "nitro.config.ts does not set serverDir: './server'");
      assert(/output:\s*\{\s*dir:\s*["']dist["']\s*\}/.test(nitro), "nitro.config.ts does not send the output to dist");
      const config = read("vite.config.ts");
      assert(/from\s+["']nitro\/vite["']/.test(config), "the root vite.config.ts does not import from nitro/vite");
      const keys = config.match(/^ {2}plugins\s*:/gm) ?? [];
      assert(keys.length === 1, `expected exactly one top-level plugins entry in the root vite.config.ts, found ${keys.length}`);
      assert(/^ {2}plugins:\s*\[nitro\(\)\],$/m.test(config), "the root plugins array does not call nitro() — the server would be inert");
      // Without this the workspace root refuses to act on itself: `vp dev`/`vp build` exit 1 with
      // "needs a target package", which is this arrangement's loudest setup trap.
      assert(/^ {2}defaultPackage:\s*["']\.["'],$/m.test(config), 'the root vite.config.ts does not set defaultPackage: "."');
      return "server/routes/hello.ts, serverDir ./server, output dist, defaultPackage ., plugins [nitro()]";
    });
  }

  check("every dependency version is shared through the workspace catalog", () => {
    const workspace = read("pnpm-workspace.yaml");
    // What the catalog has to carry is the shape's: the toolchain and the language always, the
    // server in the arrangements that have one, the proxy transformer where a proxy exists.
    const required = ["vite-plus", "typescript", ...(hasServer ? ["nitro"] : []), ...(hasProxy ? ["vite-proxy-from-env"] : [])];
    for (const name of required) {
      assert(
        new RegExp(`^\\s+"?${escapeRegExp(name)}"?:`, "m").test(workspace),
        `the workspace catalog has no ${name} entry`,
      );
    }
    // One version per dependency, in one place: a literal spec in any manifest of the workspace is
    // a version the other packages do not share, which is exactly what the catalog prevents.
    const literals = [];
    for (const [base, file] of workspacePackages) {
      const own = readJson(file);
      for (const group of ["dependencies", "devDependencies"]) {
        for (const [name, spec] of Object.entries(own[group] ?? {})) {
          if (spec !== "catalog:" && !String(spec).startsWith("workspace:")) literals.push(`${base || "."}: ${name}@${spec}`);
        }
      }
    }
    assert(literals.length === 0, `version literals outside the catalog: ${literals.join(", ")}`);

    // The catalog is only shared if it resolves shared: the same dependency must come out of every
    // package that declares it.
    const vitePlus = new Set(workspacePackages.map(([base]) => resolvedVersion(base, "vite-plus")));
    assert(vitePlus.size === 1, `vite-plus resolves to ${[...vitePlus].join(" and ")} across the workspace`);
    const typescriptHolders = workspacePackages
      .map(([base]) => base)
      .filter((base) => existsSync(join(target, base, "node_modules", "typescript")));
    if (typescriptHolders.length > 1) {
      const typescript = new Set(typescriptHolders.map((base) => resolvedVersion(base, "typescript")));
      assert(typescript.size === 1, `typescript resolves to ${[...typescript].join(" and ")} across the workspace`);
    }
    return `${workspacePackages.length} manifests, all catalog references; vite-plus ${[...vitePlus][0]}`;
  });

  check("the common commands are registered at the workspace root, all in vp form", () => {
    // The workspace's operation is vp-only: no pnpm/npm/yarn/bun command may appear in any script
    // of any package, because two sets of commands in one project is how the second one gets used
    // by mistake. (The ephemeral `vp create` bootstrap is not a script — it is not part of the
    // project's operation.)
    const managers = [];
    for (const [base, file] of workspacePackages) {
      const own = readJson(file);
      for (const [name, script] of Object.entries(own.scripts ?? {})) {
        if (/(^|[\s&|;(])(pnpm|npm|npx|yarn|bun|bunx)([\s&|;)]|$)/.test(String(script))) {
          managers.push(`${base || "."}: ${name} -> ${script}`);
        }
      }
    }
    assert(managers.length === 0, `scripts that call a package manager: ${managers.join(", ")}`);

    // The command set is the arrangement's: a root that is an application serves itself, and an
    // app package is started where it lives. Every one of them is vp-form.
    const expected = ["check", "ready", ...(hasServer ? ["dev:server", "test", "build"] : []), ...(hasApp ? ["dev:website"] : [])];
    for (const name of expected) {
      const script = manifest.scripts?.[name];
      assert(script, `the root manifest does not register \`${name}\``);
      assert(/^vp\b/.test(script), `the root's \`${name}\` script is not vp-form: ${script}`);
    }

    // The template's `dev` names a package by its task (`vp run website#dev`), and a root script
    // that names a package the workspace does not have exits 0 having run nothing. That is the
    // silent no-op this rule exists for, so nothing may be left in that form — checked before the
    // command set, because a planted `dev` script is the form this rule is about.
    for (const [dir, file] of workspacePackages) {
      const own = readJson(file);
      for (const [name, script] of Object.entries(own.scripts ?? {})) {
        assert(
          !/vp\s+run\s+\S*#/.test(String(script)),
          `${dir || "."}: script \`${name}\` names a package (${script}); a missing package would make it a silent no-op`,
        );
      }
    }

    for (const name of Object.keys(manifest.scripts ?? {})) {
      assert(expected.includes(name), `the root manifest registers \`${name}\`, which this arrangement does not need`);
    }
    assert(!manifest.scripts?.dev, "the scaffold's `dev` script (vp run website#dev) must be replaced in this layout");
    if (hasServer) {
      assert(manifest.devDependencies?.nitro === "catalog:", `the root says nitro@${manifest.devDependencies?.nitro}`);
      const nitroResolved = resolvedVersion(".", "nitro");
      assert(
        nitroResolved === answers.GUIDE_NITRO_VERSION,
        `the root resolves nitro@${nitroResolved}, the decision was ${answers.GUIDE_NITRO_VERSION}`,
      );
      return `${expected.join(", ")}; nitro@${nitroResolved} via the catalog`;
    }
    assert(!manifest.devDependencies?.nitro, "nitro is installed in a workspace with no server");
    return `${expected.join(", ")}; no server dependency`;
  });

  if (hasProxy) {
    check("the dev proxy lives in the frontend package with its guard", () => {
      const config = read("apps/website/vite.config.ts");
      assert(config.includes("proxyTransformer(env.DEV_PROXY)"), "apps/website/vite.config.ts does not use proxyTransformer(env.DEV_PROXY)");
      assert(/if\s*\(\s*!env\.DEV_PROXY\s*\)/.test(config), "the DEV_PROXY guard line is missing from the app's config");
      assert(!/command\s*===\s*["']serve["']/.test(config), "the guard is conditional on the dev command; it must fire in every mode");
      const env = read("apps/website/.env");
      assert(env.includes("DEV_PROXY"), "apps/website/.env has no DEV_PROXY");
      assert(env.includes("'/api/'"), "the proxy prefix is not '/api/' — without the trailing slash /apix/... is proxied too");
      if (isSplit) {
        // The split shape's target is this workspace's own root server, written from its port.
        assert(
          env.includes(`http://127.0.0.1:${answers.GUIDE_DEV_PORT}`),
          `apps/website/.env does not point at the root server on ${answers.GUIDE_DEV_PORT}`,
        );
      } else {
        // A pure frontend's target is the answer — or the placeholder it was answered with.
        const target = answers.GUIDE_DEV_PROXY || "http://127.0.0.1:3000";
        assert(env.includes(target), `apps/website/.env does not point at the answered backend (${target})`);
      }
      const app = readJson("apps/website/package.json");
      assert(app.devDependencies?.["vite-proxy-from-env"] === "catalog:", "vite-proxy-from-env is not a catalog dependency of the app");
      assert(existsSync(join(target, "apps/website/node_modules/vite-proxy-from-env")), "vite-proxy-from-env is not installed in apps/website");
      return isSplit
        ? "proxy + guard in apps/website, target on the root server's port, pinned through the catalog"
        : "proxy + guard in apps/website, target the answered backend, pinned through the catalog";
    });
  }

  check("the workspace build produced what this arrangement is for", () => {
    if (hasServer) {
      assert(existsSync(join(target, "dist", "server", "index.mjs")), "dist/server/index.mjs is missing — the root server did not build");
      assert(existsSync(join(target, "dist", "nitro.json")), "dist/nitro.json is missing");
      assert(!existsSync(join(target, ".output")), ".output/ exists — output.dir did not take effect");
    } else {
      assert(
        !existsSync(join(target, "dist", "server", "index.mjs")),
        "this workspace has no server, but the root built one",
      );
    }
    if (hasApp) {
      assert(existsSync(join(target, "apps", "website", "dist", "index.html")), "apps/website/dist/index.html is missing — the app did not build");
    }
    if (mode === "backend") {
      assert(!existsSync(join(target, "apps")), "a backend workspace has no client, but apps/ exists");
    }
    if (answers.GUIDE_PLACEHOLDER === "yes") {
      assert(existsSync(join(target, "packages", "utils", "package.json")), "GUIDE_PLACEHOLDER=yes but packages/utils is gone");
      assert(
        existsSync(join(target, "packages", "utils", "dist", "index.mjs")),
        "packages/utils/dist/index.mjs is missing — the placeholder package did not build",
      );
      assert(existsSync(join(target, "packages", "utils", "tsconfig.json")), "packages/utils has no tsconfig of its own");
      assert(existsSync(join(target, "packages", "utils", "vite.config.ts")), "packages/utils has no Vite config of its own");
      assert(existsSync(join(target, "packages", "utils", "tests")), "packages/utils has no tests directory of its own");
      return `root dist/${hasServer ? "server/" : ""}, ${hasApp ? "apps/website/dist, " : ""}packages/utils/dist (its own skeleton and config)`;
    }
    assert(!existsSync(join(target, "packages", "utils")), "GUIDE_PLACEHOLDER=no but packages/utils survives");
    assert(!existsSync(join(target, "packages")), "GUIDE_PLACEHOLDER=no but packages/ was left behind");
    return `root dist/${hasServer ? "server/" : ""}, ${hasApp ? "apps/website/dist, " : ""}no placeholder package`;
  });
}

if (isSsr) {
  // The silent degradation of the SSR shape, and why its absence is the assertion: an
  // `index.html` is used as the renderer template, and if it has no `<!--ssr-outlet-->` comment
  // Nitro still detects the SSR entry, still logs it, and still serves the plain client shell
  // with exit 0. The shape deletes the template instead of relying on a comment being there, so
  // a file at this path means the project went back to a shape whose failure is silent.
  check("the SSR shape owns the document, so there is no client shell to fall back to", () => {
    assert(
      !existsSync(join(target, "index.html")),
      "index.html exists — a renderer template without `<!--ssr-outlet-->` silently degrades SSR to a client-only shell",
    );
    assert(!existsSync(join(target, "src", "main.tsx")), "src/main.tsx exists — the SPA entry is replaced by the SSR entries");
    for (const file of ["src/entry-server.tsx", "src/entry-client.tsx"]) {
      assert(existsSync(join(target, file)), `${file} is missing`);
    }
    const entry = read(join("src", "entry-server.tsx"));
    assert(/export default \{/.test(entry), "src/entry-server.tsx does not default-export an object");
    assert(/fetch\(/.test(entry), "the default export has no fetch handler — the service loader would throw");
    return "no index.html, no src/main.tsx, entry-server + entry-client present";
  });

  // react-ts's scaffold config wraps its plugins in `lazyPlugins(() => [react()])`, so the
  // backend wiring — create a top-level `plugins` key — is the wrong edit here: a second
  // `plugins` key is a duplicate object key, and Nitro gets silently dropped. The count is
  // anchored at the top level because the scaffold's own `lint` block carries a `plugins` list.
  check("the Nitro plugin is called inside the scaffold's lazyPlugins array", () => {
    const config = read("vite.config.ts");
    assert(/from\s+["']nitro\/vite["']/.test(config), "vite.config.ts does not import from nitro/vite");
    const keys = config.match(/^ {2}plugins\s*:/gm) ?? [];
    assert(keys.length === 1, `expected exactly one top-level plugins entry in vite.config.ts, found ${keys.length}`);
    assert(
      /^ {2}plugins: lazyPlugins\(\(\) => \[nitro\(\), react\(\)\]\),$/m.test(config),
      "nitro() is not called inside the scaffold's lazyPlugins array — the server would be inert, or one plugin silently dropped",
    );
    return "plugins: lazyPlugins(() => [nitro(), react()])";
  });

  // Without this input, the client environment falls back to the renderer template — the file this
  // shape deleted — and the build fails in Nitro's asset step instead of shipping a document whose
  // client entry does not exist.
  check("the client entry is declared for the client environment", () => {
    const config = read("vite.config.ts");
    assert(/environments\s*:/.test(config), "vite.config.ts has no environments block");
    assert(
      config.includes('input: "./src/entry-client.tsx"'),
      "the client environment does not build from ./src/entry-client.tsx",
    );
    return "./src/entry-client.tsx";
  });

  check("the build emits the client bundle and the SSR renderer", () => {
    const assets = join(target, "dist", "public", "assets");
    const bundles = existsSync(assets) ? readdirSync(assets).filter((name) => name.endsWith(".js")) : [];
    assert(bundles.length > 0, "no client bundle under dist/public/assets");
    assert(existsSync(join(target, "dist", "server", "index.mjs")), "dist/server/index.mjs is missing");
    // `_ssr/` and the renderer chunk next to it exist only in an SSR build: they are the cheap
    // way to tell the SSR shape from a plain client build that also happens to have a server.
    assert(
      existsSync(join(target, "dist", "server", "_ssr", "ssr.mjs")),
      "dist/server/_ssr/ssr.mjs is missing — this build has no SSR renderer",
    );
    return `${bundles.length} client bundle(s) + dist/server/_ssr/ssr.mjs`;
  });

  check("the API is same-origin, so the profile carries no dev proxy", () => {
    assert(existsSync(join(target, "server", "routes", "api", "hello.ts")), "server/routes/api/hello.ts is missing");
    assert(!existsSync(join(target, "server", "api")), "server/api/ exists — that is the directory that adds /api implicitly");
    const config = read("vite.config.ts");
    assert(!config.includes("proxyTransformer"), "vite.config.ts wires a dev proxy in a same-origin project");
    assert(!manifest.devDependencies?.["vite-proxy-from-env"], "vite-proxy-from-env is installed in a same-origin project");
    assert(!existsSync(join(target, ".env")), "the SSR shape has no DEV_PROXY to point anywhere, so it writes no .env");
    const tsconfig = readTsconfig("tsconfig.json");
    assert(tsconfig.extends === "nitro/tsconfig", `tsconfig.json extends ${JSON.stringify(tsconfig.extends)}`);
    for (const included of ["src", "server", "tests"]) {
      assert((tsconfig.include ?? []).includes(included), `tsconfig.json does not include ${included}`);
    }
    // The scaffold's project-reference configs are replaced by the one merged program; leaving
    // them behind would keep a second, contradictory description of the project's TypeScript.
    const splits = readdirSync(target).filter((name) => /^tsconfig\..*\.json$/.test(name));
    assert(splits.length === 0, `split tsconfig files survived the merge: ${splits.join(", ")}`);
    return "server/routes/api/hello.ts, no proxy, one program over src/ and server/";
  });
}

// ------------------------------------------------------------------ gitignore
check("gitignore keeps .env and .vscode tracked, and build output ignored", () => {
  const probe = mkdtempSync(join(tmpdir(), "gitignore-probe-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: probe });
    // Every ignore file the project ships is copied to its own directory in the probe, because
    // git resolves the rules per directory: a package's own `.gitignore` is what decides that
    // package's paths, and copying only the root's would leave the package-level rules — which
    // this guide edits — unasserted.
    const copied = [];
    const copyIgnores = (dir) => {
      for (const entry of readdirSync(join(target, dir), { withFileTypes: true })) {
        if (["node_modules", "dist", ".git", ".agents"].includes(entry.name)) continue;
        const relative = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) copyIgnores(relative);
        else if (entry.name === ".gitignore") {
          mkdirSync(join(probe, dir), { recursive: true });
          copyFileSync(join(target, relative), join(probe, relative));
          copied.push(relative);
        }
      }
    };
    copyIgnores("");
    const probes = [
      ".env",
      ".env.local",
      ".vscode/settings.json",
      "dist/index.html",
      "dist/server/index.mjs",
      ".output/server/index.mjs",
      "node_modules/x",
      // In the monorepo layout the committed environment file — the one carrying DEV_PROXY — lives
      // in the frontend package, and the packages' own ignore files are what decide those paths.
      ...(isMono
        ? [
            ...(hasApp ? ["apps/website/.env", "apps/website/.env.local", "apps/website/dist/index.html"] : []),
            ...(existsSync(join(target, "packages/utils")) ? ["packages/utils/dist/index.mjs"] : []),
          ]
        : []),
    ];
    const result = execFileSync("git", ["check-ignore", "--no-index", "-v", ...probes], {
      cwd: probe,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const ignored = new Set(
      result
        .split("\n")
        .filter(Boolean)
        .map((line) => line.slice(line.lastIndexOf("\t") + 1)),
    );
    assert(!ignored.has(".env"), ".env must be committed (only *.local is ignored)");
    assert(ignored.has(".env.local"), ".env.local must be ignored");
    assert(!ignored.has(".vscode/settings.json"), ".vscode must not be ignored");
    assert(ignored.has("dist/index.html"), "dist/ must be ignored");
    assert(ignored.has("dist/server/index.mjs"), "the server build output under dist/ must be ignored too");
    assert(ignored.has("node_modules/x"), "node_modules/ must be ignored");
    // Nitro's default output directory is not covered by the scaffold's rules, which is exactly
    // why the guide relocates it: an ignore line for `.output` would mean the build output moved
    // out of the directory the rules already cover.
    assert(!ignored.has(".output/server/index.mjs"), ".output must NOT be ignored — the build output belongs in dist/");
    if (isMono) {
      if (hasApp) {
        assert(!ignored.has("apps/website/.env"), "apps/website/.env must be committed — it carries DEV_PROXY");
        assert(ignored.has("apps/website/.env.local"), "apps/website/.env.local must be ignored");
        assert(ignored.has("apps/website/dist/index.html"), "apps/website/dist must be ignored");
      }
      if (existsSync(join(target, "packages/utils"))) {
        assert(ignored.has("packages/utils/dist/index.mjs"), "packages/utils/dist must be ignored");
      }
    }
    return `${copied.join(" ")} -> ${[...ignored].sort().join(" ")}`;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------- dev proxy
if (mode === "frontend" && !isMono) {
  check("the dev proxy is configured from DEV_PROXY with an explicit guard", () => {
    const config = read("vite.config.ts");
    assert(config.includes("proxyTransformer(env.DEV_PROXY)"), "vite.config.ts does not use proxyTransformer(env.DEV_PROXY)");
    assert(/if\s*\(\s*!env\.DEV_PROXY\s*\)/.test(config), "the DEV_PROXY guard line is missing");
    const env = read(".env");
    assert(env.includes("DEV_PROXY"), ".env has no DEV_PROXY");
    // The target is the answer, or the placeholder it was answered with — a frontend's backend may
    // not exist yet, which is what makes the placeholder a legitimate answer.
    assert(
      env.includes(answers.GUIDE_DEV_PROXY || "http://127.0.0.1:3000"),
      `.env does not point at ${answers.GUIDE_DEV_PROXY || "http://127.0.0.1:3000"}`,
    );
    // The prefix is a regular expression, so the trailing slash is what keeps /apix/... out of the
    // proxy; without it the dev server proxies paths the production edge would not.
    assert(env.includes("'/api/'"), "the proxy prefix is not '/api/' — without the trailing slash /apix/... is proxied too");
    assert(manifest.devDependencies?.["vite-proxy-from-env"] === "1.1.0", "vite-proxy-from-env is not pinned to 1.1.0");
    return "proxy + guard + pinned plugin";
  });
}

// ------------------------------------------------------------------ documents
check("AGENTS.md keeps the tool-owned block and gains the project constraints", () => {
  const agents = read("AGENTS.md");
  const start = agents.indexOf("<!--VITE PLUS START-->");
  const end = agents.indexOf("<!--VITE PLUS END-->");
  assert(start >= 0 && end > start, "the Vite+ marked block is gone");
  const constraints = agents.indexOf("## Project constraints");
  assert(constraints > end, "the project constraints section is missing or not after the Vite+ block");
  const section = agents.slice(constraints);
  assert(section.includes("vp env doctor"), "the constraints section must correct the global-only `vp env doctor` advice");
  assert(section.includes("agent-notes") || section.includes("docs/"), "the constraints section does not point at docs/agent-notes.md");
  // The profile-specific rules are the profile's own: a frontend project has no server to
  // describe, a same-origin fullstack project no dev proxy, and a split project's proxy rules are
  // the package-level ones — so a section for another profile would be a wrong instruction.
  assert(
    section.includes("### Server") === hasServer,
    hasServer ? "the constraints section does not describe the server" : "a frontend project has no server to describe",
  );
  assert(
    section.includes("### Development proxy") === hasProxy,
    hasProxy ? "the constraints section does not describe the dev proxy" : "this profile has no dev proxy to describe",
  );
  if (isSsr) {
    assert(
      section.includes("### Rendering (SSR)"),
      "the SSR profile's constraints section does not describe the SSR shape",
    );
  }
  if (isMono) {
    assert(
      section.includes("### Workspace (monorepo)"),
      "the monorepo layout's constraints section does not describe the workspace rules",
    );
    assert(
      section.includes("vp run -r"),
      "the workspace rules do not say how cross-package commands are run",
    );
  }
  // The constraints are the profile's, not only at section level: a rule that names a file or a
  // package this project does not have is a wrong instruction, so the paths a shape does not own
  // must not appear in its constraints. (`apps/website` in a backend workspace, `#/server/…` in a
  // frontend one.)
  if (mode === "backend" && isMono) {
    assert(
      !section.includes("apps/website"),
      "the backend workspace's constraints describe apps/website, which this project deletes",
    );
  }
  if (mode === "frontend") {
    assert(
      !section.includes("#/server/"),
      "a frontend project's constraints describe #/server/…, which this project does not have",
    );
  }
  return `${agents.length} bytes`;
});

check("the setup decision point left the trace its branch says it should", () => {
  const agents = read("AGENTS.md");
  const provenance = read(join("docs", "provenance.md"));

  if (setupRan) {
    // The flow's product is the skill's own output: the tracker file for the answered tracker, the
    // label vocabulary (only when `triage` is installed — the skill's own rule), and the convention.
    const trackerFile = join("docs", "agents", "issue-tracker.md");
    assert(existsSync(join(target, trackerFile)), "the setup flow wrote no docs/agents/issue-tracker.md");
    const tracker = read(trackerFile);
    const trackerExpectation = {
      github: /# Issue tracker: GitHub/,
      gitlab: /# Issue tracker: GitLab/,
      local: /local markdown/i,
    }[answers.GUIDE_TRACKER];
    assert(trackerExpectation, `assert.mjs has no expectation for GUIDE_TRACKER=${answers.GUIDE_TRACKER}`);
    assert(trackerExpectation.test(tracker), `docs/agents/issue-tracker.md is not the ${answers.GUIDE_TRACKER} seed`);
    const triageInstalled = existsSync(join(target, ".agents", "skills", "triage", "SKILL.md"));
    const labels = join("docs", "agents", "triage-labels.md");
    assert(
      existsSync(join(target, labels)) === triageInstalled,
      triageInstalled
        ? "the setup flow wrote no docs/agents/triage-labels.md although the triage skill is installed"
        : "the setup flow wrote a label vocabulary although the triage skill is not installed",
    );
    assert(existsSync(join(target, "docs", "agents", "domain.md")), "the setup flow wrote no docs/agents/domain.md");

    // The brief is in place, points at each file the flow wrote, and sits between the tool-owned
    // block and the constraints — the two sections that are not the skill's to rewrite.
    const blockAt = agents.indexOf("## Agent skills");
    assert(blockAt >= 0, "AGENTS.md has no ## Agent skills block although the setup flow ran");
    assert(agents.indexOf("<!--VITE PLUS END-->") < blockAt, "the ## Agent skills block is not after the tool-owned block");
    assert(blockAt < agents.indexOf("## Project constraints"), "the ## Agent skills block is not before the project constraints");
    assert(/### Issue tracker[\s\S]*docs\/agents\/issue-tracker\.md/.test(agents), "the brief does not point at docs/agents/issue-tracker.md");
    assert(/### Domain docs[\s\S]*docs\/agents\/domain\.md/.test(agents), "the brief does not point at docs/agents/domain.md");
    assert(
      agents.includes("### Triage labels") === triageInstalled,
      "the brief's triage-labels sub-block does not follow whether the triage skill is installed",
    );

    // The convention names the layout the user confirmed and the ADR directory the landing came from.
    const domain = read(join("docs", "agents", "domain.md"));
    const layoutWord = answers.GUIDE_DOMAIN_LAYOUT === "multi" ? "multi-context" : "single-context";
    assert(domain.includes(layoutWord), `docs/agents/domain.md does not record the ${layoutWord} layout`);
    assert(domain.includes(`${adrDir}/`), `docs/agents/domain.md does not name the ADR directory ${adrDir}/`);

    assert(!/was never negotiated|was deferred/i.test(provenance), "the provenance records a deferral although the setup flow ran");
  } else {
    assert(!existsSync(join(target, "docs", "agents")), "the setup flow was declined but docs/agents/ exists");
    assert(!/^## Agent skills[ \t]*$/m.test(agents), "the setup flow was declined but AGENTS.md carries its brief");
    assert(/deferred|assumption/i.test(provenance), "the provenance does not record the deferred setup as an assumption");
  }
  return setupRan ? `${answers.GUIDE_TRACKER} tracker, ${answers.GUIDE_DOMAIN_LAYOUT || "single"}-context` : "deferred";
});

check("the inherited ADRs land where the project's own convention says", () => {
  // The expected directory comes from the answer — and that is sound here for a reason worth
  // naming: Phase 4.5's flow writes the convention *from* the answer (it replaces the seed's
  // `docs/adr/` with `GUIDE_ADR_DIR`), so convention and answer agree by construction. GUIDE.md's
  // `adr-convention` reads the convention back, and the answer-driven expectation below is what
  // makes a hardcoded path fail: `frontend/single` answers a directory that is not `docs/adr/`.
  // That the *file* wins when the two disagree is proven by `run.sh`'s planted-convention control,
  // which runs the resolver directly and reads its stdout — not here. If the flow ever stops
  // writing the convention from the answer, this expectation has to be read out of the convention
  // instead.
  const dir = join(target, adrDir);
  const files = existsSync(dir) ? readdirSync(dir).sort() : [];
  assert(files.length > 0, `no inherited ADR landed in ${adrDir}/ (found nothing)`);
  assert(files.some((f) => /^0001-.*\.md$/.test(f)), `no 0001-* ADR in ${adrDir}/ (found ${files.join(", ") || "nothing"})`);
  assert(files.some((f) => /^0002-.*\.md$/.test(f)), `no 0002-* ADR in ${adrDir}/ (found ${files.join(", ") || "nothing"})`);
  const hasServerAdr = files.some((f) => /^0003-.*\.md$/.test(f));
  assert(hasServerAdr === hasServer, hasServer ? "a server profile must write the server-foundation ADR" : "a pure frontend must not write the server ADR");
  // The shape's own ADR is the shape's, and only that shape's: the 0004 slot is per project, and
  // each shape fills it with its own file — the two fullstack shapes, the backend workspace and the
  // frontend workspace each have one, and the single-layout frontend and backend have none. A
  // project told about a shape it does not have is a project told about files it does not have,
  // which is the profile-filtering rule the whole document set follows.
  const expectedShapeAdr = isSsr
    ? "0004-ssr-shape.md"
    : isSplit
      ? "0004-split-shape.md"
      : mode === "backend" && isMono
        ? "0004-backend-workspace.md"
        : mode === "frontend" && isMono
          ? "0004-frontend-workspace.md"
          : null;
  const shapeAdrs = files.filter((f) => /^0004-.*\.md$/.test(f));
  if (expectedShapeAdr) {
    assert(shapeAdrs.includes(expectedShapeAdr), `this shape must write ${expectedShapeAdr} (found ${shapeAdrs.join(", ") || "nothing"})`);
    assert(shapeAdrs.length === 1, `exactly one 0004-* ADR belongs in this profile, found ${shapeAdrs.join(", ")}`);
  } else {
    assert(shapeAdrs.length === 0, `no shape ADR belongs in this profile, found ${shapeAdrs.join(", ")}`);
  }
  // How much structure an ADR carries is the author's call (the repo's ADR format treats the
  // extra sections as optional), so this only asserts they are real documents.
  for (const file of files) {
    const body = readFileSync(join(dir, file), "utf8");
    assert(/^# \S/m.test(body), `${file} has no title`);
    assert(body.length > 200, `${file} looks empty (${body.length} bytes)`);
  }
  // The default directory holds no inherited ADR when the convention named another one: a project
  // whose convention moved them and which still carries `docs/adr/` has two truths about where its
  // decisions live.
  if (adrDir !== "docs/adr") {
    const fallback = join(target, "docs", "adr");
    const straddling = existsSync(fallback) ? readdirSync(fallback).filter((f) => /^\d{4}-.*\.md$/.test(f)) : [];
    assert(straddling.length === 0, `the inherited ADRs are also in the default docs/adr/ (${straddling.join(", ")}), not only in ${adrDir}/`);
  }
  return `${adrDir}/: ${files.join(" ")}`;
});

check("every document that points at the ADR directory names the one the convention resolved", () => {
  // Two kinds of pointer, and both are checked: the documents written at run time name the resolved
  // directory, and the notes — shipped text, which cannot know a path this run decides — points at
  // the record instead. A path that is right in one run and stale in another is the kind of quiet
  // wrongness these documents exist to prevent.
  const agents = read("AGENTS.md");
  const notes = read(join("docs", "agent-notes.md"));
  const provenance = read(join("docs", "provenance.md"));
  for (const [name, body] of [["AGENTS.md", agents], ["docs/provenance.md", provenance]]) {
    assert(body.includes(`${adrDir}/`), `${name} does not name the ADR directory (${adrDir}/)`);
    if (adrDir !== "docs/adr") {
      assert(!body.includes("docs/adr/"), `${name} points at docs/adr/, which is not where the inherited ADRs landed`);
    }
  }
  assert(/docs\/provenance\.md/.test(notes), "docs/agent-notes.md does not point at the record for the ADR directory");
  assert(!notes.includes("docs/adr/"), "docs/agent-notes.md names an ADR path; the shipped notes must point at the record instead");
  // The provenance says where the landing point came from, so a later migration is a decision:
  // the convention when the setup flow ran, the guide's default (an assumption) when it did not.
  if (setupRan) {
    assert(
      /docs\/agents\/domain\.md/.test(provenance),
      "the provenance does not record the convention the landing point came from",
    );
  } else {
    assert(/deferred/i.test(provenance) && /default/i.test(provenance), "the provenance does not say the landing point is the default");
  }
  return "AGENTS.md, docs/agent-notes.md, docs/provenance.md";
});

check("the run leaves no scratch of its own behind", () => {
  // The run keeps its intermediate state in `.vite-plus-*` entries at the project root (the create
  // log, the staged inherited ADRs, the resolved landing point, the check log). Every one of them
  // is the run's own bookkeeping, so a project that still carries one carries something the guide
  // did not finish with — which is also how a half-done landing would show up.
  const leftovers = readdirSync(target).filter((entry) => entry.startsWith(".vite-plus"));
  assert(leftovers.length === 0, `the run left its own scratch behind: ${leftovers.join(", ")}`);
  return "no .vite-plus-* entries";
});

check("agent-notes.md records the known traps and is referenced from AGENTS.md", () => {
  const notes = read(join("docs", "agent-notes.md"));
  assert(notes.includes("vp check"), "agent-notes.md does not mention the check/build split");
  assert(/traps|limits|known/i.test(notes), "agent-notes.md does not present itself as a traps list");
  assert(read("AGENTS.md").includes("agent-notes.md"), "AGENTS.md does not point at docs/agent-notes.md");
  if (mode === "backend") {
    assert(/Nitro/i.test(notes), "agent-notes.md does not mention Nitro");
    assert(notes.includes(".output"), "agent-notes.md does not warn about Nitro's default .output/ directory");
    assert(!notes.includes("DEV_PROXY"), "a backend project has no dev proxy to record");
    if (isMono) {
      assert(notes.includes("defaultPackage"), "agent-notes.md does not record that the root needs defaultPackage");
      assert(/vp run -r/.test(notes), "agent-notes.md does not record the `-r` skip semantics");
      assert(/catalog/.test(notes), "agent-notes.md does not record the workspace catalog");
      assert(
        /vp run <package>#<task>|website#dev/.test(notes),
        "agent-notes.md does not record the silent no-op a package-name script becomes",
      );
      assert(
        !notes.includes("apps/website"),
        "the backend workspace's notes describe apps/website, which this project deletes",
      );
    }
  } else if (isSsr) {
    assert(/Nitro/i.test(notes), "agent-notes.md does not mention Nitro");
    assert(notes.includes("ssr-outlet"), "agent-notes.md does not record the `<!--ssr-outlet-->` silent degradation");
    assert(notes.includes("entry-server"), "agent-notes.md does not record the SSR entry contract");
    assert(/hydrat/i.test(notes), "agent-notes.md does not say what is not verified about hydration");
    assert(!notes.includes("DEV_PROXY"), "the SSR shape has no dev proxy to record");
  } else if (isSplit) {
    assert(/Nitro/i.test(notes), "agent-notes.md does not mention Nitro");
    assert(notes.includes(".output"), "agent-notes.md does not warn about Nitro's default .output/ directory");
    assert(notes.includes("DEV_PROXY"), "agent-notes.md does not record the dev-proxy traps of this shape");
    // The workspace's own traps, each one measured: they are the reason a monorepo's rules differ
    // from a single project's.
    assert(notes.includes("defaultPackage"), "agent-notes.md does not record that the root needs defaultPackage");
    assert(/vp run -r/.test(notes), "agent-notes.md does not record the `-r` skip semantics");
    assert(/catalog/.test(notes), "agent-notes.md does not record the workspace catalog");
  } else if (mode === "frontend" && isMono) {
    // A frontend workspace: the proxy traps, the workspace traps, and none of the server's.
    assert(notes.includes("DEV_PROXY"), "agent-notes.md does not record the dev-proxy traps of this shape");
    assert(/vp run -r/.test(notes), "agent-notes.md does not record the `-r` skip semantics");
    assert(/catalog/.test(notes), "agent-notes.md does not record the workspace catalog");
    assert(!/Nitro/i.test(notes), "a frontend workspace has no Nitro server to record");
    assert(!notes.includes(".output"), "agent-notes.md warns about Nitro's .output in a project with no Nitro");
    assert(
      !notes.includes("defaultPackage"),
      "agent-notes.md tells a shell root about defaultPackage, which this layout does not set",
    );
  } else {
    assert(notes.includes("DEV_PROXY"), "agent-notes.md does not record the dev-proxy traps");
  }
  return `${notes.split("\n").length} lines`;
});

check("the shipped documents cover exactly the items the coverage table declares", () => {
  // Both directions of the alignment, in one run: every declared row's text is present (an item
  // the shape should carry but does not is an omission), and every bullet the project carries is
  // claimed by a row (a bullet with no source item is fabrication). The third property — per-shape
  // trimming — is what `when` does inside both: a row the profile does not take is absent here,
  // and a bullet that leaked in from another shape has no row to claim it.
  const result = auditCoverage((relative) => read(relative), answers);
  assert(result.failures.length === 0, result.failures.join("; "));
  coverage = result;
  return `${result.items} source items landed (${result.claims} rows), ${result.bullets} shipped bullets claimed`;
});

check("provenance.md records resolved versions, the skills commit, and the choices", () => {
  const provenance = read(join("docs", "provenance.md"));
  assert(provenance.includes(answers.GUIDE_VP_VERSION), `provenance does not mention vite-plus@${answers.GUIDE_VP_VERSION}`);
  assert(provenance.includes("create-vite"), "provenance does not record the resolved create-vite version");
  assert(/mattpocock\/skills/.test(provenance), "provenance does not name the skills upstream");
  assert(/[0-9a-f]{40}/.test(provenance), "provenance does not record a skills commit hash");
  assert(provenance.includes(answers.GUIDE_FRAMEWORK), `provenance does not record the framework (${answers.GUIDE_FRAMEWORK})`);
  assert(provenance.includes(answers.GUIDE_PM), "provenance does not record the package manager");
  assert(provenance.includes(answers.GUIDE_MODE), "provenance does not record the mode");
  assert(provenance.includes(answers.GUIDE_LAYOUT), "provenance does not record the layout");
  assert(provenance.includes(answers.GUIDE_TS_VERSION), "provenance does not record the pinned TypeScript line");
  assert(
    provenance.includes(`skills@${answers.GUIDE_SKILLS_VERSION}`),
    "provenance does not record the pinned skills installer",
  );
  assert(/Skills installed\s+\|\s+[1-9]/.test(provenance), "provenance does not record how many skills were installed");
  // The decision the user made at Phase 4.5, and — in the layout that has one — the placeholder
  // answer: both are choices, not facts to infer from the produced tree.
  assert(
    new RegExp(`^\\|\\s*Skills setup run now\\s*\\|\\s*${answers.GUIDE_SETUP}\\b`, "m").test(provenance),
    `provenance does not record the setup decision (${answers.GUIDE_SETUP})`,
  );
  if (isMono) {
    assert(
      new RegExp(`^\\|\\s*Placeholder package\\s*\\|\\s*${answers.GUIDE_PLACEHOLDER}\\b`, "m").test(provenance),
      `provenance does not record the placeholder decision (${answers.GUIDE_PLACEHOLDER})`,
    );
  }
  // What resolved, not what was asked for: the versions in the table are read back out of the
  // target's own node_modules, so a record that kept only the requested range fails here.
  const resolvedVp = resolvedVersion(".", "vite-plus");
  assert(provenance.includes(resolvedVp), `provenance does not record the vite-plus that resolved (${resolvedVp})`);
  if (isMono && compiledPackage) {
    const resolvedTs = resolvedVersion(compiledPackage, "typescript");
    assert(provenance.includes(resolvedTs), `provenance does not record the TypeScript that resolved (${resolvedTs})`);
  } else if (!isMono) {
    const resolvedTs = resolvedVersion(".", "typescript");
    assert(provenance.includes(resolvedTs), `provenance does not record the TypeScript that resolved (${resolvedTs})`);
  } else {
    // A workspace whose only package is the root has no package that compiles with its own
    // TypeScript: the record states that fact, and nothing in the workspace gets to contradict it
    // by holding an installation the record says is not there.
    assert(
      /not installed in a package of this workspace/.test(provenance),
      "the workspace has no compiled package, but the record does not state the TypeScript fact",
    );
    for (const base of ["apps/website", "packages/utils"]) {
      assert(
        !existsSync(join(target, base, "node_modules", "typescript")),
        `${base}/node_modules/typescript exists although the record says no package carries one`,
      );
    }
  }
  // The one unpinnable piece: the row has to carry a version or say plainly that this run could not
  // read one. A blank cell, or a pointer to a note the reader cannot see, is not a record.
  const createVite = /^\|\s*create-vite\s*\|\s*([^|]+?)\s*\|/m.exec(provenance);
  assert(createVite, "provenance has no create-vite row");
  assert(
    /^\d+\.\d+\.\d+/.test(createVite[1]) || /not printed by this run/.test(createVite[1]),
    `the create-vite row records neither a version nor that it could not be read: ${createVite[1]}`,
  );
  // A record that names a fact the project does not have is worse than no record: a project with a
  // server must record the pin, and only a project with a proxy may claim a proxy target.
  if (hasServer) {
    assert(provenance.includes(answers.GUIDE_NITRO_VERSION), "provenance does not record the pinned nitro version");
    const resolvedNitro = resolvedVersion(".", "nitro");
    assert(provenance.includes(resolvedNitro), `provenance does not record the nitro that resolved (${resolvedNitro})`);
    assert(!/Dev proxy target/.test(provenance), "the provenance record claims a proxy to someone else's backend");
    if (isSsr) {
      assert(/SSR/.test(provenance), "provenance does not record that this project's shape is SSR");
    }
    if (isSplit) {
      assert(provenance.includes("vite:monorepo"), "provenance does not record the monorepo scaffold template");
      assert(/Placeholder package/.test(provenance), "provenance does not record the placeholder-package decision");
      assert(provenance.includes("apps/website"), "provenance does not record where the frontend lives");
      assert(
        provenance.includes(`127.0.0.1:${answers.GUIDE_DEV_PORT}`),
        "provenance does not record the proxy target (the root server's address)",
      );
      assert(!/no dev proxy/.test(provenance), "the split shape has a dev proxy; the record must not deny it");
    }
    if (mode === "backend" && isMono) {
      assert(provenance.includes("vite:monorepo"), "provenance does not record the monorepo scaffold template");
      assert(/Placeholder package/.test(provenance), "provenance does not record the placeholder-package decision");
      assert(
        !provenance.includes("apps/website"),
        "the provenance record claims a frontend (apps/website) in a project that deleted it",
      );
    }
  } else {
    assert(provenance.includes("Dev proxy target"), "provenance does not record the dev proxy target");
    assert(!/nitro@/.test(provenance), "the provenance record claims a server in a project that has none");
    if (isMono) {
      assert(provenance.includes("vite:monorepo"), "provenance does not record the monorepo scaffold template");
      assert(/Placeholder package/.test(provenance), "provenance does not record the placeholder-package decision");
      assert(provenance.includes("apps/website"), "provenance does not record where the app lives");
      assert(/Server \| none|no server/i.test(provenance), "the provenance record does not say this workspace has no server");
    }
  }
  // Structure, not only content: the closing section has to still be a heading. The deferred
  // branch's assumption paragraph is a shell interpolation, and a paragraph whose last line runs
  // into the next `##` silently stops it from being a heading at all — which is how this assertion
  // found its own bug once.
  assert(
    /^## If something looks wrong$/m.test(provenance),
    "the provenance's closing section is not a heading (a paragraph ran into it)",
  );
  if (!setupRan) {
    assert(
      /^## Assumptions worth revisiting$/m.test(provenance),
      "the deferred branch's assumption paragraph is not a section of its own",
    );
  }
  return `${provenance.split("\n").length} lines`;
});

// --------------------------------------------------------------------- skills
check("the upstream-declared promoted skills are installed and the lockfile agrees", async () => {
  // The contract is "the installed set equals the set upstream declares", not "there are 25
  // skills": the count is resolved at run time so an upstream promotion is picked up rather
  // than hard-failing. The number this run installed is reported, not asserted.
  const manifestResponse = await fetch(
    "https://raw.githubusercontent.com/mattpocock/skills/main/.claude-plugin/plugin.json",
  );
  assert(manifestResponse.ok, `could not read the upstream manifest (${manifestResponse.status})`);
  const upstream = (await manifestResponse.json()).skills.map((path) => path.replace(/\/+$/, "").split("/").pop());
  assert(upstream.length > 0, "the upstream manifest declares no promoted skills");

  const lock = readJson("skills-lock.json");
  const locked = Object.keys(lock.skills).sort();
  const expected = [...upstream].sort();
  const missing = expected.filter((name) => !locked.includes(name));
  const extra = locked.filter((name) => !expected.includes(name));
  assert(missing.length === 0, `lockfile is missing: ${missing.join(", ")}`);
  assert(extra.length === 0, `lockfile has skills outside the promoted group: ${extra.join(", ")}`);
  assert(lock.version === 1, `unexpected lockfile version ${lock.version}`);
  for (const name of locked) {
    assert(lock.skills[name].skillPath && lock.skills[name].computedHash, `lockfile entry ${name} has no skillPath/computedHash`);
  }

  const skillRoot = join(target, ".agents", "skills");
  assert(existsSync(skillRoot), ".agents/skills/ does not exist");
  const dirs = readdirSync(skillRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const notDirs = expected.filter((name) => !dirs.includes(name));
  assert(notDirs.length === 0, `.agents/skills/ has no directory for: ${notDirs.join(", ")}`);
  for (const name of expected) {
    assert(existsSync(join(skillRoot, name, "SKILL.md")), `.agents/skills/${name}/SKILL.md is missing`);
  }
  assert(dirs.length === expected.length, `.agents/skills/ holds ${dirs.length} directories, expected ${expected.length}`);
  assert(!existsSync(join(target, ".claude", "skills")), "the install must not create .claude/skills (universal agent only)");
  return `${locked.length} skills installed, matching the upstream declaration, every SKILL.md present`;
});

check("build output exists and is not committed to the source tree", () => {
  // The shape's primary artefact: the page in a pure frontend (the app package in the workspace
  // layout), the server bundle in every shape that has a server. The other outputs are asserted
  // with each profile's own checks above.
  const expected =
    mode === "frontend"
      ? isMono
        ? join("apps", "website", "dist", "index.html")
        : join("dist", "index.html")
      : join("dist", "server", "index.mjs");
  assert(existsSync(join(target, expected)), `${expected} is missing — the verify build did not produce output`);
  return expected;
});

// -------------------------------------------------------------- reported set
await Promise.all(pending);

if (!shape.isAccepted) {
  failures.push(`no assertions are implemented for mode=${mode} layout=${layout}; add them before trusting a green run`);
}

// The numbers this run computed, as fields rather than as a sentence for someone to parse:
// `e2e/run.sh` passes `--summary` and `e2e/record.mjs` reads the fields, falling back to the run
// log for a run directory that predates them.
if (args.summary) {
  const fields = { checks: checked, failures: failures.length };
  if (coverage) {
    fields.items = coverage.items;
    fields.bullets = coverage.bullets;
  }
  writeFileSync(args.summary, Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
}

console.log(`\n${checked} checks, ${failures.length} failure(s)`);
if (failures.length) {
  console.error("\nFailed checks:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
