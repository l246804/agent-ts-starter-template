# agent-ts-starter-template

A guide, not a template. `GUIDE.md` is a document an agent (or a careful human) executes **inside an
empty directory**; at the end of it that directory is a pruned, Vite+-managed TypeScript project that
proves itself — format, static check, build, tests where the shape has them, and a smoke test of what
the arrangement actually serves.

The guide is delivered as an **index plus parts**: `guide/index.md` carries the head, the pre-answered
answers, Phase 0–2 and a routing table; `guide/parts/*.md` carry the rest, one file per `when=` gate. A
run fetches the index and then only the parts its own answers select — the routing table says which
files those are and which step ids run, in order. `GUIDE.md` is the source both views are cut from, and
the same text the E2E harness in `e2e/` executes, so the document and the test cannot drift into two
truths.

## Give this to your agent

Copy the block below into a fresh conversation with an agent that can fetch URLs and run shell
commands, with an empty directory as the working directory:

```text
Turn this empty directory into a project by following this guide.

1. Fetch https://raw.githubusercontent.com/l246804/agent-ts-starter-template/dev/guide/index.md and
   read it. Do not fetch GUIDE.md, and do not start writing files yet.
2. Ask me the decision points it lists — mode, layout, framework, package manager, the version pins,
   the dev-proxy target and the route its smoke test should call, the placeholder package, and whether
   to run the skills setup — in one round of questions, each with your recommendation and the reason.
   Then record my answers as the GUIDE_* environment variables the index names.
3. Take the row of its routing table that matches my answers: fetch exactly the files it names (same
   URL, with guide/index.md replaced by the path), and run exactly the steps it lists, in that order.
   Print that step-id list before you start, and check it against what you fetched: if a file or a step
   is missing, stop and report which one. Never fall back to fetching GUIDE.md.
```

## Working on the guide

- `node e2e/coverage.mjs --self-check` — the offline gate: the shipped-text table, the profile set, the
  guide's two views (the parts glued back must equal `GUIDE.md`), the routing table against the plan,
  and the repeated fragments.
- `node e2e/guide-parts.mjs --write` — re-cut the parts after **any** edit of `GUIDE.md` (it never
  writes `GUIDE.md`); `--check` proves the two views agree again.
- `node e2e/router.mjs --print` — print the routing table body from `GUIDE.md`, to paste back into the
  index after a step or a gate changes; `--check` proves each row is the plan its shape produces.
- `bash e2e/run.sh --profile <name>` — one profile end to end; needs network and takes minutes.
- `bash e2e/matrix.sh` — all nine profiles, then rewrites `docs/verification.md`. A change to the guide
  is only proven when that pass has been run.

`AGENTS.md` carries this repository's working constraints, `e2e/README.md` says what the harness proves
and what it deliberately does not, `CONTEXT.md` holds the vocabulary, and `docs/adr/` the decisions —
`0015` is the one behind the index-and-parts delivery.
