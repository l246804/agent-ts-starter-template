#!/usr/bin/env node
/**
 * The guide's two views, and the seam between them.
 *
 *   guide/index.md + guide/parts/NN-<gate>.md   what a run takes: the 索引 first, then only the
 *                                               分片 its own answers select.
 *   GUIDE.md                                     the same text glued back in document order — the
 *                                               single file `e2e/extract.mjs` reads and the harness
 *                                               runs.
 *
 * GUIDE.md is generated, never hand-edited. `--write` cuts it into 分片 and writes the manifest;
 * `--check` proves the two views still agree, byte for byte, and `coverage.mjs --self-check` calls
 * it, so every run and every maintenance edit goes through the same door.
 *
 * The cut follows the marker grammar (there is one implementation of it, in `extract.mjs`): a 分片
 * is one `when=` gate, or the shared text. A "run" is a maximal stretch of lines that belongs to
 * one 分片; prose belongs to the block it introduces, and the tail prose is shared. The 索引 is
 * everything before the first shared step (bootstrap): the head, the 预答 table and Phase 0–2.
 *
 * The manifest records, per 分片, the file and the byte length of each of its runs, plus the order
 * the runs appear in. `order` lists 分片 ids; the k-th occurrence of an id consumes that 分片's
 * k-th run. Gluing is therefore unambiguous and the reconstruction is byte-exact.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseInfo, scanFences } from "./extract.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE_PATH = join(REPO, "GUIDE.md");
const MANIFEST_PATH = join(REPO, "guide/parts.json");
const INDEX_ID = "index";
const INDEX_FILE = "guide/index.md";
const PARTS_DIR = "guide/parts";
const CORE_ID = "core";
const INDEX_ANCHOR = "bootstrap";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const write = (relative, text) => {
  const path = join(REPO, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const slug = (gate) => gate.replace(/:/g, "-").replace(/\|/g, "-or-").replace(/&/g, "-and-");

function fail(message) {
  console.error(`guide-parts: ${message}`);
  process.exit(1);
}

/** The document split into 分片 and runs, with the glue proven lossless. */
function splitGuide() {
  const text = readFileSync(GUIDE_PATH, "utf8");
  // A line-based cut needs the trailing newline out of the way: lines are 1-based, and each one
  // carries its own "\n" except a last line that the file does not terminate.
  const trailing = text.endsWith("\n") ? "\n" : "";
  const lines = trailing ? text.split("\n").slice(0, -1) : text.split("\n");
  const textOf = (first, last) => {
    const body = lines
      .slice(first - 1, last)
      .map((line) => `${line}\n`)
      .join("");
    return last === lines.length && trailing === "" ? body.slice(0, -1) : body;
  };
  const blocks = [];
  for (const fence of scanFences(text)) {
    const { kind, attrs } = parseInfo(fence.info);
    if (!kind) continue;
    const bodyLines = fence.body.split("\n").length - 1;
    blocks.push({
      id: attrs.id ?? attrs.path,
      part: attrs.when || CORE_ID,
      first: fence.line,
      last: fence.line + bodyLines + 1,
    });
  }
  const anchor = blocks.find((block) => block.id === INDEX_ANCHOR);
  if (!anchor) fail(`GUIDE.md has no \`id=${INDEX_ANCHOR}\` step; the 索引 boundary cannot be read`);
  const indexEnd = anchor.first - 1;

  const segments = [];
  const push = (first, last, part) => {
    if (last >= first) segments.push({ first, last, part });
  };
  push(1, indexEnd, INDEX_ID);
  let cursor = indexEnd + 1;
  for (const block of blocks) {
    if (block.last < cursor) continue; // a step inside the 索引 (preflight, profile-guard)
    push(cursor, block.first - 1, block.part); // the prose that introduces this block
    push(block.first, block.last, block.part);
    cursor = block.last + 1;
  }
  push(cursor, lines.length, CORE_ID); // tail prose (Phase 7), shared

  const runs = [];
  for (const segment of segments) {
    const previous = runs[runs.length - 1];
    if (previous && previous.part === segment.part && previous.last + 1 === segment.first) previous.last = segment.last;
    else runs.push({ ...segment });
  }

  const parts = new Map();
  for (const run of runs) {
    if (!parts.has(run.part)) parts.set(run.part, { id: run.part, gate: run.part === CORE_ID || run.part === INDEX_ID ? null : run.part, runs: [] });
    parts.get(run.part).runs.push(run);
  }
  const indexPart = parts.get(INDEX_ID);
  if (!indexPart) fail("the 索引 came out empty");
  indexPart.file = INDEX_FILE;
  let n = 0;
  for (const part of parts.values()) {
    if (part === indexPart) continue;
    n += 1;
    part.file = `${PARTS_DIR}/${String(n * 10).padStart(2, "0")}-${part.gate === null ? CORE_ID : slug(part.gate)}.md`;
  }

  for (const part of parts.values()) {
    part.text = part.runs.map((run) => textOf(run.first, run.last)).join("");
    part.byteLength = Buffer.byteLength(part.text, "utf8");
    part.runByteLengths = part.runs.map((run) => Buffer.byteLength(textOf(run.first, run.last), "utf8"));
  }

  const lossless = Buffer.concat(runs.map((run) => Buffer.from(textOf(run.first, run.last), "utf8")));
  if (lossless.toString("utf8") !== text) fail("the cut is not lossless: the runs do not glue back to GUIDE.md");

  const manifest = {
    note: "生成物：由 e2e/guide-parts.mjs --write 生成，不要手改。order 里每个 id 每出现一次，就消费该分片 runs 里的下一段。",
    guide: "GUIDE.md",
    guideSha256: sha256(Buffer.from(text, "utf8")),
    byteLength: Buffer.byteLength(text, "utf8"),
    parts: Object.fromEntries(
      [...parts.values()].map((part) => [
        part.id,
        { file: part.file, gate: part.gate, byteLength: part.byteLength, runs: part.runByteLengths },
      ]),
    ),
    order: runs.map((run) => run.part),
  };
  return { parts, manifest, text };
}

/** Glue the 分片 on disk, in the manifest's order, into one buffer. */
function assemble(manifest) {
  const buffers = new Map();
  for (const [id, part] of Object.entries(manifest.parts)) {
    const path = join(REPO, part.file);
    if (!existsSync(path)) throw new Error(`${part.file} is missing (分片 ${id})`);
    buffers.set(id, readFileSync(path));
  }
  const cursors = new Map();
  const chunks = [];
  for (const id of manifest.order) {
    const part = manifest.parts[id];
    if (!part) throw new Error(`guide/parts.json order names unknown 分片 ${id}`);
    const k = cursors.get(id) ?? 0;
    if (k >= part.runs.length) throw new Error(`guide/parts.json uses 分片 ${id} more often than it has runs`);
    const offset = part.runs.slice(0, k).reduce((total, size) => total + size, 0);
    const chunk = buffers.get(id).subarray(offset, offset + part.runs[k]);
    if (chunk.length !== part.runs[k]) {
      throw new Error(`${part.file} is shorter than guide/parts.json says: ${id} run ${k} wants ${part.runs[k]} bytes, ${chunk.length} left`);
    }
    chunks.push(chunk);
    cursors.set(id, k + 1);
  }
  return Buffer.concat(chunks);
}

/**
 * Cut GUIDE.md into 分片 and write the manifest. GUIDE.md is the source and is never written here:
 * the 分片 are its derived view, and `--check` proves the two still agree after any edit.
 */
function writeParts() {
  const { parts, manifest, text } = splitGuide();
  // A part whose gate or position changed gets a new file name (the ordinal is part of it), so the
  // old one has to go: a stale file in guide/parts/ is a 分片 a reader could fetch and run, and
  // nothing would say it is not this guide's text any more.
  const keep = new Set([...parts.values()].map((part) => part.file));
  const directory = join(REPO, PARTS_DIR);
  const pruned = [];
  if (existsSync(directory)) {
    for (const name of readdirSync(directory)) {
      const relative = `${PARTS_DIR}/${name}`;
      if (!name.endsWith(".md") || keep.has(relative)) continue;
      rmSync(join(REPO, relative));
      pruned.push(relative);
    }
  }
  for (const part of parts.values()) write(part.file, part.text);
  write("guide/parts.json", JSON.stringify(manifest, null, 2) + "\n");
  const rebuilt = assemble(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
  if (rebuilt.toString("utf8") !== text) {
    fail("the 分片 just written do not glue back into GUIDE.md — a bug in guide-parts.mjs, not something to fix by hand");
  }
  console.log(
    `guide-parts: cut GUIDE.md into ${Object.keys(manifest.parts).length} 分片 (${manifest.order.length} runs, ${manifest.byteLength} B)${
      pruned.length ? `; pruned ${pruned.length} stale file(s): ${pruned.join(", ")}` : ""
    }; GUIDE.md is the source and was not touched`,
  );
}

/** The failures a caller (coverage.mjs --self-check) can push onto its own list. */
export function checkGuideParts() {
  const failures = [];
  if (!existsSync(MANIFEST_PATH)) return ["guide/parts.json is missing — run `node e2e/guide-parts.mjs --write`"];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (error) {
    return [`guide/parts.json does not parse: ${error.message}`];
  }
  for (const [id, part] of Object.entries(manifest.parts)) {
    const path = join(REPO, part.file);
    if (!existsSync(path)) {
      failures.push(`${part.file} is missing (分片 \`${id}\`) — run \`node e2e/guide-parts.mjs --write\``);
      continue;
    }
    const byteLength = readFileSync(path).length;
    if (byteLength !== part.byteLength) {
      failures.push(
        `${part.file} is ${byteLength} bytes, guide/parts.json says ${part.byteLength} — the 分片 are stale: run \`node e2e/guide-parts.mjs --write\` to cut them again from GUIDE.md`,
      );
    }
    const used = manifest.order.filter((named) => named === id).length;
    if (used !== part.runs.length) failures.push(`guide/parts.json uses 分片 \`${id}\` ${used} time(s) but records ${part.runs.length} run(s)`);
  }
  try {
    const rebuilt = assemble(manifest);
    const guide = readFileSync(GUIDE_PATH);
    if (sha256(rebuilt) !== sha256(guide)) {
      failures.push(
        "the 分片 do not glue back into GUIDE.md — GUIDE.md was edited after the last cut: run `node e2e/guide-parts.mjs --write`",
      );
    }
  } catch (error) {
    failures.push(`the 分片 do not glue back into GUIDE.md: ${error.message}`);
  }
  // A file the manifest does not name is a 分片 nobody promises anything about — the stale half of a
  // re-cut, which is exactly what a reader (or a client agent following the 路由表) would trip over.
  const directory = join(REPO, PARTS_DIR);
  if (existsSync(directory)) {
    const named = new Set(Object.values(manifest.parts).map((part) => part.file));
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".md")) continue;
      const relative = `${PARTS_DIR}/${name}`;
      if (!named.has(relative)) {
        failures.push(`${relative} is in ${PARTS_DIR}/ but guide/parts.json does not name it — run \`node e2e/guide-parts.mjs --write\` to prune it`);
      }
    }
  }
  return failures;
}

function list() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const runs = Object.values(manifest.parts).reduce((total, part) => total + part.runs.length, 0);
  console.log(`${Object.keys(manifest.parts).length} 分片, ${runs} runs, GUIDE.md ${manifest.byteLength} B`);
  for (const [id, part] of Object.entries(manifest.parts)) {
    const used = manifest.order.filter((named) => named === id).length;
    console.log(`  ${id.padEnd(42)} ${part.file.padEnd(46)} ${String(part.byteLength).padStart(7)} B  ${used} run(s)`);
  }
}

// Only a direct `node e2e/guide-parts.mjs …` runs the CLI: importing this module (coverage.mjs
// does) must stay side-effect free and must not print usage.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv.includes("--write")) writeParts();
  else if (argv.includes("--check")) {
    const failures = checkGuideParts();
    if (failures.length) {
      for (const failure of failures) console.error(`guide-parts: ${failure}`);
      process.exit(1);
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    console.log(
      `guide-parts: ok — ${Object.keys(manifest.parts).length} 分片 glue back into GUIDE.md (${manifest.byteLength} B)`,
    );
  } else if (argv.includes("--list")) list();
  else {
    console.log("usage: node e2e/guide-parts.mjs --write | --check | --list");
    console.log("  --write   cut GUIDE.md into 分片 + guide/parts.json (GUIDE.md is the source, never written)");
    console.log("  --check   prove the 分片 on disk glue back into GUIDE.md, byte for byte");
    console.log("  --list    print the 分片, their files and their sizes");
  }
}
