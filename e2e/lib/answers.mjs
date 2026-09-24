/**
 * The answers file, read in one place.
 *
 * A profile (`e2e/profiles/<name>.env`) is the pre-answered decision points — what a user
 * would answer when running GUIDE.md attended. The extractor needs it to evaluate `when=`
 * gates and to prove every decision a step needs was answered; the assertion layer needs it
 * to know which choices to check the produced project against. Both read the same file, so
 * the format lives here instead of in two parsers that can drift apart.
 *
 * Format: `KEY=VALUE` lines, `#` comments, blank lines ignored, optional surrounding quotes.
 */
import { existsSync, readFileSync } from "node:fs";

export function readAnswers(path) {
  if (!existsSync(path)) throw new Error(`answers file not found: ${path}`);
  const answers = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(`answers line is not KEY=VALUE: ${raw}`);
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    answers[key] = value;
  }
  return answers;
}
