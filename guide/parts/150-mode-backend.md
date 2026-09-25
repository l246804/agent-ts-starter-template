
```bash guide:exec id=notes-backend when=mode:backend
set -euo pipefail

# The one trap that is only true of a project with no client at all.
cat >> docs/agent-notes.md <<'NOTES'

## No client

- There is no client build phase in this project (no `index.html`), and `/` answers `404`
  because nothing renders a page — that is the configured state, not a broken project.
NOTES
echo "ok  no-client trap appended to docs/agent-notes.md"
```
