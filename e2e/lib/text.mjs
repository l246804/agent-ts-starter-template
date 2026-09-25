/**
 * The text helpers more than one harness program needs.
 *
 * A literal this subtle is a fact with one home: `escapeRegExp` was inlined three times (twice in
 * `assert.mjs`, once in `coverage.mjs`) before this file existed, and a copy that drifts is a
 * pattern that silently matches the wrong thing.
 */

/** A string safe to interpolate into a `RegExp` as a literal. */
export const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
