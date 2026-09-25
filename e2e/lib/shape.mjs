/**
 * 形状 — the resolved shape of one run, and the facts that follow from it.
 *
 * 形态 (mode) × 布局 (layout) is this repository's central pair of answers, and the facts that
 * hang off it — is there a server, is there an app, does a proxy exist, are versions shared
 * through a workspace catalog, is the shape the SSR one or the split one — used to be re-derived
 * in the coverage table, in the assertion layer, in the runner's control gates and in the plan's
 * `when=` matcher. They are derived once here.
 *
 * The interface is a pure function of the 预答 answers: no filesystem, no environment, no
 * network. That is what makes it the harness's test surface — a truth table over the accepted
 * shapes needs nothing but this module.
 *
 * The guide keeps its own gates: `GUIDE.md`'s `when=` markers are evaluated by `e2e/extract.mjs`
 * and stay exactly as they are (ADR-0006: a step is self-contained text). This module is the
 * harness's half, and `ACCEPTED` is the harness's declaration of what this revision implements —
 * `e2e/coverage.mjs --self-check` binds it, both ways, to the arms the profile guard actually
 * declares in the guide.
 */

/**
 * The (形态, 布局) pairs this revision implements, in the order the profile guard names them.
 * `e2e/assert.mjs` fails a run whose answers are not one of these, and the self-check requires
 * the guide's guard to implement exactly this set.
 */
export const ACCEPTED = [
  "frontend/single",
  "frontend/monorepo",
  "backend/single",
  "backend/monorepo",
  "fullstack/single",
  "fullstack/monorepo",
];

/** Whether this revision implements a (形态, 布局) pair at all. */
function isAccepted(mode, layout) {
  return ACCEPTED.includes(`${mode}/${layout}`);
}

/**
 * The resolved shape and its facts. `shape` is the readable name used by narrow readers (the
 * record's Shape column, `SELECTORS`); the booleans are the facts every check actually asks for.
 *
 * `mode`, `layout` and `shape` are `undefined` when the answers do not carry them, so a profile
 * with a missing answer fails a check that reads it rather than silently taking a default.
 */
export function shapeOf(answers) {
  const mode = answers.GUIDE_MODE;
  const layout = answers.GUIDE_LAYOUT;
  const isMono = layout === "monorepo";
  const isSingle = layout === "single";
  // A server side exists in the modes whose project serves something: backend serves routes,
  // fullstack serves routes and a page. Enumerated rather than "not frontend", so a fourth 形态
  // cannot silently inherit a server it was never given.
  const hasServer = mode === "backend" || mode === "fullstack";
  const isSsr = mode === "fullstack" && isSingle;
  const isSplit = mode === "fullstack" && isMono;
  // The app the monorepo template writes survives everything but a backend project — a backend
  // deletes `apps/` in the same run, because it has no client.
  const hasApp = isMono && mode !== "backend";
  // A pure frontend's backend is somewhere else (in either layout); the split shape's is the
  // workspace root server on another port. Those are the shapes with a dev proxy.
  const hasProxy = mode === "frontend" || isSplit;
  return {
    mode,
    layout,
    isSingle,
    isMono,
    isSsr,
    isSplit,
    hasServer,
    hasApp,
    hasProxy,
    // The workspace catalog is where the monorepo layout keeps its versions; in the single
    // layouts a version lives in the project's own manifest.
    usesCatalog: isMono,
    // The guard's own spelling of the pair, and whether this revision implements it.
    arm: mode !== undefined && layout !== undefined ? `${mode}/${layout}` : undefined,
    isAccepted: isAccepted(mode, layout),
  };
}

/**
 * The named predicates the coverage table's `when` column is written in: the guide's own `when=`
 * vocabulary where it has one, plus the layout facts those gates spell out — so a row can say
 * "every shape with a dev proxy" without listing the shapes.
 *
 * `whenHolds` throws on a name that is not here: a `when` typo has to be a failure, not a row
 * that silently never matches.
 */
export const SELECTORS = {
  all: () => true,
  server: (p) => p.hasServer,
  proxy: (p) => p.hasProxy,
  ssr: (p) => p.isSsr,
  split: (p) => p.isSplit,
  single: (p) => p.isSingle,
  mono: (p) => p.isMono,
  "mono-server": (p) => p.isMono && p.hasServer,
  "mono-shell": (p) => p.isMono && p.mode === "frontend",
  "mode-backend": (p) => p.mode === "backend",
  "frontend-single": (p) => p.mode === "frontend" && p.isSingle,
  "backend-single": (p) => p.mode === "backend" && p.isSingle,
  "frontend-monorepo": (p) => p.mode === "frontend" && p.isMono,
  "backend-monorepo": (p) => p.mode === "backend" && p.isMono,
};

/** Whether a row's `when` holds for a shape: `&`-joined clauses, each clause `|`-separated. */
export function whenHolds(when, p) {
  if (!when || when === "all") return true;
  return when.split("&").every((clause) =>
    clause.split("|").some((name) => {
      const selector = SELECTORS[name];
      if (!selector) throw new Error(`shape.mjs: unknown selector ${name}`);
      return selector(p);
    }),
  );
}

/** The selector names a `when` clause uses, in order — what the self-check audits for typos. */
export function selectorNames(when) {
  return String(when)
    .split("&")
    .flatMap((clause) => clause.split("|"));
}
