
```bash guide:exec id=notes-merged-tsconfig when=mode:backend|fullstack&layout:single
set -euo pipefail

# The trap that belongs to the shapes that merge the server into one TypeScript program.
cat >> docs/agent-notes.md <<'NOTES'

## One program, and who checks it

- The build script's `tsc` only checks what the tsconfig `include` lists. The config here
  extends `nitro/tsconfig` and lists the file set this shape needs; without `server` in that
  list, `tsc` passes while never looking at a handler.
NOTES
echo "ok  merged-program trap appended to docs/agent-notes.md"
```
