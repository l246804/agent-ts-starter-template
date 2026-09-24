# Agent instructions

## The product

`GUIDE.md` is this repo's only product: a guide an agent executes inside an empty directory.
It carries machine-extractable step markers (`guide:exec`, `guide:file`, `guide:verify`), and
`bash e2e/run.sh` extracts and runs them from scratch — the guide's own verify block is the
assertion set. Run it after changing `GUIDE.md`; it needs network and takes minutes. See
`e2e/README.md` for what the harness does and does not prove.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `l246804/agent-ts-starter-template`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
