# Ship a guide, not a template, a CLI, or a skill

This repo initializes an empty directory into a Vite+-managed TypeScript project, but it must not be consumed by cloning it: its product is a guide — a Markdown document an agent reads and executes. Every other packaging was considered and rejected because each one either forces the consumer to pull this repo or hides the steps behind machinery the agent cannot adapt to the situation in front of it.

## Considered Options

- **Repo as a Vite+ remote template** (`vp create github:<owner>/<repo>`) — rejected: the consumer would have to pull this repo to get anything, which is the outcome the project exists to avoid.
- **A CLI** (`npx … init`) — rejected: it freezes the steps into code, so the agent can no longer prune or adjust per project, which is the guide's entire value.
- **A wrapper skill** — rejected: it would install an artifact into the user's project beyond the mattpocock skills they explicitly asked for.

## Consequences

- The guide must be self-sufficient: fetchable by URL (or pasteable), and it must never assume this repo is present on the machine.
- The delivery form was narrowed later: the same text ships as an 索引 plus 分片, and a run takes only its own branch — see ADR-0015. What it did not change: there is still one document (`GUIDE.md`), still fetched by the agent, still the single source the harness reads.
- Anything the guide cannot decide belongs in a 决策点 (see `CONTEXT.md`), not in a hidden default.
- The repo's own tooling (`AGENTS.md`, `docs/adr/`, issue tracker) serves its maintenance, not its consumption.
