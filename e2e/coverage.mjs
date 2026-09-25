#!/usr/bin/env node
/**
 * The coverage matrix: every engineering item this repository owns, and the shipped text that
 * carries it into a target project.
 *
 * The repository keeps one master list (`docs/constraints.md`: numbered items C1..Cn, known
 * boundaries B1..Bn) plus the inherited decision records (`docs/adr/`). A target project receives
 * two of those, filtered by shape: `AGENTS.md`'s `## Project constraints` section (the rules) and
 * `docs/agent-notes.md` (the traps). This file is the mapping between the two sides, and it is the
 * only place that mapping lives:
 *
 *   - every shipped statement — one bullet of `AGENTS.md`'s constraints section or of
 *     `docs/agent-notes.md` — is declared here with the source item it comes from (`item`), the
 *     section it lands in (`section`), the shapes it applies to (`when`) and a `marker`: a fragment
 *     that must appear in that bullet;
 *   - every item that ships no text is declared in NOT_SHIPPED with the reason and the place it
 *     lives instead (a guide step, the verification record, or this repository only).
 *
 * Two checks follow, and `e2e/assert.mjs` runs both against every produced project:
 *
 *   - no omission: every declared row's marker is present, in the section the row names. A row the
 *     run's shape should have carried but did not is a rule the project was not told;
 *   - no fabrication: every bullet the project actually carries is claimed by a declared row. A
 *     bullet nobody declared is text with no source item.
 *
 * `when` is part of both checks, which is what makes the per-shape trimming exact rather than
 * approximate: a bullet that leaked into a shape the table does not assign it to has no row there
 * and fails the second check, and a rule the shape should carry is caught by the first.
 *
 * `node e2e/coverage.mjs --self-check` proves the table itself: every item the master list defines
 * is either shipped somewhere or declared not-shipped, every id it names exists, and every marker
 * is a fragment of the document it claims to come from. `node e2e/coverage.mjs --list` prints the
 * matrix.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ACCEPTED, SELECTORS, selectorNames, shapeOf, whenHolds } from "./lib/shape.mjs";
import { discoverProfiles } from "./lib/profiles.mjs";
import { escapeRegExp } from "./lib/text.mjs";
import { checkGuideParts } from "./guide-parts.mjs";
import { checkRouter } from "./router.mjs";
import { checkFragments } from "./fragments.mjs";

// ---------------------------------------------------------------------------- the shape filter
//
// A row's `when` is `&`-joined clauses, each clause `|`-separated alternatives. The vocabulary and
// the 形态 × 布局 facts behind it live in `e2e/lib/shape.mjs`: one module, read by this table, by
// `e2e/assert.mjs` and by the runner's control gates, instead of each deriving them again.

// ------------------------------------------------------------------------------- the shipped text
//
// Grouped by document and section, in the order the guide writes them. `item` names the source:
// `C<n>`/`B<n>` are `docs/constraints.md`, `ADR-<n>` is `docs/adr/`. Both documents share one
// fact per row: the `marker` has to be a fragment of a bullet that lives in that section, in
// every shape the row's `when` selects.
const AGENTS = {
  "Project constraints": [
    ["ADR-0001", "all", "Engineering rules for this project", "prose"],
  ],
  Toolchain: [
    ["C1", "all", "The toolchain is **project-local**"],
    ["ADR-0002", "all", "The toolchain is **project-local**"],
    ["C2", "all", "**Pin every version.**"],
    ["C3", "all", "Read the documentation for the **installed** version"],
    ["C4", "all", "Do not hand-write toolchain configuration"],
    ["C6", "all", "does **not** exist in a project-local setup"],
    ["C5", "all", "A green result has to be meaningful"],
    ["C45", "all", "retry it once, unchanged, with the narrowest escalation"],
  ],
  "Path aliases": [
    ["C8", "all", "Import cross-directory modules as `#/…`"],
    ["C34", "all", "The only alias mechanism is the `imports` map"],
    ["C8", "all", "Keep the `types` branch first in that map"],
    ["C34", "all", "TypeScript never probes extensions"],
  ],
  Configuration: [
    ["C14", "all", "Configuration must earn its place"],
    ["C15", "all", "Deleting configuration requires re-running the verification"],
  ],
  "Code organisation": [
    ["C38", "all", "Business code stays where it is used"],
    ["ADR-0005", "all", "Business code stays where it is used"],
    ["C38", "all", "Dependencies point one way"],
  ],
  "Defensive code": [
    ["C39", "all", "Write a guard only for a state that has actually been observed"],
  ],
  "Documents and decisions": [
    ["C42", "all", "Every fact has one home"],
    ["ADR-0013", "all", "Every fact has one home"],
    ["C43", "all", "keeps the alternatives it beat"],
    ["C44", "all", "says what to re-check when it moves"],
    // The closing pointer follows the last section the guide appends, and it is the document that
    // names the resolved ADR landing point — the thing ADR-0011 decides.
    ["ADR-0011", "all", "See `docs/agent-notes.md` for the traps behind these rules", "prose"],
  ],
  "Development proxy": [
    ["C36", "frontend-single", "`DEV_PROXY` lives in `.env` and is committed"],
    ["C37", "frontend-single", "personal overrides go in `.env.local` or"],
    ["C39", "frontend-single", "The one-line guard in `vite.config.ts` is deliberate"],
    ["C36", "frontend-single", "The proxy prefix is a regular expression and is written `/api/`"],
    ["C36", "frontend-single", "Verification of the proxy means a request through the **frontend** port"],
  ],
  Tests: [
    ["C11", "frontend-single", "This profile ships no test harness by decision"],
    ["C11", "frontend-monorepo", "The frontend app ships no test harness by decision"],
    ["C11", "split", "The frontend app ships no test harness by decision"],
    ["C11", "split", "that is exactly the case `vp run -r` is built to skip"],
    ["C13", "server&single", "The runner is wired and empty"],
    ["C13", "mono-server", "The root's runner is wired and empty"],
    ["C9", "server", "never under `server/`"],
    ["C10", "server&single", "Tests live in `tests/` at the project root"],
    ["C10", "mono-server", "Tests live in `tests/` at the workspace root"],
    ["C10", "mono-shell", "A package that does need tests keeps them in its own `tests/`"],
  ],
  Server: [
    ["C5", "backend-single", "registered in the `plugins` array of"],
    ["C36", "backend-single", "Routes are files under `server/routes/`"],
    ["C33", "server", "the directory the ignore rules already cover"],
    ["B4", "server", "the directory the ignore rules already cover"],
    ["C27", "server", "Server code imports explicitly (`nitro`, `nitro/h3`, `nitro/types`)"],
    ["C33", "server&single", "The production artefact is the built bundle"],
    ["C5", "ssr", "registered inside the scaffold's `lazyPlugins` array"],
    ["B1", "ssr", "A second top-level `plugins` key is a duplicate object key"],
    ["C36", "ssr", "The API is **same-origin**"],
    ["C5", "mono-server", "in the **root** `vite.config.ts`, called in the"],
    ["C36", "mono-server", "their URL is the file path with **no prefix**"],
    ["C33", "mono-server", "and `nitro` is a devDependency of the root"],
  ],
  "Rendering (SSR)": [
    ["ADR-0008", "ssr", "The page is rendered by `src/entry-server.tsx`"],
    ["B13", "ssr", "There is deliberately **no `index.html`**"],
    ["ADR-0008", "ssr", "the `<!--ssr-outlet-->` comment inside it is the only channel"],
    ["B15", "ssr", "The SSR entry default-exports an object with a `fetch` method"],
    ["B16", "ssr", "`environments.client.build.rollupOptions.input` names"],
    ["B17", "ssr", "The SSR entry is the catch-all"],
  ],
  "Workspace (monorepo)": [
    ["C25", "mono-server", "`defaultPackage: \".\"` in the root `vite.config.ts` is what lets"],
    ["C19", "mono-server", "`defaultPackage: \".\"` in the root `vite.config.ts` is what lets"],
    ["C25", "mono-server", "The workspace root is a package, and it owns the server"],
    ["ADR-0009", "split", "The commands that matter are registered in the root `package.json`"],
    ["ADR-0010", "mono-shell", "The workspace root is a shell"],
    ["ADR-0010", "mono-shell", "The root manifest registers `vp run dev:website`"],
    ["ADR-0010", "mono-shell", "the root defines no `build` task of its own"],
    ["ADR-0010", "backend-monorepo", "There is no `dev:website`"],
    ["C23", "backend-monorepo|frontend-monorepo", "**No command may name a package by its task**"],
    ["C16", "mono", "is the cross-package form"],
    ["C17", "mono", "Selecting a package explicitly"],
    ["C24", "mono", "Every dependency version lives in the `catalog:` block"],
    ["C35", "mono", "Only `vp` commands, everywhere"],
    ["C35", "mono", "Do not reach for pnpm, npm, yarn or bun"],
    ["C16", "mono", "`vp check` at the root covers **every** package"],
    ["C31", "mono-server", "would run the root's workspace-wide scan"],
    ["C16", "backend-monorepo", "The workspace build is `vp run -r build`"],
    ["ADR-0009", "split", "The root server does not serve the frontend's build"],
  ],
  "Development proxy (apps/website)": [
    ["C36", "proxy&mono", "The proxy lives in the frontend package"],
    ["C39", "proxy&mono", "The one-line guard is deliberate and unconditional"],
    ["C36", "proxy&mono", "It must fire in every mode"],
    ["C36", "proxy&mono", "The proxy prefix is a regular expression"],
    ["C36", "split", "Vite's single-page fallback never applies"],
    ["C36", "split", "an unknown `/api/…` path is the server's `404`"],
    ["C36", "mono-shell", "A target nothing listens on answers `502`"],
    ["C36", "split", "`DEV_PROXY` names this workspace's own root server"],
    ["C36", "mono-shell", "it was answered at initialization"],
  ],
};

const NOTES = {
  "Agent notes — known traps and version facts": [
    ["ADR-0011", "all", "shipped text cannot name a path this run decides", "prose"],
    ["C46", "all", "Record a trap here only if it has actually been hit", "prose"],
  ],
  "Two engines, one green light": [
    ["B24", "all", "type-checks with the TypeScript Go engine"],
    ["C4", "all", "reports formatting problems"],
    ["C15", "all", "only type-checks when `lint.options.typeAware` and `typeCheck`"],
  ],
  "Modules and aliases": [
    ["C34", "all", "Path aliases are `package.json` `imports` only"],
    ["C8", "all", "The `types` branch must be the first key"],
    ["C34", "all", "`#/…` specifiers need Node >= 24.14.0"],
  ],
  Versions: [
    ["C7", "all", "TypeScript is the 7.x line"],
    ["C7", "all", "uses the TypeScript 6 API bridge"],
    ["C1", "all", "`vite-plus` is a devDependency, never a global install"],
  ],
  "Package managers": [
    ["B26", "all", "declares its package manager in `devEngines`"],
    ["B25", "all", "under `CI=1` uses a frozen lockfile"],
    ["C2", "all", "Do not move `vite-plus` with a package-manager update"],
  ],
  "Skills and setup": [
    ["C40", "all", "The `--skill=name` spelling is silently ignored"],
    ["C40", "all", "Exit codes lie here"],
    ["C41", "all", "records content hashes, not a commit"],
    ["C13", "all", "exits 1 when it finds no test files"],
  ],
  "The development proxy": [
    ["C36", "frontend-single", "is read from `.env` by `loadEnv(mode, process.cwd(), \"\")`"],
    ["C39", "frontend-single", "guard `if (!env.DEV_PROXY) throw …` is deliberate"],
    ["C36", "frontend-single", "The proxy prefix is a regular expression"],
    ["C36", "frontend-single", "A dead backend produces `502`"],
    ["C36", "frontend-single", "The proxy target has a placeholder"],
  ],
  "The server (Nitro)": [
    ["C2", "server", "Nitro v3 has no stable release"],
    ["ADR-0003", "server", "Nitro v3 has no stable release"],
    ["C9", "server", "A test file in either directory is compiled into a route"],
    ["C5", "server", "The plugin has to be **called** in `plugins`"],
    ["ADR-0004", "server", "The plugin has to be **called** in `plugins`"],
    ["B1", "server", "adding a second top-level `plugins` key instead"],
    ["C33", "server", "Production output is `dist/`"],
    ["C33", "server", "The output directory is emptied on every build"],
    ["B6", "server", "Do not also set Vite's `build.outDir`"],
    ["C33", "server", "Remove a stale `.output/` if one ever appears"],
    ["C27", "server", "v3 has no auto-imports"],
    ["C25", "server", "The dev server's default port comes from Nitro"],
    ["C33", "server", "The production artefact is `node dist/server/index.mjs`"],
    ["B22", "server", "close timed out after 10000ms"],
  ],
  "One program, and who checks it": [
    ["B18", "server&single", "The build script's `tsc` only checks what the tsconfig `include` lists"],
  ],
  "No client": [
    ["ADR-0007", "mode-backend", "There is no client build phase in this project"],
    ["ADR-0007", "mode-backend", "`/` answers `404`"],
  ],
  "Rendering (SSR)": [
    ["B13", "ssr", "There is no `index.html` on purpose"],
    ["B19", "ssr", "`dist/server/_ssr/ssr.mjs` next to a"],
    ["ADR-0008", "ssr", "The template channel is a silent switch"],
    ["ADR-0008", "ssr", "The render marker"],
    ["B15", "ssr", "The SSR entry's contract is `export default { fetch(request) }`"],
    ["B16", "ssr", "must name `src/entry-client.tsx`"],
    ["B16", "ssr", "assembled from two asset lists"],
    ["B19", "ssr", "The SSR bundle lands in `dist/server/_ssr/ssr.mjs`"],
    ["B19", "ssr", "exists only in an SSR build, which is the cheap way"],
    ["B18", "ssr", "One tsconfig covers both halves"],
    ["B17", "ssr", "The SSR entry is the catch-all route"],
    ["B20", "ssr", "warns on `export default {` in the SSR entry"],
    ["B3", "ssr", "Hydration is **not verified**"],
  ],
  "The workspace": [
    ["ADR-0010", "mono", "The workspace root is a package of the workspace"],
    ["C23", "mono", "is a **silent no-op** when that package does not exist"],
    ["C16", "mono", "skips a package that does not define the task"],
    ["C17", "mono", "and a task no package defines is exit 1 as well"],
    ["C16", "mono", "walks every package, so it is the workspace's type check"],
    ["C31", "mono", "runs the root's workspace-wide Vitest scan"],
    ["C29", "mono", "`vp run -r check -v` fails"],
    ["C21", "mono", "may not share a name; the collision"],
    ["C24", "mono", "The catalog is the only place a version lives"],
    ["C26", "mono", "without `-w` is refused (`ERR_PNPM_ADDING_TO_ROOT`)"],
    ["C16", "mono", "Task caching is per task input"],
  ],
  "The workspace root as an application": [
    ["C25", "mono-server", "note on the command that runs"],
    ["B27", "mono-server", "The root's TypeScript program is the scaffold's `tsconfig.json`"],
    ["C23", "mono-server", "Deleting a package is not enough"],
  ],
  "The development proxy (apps/website)": [
    ["C36", "split", "`DEV_PROXY` lives in `apps/website/.env`"],
    ["C37", "proxy&mono", "ignores only `*.local`"],
    ["C39", "proxy&mono", "guard `if (!env.DEV_PROXY) throw …` is deliberate and unconditional"],
    ["C39", "proxy&mono", "fires in every mode: with the variable missing"],
    ["C36", "split", "The proxy target and the root server's port have to agree"],
    ["C36", "proxy&mono", "The prefix is compiled as a regular expression"],
    ["C36", "split", "an unknown `/api/…` path is the server's `404`"],
    ["C36", "mono-shell", "an unknown `/api/…` path is the backend's `404`"],
    ["C36", "split", "The proxied path reaches the server **without** the prefix"],
    ["C36", "mono-shell", "The proxied path reaches the backend **without** the prefix"],
    ["C36", "mono-shell", "It was answered at initialization"],
  ],
};

/**
 * Every shipped row, flattened: `{ item, doc, section, when, marker, kind }`. `kind` is the block
 * the marker has to be found in — a bullet (the default) or a paragraph of prose.
 */
export const SHIPPED = [
  ...Object.entries(AGENTS).flatMap(([section, rows]) =>
    rows.map(([item, when, marker, kind]) => ({ item, doc: "agents", section, when, marker, kind })),
  ),
  ...Object.entries(NOTES).flatMap(([section, rows]) =>
    rows.map(([item, when, marker, kind]) => ({ item, doc: "notes", section, when, marker, kind })),
  ),
];

// ----------------------------------------------------------------------------- what does not ship
//
// One entry per item that carries no shipped text. `where` says where it lives instead:
//   "guide"        — an initialization action, executed by a step of GUIDE.md
//   "verification" — an end-to-end verification record, in docs/verification.md
//   "repo"         — this repository's own working state, kept in docs/constraints.md itself
// A marker is checked where one is given: `guide` against GUIDE.md, `verification` against the
// record, so the claim is more than a comment.
export const NOT_SHIPPED = {
  C12: { where: "guide", marker: "tests/\\.gitkeep", why: "creating tests/ is an initialization action (Phase 3)" },
  C18: { where: "guide", marker: "\\.output", why: "the .gitignore line is written by Phase 3; the rule ships as the ignore-rules clause of the server rules" },
  C20: { where: "repo", why: "no shipped shape declares env passthrough on a package task (measured, unexercised)" },
  C22: { where: "repo", why: "the placeholder package is pruned to a plain package; the library-startup path is not part of it" },
  C28: { where: "repo", why: "no shipped shape has a local plugin package" },
  C30: { where: "repo", why: "orchestrator behaviour kept as a maintenance trap for this repository's own runs" },
  C32: { where: "repo", why: "expected noise from vp pack; no shipped shape packs a library" },
  B2: { where: "guide", marker: "vp create vite:monorepo", why: "a step-ordering fact about the guide, not a project rule" },
  B5: { where: "guide", marker: "require_vanilla_base", why: "the profile guard refuses the base before anything is written" },
  B7: {
    where: "verification",
    marker: "\\| `backend-single` \\|(?:[^|]*\\|){3} \\*\\*PASS\\*\\*",
    why: "an end-to-end verification record: the row for this profile has to be PASS",
  },
  B8: {
    where: "verification",
    marker: "\\| `fullstack-single` \\|(?:[^|]*\\|){3} \\*\\*PASS\\*\\*",
    why: "an end-to-end verification record: the row for this profile has to be PASS",
  },
  B9: {
    where: "verification",
    marker: "\\| `fullstack-monorepo` \\|(?:[^|]*\\|){3} \\*\\*PASS\\*\\*",
    why: "an end-to-end verification record: the row for this profile has to be PASS",
  },
  B10: {
    where: "verification",
    marker: "\\| `backend-monorepo` \\|(?:[^|]*\\|){3} \\*\\*PASS\\*\\*",
    why: "an end-to-end verification record: the row for this profile has to be PASS",
  },
  B11: {
    where: "verification",
    marker: "\\| `frontend-monorepo` \\|(?:[^|]*\\|){3} \\*\\*PASS\\*\\*",
    why: "an end-to-end verification record: the row for this profile has to be PASS",
  },
  B12: { where: "guide", marker: "completely empty", why: "a preflight rule; the guide refuses a non-empty target" },
  B14: { where: "guide", marker: "ssr-outlet", why: "the shape decision ships as the SSR rules; the mixing trap is why the template stays deleted" },
  B21: { where: "repo", why: "a guide-internal assertion detail" },
  B23: { where: "guide", marker: "tsBuildInfoFile", why: "the cache file is placed by the guide; the shipped note is the ignore rule it belongs to" },
  // The ADR half of the item space: every ADR is either the source of a shipped row or declared
  // here as a decision that stays in this repository.
  "ADR-0006": { where: "repo", why: "the guide's own test decision: its verify block is the assertion set" },
  "ADR-0012": { where: "repo", why: "this repository's coverage-matrix and alignment decision" },
  "ADR-0014": {
    where: "repo",
    why: "this repository's harness mechanism: declared item ids, and one owner each for the shape, the profile set and the record's numbers",
  },
  "ADR-0015": {
    where: "repo",
    why: "the delivery decision: 索引 + 分片 with GUIDE.md as the source, the hand-written 路由表 and the checks that keep them one text",
  },
  "ADR-0016": {
    where: "repo",
    why: "the run's own statement about itself: a directory that never reached a passing verification carries a marker, and nothing in the shipped documents changes",
  },
};

// ---------------------------------------------------------------------------------- the checking

/**
 * A document's blocks, in order: headings, bullets (`- ` with their wrapped continuations), and
 * prose (a paragraph of loose lines). Every block belongs to the section it sits under, which is
 * what lets a row say "this item is that bullet, in that section" — and lets the audit require that
 * nothing else, no bullet and no paragraph, sits in a shipped section unclaimed.
 *
 * A run of adjacent non-blank lines is one paragraph, and a `- ` line starts a new bullet inside
 * it. That is the Markdown rule the documents actually follow: the guide's own `vp fmt` run
 * re-wraps long bullets lazily, so a continuation line can land at column 0 and still belong to the
 * bullet above it (measured: `… Tests closed` / `successfully but …` in the Nitro traps).
 */
export function sectionBlocks(body) {
  const blocks = [];
  let section = null;
  let current = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const line of body.split("\n")) {
    const heading = /^(#{1,4})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (heading) {
      flush();
      section = heading[2];
      blocks.push({ kind: "heading", section, text: heading[2] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^- /.test(line)) {
      flush();
      current = { kind: "bullet", section, text: line.slice(2) };
      continue;
    }
    if (current) {
      current.text += ` ${line.trim()}`;
      continue;
    }
    current = { kind: "prose", section, text: line.trim() };
  }
  flush();
  return blocks;
}

/** The headings that are the document's own frame rather than a section a row declares. */
const DOCUMENT_HEADINGS = {
  agents: ["Project constraints"],
  notes: ["Agent notes — known traps and version facts"],
};

/** The two shipped documents of a produced project, as text fields. */
export function shippedDocuments(read) {
  const agents = read("AGENTS.md");
  const at = agents.indexOf("## Project constraints");
  return {
    agents: at < 0 ? "" : agents.slice(at),
    notes: read("docs/agent-notes.md"),
  };
}

/** The rows a profile takes. */
export function rowsFor(answers) {
  const p = shapeOf(answers);
  return SHIPPED.filter((row) => whenHolds(row.when, p));
}

/**
 * Audit one produced project: returns `{ items, claims, bullets, failures }`. A failure is a row
 * whose text is missing from its section (an omission), a block no row claims (fabrication — and
 * that includes prose and headings, so a sentence added to a shipped section is caught too), or a
 * heading no declared section covers.
 */
export function audit(read, answers) {
  const documents = shippedDocuments(read);
  const failures = [];
  const rows = rowsFor(answers);
  let items = 0;
  let bullets = 0;

  for (const doc of ["agents", "notes"]) {
    const blocks = sectionBlocks(documents[doc]);
    const declared = new Set(rows.filter((r) => r.doc === doc).map((r) => r.section));
    const claimed = new Set();
    bullets += blocks.filter((block) => block.kind === "bullet").length;

    for (const row of rows.filter((r) => r.doc === doc)) {
      const kind = row.kind ?? "bullet";
      const hits = blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.kind === kind && block.section === row.section && block.text.includes(row.marker));
      if (hits.length === 0) {
        failures.push(
          `${row.item} is not shipped in ${doc} §${row.section} (${answers.GUIDE_MODE}/${answers.GUIDE_LAYOUT}): no ${kind} contains ${JSON.stringify(row.marker)}`,
        );
        continue;
      }
      for (const hit of hits) claimed.add(hit.index);
    }

    blocks.forEach((block, index) => {
      if (block.kind === "heading") {
        if (!declared.has(block.text) && !(DOCUMENT_HEADINGS[doc] ?? []).includes(block.text)) {
          failures.push(`no declared section covers this ${doc} heading (${answers.GUIDE_MODE}/${answers.GUIDE_LAYOUT}): ${block.text}`);
        }
        return;
      }
      if (!claimed.has(index)) {
        failures.push(
          `no source item claims this ${doc} ${block.kind} in §${block.section} (${answers.GUIDE_MODE}/${answers.GUIDE_LAYOUT}): ${block.text.slice(0, 120)}`,
        );
      }
    });
  }
  items = new Set(rows.map((row) => row.item)).size;
  return { items, claims: rows.length, bullets, failures };
}

// ------------------------------------------------------------------------------------- the self-check

/**
 * Every item of the master list, in document order: `{ id, line, declared }`.
 *
 * An id is *declared in the item itself* — `42. 📌 …` for a numbered item, and `- ⚠️ **B13** …`
 * for a boundary. It used to be counted from a boundary's position in the list, which made the id
 * invisible: with nothing in the item to read back, deleting one bullet shifted every later id,
 * and every row naming one silently re-pointed at a different fact (measured: the whole table
 * stayed green through exactly that). A declared id cannot move.
 */
function scanItems(constraintsText) {
  const entries = [];
  let section = "";
  let line = 0;
  for (const raw of constraintsText.split("\n")) {
    line += 1;
    const heading = /^## (.+?)[ \t]*$/.exec(raw);
    if (heading) {
      section = heading[1];
      continue;
    }
    const numbered = /^(\d+)\. /.exec(raw);
    if (numbered && section !== "已知边界") {
      entries.push({ id: `C${numbered[1]}`, line, declared: true });
      continue;
    }
    if (section === "已知边界" && /^- /.test(raw)) {
      const declared = /^- [^\s]+ \*\*(B\d+)\*\*/.exec(raw);
      entries.push(declared ? { id: declared[1], line, declared: true } : { id: null, line, declared: false });
    }
  }
  return entries;
}

/** Every item id the master list declares: `C<n>` for numbered items, `B<n>` for the boundaries. */
export function itemIds(constraintsText) {
  return scanItems(constraintsText)
    .filter((entry) => entry.declared)
    .map((entry) => entry.id);
}

/**
 * The master list's own failures: an item that declares no id, and an id declared twice. Both are
 * the item space's business — a boundary without an id is the state that made the table's
 * addresses depend on the list's order.
 */
export function itemIdFailures(constraintsText) {
  const failures = [];
  const seen = new Map();
  for (const entry of scanItems(constraintsText)) {
    if (!entry.declared) {
      failures.push(
        `docs/constraints.md:${entry.line} is a 已知边界 item with no declared id — write "- <emoji> **B<n>** …" so its id travels with it`,
      );
      continue;
    }
    if (seen.has(entry.id)) {
      failures.push(`${entry.id} is declared twice (docs/constraints.md:${seen.get(entry.id)} and :${entry.line})`);
    } else {
      seen.set(entry.id, entry.line);
    }
  }
  return failures;
}

/**
 * The (形态, 布局) arms the *profile guard* declares, read from that one fenced block.
 *
 * The guard is `guide:exec id=profile-guard`, and its arms are the `case` labels indented two
 * spaces inside it. An earlier version of this check matched any two-space-indented
 * `mode/layout)` line anywhere in GUIDE.md — 18 lines, spread across three different `case`
 * statements — so the guard could lose an arm and the check stayed green on a copy inside the
 * verify block (measured). Scoping the read to the guard's own block is what makes the claim in
 * the failure message true; that the guard *accepts* each arm is asserted by running it
 * (`e2e/run.sh`).
 */
export function guardArms(guide) {
  const lines = guide.split("\n");
  const open = lines.findIndex((line) => /^```[^\n]*guide:exec\b[^\n]*\bid=profile-guard\b/.test(line));
  if (open < 0) return { found: false, arms: [] };
  let close = open + 1;
  while (close < lines.length && !/^```[ \t]*$/.test(lines[close])) close += 1;
  const arms = [];
  for (const line of lines.slice(open + 1, close)) {
    // Any `  <形态>/<布局>)` arm, whatever the two words are: the vocabulary is `ACCEPTED`'s
    // business, and a guard arm this pattern could not read would be an arm no direction checks —
    // the very silence this function exists to end.
    const arm = /^ {2}([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\)/.exec(line);
    if (arm) arms.push(`${arm[1]}/${arm[2]}`);
  }
  return { found: true, arms };
}

/** Every ADR id the repository carries. */
export function adrIds(repoRoot) {
  const dir = join(repoRoot, "docs", "adr");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /^(\d{4})-.+\.md$/.exec(name))
    .filter(Boolean)
    .map((match) => `ADR-${match[1]}`);
}

/** The answers of every profile file, by profile name. Discovery lives in `lib/profiles.mjs`. */
export function profileAnswers(repoRoot) {
  const profiles = new Map();
  for (const profile of discoverProfiles(repoRoot)) profiles.set(profile.name, profile.answers);
  return profiles;
}

/**
 * Prove the table against the repository: ids exist, every item is covered or declared, every
 * shipped marker is a fragment of GUIDE.md, every not-shipped marker is where it claims to be —
 * and the profile set really exercises the whole matrix: every shipped row is selected by at
 * least one profile, every (mode, layout) the profile guard accepts has one, and both answers of
 * the layout's placeholder decision are run in every monorepo arrangement that has it.
 *
 * It also runs the checks that read GUIDE.md's own markers, through `extract.mjs`'s grammar: the
 * 分片 glue back into GUIDE.md (`guide-parts.mjs`), the 索引's 路由表 equals the plan each shape
 * produces and every `when=` gate is either run by a profile or declared `unrun` (`router.mjs`),
 * and the copies of a repeated fragment are one text each (`fragments.mjs`).
 */
export function selfCheck(repoRoot) {
  const failures = [];
  const constraints = readFileSync(join(repoRoot, "docs", "constraints.md"), "utf8");
  const guide = readFileSync(join(repoRoot, "GUIDE.md"), "utf8");
  const verification = existsSync(join(repoRoot, "docs", "verification.md"))
    ? readFileSync(join(repoRoot, "docs", "verification.md"), "utf8")
    : null;
  const items = itemIds(constraints);
  for (const failure of itemIdFailures(constraints)) failures.push(failure);
  const adrs = adrIds(repoRoot);
  const known = new Set([...items, ...adrs]);
  // The guide wraps its prose, so a marker is a fragment of the *flattened* text: the shipped
  // documents are written verbatim from those blocks, which is what makes the fragment meaningful.
  const flat = (text) => text.replace(/\s+/g, " ");
  const flatGuide = flat(guide);

  const shipped = new Map();
  for (const row of SHIPPED) {
    if (!known.has(row.item)) failures.push(`a ${row.doc} row names ${row.item}, which the master list and the ADRs do not define`);
    shipped.set(row.item, (shipped.get(row.item) ?? 0) + 1);
    if (!flatGuide.includes(flat(row.marker))) {
      failures.push(`${row.item} (${row.doc} §${row.section}) marker is not a fragment of GUIDE.md: ${JSON.stringify(row.marker)}`);
    }
  }
  for (const id of known) {
    if (!shipped.has(id) && !NOT_SHIPPED[id]) failures.push(`${id} ships nothing and is not declared in NOT_SHIPPED`);
    if (shipped.has(id) && NOT_SHIPPED[id]) failures.push(`${id} is both shipped and declared not-shipped`);
  }
  for (const [id, entry] of Object.entries(NOT_SHIPPED)) {
    if (!known.has(id)) failures.push(`NOT_SHIPPED names ${id}, which the master list does not define`);
    if (!entry.why) failures.push(`NOT_SHIPPED[${id}] has no reason`);
    const where =
      entry.where === "guide"
        ? flatGuide
        : entry.where === "verification"
          ? verification === null
            ? null
            : flat(verification)
          : entry.where === "repo"
            ? null
            : undefined;
    if (where === undefined) failures.push(`NOT_SHIPPED[${id}] has an unknown place: ${entry.where}`);
    else if (where === null && entry.where !== "repo") failures.push(`NOT_SHIPPED[${id}] claims ${entry.where} but no document was read`);
    else if (entry.marker && where !== null && !new RegExp(flat(entry.marker)).test(where)) {
      failures.push(
        `NOT_SHIPPED[${id}] marker is not present in ${entry.where === "guide" ? "GUIDE.md" : "docs/verification.md"}: ${entry.marker}`,
      );
    }
    if (entry.where === "verification" && where === null) {
      failures.push(`NOT_SHIPPED[${id}] claims the verification record, which does not exist yet`);
    }
  }
  // ---- the selector vocabulary: a `when` typo must be a failure, not a row that silently never
  // matches, and a selector no row uses is dead weight in the vocabulary.
  const usedSelectors = new Set();
  for (const row of SHIPPED) {
    for (const name of selectorNames(row.when)) {
      usedSelectors.add(name);
      if (!SELECTORS[name]) failures.push(`a row's shape filter names ${name}, which is not a selector (${row.item})`);
    }
  }
  for (const name of Object.keys(SELECTORS)) {
    if (!usedSelectors.has(name)) failures.push(`selector ${name} is declared but no row uses it`);
  }

  // ---- the profile set covers the matrix.
  const profiles = profileAnswers(repoRoot);
  const p = [...profiles.values()].map(shapeOf);
  for (const row of SHIPPED) {
    if (!p.some((answers) => whenHolds(row.when, answers))) {
      failures.push(`no profile runs the shape ${row.when} declares (${row.item}, ${row.doc} §${row.section})`);
    }
  }
  // ---- the guard's accepted set, bound to this module's declaration both ways, and every arm
  // runnable: a shape the guard accepts with no profile file is a shape nobody runs, and a shape
  // the module accepts that the guard does not implement would fail every run that took it.
  // The arms come from the guard step's own block — not from any line in GUIDE.md that looks like
  // an arm — and `e2e/run.sh` then runs the guard once per arm to prove it accepts them.
  const guard = guardArms(guide);
  if (!guard.found) {
    failures.push("GUIDE.md has no `guide:exec id=profile-guard` step — the guard's accepted set cannot be read");
  } else {
    if (new Set(guard.arms).size !== guard.arms.length) failures.push("the profile guard declares one arm twice");
    for (const arm of guard.arms) {
      if (!ACCEPTED.includes(arm)) failures.push(`the profile guard implements ${arm}, which e2e/lib/shape.mjs's ACCEPTED does not name`);
      const [mode, layout] = arm.split("/");
      if (!p.some((answers) => answers.mode === mode && answers.layout === layout)) {
        failures.push(`the profile guard implements ${arm}, which no profile file runs`);
      }
    }
    for (const arm of ACCEPTED) {
      if (!guard.arms.includes(arm)) failures.push(`e2e/lib/shape.mjs accepts ${arm}, which the profile guard does not implement`);
    }
  }
  // The setup decision point's two branches are proved by profiles too. No shipped row is keyed on
  // the answer any more, so the `yes` branch is asserted here instead of being implied by a row's
  // shape filter.
  if (![...profiles.values()].some((answers) => answers.GUIDE_SETUP === "yes")) {
    failures.push("no profile answers GUIDE_SETUP=yes — the setup flow's yes branch has never been run");
  }
  for (const [mode, layout] of new Set(p.filter((a) => a.layout === "monorepo").map((a) => [a.mode, a.layout]))) {
    const answers = new Set(
      [...profiles.values()]
        .filter((a) => a.GUIDE_MODE === mode && a.GUIDE_LAYOUT === layout)
        .map((a) => a.GUIDE_PLACEHOLDER),
    );
    for (const value of ["yes", "no"]) {
      if (!answers.has(value)) {
        failures.push(`${mode}/${layout} runs the placeholder decision ${[...answers].join("/") || "not at all"} — the ${value} branch has never been built`);
      }
    }
  }
  // ---- the profile set is named where it is documented, the count in that prose is the set's,
  // and the shared pins agree.
  const readme = flat(readFileSync(join(repoRoot, "e2e", "README.md"), "utf8"));
  const agents = flat(readFileSync(join(repoRoot, "AGENTS.md"), "utf8"));
  // A profile is named in the product as `<mode>-<layout>` (the profile file) or `<mode>/<layout>`
  // (the guide's own profile table); either is the profile being described. The match is a whole
  // name, not a substring: `backend-monorepo` occurs inside `backend-monorepo-placeholder-no`, so
  // the substring form could never fail for the three arrangements that have a `-placeholder-`
  // sibling (measured) — three of nine rows were dead checks.
  const slashName = (name) => name.replace(/^(frontend|backend|fullstack)-(single|monorepo)/, "$1/$2");
  const mentions = (text, name) =>
    new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(name)}([^A-Za-z0-9_-]|$)`).test(text);
  // A count written in prose is a fact with no owner unless something reads it: `AGENTS.md` said
  // "nine of them" and `e2e/README.md` "The nine profiles", and nothing did.
  const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const count = NUMBER_WORDS[profiles.size];
  if (!count) {
    failures.push(`the profile set holds ${profiles.size} profiles: extend NUMBER_WORDS in selfCheck and update the counts in AGENTS.md and e2e/README.md`);
  } else {
    for (const [doc, text, phrase] of [
      ["AGENTS.md", agents, `${count} of them`],
      ["AGENTS.md", agents, `all ${count}`],
      ["e2e/README.md", readme, `The ${count} profiles`],
    ]) {
      if (!text.includes(phrase)) failures.push(`${doc} does not say "${phrase}" — the profile count in prose has to follow the profile set`);
    }
  }
  // Every profile answers these; the server pin belongs to the shapes that have a server, so it is
  // compared only among the profiles that do answer it.
  const REQUIRED_PINS = ["GUIDE_VP_VERSION", "GUIDE_TS_VERSION", "GUIDE_TNB_VERSION", "GUIDE_SKILLS_VERSION"];
  const COMPARED_PINS = [...REQUIRED_PINS, "GUIDE_NITRO_VERSION"];
  for (const [name, answers] of profiles) {
    const shape = shapeOf(answers);
    if (!shape.arm) failures.push(`profile ${name} does not answer GUIDE_MODE and GUIDE_LAYOUT`);
    else if (!shape.isAccepted) failures.push(`profile ${name} answers ${shape.arm}, which e2e/lib/shape.mjs's ACCEPTED does not name`);
    for (const [doc, text] of [["GUIDE.md", flatGuide], ["e2e/README.md", readme]]) {
      if (!mentions(text, name) && !mentions(text, slashName(name))) {
        failures.push(`profile ${name} exists but is not named in ${doc}`);
      }
    }
    for (const key of REQUIRED_PINS) {
      if (!answers[key]) failures.push(`profile ${name} does not answer ${key}`);
    }
  }
  for (const key of COMPARED_PINS) {
    const byValue = new Map();
    for (const [name, answers] of profiles) {
      if (!answers[key]) continue;
      byValue.set(answers[key], [...(byValue.get(answers[key]) ?? []), name]);
    }
    if (byValue.size > 1) {
      const detail = [...byValue].map(([value, names]) => `${value} (${names.join(", ")})`).join(" vs ");
      failures.push(`${key} is not one pin across the profiles: ${detail}`);
    }
  }

  // ---- the guide's two views agree: the 分片 on disk glue back into GUIDE.md, byte for byte.
  // The cut has one implementation (`guide-parts.mjs`); calling its check here means every run and
  // every maintenance edit passes the same door before any plan is extracted.
  for (const failure of checkGuideParts()) failures.push(failure);

  // ---- the 索引's 路由表 is the plan, and the copies of a repeated fragment are one text each.
  // Both walk GUIDE.md's own markers, through `extract.mjs`'s grammar, so a run that reads only the
  // 索引 and its own 分片 is reading something the extractor would produce.
  for (const failure of checkRouter()) failures.push(failure);
  for (const failure of checkFragments()) failures.push(failure);

  return { failures, items, adrs, shippedRows: SHIPPED.length, profiles: profiles.size };
}

/** The matrix, as a readable table. */
export function list() {
  const lines = [];
  for (const doc of ["agents", "notes"]) {
    lines.push(`\n== ${doc === "agents" ? "AGENTS.md (## Project constraints)" : "docs/agent-notes.md"} ==`);
    let section = "";
    for (const row of SHIPPED.filter((r) => r.doc === doc)) {
      if (row.section !== section) {
        section = row.section;
        lines.push(`\n-- ${section}`);
      }
      lines.push(`  ${row.item.padEnd(9)} ${String(row.when).padEnd(20)} ${row.marker}`);
    }
  }
  lines.push("\n== not shipped ==");
  for (const [id, entry] of Object.entries(NOT_SHIPPED)) {
    lines.push(`  ${id.padEnd(4)} ${entry.where.padEnd(12)} ${entry.why}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("coverage.mjs")) {
  const repoRoot = join(import.meta.dirname, "..");
  const flag = process.argv[2];
  if (flag === "--list") {
    console.log(list());
    process.exit(0);
  }
  if (flag === "--self-check") {
    const result = selfCheck(repoRoot);
    if (result.failures.length) {
      console.error(`coverage: ${result.failures.length} failure(s)`);
      for (const failure of result.failures) console.error(`  - ${failure}`);
      process.exit(1);
    }
    console.log(
      `ok    coverage table: ${result.shippedRows} shipped rows over ${result.items.length} items, ${Object.keys(NOT_SHIPPED).length} declared not shipped, ${result.adrs.length} ADRs, ${result.profiles} profiles covering the matrix`,
    );
    process.exit(0);
  }
  console.error("usage: node e2e/coverage.mjs [--self-check|--list]");
  process.exit(2);
}
