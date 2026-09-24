# GUIDE.md carries the executable plan; the E2E harness runs it

The guide an agent executes and the E2E test that proves the guide works must not be two
documents. `GUIDE.md` therefore carries machine-extractable step markers (`guide:exec`,
`guide:file`, `guide:verify`), and `e2e/run.sh` extracts exactly those blocks and executes
them from an empty directory, in document order, stopping at the first failure. The marker
grammar has one implementation, `e2e/extract.mjs`.

## Considered Options

- **Harness-owned assertions that re-implement the guide's checks** — rejected: the guide is
  the product, and a second copy of its verification would drift from it silently. The verify
  step is extracted from the guide itself, so the only way to change what "green" means is to
  change the guide.
- **Asking a model to read the guide and act on it, then asserting the result** — rejected as
  the primary seam: it tests the model's reading, not the guide, and it is not reproducible.
  The judgement-dependent half is instead documented in `e2e/README.md` as explicitly out of
  scope, rather than faked.
- **Freezing the generated project into a fixture and diffing it** — rejected: it would pin
  the output of `vp create` and of upstream create-vite, so every upstream change would look
  like a guide regression, and the guide's real claim — that these steps work on a machine
  today — would go untested.

## Consequences

- An extracted step that a human cannot paste and run is a bug: the same text serves both
  readers, so steps stay self-contained and start with `set -euo pipefail`. That has a price,
  paid knowingly: the package-manager branch (`case "$GUIDE_PM"`) recurs in every step that
  needs it, because one step cannot call a helper another step defined.
- `e2e/extract.mjs` is the only implementation of the marker convention and enforces it:
  unique step ids, exactly one verify step and it must be last, no references to this
  repository's internal docs, and no step that needs an unanswered decision.
- The harness's own assertions are outcome checks made from outside the guide: the file tree,
  where the documents landed, the ignore rules (probed with `git check-ignore` in a throwaway
  repository), and the installed skill set compared against the upstream manifest re-resolved
  at assertion time. They are deliberately not a second copy of the verify step, which is
  extracted and run as-is; where an outcome is also asserted inside a guide step, that is the
  same contract observed twice, not a second assertion set.
- A profile is "supported" only when it has both a pre-answered profile file and assertions;
  `e2e/assert.mjs` fails on a profile it has no checks for instead of passing quietly.
