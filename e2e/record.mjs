#!/usr/bin/env node
/**
 * Write the full-matrix record from the runs that actually happened.
 *
 *   node e2e/record.mjs [--workdir e2e/.work] [--manifest <file>] [--out docs/verification.md]
 *
 * `e2e/matrix.sh` runs every profile and then calls this; the file it writes is the reviewable
 * record of one full-matrix pass. Nothing here asks a target what happened: each verdict and each
 * fact comes from the run's own artifacts (`result.env`, the run log, the produced
 * `docs/provenance.md`), because the negative controls deliberately leave some targets half-built
 * — a post-hoc assertion on one of those is not the claim the run made.
 *
 * The manifest (`profile<TAB>run-dir`, written by `matrix.sh` as it starts each profile) is what
 * ties the record to *this* pass: a run that was killed before it settled has no verdict, and the
 * record says `stopped` rather than falling back to an older green run of the same profile. With
 * no manifest, each profile's newest run that wrote a verdict is used, which is only good for
 * looking at a single run by hand.
 *
 * A profile with no run at all is written as `not run`, and the exit code is non-zero unless every
 * profile is a `PASS`: the record cannot claim more than the runs prove.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAnswers } from "./lib/answers.mjs";
import { discoverProfiles } from "./lib/profiles.mjs";

const args = { workdir: "e2e/.work", out: "docs/verification.md", manifest: null, root: null };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === "--root") args.root = process.argv[++i];
  else if (process.argv[i] === "--workdir") args.workdir = process.argv[++i];
  else if (process.argv[i] === "--manifest") args.manifest = process.argv[++i];
  else if (process.argv[i] === "--out") args.out = process.argv[++i];
  else {
    console.error(`record: unknown argument ${process.argv[i]}`);
    process.exit(2);
  }
}

// Paths in the record are repo-relative: it is a committed document, and an absolute path from
// one machine says nothing on another. Inputs may be absolute or repo-relative.
const repoRoot = args.root ?? join(import.meta.dirname, "..");
const relative = (path) => path.replace(`${repoRoot}/`, "");
const resolve = (path) => (path.startsWith("/") ? path : join(repoRoot, path));
const profiles = discoverProfiles(repoRoot).map((profile) => profile.name);

const workdir = resolve(args.workdir);
const runsDir = join(workdir, "runs");
const logsDir = join(workdir, "matrix");
const out = resolve(args.out);

/** profile -> run directory, from the manifest when one was given. */
const manifest = new Map();
if (args.manifest && existsSync(resolve(args.manifest))) {
  for (const line of readFileSync(resolve(args.manifest), "utf8").split("\n")) {
    if (!line.includes("\t")) continue;
    const [profile, dir] = line.split("\t");
    manifest.set(profile.trim(), dir.trim());
  }
}

function newestRun(profile) {
  // A manifest is the pass's own record of what it ran: a profile it does not name was not run by
  // this pass, and an older green run of it must not be borrowed to fill the table.
  if (args.manifest) return manifest.get(profile) ?? null;
  if (!existsSync(runsDir)) return null;
  const dirs = readdirSync(runsDir)
    .filter((name) => name.endsWith(`-${profile}`) && existsSync(join(runsDir, name, "result.env")))
    .sort();
  return dirs.length ? join(runsDir, dirs[dirs.length - 1]) : null;
}

/** A markdown table row of the produced provenance, by its first cell. */
function provenanceRow(provenance, firstCell) {
  for (const line of provenance.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length > 3 && cells[1] === firstCell) return cells[2];
  }
  return "—";
}

const logOf = (profile) => {
  const path = join(logsDir, `${profile}.log`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

function countOf(log, pattern) {
  const match = pattern.exec(log);
  return match ? match.slice(1).join("/") : "—";
}

const rows = [];
const missing = [];
for (const profile of profiles) {
  const dir = newestRun(profile);
  if (!dir) {
    missing.push(profile);
    rows.push({ profile, status: "not run" });
    continue;
  }
  const runDir = relative(dir);
  // No verdict file means the run never settled (killed, or stopped before the harness could
  // write one): the record says `stopped`, never the older run's green. Both files are read through
  // the one answers reader — an inline `split("=")` kept the quotes and the padding of a quoted
  // value, which is how the same answer read differently here and in every other module.
  const readEnvFile = (name) => {
    const path = join(dir, name);
    return existsSync(path) ? readAnswers(path) : {};
  };
  const result = readEnvFile("result.env");
  const log = logOf(profile);
  const provenancePath = join(dir, "target", "docs", "provenance.md");
  const provenance = existsSync(provenancePath) ? readFileSync(provenancePath, "utf8") : "";
  const answers = readEnvFile("answers.env");
  // What the run's own assertion layer computed, as fields (`assert.mjs --summary`). A run
  // directory from before that flag carries no summary, and the log scrape below still reads it.
  const summary = readEnvFile("assert.env");
  const started = /runs\/(\d{8}-\d{6})-(.+)$/.exec(dir);
  const seconds =
    started && result.finished
      ? Math.round(
          (Date.parse(result.finished) -
            Date.parse(
              `${started[1].slice(0, 4)}-${started[1].slice(4, 6)}-${started[1].slice(6, 8)}T${started[1].slice(9, 11)}:${started[1].slice(11, 13)}:${started[1].slice(13, 15)}Z`,
            )) /
            1000,
        )
      : null;
  rows.push({
    profile,
    status: result.status ?? "stopped",
    finished: result.finished ?? "—",
    shape: `${answers.GUIDE_MODE ?? "?"} × ${answers.GUIDE_LAYOUT ?? "?"}`,
    setup: answers.GUIDE_SETUP ?? "?",
    placeholder: answers.GUIDE_PLACEHOLDER ?? "—",
    run: runDir,
    seconds,
    checks: summary.checks !== undefined ? `${summary.checks}/${summary.failures}` : countOf(log, /(\d+) checks, (\d+) failure/),
    coverage:
      summary.items !== undefined
        ? `${summary.items}/${summary.bullets}`
        : countOf(log, /(\d+) source items landed \(\d+ rows\), (\d+) shipped bullets claimed/),
    vp: provenanceRow(provenance, "vite-plus"),
    typescript: provenanceRow(provenance, "TypeScript"),
    nitro: provenanceRow(provenance, "nitro"),
    createVite: provenanceRow(provenance, "create-vite").replace("see note below", "not printed by this run"),
    skillsRevision: provenanceRow(provenance, "Revision at install time"),
    skillsInstalled: (provenanceRow(provenance, "Skills installed") ?? "—").split(" (")[0],
  });
}

const ran = rows.filter((row) => row.run).length;
const failures = rows.filter((row) => row.status !== "PASS").length;
// What identifies the thing that was actually run is each run's own plan digest (`extract.mjs`
// records the guide's sha256 there), never the file on disk at record time: an edit between a pass
// and this write would otherwise be attributed to runs that never saw it.
const guideDigests = new Map();
for (const row of rows) {
  if (!row.run) continue;
  const planPath = join(repoRoot, row.run, "plan", "plan.json");
  if (!existsSync(planPath)) continue;
  const digest = JSON.parse(readFileSync(planPath, "utf8")).guideSha256;
  if (!guideDigests.has(digest)) guideDigests.set(digest, []);
  guideDigests.get(digest).push(row.profile);
}
const oneGuide = guideDigests.size <= 1;
const guideLine =
  [...guideDigests.entries()]
    .map(([digest, names]) => (guideDigests.size === 1 ? `\`${digest.slice(0, 12)}\`` : `\`${digest.slice(0, 12)}\` (${names.join(", ")})`))
    .join(" vs ") || "unknown";
const revision = (() => {
  try {
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
    return `${head}${dirty ? " + uncommitted changes" : ""}`;
  } catch {
    return "unknown";
  }
})();

const lines = [
  "# Full-matrix verification record",
  "",
  ...(ran === profiles.length
    ? [
        "One pass of `bash e2e/matrix.sh`: every profile in `e2e/profiles/` initialized from an empty",
        "directory, verified by the guide's own verify block, asserted from outside, and put through",
        "the negative controls.",
      ]
    : [
        `One pass of \`bash e2e/matrix.sh\`, over the ${ran} profiles selected for it (of the`,
        `${profiles.length} in \`e2e/profiles/\`): each one initialized from an empty directory, verified`,
        "by the guide's own verify block, asserted from outside, and put through the negative controls.",
        "The profiles this pass did not run are marked `not run`.",
      ]),
  "The table is generated by `e2e/record.mjs` from the runs' own artifacts — each verdict is the one",
  "the run wrote (`result.env`), each version is read back out of the produced `docs/provenance.md`,",
  "and the guide digest is each run's own `plan/plan.json` — so this file cannot claim more than",
  "those runs prove.",
  "",
  `- Guide: sha256 ${guideLine} — the digest each run's own plan recorded. A pass is recorded before`,
  "  it is committed, so this digest, not the commit below, identifies the revision that ran.",
  `- Git at the time of the pass: \`${revision}\``,
  `- Profiles this pass ran: ${ran} of ${profiles.length} (${profiles.join(", ")})`,
  ...(oneGuide
    ? []
    : [
        "- **The runs did not all execute the same guide** — the digests above differ, so this table",
        "  mixes revisions and the record is not one pass.",
      ]),
  `- Result: ${failures === 0 ? `all ${rows.length} PASS` : `${failures} of ${rows.length} not PASS`}`,
  "",
  "| Profile | Shape | Setup | Placeholder | Result | Checks | Coverage (items/bullets) | Run |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| \`${row.profile}\` | ${row.shape ?? "—"} | ${row.setup ?? "—"} | ${row.placeholder ?? "—"} | ${
        row.status === "PASS" ? "**PASS**" : `**${row.status}**`
      } | ${row.checks} | ${row.coverage} | ${row.run ? `\`${row.run}\`` : "—"} |`,
  ),
  "",
  "## Versions that resolved",
  "",
  "| Profile | vite-plus | TypeScript | nitro | create-vite | skills revision | skills installed |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| \`${row.profile}\` | ${row.vp ?? "—"} | ${row.typescript ?? "—"} | ${row.nitro ?? "—"} | ${row.createVite ?? "—"} | ${
        row.skillsRevision && row.skillsRevision !== "—" ? `\`${row.skillsRevision.replace(/`/g, "")}\`` : "—"
      } | ${row.skillsInstalled ?? "—"} |`,
  ),
  "",
  "## What this record does not prove",
  "",
  "- **Branches no profile takes.** `GUIDE_TNB=yes` (the TypeScript 6 API bridge), every package",
  "  manager other than `pnpm`, the SSR bases other than `react-ts`, the split layout's other app",
  "  bases, and `GUIDE_TRACKER=other` (the file only a conversation with the user can write). The",
  "  guide's \"Profile status\" says the same, and `docs/upstream-drift.md` lists what to re-run when",
  "  the upstream that made them unexercised moves.",
  "- **Machine-dependent facts.** The runs use this machine's Node, package managers and network.",
  "  The guide's preflight reports what is really available; a different machine can change which",
  "  package managers exist, not whether the guide's own toolchain works.",
  "- **The harness's judgement half.** Decision points are pre-answered from the profile files, and",
  "  `/setup-matt-pocock-skills`'s conversation is replaced by its answers. What is exercised is the",
  "  flow's write half, not the conversation (see `e2e/README.md`).",
  "",
  "## Reproducing one pass",
  "",
  "```bash",
  "bash e2e/matrix.sh                              # every profile, in order, then rewrites this file",
  `bash e2e/run.sh --profile ${profiles[0]}   # one profile`,
  "```",
  "",
  `Run logs: \`${relative(logsDir)}/<profile>.log\`; extracted plans and produced projects: \`${relative(runsDir)}/<timestamp>-<profile>/\`.`,
  "",
];

writeFileSync(out, lines.join("\n"));
console.log(`record: wrote ${args.out} — ${rows.length} profiles, ${failures} not PASS`);
for (const profile of missing) console.log(`  not run: ${profile}`);
process.exit(failures === 0 && oneGuide && ran === profiles.length ? 0 : 1);
