# Business code stays page-local; sharing has to earn its keep

Business code is written where it is used: each page (or feature) owns its implementation, and a shared module exists only if it passes one of two tests — the **deletion test** (deleting it would scatter complexity back across N callers, rather than making complexity vanish) or the **cross-cutting test** (auth, the error contract, data access, telemetry and i18n must be identical everywhere, so they must be shared). The trade is deliberate: we give up leverage for locality, because in agent-driven iteration the scarce resources are context and blast radius, and because duplication is cheap to consolidate once real examples exist, while a premature abstraction is expensive to undo.

## Considered Options

- **DRY-first — extract as soon as a second caller appears** — rejected: it optimises leverage for a maintainer who already knows the codebase, at the cost of the page's independence. An abstraction built from two examples is a guess, and once it has N callers it is effectively frozen.
- **No shared business code at all** — rejected: cross-cutting concerns would then be re-implemented per page and drift, so pages would disagree about 401 handling, error shape and telemetry. That is a correctness and security risk, not a style preference.

## Consequences

- A page can be changed or deleted without reading any other page: the unit of change, knowledge and verification is one directory. That is what makes parallel agents safe as well as fast.
- The costs are accepted knowingly: real duplication, and no test-level enforcement — `vp check` cannot see code locality.
- The only machine-checkable half is dependency direction: pages may import `src/shared/`, never the reverse, and never each other. Everything else is a principle in `AGENTS.md`, not a verified constraint.
- Architecture-level code is an explicit list rather than a judgement call: routing and the app shell, the API client with its auth and error contract, telemetry, design primitives, API type contracts, and the server framework plumbing.
