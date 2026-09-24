# Agent instructions

## The product

`GUIDE.md` is this repo's only product: a guide an agent executes inside an empty directory.
It carries machine-extractable step markers (`guide:exec`, `guide:file`, `guide:verify`), and
`bash e2e/run.sh` extracts and runs them from scratch — the guide's own verify block is the
assertion set. Run it after changing `GUIDE.md`; it needs network and takes minutes. `bash
e2e/matrix.sh` runs every profile in `e2e/profiles/` — nine of them: the three modes times the two
layouts, plus both answers of the monorepo layout's placeholder decision — and rewrites
`docs/verification.md`; a change to the guide is only proven when all nine have been run. See
`e2e/README.md` for what the harness does and does not prove.

The shipped documents (`AGENTS.md`'s constraints section and `docs/agent-notes.md` in a target
project) are aligned with `docs/constraints.md` by `e2e/coverage.mjs`, in both directions per
profile; `node e2e/coverage.mjs --self-check` proves the table and the profile set, and
`run.sh` runs it before the first step.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `l246804/agent-ts-starter-template`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
