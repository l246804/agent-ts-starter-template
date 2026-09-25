#!/usr/bin/env node
/**
 * The 路由表, and the plan it has to equal.
 *
 * A run does not read GUIDE.md: it reads the 索引 and the 分片 its own answers select. The 索引
 * carries a 路由表 — for each (形态, 布局) the files to fetch and the step ids to run, in order —
 * and this module is what keeps that table honest: it recomputes the plan from the markers in
 * GUIDE.md, through the same `when=` implementation the extractor uses, and compares it with the
 * table as written.
 *
 * A gate is either **shape-determined** (`mode:` and `layout:` clauses only) or not. Shape-
 * determined gates are inside the six rows: the row for a shape is the plan that shape produces.
 * The others are answer-determined — today `setup:yes` and `tnb:yes` — and each needs its own line
 * saying what it adds:
 *
 *   setup=yes: fetch: guide/parts/90-setup-yes.md; steps: setup-flow (after setup-guard)
 *
 * and, when no profile exercises the gate, the line is marked `unrun`:
 *
 *   unrun tnb=yes: fetch: guide/parts/20-tnb-yes.md; steps: manifest-tnb (after manifest)
 *
 * The `unrun` marker is the declaration that ends the silence: every `when=` value in GUIDE.md is
 * either matched by a profile or declared here, so a new gate that nothing runs fails the check
 * instead of shipping quietly. The reverse direction holds too — a gate declared `unrun` that a
 * profile does match is a stale declaration.
 *
 * The file behind a 分片 comes from `guide/parts.json` (the generated manifest), so the table, the
 * manifest and the guide's own markers stay one fact seen three times.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { markerLabel, parseInfo, scanFences, whenMatches } from "./extract.mjs";
import { ACCEPTED, shapeOf } from "./lib/shape.mjs";
import { discoverProfiles } from "./lib/profiles.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE = join(REPO, "GUIDE.md");
const MANIFEST = join(REPO, "guide/parts.json");
const ROUTER_INFO = "text router";
const CORE = "core";
const INDEX = "index";
/** The answer keys a shaped plan is built from: the rows are the run that takes no optional branch. */
const ROW_ANSWERS = { GUIDE_TNB: "no", GUIDE_SETUP: "no" };

const fail = (message) => {
  console.error(`router: ${message}`);
  process.exit(1);
};

/** Every guide: marker in GUIDE.md, in document order, with the 分片 each one belongs to. */
function guideBlocks(text) {
  const blocks = [];
  for (const fence of scanFences(text)) {
    const { kind, attrs } = parseInfo(fence.info);
    if (!kind) continue;
    blocks.push({
      kind,
      id: attrs.id ?? attrs.path,
      label: markerLabel(kind, attrs),
      gate: attrs.when ?? null,
      part: attrs.when || CORE,
    });
  }
  return blocks;
}

/** The plan one answer set produces: the blocks whose gate holds, in document order. */
const planFor = (blocks, answers) =>
  blocks.filter((block) => block.gate === null || whenMatches(block.gate, answers));

/** The 分片 a plan takes, in the order their text first appears (the 索引 is always first). */
function partsOf(plan, manifest) {
  const first = new Map();
  plan.forEach((block, index) => {
    if (!manifest.parts[block.part]) fail(`GUIDE.md has a step in 分片 \`${block.part}\`, which guide/parts.json does not name`);
    if (!first.has(block.part)) first.set(block.part, index);
  });
  const partIds = [...first.keys()].sort((a, b) => first.get(a) - first.get(b));
  return [INDEX, ...partIds];
}

/** What the table writes down: the files to fetch, and each step's marker token, in order. */
const asRow = (plan, parts, manifest) => ({
  fetch: parts.map((id) => manifest.parts[id].file),
  steps: plan.map((block) => block.label),
});

/** The answer a gate needs to hold: `mode:backend|fullstack` -> { GUIDE_MODE: "backend" }. */
function answersFor(gate) {
  const answers = {};
  for (const clause of gate.split("&")) {
    const colon = clause.indexOf(":");
    answers[`GUIDE_${clause.slice(0, colon).toUpperCase()}`] = clause.slice(colon + 1).split("|")[0];
  }
  return answers;
}

const shapeDetermined = (gate) => gate.split("&").every((clause) => ["mode", "layout"].includes(clause.slice(0, clause.indexOf(":"))));

/**
 * Does this gate hold under these answers? `whenMatches` is the extractor's own implementation and
 * fails the process (loudly, naming the answer) on a clause no answer covers — which is the right
 * failure for a gate the profile set cannot evaluate, so it is not caught here.
 */
const gateHolds = (gate, answers) => whenMatches(gate, answers);

/** Parse the `text router` block: six rows and one line per answer-determined gate. */
function parseRouter(guide) {
  const fence = scanFences(guide).find((candidate) => candidate.info === ROUTER_INFO);
  if (!fence) fail(`GUIDE.md carries no \`\`\`${ROUTER_INFO} block — the 路由表 cannot be read`);
  const rows = new Map();
  const rules = new Map();
  let row = null;
  let rule = null;
  fence.body.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const where = `${ROUTER_INFO} block line ${index + 1}`;
    const head = /^\[([a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)\]$/.exec(line);
    if (head) {
      if (rows.has(head[1])) fail(`${where}: ${head[1]} is a row twice`);
      row = { fetch: null, steps: null };
      rows.set(head[1], row);
      rule = null;
      return;
    }
    const gate = /^(unrun )?([a-z][a-z0-9-]*:[a-z0-9|:&]+):\s*(.*)$/.exec(line);
    if (gate) {
      rule = { gate: gate[2], unrun: Boolean(gate[1]), fetch: null, steps: null, after: null };
      if (rules.has(rule.gate)) fail(`${where}: ${rule.gate} is a line twice`);
      rules.set(rule.gate, rule);
      row = null;
      const rest = gate[3].trim();
      if (rest) applyFields(rule, rest, where);
      return;
    }
    const field = /^(fetch|steps):\s*(.*)$/.exec(line);
    if (field) {
      if (row) applyFields(row, line, where);
      else if (rule) applyFields(rule, line, where);
      else fail(`${where}: \`${field[1]}:\` before any [shape] row or gate line`);
      return;
    }
    fail(`${where}: cannot parse ${JSON.stringify(line)}`);
  });
  for (const [shape, entry] of rows) if (!entry.fetch?.length || !entry.steps?.length) fail(`the [${shape}] row needs both a \`fetch:\` and a \`steps:\` line`);
  for (const [gate, entry] of rules) if (!entry.fetch?.length || !entry.steps?.length) fail(`the ${gate} line needs both a \`fetch:\` and a \`steps:\` part`);
  return { rows, rules };
}

/** `fetch: a b c` / `steps: x y (after z)` / `fetch: …; steps: …` on one line. */
function applyFields(target, text, where) {
  for (const piece of text.split(";")) {
    const field = /^(fetch|steps):\s*(.*)$/.exec(piece.trim());
    if (!field) fail(`${where}: cannot parse ${JSON.stringify(piece.trim())}`);
    if (field[1] === "fetch") target.fetch = field[2].trim().split(/\s+/).filter(Boolean);
    else {
      const after = /\s*\(after ([^\s)]+)\)$/.exec(field[2]);
      target.steps = (after ? field[2].slice(0, after.index) : field[2]).trim().split(/\s+/).filter(Boolean);
      target.after = after ? after[1] : null;
    }
  }
}

/** Every failure a caller (coverage.mjs --self-check) can push onto its own list. */
export function checkRouter() {
  const failures = [];
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const guide = readFileSync(GUIDE, "utf8");
  const table = parseRouter(guide);
  const blocks = guideBlocks(guide);
  const profiles = discoverProfiles(REPO);

  // ---- the six rows are the six shapes, and each row is that shape's plan.
  const covered = new Set();
  for (const shape of ACCEPTED) {
    if (!table.rows.has(shape)) {
      failures.push(`the 路由表 has no [${shape}] row`);
      continue;
    }
    covered.add(shape);
    const [mode, layout] = shape.split("/");
    const plan = planFor(blocks, { ...ROW_ANSWERS, GUIDE_MODE: mode, GUIDE_LAYOUT: layout });
    const want = asRow(plan, partsOf(plan, manifest), manifest);
    const got = table.rows.get(shape);
    if (want.fetch.join(" ") !== got.fetch.join(" ")) {
      failures.push(`the [${shape}] row fetches ${got.fetch.join(" ")} — the plan takes ${want.fetch.join(" ")}`);
    }
    if (want.steps.join(" ") !== got.steps.join(" ")) {
      failures.push(`the [${shape}] row runs ${got.steps.join(" ")} — the plan runs ${want.steps.join(" ")}`);
    }
  }
  for (const shape of table.rows.keys()) if (!covered.has(shape)) failures.push(`the 路由表 has a row for ${shape}, which is not a shape the guard accepts`);

  // ---- every gate is either inside the rows or has a line of its own, and `unrun` says which.
  const gates = [...new Set(blocks.map((block) => block.gate).filter(Boolean))];
  const matched = (gate) => profiles.some((profile) => gateHolds(gate, profile.answers));
  for (const gate of gates) {
    const entry = table.rules.get(gate);
    if (shapeDetermined(gate)) {
      if (entry) failures.push(`the 路由表 has a separate ${gate} line, but the six rows already cover every (形态, 布局) gate`);
      continue;
    }
    if (!entry) {
      failures.push(`GUIDE.md has a \`when=${gate}\` gate with no line in the 路由表: a run that answers it would not know what to take`);
      continue;
    }
    if (entry.unrun && matched(gate)) failures.push(`the 路由表 declares \`when=${gate}\` unrun, but a profile does answer that gate`);
    if (!entry.unrun && !matched(gate)) failures.push(`the \`when=${gate}\` line is missing the \`unrun\` marker: no profile answers that gate`);
    if (entry.unrun !== !matched(gate)) continue;
    // The line has to produce that gate's plan out of any row it applies to.
    const gateBlocks = blocks.filter((block) => block.gate === gate);
    const wantSteps = gateBlocks.map((block) => block.label);
    if (wantSteps.join(" ") !== entry.steps.join(" ")) {
      failures.push(`the ${gate} line runs ${entry.steps.join(" ")} — the gate's steps are ${wantSteps.join(" ")}`);
    }
    for (const shape of ACCEPTED) {
      const [mode, layout] = shape.split("/");
      const answers = { ...ROW_ANSWERS, GUIDE_MODE: mode, GUIDE_LAYOUT: layout, ...answersFor(gate) };
      const plan = planFor(blocks, answers);
      const want = asRow(plan, partsOf(plan, manifest), manifest);
      const row = table.rows.get(shape);
      if (!row) continue;
      const steps = [...row.steps];
      const at = steps.indexOf(entry.after);
      if (at < 0) failures.push(`the ${gate} line inserts after \`${entry.after}\`, which is not a step of the [${shape}] row`);
      else {
        steps.splice(at + 1, 0, ...entry.steps);
        if (steps.join(" ") !== want.steps.join(" ")) {
          failures.push(`the [${shape}] row plus the ${gate} line runs ${steps.join(" ")} — that run's plan runs ${want.steps.join(" ")}`);
        }
      }
      const fetch = [...new Set([...row.fetch, ...entry.fetch])].sort();
      if (fetch.join(" ") !== [...want.fetch].sort().join(" ")) {
        failures.push(`the [${shape}] row plus the ${gate} line fetches ${fetch.join(" ")} — that run takes ${want.fetch.join(" ")}`);
      }
    }
  }
  for (const gate of table.rules.keys()) if (!gates.includes(gate)) failures.push(`the 路由表 has a line for \`when=${gate}\`, which GUIDE.md does not use`);

  // ---- the 占位子包 decision is not a gate: it changes what a step keeps, never which steps run,
  // which is what lets six rows stand for the nine profiles. Checked on the monorepo shapes, which
  // are where a `placeholder:` gate could appear — a probe on a single-layout shape would compare
  // two plans that cannot differ, and a check that cannot fail is not a check.
  for (const shape of ACCEPTED.filter((name) => name.endsWith("/monorepo"))) {
    const [mode, layout] = shape.split("/");
    const yes = planFor(blocks, { ...ROW_ANSWERS, GUIDE_MODE: mode, GUIDE_LAYOUT: layout, GUIDE_PLACEHOLDER: "yes" }).map((b) => b.id);
    const no = planFor(blocks, { ...ROW_ANSWERS, GUIDE_MODE: mode, GUIDE_LAYOUT: layout, GUIDE_PLACEHOLDER: "no" }).map((b) => b.id);
    if (yes.join(" ") !== no.join(" ")) {
      failures.push(`GUIDE_PLACEHOLDER changes which steps run in ${shape}; the 路由表's six rows would no longer cover the nine profiles`);
    }
  }
  const shapes = new Set(profiles.map((profile) => shapeOf(profile.answers).arm));
  for (const shape of ACCEPTED) if (!shapes.has(shape)) failures.push(`no profile runs ${shape}, so its row is not exercised by the matrix`);
  return failures;
}

/** The block body, regenerated from GUIDE.md: what a maintainer pastes back after a guide edit. */
function print() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const guide = readFileSync(GUIDE, "utf8");
  const blocks = guideBlocks(guide);
  const profiles = discoverProfiles(REPO);
  const lines = [];
  for (const shape of ACCEPTED) {
    const [mode, layout] = shape.split("/");
    const plan = planFor(blocks, { ...ROW_ANSWERS, GUIDE_MODE: mode, GUIDE_LAYOUT: layout });
    const row = asRow(plan, partsOf(plan, manifest), manifest);
    lines.push(`[${shape}]`, `fetch: ${row.fetch.join(" ")}`, `steps: ${row.steps.join(" ")}`, "");
  }
  const gates = [...new Set(blocks.map((block) => block.gate).filter(Boolean))].filter((gate) => !shapeDetermined(gate));
  for (const gate of gates) {
    const isMatched = profiles.some((profile) => gateHolds(gate, profile.answers));
    const [mode, layout] = ACCEPTED[0].split("/");
    const plan = planFor(blocks, { ...ROW_ANSWERS, GUIDE_MODE: mode, GUIDE_LAYOUT: layout, ...answersFor(gate) });
    const first = plan.findIndex((block) => block.gate === gate);
    if (first <= 0) fail(`the \`when=${gate}\` gate has no step before it in any plan: the 路由表 line needs an insertion point`);
    const after = plan[first - 1].label;
    const steps = plan.filter((block) => block.gate === gate).map((block) => block.label);
    const files = [...new Set(blocks.filter((block) => block.gate === gate).map((block) => manifest.parts[block.part].file))];
    lines.push(`${isMatched ? "" : "unrun "}${gate}: fetch: ${files.join(" ")}; steps: ${steps.join(" ")} (after ${after})`);
  }
  console.log(lines.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv.includes("--print")) print();
  else if (argv.includes("--check")) {
    const failures = checkRouter();
    if (failures.length) {
      for (const failure of failures) console.error(`router: ${failure}`);
      process.exit(1);
    }
    console.log("router: ok — the 路由表 equals the plan for every shape, and every gate is run or declared");
  } else {
    console.log("usage: node e2e/router.mjs --check | --print");
    console.log("  --check  prove the 索引's 路由表 equals the plan GUIDE.md's markers produce");
    console.log("  --print  print the table body from GUIDE.md, to paste back after a guide edit");
  }
}
