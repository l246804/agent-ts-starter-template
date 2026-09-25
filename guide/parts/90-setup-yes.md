
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
# is silently dropped.
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
