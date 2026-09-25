/**
 * The profile set, discovered in one place.
 *
 * A profile (`e2e/profiles/<name>.env`) is 预答 决策点 — the answers a user would give when
 * running `GUIDE.md` attended — plus the harness assertions that go with them. The *set* used to
 * be discovered independently by `e2e/matrix.sh` (which runs them), `e2e/record.mjs` (which
 * writes them into the record) and `e2e/coverage.mjs` (which proves the set covers the matrix),
 * with the documentation naming them a fourth time by hand.
 *
 * Discovery lives here; the shape of each profile comes from `shape.mjs`. Ordered by name: the
 * record and the matrix run in this order, and the sorted order is stable across machines. A
 * dotted file is not a profile — a name nobody would mean as one, and a glob would not match it.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readAnswers } from "./answers.mjs";
import { shapeOf } from "./shape.mjs";

/** Every profile file in `e2e/profiles/`, as `{ name, answers, shape }`, by name. */
export function discoverProfiles(repoRoot) {
  const dir = join(repoRoot, "e2e", "profiles");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".env") && !entry.startsWith("."))
    .sort()
    .map((entry) => {
      const answers = readAnswers(join(dir, entry));
      return { name: entry.slice(0, -4), answers, shape: shapeOf(answers) };
    });
}
