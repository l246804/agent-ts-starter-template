#!/usr/bin/env node
/**
 * The copies of a repeated fragment, and the check that keeps them one text.
 *
 * A step has to be runnable on its own, so a few fragments of it are repeated in GUIDE.md verbatim:
 * the package-manager dispatch appears once per step that needs a package manager, the application
 * manifest's key order once per step that rewrites `package.json`, and so on. The duplication is
 * deliberate; a *divergence* between copies is not — it is how one rule quietly becomes two, with
 * nothing red.
 *
 * Each entry below names one such fragment, how many copies of it the guide carries, and how to
 * find them. The check requires exactly that many copies and byte-identical text across them
 * (leading and trailing whitespace aside, because a nested copy is indented). It is bidirectional
 * on purpose: a copy that drifts fails, and a copy that is added or deleted fails too — the count in
 * this file is a fact about the guide, and moving it is how a maintainer says "yes, and here is the
 * new text".
 *
 * What this does *not* check: fragments whose copies legitimately differ per shape (the planted
 * type-error control's four *forms* differ by probe path and log name — the server form has three
 * copies and is declared, the other three have one each and nothing to compare; the workspace
 * manifest key order differs by the keys a package has). A declared family whose copies were never
 * identical would be a check that cannot fail, which is worse than no check.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE = join(REPO, "GUIDE.md");

const PM_CASE = /^[ \t]*case "\$\{?GUIDE_PM\}?" in$/;
const ESAC = /^[ \t]*esac[ \t]*$/;

/**
 * `line` finds single-line fragments; `open`/`close` bound a block, and `seed` (optional) picks the
 * form: only blocks containing a line that matches it belong to the family.
 */
const FRAGMENTS = [
  {
    name: "the `dlx` package-manager dispatch",
    copies: 2,
    open: PM_CASE,
    close: ESAC,
    seed: /^pnpm\) dlx\(\) \{ pnpm dlx "\$@"; \} ;;$/,
  },
  {
    name: "the `install` package-manager dispatch",
    copies: 4,
    open: PM_CASE,
    close: ESAC,
    seed: /^pnpm\) pnpm install --no-frozen-lockfile ;;$/,
  },
  {
    // The most-copied line in the guide: every step that rewrites a file in Node starts with it. The
    // family is the exact import list, so a copy that drifts to a different list leaves the family
    // and the count falls — which is the failure this declares.
    name: "the node:fs import header",
    copies: 15,
    line: /^import \{ readFileSync, writeFileSync \} from "node:fs";$/,
  },
  {
    name: "the application manifest key order",
    copies: 3,
    line: /^const order = \[.*"devEngines"\];$/,
  },
  {
    name: "the missing-nitro-pin assertion",
    copies: 5,
    line: /^[ \t]*\[ -n "\$nitro_pin" \] \|\| \{ echo "GUIDE_NITRO_VERSION was never answered \(Phase 2\)" >&2; exit 1; \}$/,
  },
  {
    // The refusal every package-manager dispatch ends with: one message, wherever a step needs a
    // package manager. It drifts the moment one site is reworded or re-cased.
    name: "the package-manager refusal arm",
    copies: 7,
    line: /^\*\) echo "unsupported package manager: \$GUIDE_PM" >&2; exit 1 ;;$/,
  },
  {
    // The control that says a green check is meaningful: plant a type error, require the checker to
    // catch *that* error. The blocks differ by probe path and log name across shapes — those single
    // copies have nothing to compare — but three of them sit under `server/` with the same log name,
    // and those three must stay one text.
    name: "the planted type-error check (server form)",
    copies: 3,
    open: /^grep -q 'TS2322' \.vite-plus-server-control\.log \|\| \{$/,
    close: /^\}$/,
  },
];

const normalize = (text) => text.map((line) => line.trim()).join("\n").replace(/\n+$/, "");

/** Every occurrence of one fragment: `{ lines, text }`, in document order. */
function occurrences(lines, fragment) {
  if (fragment.line) {
    return lines
      .map((line, index) => ({ text: line.trim(), first: index + 1, last: index + 1 }))
      .filter((entry) => fragment.line.test(entry.text));
  }
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!fragment.open.test(lines[i])) continue;
    let j = i;
    while (j < lines.length && !fragment.close.test(lines[j])) j += 1;
    const body = lines.slice(i, j + 1);
    if (fragment.seed && !body.some((line) => fragment.seed.test(line.trim()))) {
      i = j;
      continue;
    }
    found.push({ text: normalize(body), first: i + 1, last: j + 1 });
    i = j;
  }
  return found;
}

/** The failures a caller (coverage.mjs --self-check) can push onto its own list. */
export function checkFragments() {
  const failures = [];
  const lines = readFileSync(GUIDE, "utf8").split("\n");
  for (const fragment of FRAGMENTS) {
    const found = occurrences(lines, fragment);
    if (found.length !== fragment.copies) {
      failures.push(
        `${found.length} copies of ${fragment.name} in GUIDE.md, ${fragment.copies} declared — a copy was added or deleted: ${
          found.map((entry) => `line ${entry.first}`).join(", ") || "none"
        }`,
      );
      continue;
    }
    const [first, ...rest] = found;
    for (const copy of rest) {
      if (copy.text !== first.text) {
        failures.push(
          `${fragment.name} diverges: the copy at line ${copy.first} is not the text at line ${first.first} — a repeated fragment is one text, and changing one copy makes it two rules`,
        );
      }
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = checkFragments();
  if (failures.length) {
    for (const failure of failures) console.error(`fragments: ${failure}`);
    process.exit(1);
  }
  console.log(`fragments: ok — ${FRAGMENTS.length} repeated fragments, every copy identical`);
}
