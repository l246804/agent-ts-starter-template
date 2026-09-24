#!/usr/bin/env node
/**
 * Extract the machine-executable plan out of GUIDE.md.
 *
 * GUIDE.md is both the product (a document an agent reads) and the single source
 * of truth the E2E harness executes. The link between the two is a fence-marker
 * convention; this script is the only implementation of it.
 *
 * A fenced code block whose info string contains a `guide:` token is a step:
 *
 *   ```bash guide:exec id=alias                       -> run this shell text verbatim
 *   ```markdown guide:file path=docs/notes.md         -> write this text to that path
 *   ```bash guide:verify id=verify                    -> the assertion set; always last
 *
 * A file block's path is its final path; the inherited ADRs are the one deliberate exception,
 * because where they land is decided at run time by the target project's own convention. They are
 * staged under `.vite-plus-inherited-adrs/` and the guide's `adr-land` step installs them.
 *
 * Extra attributes:
 *   when=mode:frontend|backend        include the step only when GUIDE_MODE matches
 *   when=mode:fullstack&layout:single every clause must match (one `|` alternative each)
 *
 * Anything else in the info string (a language tag, prose) is ignored, so blocks
 * without a `guide:` token document the guide without becoming steps.
 *
 * Output (--out <dir>):
 *   plan.json          ordered manifest (the readable record)
 *   plan.tsv           the same order in tab-separated columns, which is what the runner reads:
 *                      number, kind, id, payload (script for exec/verify, source for file),
 *                      destination path (file steps only)
 *   steps/NNNN-<id>.sh exec/verify bodies, byte-identical to GUIDE.md
 *   files/<path>       file bodies, byte-identical to GUIDE.md
 *
 * Checks (all fatal, because a silently wrong plan would make the E2E lie):
 *   - ids unique; every exec/verify block has one
 *   - every file block has a relative path that cannot escape the target
 *   - exactly one verify block, and it is the last step
 *   - exec/verify bodies start with `set -euo pipefail`
 *   - exec/verify bodies parse (bash -n), so a quoting mistake fails here in milliseconds
 *     instead of minutes into an end-to-end run
 *   - exec/verify bodies never reference this repository's own research docs
 *   - every $GUIDE_xxx a step needs is either answered or has a `:-` default
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { readAnswers } from "./lib/answers.mjs";

const KINDS = new Set(["exec", "file", "verify"]);

function fail(message) {
  console.error(`extract: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { guide: "GUIDE.md", out: null, answers: null, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--guide") args.guide = argv[++i];
    else if (token === "--out") args.out = argv[++i];
    else if (token === "--answers") args.answers = argv[++i];
    else if (token === "--list") args.list = true;
    else if (token === "--help") {
      console.log("usage: extract.mjs --guide GUIDE.md --out DIR [--answers answers.env] [--list]");
      process.exit(0);
    } else fail(`unknown argument ${token}`);
  }
  if (!args.out) fail("--out is required");
  return args;
}

/** Minimal .env reader: KEY=VALUE lines, # comments, optional surrounding quotes. */
function loadAnswers(path) {
  if (!path) return {};
  try {
    return readAnswers(path);
  } catch (error) {
    fail(error.message);
  }
}

/**
 * CommonMark-ish fence scan. Returns every fenced block with its raw body so the
 * extracted text is byte-identical to what GUIDE.md contains.
 */
function scanFences(text) {
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!open) {
      i += 1;
      continue;
    }
    const char = open[2][0];
    const length = open[2].length;
    const closeRe = new RegExp(`^ {0,3}\\${char}{${length},}[ \t]*$`);
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j])) j += 1;
    if (j >= lines.length) fail(`unterminated fence opened at line ${i + 1}`);
    blocks.push({
      info: open[3].trim(),
      line: i + 1,
      body: lines.slice(i + 1, j).join("\n") + "\n",
    });
    i = j + 1;
  }
  return blocks;
}

function parseInfo(info) {
  const attrs = {};
  let kind = null;
  const tokens = info.length ? info.split(/\s+/) : [];
  for (const token of tokens) {
    if (token.startsWith("guide:")) {
      const candidate = token.slice("guide:".length);
      if (!KINDS.has(candidate)) fail(`unknown guide kind in info string: ${info}`);
      if (kind) fail(`two guide kinds in one info string: ${info}`);
      kind = candidate;
      continue;
    }
    const eq = token.indexOf("=");
    if (eq > 0) {
      const key = token.slice(0, eq);
      let value = token.slice(eq + 1);
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      attrs[key] = value;
    }
  }
  return { kind, attrs };
}

/**
 * when=mode:frontend|backend — one answer, an alternative per value.
 * when=mode:fullstack&layout:single — one clause per `&`, and all of them must match: a mode can
 * hold two shapes (fullstack is SSR in the `single` layout and split in the `monorepo` one), so a
 * step that belongs to only one of them has to name both answers.
 */
function whenMatches(expr, answers) {
  return expr.split("&").every((clause) => {
    const colon = clause.indexOf(":");
    if (colon < 0) fail(`bad when clause (expected key:value): ${clause}`);
    const key = `GUIDE_${clause.slice(0, colon).toUpperCase()}`;
    const alternatives = clause.slice(colon + 1).split("|");
    const actual = answers[key];
    if (actual === undefined) fail(`when clause references unanswered ${key}`);
    return alternatives.includes(actual);
  });
}

function requiredAnswers(body) {
  const needed = new Set();
  const pattern =
    /\$\{(GUIDE_[A-Z0-9_]+)(:-[^}]*)?\}|\$(GUIDE_[A-Z0-9_]+)/g;
  for (const match of body.matchAll(pattern)) {
    const name = match[1] ?? match[3];
    const hasDefault = match[1] !== undefined && match[2] !== undefined;
    if (!hasDefault) needed.add(name);
  }
  return needed;
}

/**
 * The big scripts inside a step are quoted heredocs, so their bytes reach Node unchanged and
 * can be syntax-checked here. Catching a typo in milliseconds beats catching it after a
 * five-minute end-to-end run has already downloaded a scaffold.
 */
function checkEmbeddedNode(body, id) {
  const heredoc = /node(?: --input-type=(module|commonjs))? - <<'([A-Za-z_][A-Za-z0-9_]*)'\n([\s\S]*?)\n\2(?:\n|$)/g;
  for (const match of body.matchAll(heredoc)) {
    const [, inputType, , script] = match;
    const args = inputType ? ["--input-type=" + inputType, "--check", "-"] : ["--check", "-"];
    const result = spawnSync("node", args, { input: script, encoding: "utf8" });
    if (result.error || result.status !== 0) {
      const detail = (result.stderr || result.error?.message || "").trim();
      fail(`guide:step "${id}" embeds a Node script that does not parse:\n${detail}`);
    }
  }
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const guidePath = resolve(args.guide);
  const guide = readFileSync(guidePath, "utf8");
  const answers = loadAnswers(args.answers);

  const raw = [];
  for (const block of scanFences(guide)) {
    const { kind, attrs } = parseInfo(block.info);
    if (kind) raw.push({ ...block, kind, attrs });
  }
  if (!raw.length) fail(`${args.guide} contains no guide: blocks`);

  const steps = [];
  const seenIds = new Set();
  for (const block of raw) {
    if (block.attrs.when && !whenMatches(block.attrs.when, answers)) continue;
    const { kind, attrs } = block;
    if (kind === "file") {
      if (!attrs.path) fail(`file block at line ${block.line} has no path=`);
      if (/^([/\\]|[A-Za-z]:)/.test(attrs.path)) fail(`file path is absolute: ${attrs.path}`);
      const normalized = resolve("/target", attrs.path);
      if (!normalized.startsWith("/target" + sep)) fail(`file path escapes the target: ${attrs.path}`);
      const id = attrs.id ?? (slug(attrs.path) || `file-${steps.length + 1}`);
      if (seenIds.has(id)) fail(`duplicate step id: ${id}`);
      seenIds.add(id);
      steps.push({
        kind,
        id,
        path: attrs.path,
        line: block.line,
        body: block.body,
        sha256: createHash("sha256").update(block.body).digest("hex"),
      });
      continue;
    }
    if (!attrs.id) fail(`guide:${kind} block at line ${block.line} has no id=`);
    if (seenIds.has(attrs.id)) fail(`duplicate step id: ${attrs.id}`);
    seenIds.add(attrs.id);
    if (!block.body.startsWith("set -euo pipefail")) {
      fail(`guide:${kind} "${attrs.id}" must start with: set -euo pipefail`);
    }
    const syntax = spawnSync("bash", ["-n"], { input: block.body, encoding: "utf8" });
    if (syntax.error || syntax.status !== 0) {
      const detail = (syntax.stderr || syntax.error?.message || "").trim();
      fail(`guide:${kind} "${attrs.id}" is not valid shell:\n${detail}`);
    }
    checkEmbeddedNode(block.body, attrs.id);
    for (const marker of ["docs/research/", "docs/constraints.md"]) {
      if (block.body.includes(marker)) {
        fail(`guide:${kind} "${attrs.id}" references this repo's ${marker}; the guide must stand alone`);
      }
    }
    const needed = requiredAnswers(block.body);
    const missing = [...needed].filter((name) => answers[name] === undefined);
    if (args.answers && missing.length) {
      fail(`guide:${kind} "${attrs.id}" needs unanswered ${missing.join(", ")}`);
    }
    steps.push({
      kind,
      id: attrs.id,
      line: block.line,
      body: block.body,
      sha256: createHash("sha256").update(block.body).digest("hex"),
      needs: [...needed].sort(),
    });
  }

  const verifies = steps.filter((step) => step.kind === "verify");
  if (verifies.length !== 1) fail(`expected exactly one guide:verify block, found ${verifies.length}`);
  const last = steps.findIndex((step) => step.kind === "verify");
  if (last !== steps.length - 1) fail("the guide:verify block must be the last step in GUIDE.md");

  if (args.list) {
    for (const [index, step] of steps.entries()) {
      console.log(
        `${String(index + 1).padStart(3, "0")}  ${step.kind.padEnd(6)}  ${step.id.padEnd(28)}  ${step.kind === "file" ? step.path : `line ${step.line}`}`,
      );
    }
    return;
  }

  const out = resolve(args.out);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "steps"), { recursive: true });

  const manifest = [];
  steps.forEach((step, index) => {
    const n = String(index + 1).padStart(4, "0");
    const entry = { n: index + 1, kind: step.kind, id: step.id, line: step.line, sha256: step.sha256 };
    if (step.needs) entry.needs = step.needs;
    if (step.kind === "file") {
      const file = join(out, "files", step.path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, step.body);
      entry.path = step.path;
      entry.file = relative(out, file);
    } else {
      const script = join(out, "steps", `${n}-${step.id}.sh`);
      writeFileSync(script, step.body, { mode: 0o755 });
      entry.script = relative(out, script);
    }
    manifest.push(entry);
  });

  writeFileSync(
    join(out, "plan.json"),
    JSON.stringify(
      {
        guide: relative(process.cwd(), guidePath),
        guideSha256: createHash("sha256").update(guide).digest("hex"),
        steps: manifest,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(out, "plan.tsv"),
    manifest
      .map((entry) => [entry.n, entry.kind, entry.id, entry.script ?? entry.file, entry.path ?? ""].join("\t"))
      .join("\n") + "\n",
  );
  console.log(`extract: ${manifest.length} steps -> ${relative(process.cwd(), out)}`);
}

main();
