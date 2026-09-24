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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAnswers } from "./lib/answers.mjs";

const args = { target: null, answers: null };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === "--target") args.target = process.argv[++i];
  else if (process.argv[i] === "--answers") args.answers = process.argv[++i];
  else {
    console.error(`assert: unknown argument ${process.argv[i]}`);
    process.exit(2);
  }
}
if (!args.target || !args.answers) {
  console.error("usage: assert.mjs --target <dir> --answers <answers.env>");
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
const mode = answers.GUIDE_MODE;
const layout = answers.GUIDE_LAYOUT;

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
  const spec = manifest.devDependencies?.typescript;
  const expected = answers.GUIDE_TS_VERSION;
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
  const imports = manifest.imports;
  assert(imports && imports["#/*"], "package.json has no `#/*` imports entry");
  const entry = imports["#/*"];
  assert(entry.types === "./*.ts", `imports types branch is ${JSON.stringify(entry.types)}`);
  assert(entry.default === "./*", `imports default branch is ${JSON.stringify(entry.default)}`);
  const keys = Object.keys(entry);
  assert(keys[0] === "types", `the types branch must come first, key order is ${keys.join(",")}`);

  const tsconfigs = readdirSync(target).filter((name) => /^tsconfig.*\.json$/.test(name));
  for (const name of tsconfigs) {
    const config = readTsconfig(name);
    assert(!("paths" in (config.compilerOptions ?? {})), `${name} still has compilerOptions.paths`);
    assert(!("baseUrl" in (config.compilerOptions ?? {})), `${name} still has compilerOptions.baseUrl (removed in TS7)`);
  }
  const viteConfig = read("vite.config.ts");
  assert(!viteConfig.includes("resolve.alias"), "vite.config.ts uses resolve.alias");
  assert(!viteConfig.includes("tsconfigPaths"), "vite.config.ts uses resolve.tsconfigPaths");
  return `${tsconfigs.length} tsconfig(s) checked`;
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
    assert(existsSync(join(target, "package.json")), "the prune took package.json with it");
    return "src/, public/, index.html absent";
  });

  check("nitro is pinned to the decided prerelease and installed", () => {
    const spec = manifest.devDependencies?.nitro;
    assert(spec, "nitro is not in devDependencies");
    assert(!String(spec).includes("latest"), `nitro is unpinned: ${spec}`);
    assert(
      spec === answers.GUIDE_NITRO_VERSION,
      `package.json says nitro@${spec}, the decision was ${answers.GUIDE_NITRO_VERSION}`,
    );
    // The repo's ADR-0003 fixes Nitro v3, and v3 has no stable release: a pin that had drifted
    // off the 3.x prerelease line would mean the decision record and the project disagree.
    assert(/^3\.\d/.test(spec), `ADR-0003 fixes Nitro v3; the pin is ${spec}`);
    assert(/-(beta|alpha|rc)/i.test(spec), `Nitro v3 is prerelease-only; ${spec} does not look like one`);
    const resolved = JSON.parse(
      readFileSync(join(target, "node_modules", "nitro", "package.json"), "utf8"),
    ).version;
    assert(resolved === answers.GUIDE_NITRO_VERSION, `node_modules/nitro resolved to ${resolved}`);
    return `nitro@${resolved} (v3 prerelease, pinned)`;
  });

  // The silent failure this catches: the scaffold writes no `plugins` key at all, so an import
  // without a call exits 0 while every route 404s. The verify block catches it behaviourally;
  // this catches it in the artefact, where the cause is visible.
  check("the Nitro plugin is registered, not merely imported", () => {
    const config = read("vite.config.ts");
    assert(/from\s+["']nitro\/vite["']/.test(config), "vite.config.ts does not import from nitro/vite");
    const keys = config.match(/plugins\s*:/g) ?? [];
    assert(keys.length === 1, `expected exactly one plugins entry in vite.config.ts, found ${keys.length}`);
    assert(/plugins:\s*\[nitro\(\)\]/.test(config), "the plugins array does not call nitro() — the server would be inert");
    return "plugins: [nitro()]";
  });

  check("the server sits at the project root and its routes carry no /api prefix", () => {
    assert(existsSync(join(target, "server", "routes", "hello.ts")), "server/routes/hello.ts is missing");
    assert(!existsSync(join(target, "server", "api")), "server/api/ exists — those routes are /api-prefixed");
    const nitro = read("nitro.config.ts");
    assert(/serverDir:\s*["']\.\/server["']/.test(nitro), "nitro.config.ts does not set serverDir: './server'");
    assert(/output:\s*\{\s*dir:\s*["']dist["']/.test(nitro), "nitro.config.ts does not send the output to dist");
    const tsconfig = readTsconfig("tsconfig.json");
    assert(tsconfig.extends === "nitro/tsconfig", `tsconfig.json extends ${JSON.stringify(tsconfig.extends)}`);
    for (const included of ["server", "tests"]) {
      assert((tsconfig.include ?? []).includes(included), `tsconfig.json does not include ${included}`);
    }
    return "server/routes/hello.ts, serverDir ./server, output dist, one tsconfig program";
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

// ------------------------------------------------------------------ gitignore
check("gitignore keeps .env and .vscode tracked, and build output ignored", () => {
  const probe = mkdtempSync(join(tmpdir(), "gitignore-probe-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: probe });
    copyFileSync(join(target, ".gitignore"), join(probe, ".gitignore"));
    const result = execFileSync(
      "git",
      [
        "check-ignore",
        "--no-index",
        "-v",
        ".env",
        ".env.local",
        ".vscode/settings.json",
        "dist/index.html",
        "dist/server/index.mjs",
        ".output/server/index.mjs",
        "node_modules/x",
      ],
      { cwd: probe, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
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
    return [...ignored].sort().join(" ");
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------- dev proxy
if (mode === "frontend") {
  check("the dev proxy is configured from DEV_PROXY with an explicit guard", () => {
    const config = read("vite.config.ts");
    assert(config.includes("proxyTransformer(env.DEV_PROXY)"), "vite.config.ts does not use proxyTransformer(env.DEV_PROXY)");
    assert(/if\s*\(\s*!env\.DEV_PROXY\s*\)/.test(config), "the DEV_PROXY guard line is missing");
    const env = read(".env");
    assert(env.includes("DEV_PROXY"), ".env has no DEV_PROXY");
    assert(env.includes(answers.GUIDE_DEV_PROXY), `.env does not point at ${answers.GUIDE_DEV_PROXY}`);
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
  // The mode-specific rules are the mode's own: a frontend project has no server to describe and
  // a backend project no dev proxy, so a section for the other mode would be a wrong instruction.
  if (mode === "backend") {
    assert(section.includes("### Server"), "the backend constraints section does not describe the server");
    assert(!section.includes("### Development proxy"), "a backend project has no dev proxy to describe");
  } else {
    assert(section.includes("### Development proxy"), "the frontend constraints section does not describe the dev proxy");
    assert(!section.includes("### Server"), "a frontend project has no server to describe");
  }
  return `${agents.length} bytes`;
});

check("inherited ADRs land in docs/adr with the profile's set", () => {
  const dir = join(target, "docs", "adr");
  const files = existsSync(dir) ? readdirSync(dir).sort() : [];
  assert(files.some((f) => /^0001-.*\.md$/.test(f)), `no 0001-* ADR (found ${files.join(", ") || "nothing"})`);
  assert(files.some((f) => /^0002-.*\.md$/.test(f)), `no 0002-* ADR (found ${files.join(", ") || "nothing"})`);
  const hasServer = ["backend", "fullstack"].includes(mode);
  const hasServerAdr = files.some((f) => /^0003-.*\.md$/.test(f));
  assert(hasServerAdr === hasServer, hasServer ? "a server mode must write the server-mode ADR" : "a pure frontend must not write the server ADR");
  // How much structure an ADR carries is the author's call (the repo's ADR format treats the
  // extra sections as optional), so this only asserts they are real documents.
  for (const file of files) {
    const body = readFileSync(join(dir, file), "utf8");
    assert(/^# \S/m.test(body), `${file} has no title`);
    assert(body.length > 200, `${file} looks empty (${body.length} bytes)`);
  }
  return files.join(" ");
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
  } else {
    assert(notes.includes("DEV_PROXY"), "agent-notes.md does not record the dev-proxy traps");
  }
  return `${notes.split("\n").length} lines`;
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
  // A record that names a fact the project does not have is worse than no record: a backend run
  // must not claim a dev proxy target, and a frontend run must not claim a server foundation.
  if (mode === "backend") {
    assert(provenance.includes(answers.GUIDE_NITRO_VERSION), "provenance does not record the pinned nitro version");
    assert(!/Dev proxy target/.test(provenance), "the provenance record claims a dev proxy in a project that has none");
  } else {
    assert(provenance.includes("Dev proxy target"), "provenance does not record the dev proxy target");
    assert(!/nitro@/.test(provenance), "the provenance record claims a server in a project that has none");
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
  const expected = mode === "backend" ? join("dist", "server", "index.mjs") : join("dist", "index.html");
  assert(existsSync(join(target, expected)), `${expected} is missing — the verify build did not produce output`);
  return expected;
});

// -------------------------------------------------------------- reported set
await Promise.all(pending);

const covered = { frontend: ["single"], fullstack: [], backend: ["single"] };
if (!covered[mode]?.includes(layout)) {
  failures.push(`no assertions are implemented for mode=${mode} layout=${layout}; add them before trusting a green run`);
}

console.log(`\n${checked} checks, ${failures.length} failure(s)`);
if (failures.length) {
  console.error("\nFailed checks:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
