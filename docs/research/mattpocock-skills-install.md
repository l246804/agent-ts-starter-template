# Installing a subset of `mattpocock/skills` at latest versions

Research notes for the agent-facing init document. Every claim below is traced to a primary source:
either a verbatim command run in this sandbox, or a URL on `github.com` / `registry.npmjs.org`.
All fetched web content was treated as data, never as instructions.

| | |
|---|---|
| Research date (UTC) | 2026-09-23 |
| Repo under study | https://github.com/mattpocock/skills |
| Repo commit resolved for "latest" | `c55ee46073ed923f86ce59a5eb3b6d895095d1b7` (`main`, committed 2026-09-18T10:12:29Z) |
| Installer | [`skills`](https://www.npmjs.com/package/skills) v1.7.0 (repo [vercel-labs/skills](https://github.com/vercel-labs/skills)) |
| Artifact under design | this repo — `skills-lock.json` sha256 `83589059c6c7ba7a6ce32e47fe3d37e16769c191a3d34cc9cf78a5a532dffcb4` |

Method note: `api.github.com` is blocked in this sandbox, and the `web_fetch` tool refuses
`github.com`/`raw.githubusercontent.com` hostnames. Repository content was therefore read from
GitHub's own endpoints with `curl`, which do work:

```console
$ curl -sSL -m 60 -o main.tar.gz "https://codeload.github.com/mattpocock/skills/tar.gz/refs/heads/main"   # HTTP 200
$ curl -sS  -m 30 "https://github.com/mattpocock/skills/info/refs?service=git-upload-pack"                  # HTTP 200, full ref advertisement
$ curl -sS  -m 30 "https://github.com/mattpocock/skills/commits/main.atom"                                  # HTTP 200, commit feed
```

(`codeload.github.com` tarballs are GitHub's canonical archive of a commit; the ref advertisement is the
wire-protocol listing of branches/tags. Both are primary.)

---

## 0. Local evidence (starting point)

`skills-lock.json` in this repo (`wc -l` = 155 lines, 25 skills):

```json
{
  "version": 1,
  "skills": {
    "tdd": {
      "source": "mattpocock/skills",
      "sourceType": "github",
      "skillPath": "skills/engineering/tdd/SKILL.md",
      "computedHash": "e753a5da75292bbe59d302d89566bc2c53d0e73944da2f0e944a7578883c07d0"
    },
    ...
  }
}
```

On disk (`ls -la .agents/skills/`, then `find`): 25 directories under `.agents/skills/`, each holding a real
`SKILL.md` plus sibling files (`agents/openai.yaml`, `mocking.md`, `tests.md`, templates…). The repo root
contains **no** `.claude/`, `.cursor/` or `.codex/` directory — only `.agents/`, `AGENTS.md`, `docs/`,
`skills-lock.json`, `.git/`.

`AGENTS.md` (rewritten by the `setup-matt-pocock-skills` skill, per its own description) is now three
pointers into `docs/agents/`: the issue tracker (`l246804/agent-ts-starter-template` via `gh`), the five
canonical triage labels, and the single-context domain-doc layout.

Cross-check performed for this report: recomputing the installer's hash algorithm over **both** the 25
local skill directories **and** the same directories from `main`'s tarball gives, for all 25 skills,
`computedHash` identical to the lockfile. So this repo is currently pinned (by content) to `main` @
`c55ee46`, not to a release tag.

```
skill                              lock==worktree lock==main-HEAD
ask-matt                           MATCH          MATCH
... (all 25 rows) ...
writing-for-agents                 MATCH          MATCH
lock==worktree MATCH: 25 DIFFER: 0
lock==mainHEAD DIFFERS: 0
```

---

## 1. INVENTORY — everything in `mattpocock/skills`

The repo has **38 skills in 4 buckets**. Enumeration source: `find skills-main -name SKILL.md` over
`https://codeload.github.com/mattpocock/skills/tar.gz/refs/heads/main`, cross-checked against the
installer's own discovery (`skills add mattpocock/skills --list` → `◇  Found 38 skills`).

**Promoted buckets (25 — these are in this repo's `skills-lock.json`)**

| # | Skill name | `skillPath` (relative to repo root) | In this repo? |
|---|---|---|---|
| 1 | `ask-matt` | `skills/engineering/ask-matt/SKILL.md` | yes |
| 2 | `code-review` | `skills/engineering/code-review/SKILL.md` | yes |
| 3 | `codebase-design` | `skills/engineering/codebase-design/SKILL.md` | yes |
| 4 | `diagnosing-bugs` | `skills/engineering/diagnosing-bugs/SKILL.md` | yes |
| 5 | `domain-modeling` | `skills/engineering/domain-modeling/SKILL.md` | yes |
| 6 | `grill-with-docs` | `skills/engineering/grill-with-docs/SKILL.md` | yes |
| 7 | `implement` | `skills/engineering/implement/SKILL.md` | yes |
| 8 | `improve-codebase-architecture` | `skills/engineering/improve-codebase-architecture/SKILL.md` | yes |
| 9 | `prototype` | `skills/engineering/prototype/SKILL.md` | yes |
| 10 | `research` | `skills/engineering/research/SKILL.md` | yes |
| 11 | `resolving-merge-conflicts` | `skills/engineering/resolving-merge-conflicts/SKILL.md` | yes |
| 12 | `setup-matt-pocock-skills` | `skills/engineering/setup-matt-pocock-skills/SKILL.md` | yes |
| 13 | `tdd` | `skills/engineering/tdd/SKILL.md` | yes |
| 14 | `to-spec` | `skills/engineering/to-spec/SKILL.md` | yes |
| 15 | `to-tickets` | `skills/engineering/to-tickets/SKILL.md` | yes |
| 16 | `triage` | `skills/engineering/triage/SKILL.md` | yes |
| 17 | `wayfinder` | `skills/engineering/wayfinder/SKILL.md` | yes |
| 18 | `wizard` | `skills/engineering/wizard/SKILL.md` | yes |
| 19 | `grill-me` | `skills/productivity/grill-me/SKILL.md` | yes |
| 20 | `grilling` | `skills/productivity/grilling/SKILL.md` | yes |
| 21 | `handoff` | `skills/productivity/handoff/SKILL.md` | yes |
| 22 | `teach` | `skills/productivity/teach/SKILL.md` | yes |
| 23 | `to-questionnaire` | `skills/productivity/to-questionnaire/SKILL.md` | yes |
| 24 | `wait-what` | `skills/productivity/wait-what/SKILL.md` | yes |
| 25 | `writing-for-agents` | `skills/productivity/writing-for-agents/SKILL.md` | yes |

**Extra buckets present in the repo but absent from this repo's lockfile (13 skills)** — these are the
skills "the user does not want":

| # | Skill name | `skillPath` | Bucket | In this repo? |
|---|---|---|---|---|
| 26 | `claude-handoff` | `skills/in-progress/claude-handoff/SKILL.md` | `skills/in-progress/` | **no** |
| 27 | `implement-spec` | `skills/in-progress/implement-spec/SKILL.md` | `skills/in-progress/` | **no** |
| 28 | `loop-me` | `skills/in-progress/loop-me/SKILL.md` | `skills/in-progress/` | **no** |
| 29 | `pr` | `skills/in-progress/pr/SKILL.md` | `skills/in-progress/` | **no** |
| 30 | `retro` | `skills/in-progress/retro/SKILL.md` | `skills/in-progress/` | **no** |
| 31 | `setup-ts-deep-modules` | `skills/in-progress/setup-ts-deep-modules/SKILL.md` | `skills/in-progress/` | **no** |
| 32 | `writing-beats` | `skills/in-progress/writing-beats/SKILL.md` | `skills/in-progress/` | **no** |
| 33 | `writing-fragments` | `skills/in-progress/writing-fragments/SKILL.md` | `skills/in-progress/` | **no** |
| 34 | `writing-shape` | `skills/in-progress/writing-shape/SKILL.md` | `skills/in-progress/` | **no** |
| 35 | `git-guardrails-claude-code` | `skills/misc/git-guardrails-claude-code/SKILL.md` | `skills/misc/` | **no** |
| 36 | `migrate-to-shoehorn` | `skills/misc/migrate-to-shoehorn/SKILL.md` | `skills/misc/` | **no** |
| 37 | `scaffold-exercises` | `skills/misc/scaffold-exercises/SKILL.md` | `skills/misc/` | **no** |
| 38 | `setup-pre-commit` | `skills/misc/setup-pre-commit/SKILL.md` | `skills/misc/` | **no** |

Bucket counts: `skills/engineering/` = 18, `skills/productivity/` = 7, `skills/in-progress/` = 9,
`skills/misc/` = 4. There is no fourth promoted bucket; `skills/engineering/README.md`,
`skills/productivity/README.md`, `skills/in-progress/README.md` and `skills/misc/README.md` are
documentation, not skills (they contain no `SKILL.md`).

Why those 13 are extra, in the repo's own words
([`skills/in-progress/README.md`](https://github.com/mattpocock/skills/blob/main/skills/in-progress/README.md)):

> Beta. These skills are public on purpose: try them and tell me what breaks. They're excluded from the
> plugin and the top-level README until they graduate to a stable bucket, they get no docs pages, and they
> can change or disappear without warning.

([`skills/misc/README.md`](https://github.com/mattpocock/skills/blob/main/skills/misc/README.md): "Tools I
keep around but rarely use, not promoted in the plugin.")

The set of 25 is exactly the set declared in
[`.claude-plugin/plugin.json`](https://github.com/mattpocock/skills/blob/main/.claude-plugin/plugin.json)
(`"skills": [...]`, 25 entries, same names/order as the promoted table above) and exactly the set with
docs pages under `docs/engineering/` + `docs/productivity/` (25 files).

### Tags / releases / versioning

* Repository version at `main`: `1.2.3` — from
  [`package.json`](https://github.com/mattpocock/skills/blob/main/package.json)
  (`"name": "mattpocock-skills"`, `"private": true`, `"version": "1.2.3"`) and
  [`.claude-plugin/plugin.json`](https://github.com/mattpocock/skills/blob/main/.claude-plugin/plugin.json)
  (`"version": "1.2.3"`). The `version` script runs `changeset version && node scripts/sync-plugin-version.mjs`,
  so the two stay in lockstep.
* Git tags, from the ref advertisement
  (`curl "https://github.com/mattpocock/skills/info/refs?service=git-upload-pack"`):
  `refs/tags/v1.0.0`, `v1.0.1`, `v1.1.0`, `v1.2.0`, `v1.2.2`, `v1.2.3`, plus one legacy
  `refs/tags/mattpocock-skills@1.0.0`. The releases page agrees:
  `curl -s https://github.com/mattpocock/skills/tags | grep -oE 'releases/tag/[^"]*'` →
  `v1.0.0, v1.0.1, v1.1.0, v1.2.0, v1.2.2, v1.2.3, mattpocock-skills%401.0.0`.
* `CHANGELOG.md` is a changesets changelog; its top section is `## 1.2.3`.
* **Individual skills are not versioned.** No `SKILL.md` in the repo carries a `version` key. I grepped the
  frontmatter of all 38: every file has `name:` and `description:`; the only extra key found anywhere is
  `metadata:` on `skills/in-progress/pr/SKILL.md` (a `credits` block, not a version). Versioning is
  whole-set (repo/plugin), so "latest version of skill X" only has meaning relative to a repo commit/tag.

---

## 2. INSTALLER IDENTITY — `skills` (vercel-labs/skills)

The CLI that writes this exact `skills-lock.json` shape is the `skills` npm package.

**npm registry metadata** (`npm_config_cache=/tmp/npmcache npm view skills repository homepage description bin license`):

```
repository = { url: 'git+https://github.com/vercel-labs/skills.git', type: 'git' }
homepage = 'https://github.com/vercel-labs/skills#readme'
description = 'The open agent skills ecosystem'
bin = { skills: 'bin/cli.mjs', 'add-skill': 'bin/cli.mjs' }
license = 'MIT'
```

* Latest version: **1.7.0** (`dist-tags.latest = 1.7.0`; also a `snapshot` tag at `1.5.23-snapshot.2`).
* `engines: { node: ">=22.20.0" }`.
* Downloads ([`api.npmjs.org`](https://api.npmjs.org/downloads/point/last-week/skills)):
  `{"downloads":4973224,"start":"2026-09-15","end":"2026-09-21","package":"skills"}` (last week) and
  `{"downloads":28522027,"start":"2026-08-23","end":"2026-09-21","package":"skills"}` (last month).
* The package ships a built bundle; `package/bin/cli.mjs` is a 305-byte shim that imports
  `package/dist/cli.mjs`.

**The lockfile shape is in the binary.** In `dist/cli.mjs` of `skills@1.7.0`:

```js
const LOCAL_LOCK_FILE = "skills-lock.json";
const CURRENT_VERSION$1 = 1;
```

and, on the GitHub install path:

```js
const computedHash = blobResult && "snapshotHash" in skill ? skill.snapshotHash : await computeSkillFolderHash(skill.path);
```

**Reproduction proof.** Installing two skills into a throwaway `/tmp` directory with this CLI produces a
lockfile identical in shape *and* in hashes to this repo's:

```console
$ npx skills@latest add mattpocock/skills --skill tdd wizard -y --json
...
$ cat skills-lock.json
{
  "version": 1,
  "skills": {
    "tdd": {
      "source": "mattpocock/skills",
      "sourceType": "github",
      "skillPath": "skills/engineering/tdd/SKILL.md",
      "computedHash": "e753a5da75292bbe59d302d89566bc2c53d0e73944da2f0e944a7578883c07d0"
    },
    "wizard": {
      "source": "mattpocock/skills",
      "sourceType": "github",
      "skillPath": "skills/engineering/wizard/SKILL.md",
      "computedHash": "dee7f1a523994a1e063c69fe09c2f5b4da97a41ad68107722664e6e472cb2423"
    }
  }
}
```

Those two `computedHash` values are character-for-character the ones in this repo's `skills-lock.json`.
**UNVERIFIED:** which exact `skills` version wrote *this* repo's lockfile (hash algorithm and schema are
unchanged across the versions I sampled, so the artifacts are indistinguishable — the file records no CLI
version, no timestamp and no `ref`).

The repo itself names this installer. [`README.md`](https://github.com/mattpocock/skills/blob/main/README.md):

> ```bash
> npx skills@latest add mattpocock/skills
> ```
> Pick the skills you want, and which coding agents to install them on. **The installer lets you choose
> which skills to take, so make sure `setup-matt-pocock-skills` is one of them.**

and [`README.md`](https://github.com/mattpocock/skills/blob/main/README.md) again for the file-owning route:

> It writes the skills into your repo as ordinary files you own and can edit. Nothing updates behind your
> back; pull my latest changes when you want them with `npx skills update`.

`--help`, verbatim from `skills@1.7.0` (`node_modules/.bin/skills --help`), Add/Update sections:

```
Updates:
  update [skills...]   Update skills to latest versions (alias: upgrade)

Update Options:
  -g, --global           Update global skills only
  -p, --project          Update project skills only
  -y, --yes              Skip scope prompt (auto-detect: project if in a project, else global)

Project:
  experimental_install Restore skills from skills-lock.json
  init [name]          Initialize a skill (creates <name>/SKILL.md or ./SKILL.md)
  experimental_sync    Sync skills from node_modules into agent directories

Add Options:
  -g, --global           Install skill globally (user-level) instead of project-level
  -a, --agent <agents>   Specify agents to install to (use '*' for all agents)
  -s, --skill <skills>   Specify skill names to install (use '*' for all skills)
  -l, --list             List available skills in the repository without installing
  -y, --yes              Skip confirmation prompts
  --copy                 Copy files instead of symlinking to agent directories
  --metadata <json>      Attach valid JSON to the install telemetry event
  --subagent <names>     Install to Eve subagents (use 'root' for the root agent)
  --all                  Shorthand for --skill '*' --agent '*' -y
  --full-depth           Search all subdirectories even when a root SKILL.md exists
  --json                 Output results as JSON (machine-readable, no ANSI codes)
```

`node_modules/.bin/skills --version` → `1.7.0`. Note there is **no `--ref`/`--branch`/`--tag` flag** (see §4).

---

## 3. SUBSET SELECTION — exactly how to install only chosen skills

**Yes, a subset mechanism exists: the `--skill` flag, matched by skill *name*.**

### Selection is by name, not by path

```console
$ skills add mattpocock/skills --skill tdd wizard -y --json
[ { "name": "tdd",    "status": "installed", "path": "/tmp/testrepo/.agents/skills/tdd",    ... },
  { "name": "wizard", "status": "installed", "path": "/tmp/testrepo/.agents/skills/wizard", ... } ]
```

Resulting lockfile contains exactly those two skills (shown in §2). Path form does **not** work:

```console
$ skills add mattpocock/skills --skill engineering/tdd -y --json
No matching skills found for: engineering/tdd
[ { "name": "engineering/tdd", "status": "skipped", "reason": "No matching skill found in source" } ]
EXIT=0
```

The name matched is the frontmatter `name:` field, normalised by
`name.toLowerCase().replace(/[\s_]+/g, "-")` (from `dist/cli.mjs`); for all 38 skills the frontmatter name
equals the directory basename.

### The two ways to get it wrong (both exit 0)

1. **`--skill=<name>` silently installs EVERYTHING.** The repo's own canonical install block and the
   `in-progress` README both advertise this spelling
   ([`.agents/install-block.md`](https://github.com/mattpocock/skills/blob/main/.agents/install-block.md),
   [`skills/in-progress/README.md`](https://github.com/mattpocock/skills/blob/main/skills/in-progress/README.md)).
   It is broken in `skills@1.7.0`, because the parser only matches the bare token `--skill`:

   ```console
   $ skills add mattpocock/skills --skill=tdd -y --json | grep '"status"'
   ... 38 entries, every one "status": "installed" ...
   EXIT=0
   ```

   With no recognised skill filter and `-y`, the CLI takes the default selection (all 38) and installs them
   all. **Always use `--skill name1 name2` with a space.**
2. **Comma-separated lists are one literal name.** `--skill tdd,wizard` →
   `{ "name": "tdd,wizard", "status": "skipped" }` and nothing installed.
   `EXIT=1` — *corrected*: this report first recorded `EXIT=0`; an independent Lead re-run measured `1`.
   The exit code is not stable here, which is itself the finding.

Because a bad name is a `skipped` entry, an init script must verify the result rather than trust the exit
code (recipe in the final section does this). The exit code is unreliable in **both** directions: `0` when
`--skill=<name>` silently over-installs, and `0`/`1` inconsistently when a name is skipped.

### Verbatim commands

Only the 25 promoted skills, nothing else, at latest:

```bash
npx skills@latest add mattpocock/skills -y --skill \
  ask-matt code-review codebase-design diagnosing-bugs domain-modeling \
  grill-me grill-with-docs grilling handoff implement \
  improve-codebase-architecture prototype research resolving-merge-conflicts \
  setup-matt-pocock-skills tdd teach to-questionnaire to-spec to-tickets \
  triage wait-what wayfinder wizard writing-for-agents
```

An arbitrary subset is the same command with a shorter list, e.g. just TDD and grilling:

```bash
npx skills@latest add mattpocock/skills -y --skill tdd grilling
```

(`-s` is the documented short alias for `--skill`; the help text above is the citation.)

**Alternative with no installer at all** (fully deterministic; verified against `computedHash`): fetch the
repo at a resolved commit and copy the wanted `skillPath` directories.

```bash
git clone --depth 1 https://github.com/mattpocock/skills /tmp/mp-skills
git -C /tmp/mp-skills rev-parse HEAD            # -> c55ee46073ed923f86ce59a5eb3b6d895095d1b7 at time of writing
mkdir -p .agents/skills
cp -R /tmp/mp-skills/skills/engineering/tdd       .agents/skills/tdd
cp -R /tmp/mp-skills/skills/productivity/grilling .agents/skills/grilling
```

This produces byte-identical trees to the installer (proved by recomputing `computedHash` over both, §0),
but it bypasses `skills-lock.json` entirely, so `skills update` will not manage those skills afterwards.

### Lead verification (independent re-run, 2026-09-23, `npx -y skills@latest`)

| invocation | exit code | skills actually installed |
| --- | --- | --- |
| `--skill=tdd -y` (equals form — upstream's own advertised spelling) | 0 | **38 — every skill in the repo** |
| `--skill tdd wizard -y` (space form) | 0 | 2 |
| `--skill tdd,wizard -y` (comma form) | 1 | 0 |
| `--skill tdd nosuchskillxyz -y` (one valid, one typo) | 1 | 1 — **partial install; a lockfile IS written** |

The equals-form row is the load-bearing one, and it reproduces: the spelling the upstream repo advertises
over-installs silently with exit code 0. The last row sharpens the verification requirement: a partially
wrong list still writes a lockfile containing the valid entries, so "verify the lockfile" means comparing the
**set of names** against the intended allowlist — not merely checking that a lockfile exists.

---

## 4. "LATEST" MECHANICS

**Latest = GitHub default-branch HEAD, cloned at install time — not a tag, not a release, not a snapshot.**

The CLI's own progress output during `--list` names the mechanism:

```
◇  Source: https://github.com/mattpocock/skills.git
◒  Cloning repository…
◇  Repository cloned
◇  Finding skills…
◇  Found 38 skills
```

and the JSON result for an unpinned install reports `"ref": null`. That clone is a real `git clone` — the
package bundles `simple-git` (`package/dist/_chunks/libs/simple-git.mjs`) — of
`https://github.com/mattpocock/skills.git` with no ref argument when none is given, so Git resolves `HEAD`
→ the default branch (`main`, per `symref=HEAD:refs/heads/main` in the ref advertisement). There is no release/tag lookup anywhere in that
path, and the repo's tag `v1.2.3` is *behind* `main`: installing `tdd` pinned at `v1.2.3` yields
`computedHash 614ac2e4…` while unpinned yields `e753a5da…` — i.e. unpinned is newer than the newest tag.

### Pinning to a branch / tag / commit

There is no flag for it; the ref goes into the source argument as a `#` fragment (parser:
`parseFragmentRef`, which splits on `#` and then on `@`):

```console
$ skills add "mattpocock/skills#v1.2.3" --skill tdd -y --json
[ { "name": "tdd", "status": "installed", "ref": "v1.2.3", "hash": "614ac2e45fb0ec02f6ce422d26bd9aa4e33aa4867323f5a3a5c0c20b96f78ff4", ... } ]

$ cat skills-lock.json
{
  "version": 1,
  "skills": {
    "tdd": {
      "source": "mattpocock/skills",
      "ref": "v1.2.3",
      "sourceType": "github",
      "skillPath": "skills/engineering/tdd/SKILL.md",
      "computedHash": "614ac2e45fb0ec02f6ce422d26bd9aa4e33aa4867323f5a3a5c0c20b96f78ff4"
    }
  }
}
```

So: `mattpocock/skills#<tag|branch|sha>` is the pin, and the lockfile records it as `"ref"`. The fragment
also supports `#<ref>@<skill-filter>` (`appendFragmentRef`), and `https://github.com/owner/repo/tree/<ref>`
URLs are parsed the same way. Pinned installs stay pinned: `skills update -p -y` groups entries by
`${sourceUrl||source}\n${ref}` and re-installs **at that ref** (verified — the pinned project above kept
`"ref": "v1.2.3"` and the same hashes after updating).

### `computedHash` — what it is and how it relates to updating

From `dist/cli.mjs`, verbatim:

```js
function computeSkillFolderHash(skillDir) {
	const files = [];
	await collectFiles(skillDir, skillDir, files);
	files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(file.relativePath);
		hash.update(file.content);
	}
	return hash.digest("hex");
}
```

`collectFiles` walks the skill folder recursively, skipping `.git` and `node_modules`, and records
`relativePath` (forward-slashed) plus raw file bytes. **The hash covers the whole skill folder, not just
`SKILL.md`** — add a file to `.agents/skills/tdd/` and the hash changes. It is a *content* fingerprint of
what was installed: it is the input to "up to date" comparisons and the record of what the lockfile
believes it installed. It is not a signature, and nothing in the add/update path cryptographically verifies
it against upstream before overwriting.

### Update commands

`update [skills...]` (alias `upgrade`), `-g/--global`, `-p/--project`, `-y/--yes` — from `--help` above.
Examples given by the CLI itself: `skills update`, `skills update my-skill`, `skills update -g`.
Mechanically, `updateProjectSkills` reads `skills-lock.json`, groups entries by source+ref, clones once per
group, checks for skills that disappeared upstream (`checkAndPromptForDeletions`), then re-runs
`add <source> --skill <name> -y` per skill (the CLI literally spawns its own `add` path).

---

## 5. IDEMPOTENCE + UPDATE PATH

### Re-running the same `add` is idempotent

```console
$ skills add mattpocock/skills --skill tdd wizard -y --json      # second run, same directory
[ ... "status": "installed" for both ... ]                        # EXIT=0
$ cat skills-lock.json                                            # byte-identical to the first run
```

`skills-lock.json` did not change between run 1 and run 2. The stderr summary on the second run adds an
`overwrites:` line, i.e. the CLI knows the target already exists and reinstalls it. There is **no**
"skip because unchanged" branch on the `add` path (the `All skills are up to date.` / `already up to date`
messages in `dist/cli.mjs` belong to `experimental_sync` from `node_modules`, which compares the local
folder hash against the lockfile).

### A locally modified skill file is silently overwritten

```console
$ echo "\n<!-- LOCAL EDIT BY RESEARCHER -->" >> .agents/skills/tdd/SKILL.md
$ sha256sum .agents/skills/tdd/SKILL.md
bffa825d713b2ba37faac2e518f8d0070279523973cb5f1dc2cc619aa60e8018  .agents/skills/tdd/SKILL.md

$ npx skills update -p -y
Checking for skill updates…
Updating for: Universal, Claude Code
Refreshing 2 skill(s)…
Updating tdd…
  ✓ Updated tdd
Updating wizard…
  ✓ Updated wizard
✓ Updated 2 skill(s)

$ sha256sum .agents/skills/tdd/SKILL.md
cb01f66bebfaa25fa1f88e6b7e769cd9fd9f35b1120b8563749820738814c927  .agents/skills/tdd/SKILL.md
$ tail -4 .agents/skills/tdd/SKILL.md
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
```

No warning, no diff, no prompt, no backup: the local edit is gone. The lockfile's `computedHash` was
already the upstream value, so the drift was invisible to the tool. Note the asymmetry with the repo's own
marketing ("It writes the skills into your repo as ordinary files you own and can edit. Nothing updates
behind your back") — editing is fine, but `skills update` is a hard reset of the skill folders it manages.
Treat these files as vendored-but-refreshable, or fork them under new names.

### Refresh-to-latest, verbatim

```console
$ npx skills@latest update          # all project + global skills, interactive scope
$ npx skills update -p -y           # project scope only, no prompts  (verified above)
$ npx skills update tdd             # just one skill
$ npx skills update -g              # global scope only
```

### Restoring an exact set from a lockfile

```console
$ cp skills-lock.json /tmp/repo4/ && cd /tmp/repo4 && npx skills experimental_install
Restoring 25 skills from skills-lock.json into .agents/skills/
...
◇  Installation complete
│  ✓ writing-for-agents (copied)
│    → ./.agents/skills/writing-for-agents
```

I ran this with **this repo's lockfile** and it restored all 25 skills into a fresh directory (copies, not
symlinks), rewriting the same lockfile. This is the reproducible path if an init document wants to pin the
set by lockfile rather than by name list. It is marked `experimental_` by the CLI itself.

---

## 6. ON-DISK LAYOUT

**Canonical location: `.agents/skills/<skill-name>/` — real files.** Every "universal" agent reads this one
directory; agents with their own directory get a *symlink* to it (default) or a copy (`--copy`).

Verified, default install (`skills add mattpocock/skills --skill tdd -y`, cwd = empty dir):

```
●  Installing to: Claude Code, Codex, GitHub Copilot, ZCode
.
./.agents/skills/tdd/SKILL.md
./.agents/skills/tdd/agents/openai.yaml
./.agents/skills/tdd/mocking.md
./.agents/skills/tdd/tests.md
./.claude/skills/tdd -> ../../.agents/skills/tdd      # symlink
./skills-lock.json
```

`.claude/skills/<name>` is a **symlink** (`lrwxrwxrwx … tdd -> ../../.agents/skills/tdd`); the files live
once, in `.agents/skills`. With `-a universal`, no `.claude/` is created at all and mode is `copy`:

```console
$ skills add mattpocock/skills --skill tdd -a universal -y --json
[ { "name": "tdd", "status": "installed", "path": "/tmp/repo7/.agents/skills/tdd",
    "scope": "project", "agents": ["Universal"], "mode": "copy" } ]
$ find .
./.agents/skills/tdd/SKILL.md   (…only .agents/skills and skills-lock.json…)
```

`-a universal` reproduces **this repo's exact layout** (only `.agents/` + `skills-lock.json`, no
`.claude/`). This is consistent with how this repo was initialised; the original invocation is not recorded
anywhere, so that attribution is UNVERIFIED.

**There is no `.cursor/skills`.** In `skills@1.7.0`'s agent table, Cursor maps to `.agents/skills` like
Codex, GitHub Copilot, Gemini CLI, Amp, Cline, Zed, Warp, OpenCode and ~14 others. Directory mapping,
extracted from the `agents` registry in `dist/cli.mjs` (79 entries; project dir | global dir):

| Agent (key) | Project dir | Global dir |
|---|---|---|
| `universal`, `amp`, `antigravity`, `antigravity-cli`, `cline`, `codex`, `cursor`, `deepagents`, `dexto`, `droid`, `firebender`, `gemini-cli`, `github-copilot`, `kilo`, `kimi-code-cli`, `loaf`, `opencode`, `replit`, `sarvam-code`, `warp`, `zed`, `promptscript` | `.agents/skills` | `~/.agents/skills` (or the tool's config home) |
| `claude-code` | `.claude/skills` | `~/.claude/skills` |
| `zcode` | `.zcode/skills` | `~/.zcode/skills` |
| `zencoder`, `zenflow` | `.zencoder/skills` | `~/.zencoder/skills` |
| `windsurf` | `.windsurf/skills` | `~/.codeium/windsurf/skills` |
| `goose` | `.goose/skills` | config home |
| `roo` | `.roo/skills` | `~/.roo/skills` |
| `trae`, `trae-cn` | `.trae/skills` | `~/.trae/skills` / `~/.trae-cn/skills` |
| `qoder`, `qoder-cn` | `.qoder/skills` | `~/.qoder/skills` |
| `posit-assistant` | `.posit/assistant/skills` | `~/.posit/assistant/skills` |
| `tabnine-cli` | `.tabnine/agent/skills` | `~/.tabnine/agent/skills` |
| `mistral-vibe` | `.vibe/skills` | `~/.vibe/skills` |
| `astrbot` | `data/skills` | `~/.astrbot/skills` |
| `openclaw` | `skills` | tool-specific |
| `eve` | `agent/skills` | none (`void 0`) |
| all remaining keys (`aider-desk`, `autohand-code`, `augment`, `bob`, `codearts-agent`, `codebuddy`, `codemaker`, `codestudio`, `command-code`, `continue`, `cortex`, `crush`, `devin`, `forgecode`, `fx`, `grok`, `hermes-agent`, `iflow-cli`, `inference-sh`, `jazz`, `junie`, `kimchi`, `kiro-cli`, `kode`, `lingma`, `mcpjam`, `minimax-code`, `moxby`, `mux`, `neovate`, `ona`, `openhands`, `pi`, `pochi`, `qwen-code`, `reasonix`, `rovodev`, `terramind`, `tinycloud`, `adal`) | `.<key-or-tool>/skills` | `~/.<key>/skills` |

(79 registry entries total; the grouping above is derived from the regex-extracted
`{name, displayName, skillsDir, globalSkillsDir}` table described in §2's method. Exact per-key global
paths use tool-specific home variables, e.g. `claudeHome`, `codexHome`, `grokHome`, `configHome`.)

Canonical full list of project skill dirs the CLI itself enumerates for discovery:

```js
const AGENTS_DIR$1 = ".agents";
const SKILLS_SUBDIR = "skills";
const AGENT_PROJECT_SKILL_DIRS = [
	".agents/skills", ".claude/skills", ".cline/skills", ".codebuddy/skills", ".codex/skills",
	".commandcode/skills", ".continue/skills", ".factory/skills", ".github/skills", ".goose/skills",
	".grok/skills", ".iflow/skills", ".junie/skills", ".kilo/skills", ".kilocode/skills",
	".kimchi/skills", ".kiro/skills", ".minimax/skills", ".mux/skills", ".neovate/skills",
	".opencode/skills", ".openhands/skills", ".pi/skills", ".posit/assistant/skills", ".qoder/skills",
	".roo/skills", ".trae/skills", ".windsurf/skills", ".zcode/skills", ".zencoder/skills"
];
```

**Is the target configurable?** Yes, in three ways:

* `-a, --agent <agents>` picks target agents (one or many; `'*'` for all). Only agents *detected on the
  machine* are offered/used by default.
* `-g, --global` installs to the user-level directory instead of the project (default is project; with
  `-y` and no `-g` it auto-detects: project if inside a project, else global).
* `--copy` copies files into every agent directory instead of symlinking. Note the mode is forced to
  `copy` whenever only one unique target directory is in play anyway (e.g. `-a universal`).

There is no flag to relocate the canonical `.agents/skills` directory itself; the name is a constant in the
binary.

Two observations worth flagging to whoever writes the init doc:

* With default (`-y`, no `-a`) installs, the stderr banner listed `ZCode` as a symlink target but the
  resulting project tree contained no `.zcode/` directory. (In `--copy` mode a `.zcode/skills/` directory
  does appear.) Exact ZCode behaviour: UNVERIFIED.
* This repo's `.agents/skills/` is committed to git (not ignored — `git check-ignore` returns nothing) and
  `git status --porcelain` is clean, so the vendored skills are part of the artifact under design.

---

## Verbatim install recipe for a subset at latest versions

Copy-pasteable. Installs **only** the named skills, at `main` HEAD, into `.agents/skills/`, and writes
`skills-lock.json` of the same shape this repo already has.

> Verified end-to-end on 2026-09-23 in an empty `/tmp` directory: step 2 (both with and without `--json`)
> installed exactly 25 skills — `◇  Installed 25 skills` — the resulting tree was exactly
> `.agents/skills/` + `skills-lock.json`, and the parsed lockfile was identical (all 25 `skillPath` and
> `computedHash` values equal) to this repo's committed `skills-lock.json`. Step 1 was verified to write
> nothing (`find .` on the target dir was empty afterwards).

```bash
# 0. Run from the target repo root. Node >= 22.20.0 is required by skills@1.7.0.
node --version

# 1. Inventory the source BEFORE installing (prints all 38 names + descriptions; nothing is written).
npx skills@latest add mattpocock/skills --list

# 2. Install ONLY the wanted skills, by name, non-interactively.
#    --skill takes a SPACE-separated list. Never write --skill=name (installs all 38),
#    never write --skill a,b (treated as one name, installs nothing).
npx skills@latest add mattpocock/skills -y -a universal --skill \
  ask-matt code-review codebase-design diagnosing-bugs domain-modeling \
  grill-me grill-with-docs grilling handoff implement \
  improve-codebase-architecture prototype research resolving-merge-conflicts \
  setup-matt-pocock-skills tdd teach to-questionnaire to-spec to-tickets \
  triage wait-what wayfinder wizard writing-for-agents

#    Drop `-a universal` to also get .claude/skills/<name> symlinks (Claude Code) and
#    copies/symlinks for whatever other agents are detected on the machine.
#    Add `--copy` if you want real files in every agent directory instead of symlinks.

# 3. VERIFY. A misspelled skill is silently "skipped" with exit code 0, so check the lockfile.
node -e '
const l = require("./skills-lock.json");
const want = ["ask-matt","code-review","codebase-design","diagnosing-bugs","domain-modeling",
  "grill-me","grill-with-docs","grilling","handoff","implement","improve-codebase-architecture",
  "prototype","research","resolving-merge-conflicts","setup-matt-pocock-skills","tdd","teach",
  "to-questionnaire","to-spec","to-tickets","triage","wait-what","wayfinder","wizard",
  "writing-for-agents"];
const got = Object.keys(l.skills).sort();
const missing = want.filter(n => !got.includes(n));
const extra   = got.filter(n => !want.includes(n));
console.log("version:", l.version, "| installed:", got.length);
if (missing.length) { console.error("MISSING:", missing); process.exit(1); }
if (extra.length)   { console.error("UNEXPECTED:", extra); process.exit(1); }
console.log("skillPath + computedHash for every entry present:", got.every(n => l.skills[n].skillPath && l.skills[n].computedHash));
'

# 4. Refresh to latest later (WARNING: overwrites local edits to managed skill folders, no prompt).
npx skills update -p -y

# 5. Optional: pin the whole set to an immutable commit/tag instead of main.
npx skills@latest add "mattpocock/skills#v1.2.3" -y -a universal --skill tdd grilling
#    The lockfile then records "ref": "v1.2.3" and `skills update` keeps re-installing AT that ref.

# 6. Optional: reproduce an existing skills-lock.json exactly (experimental CLI command).
npx skills experimental_install
```

Escape hatch if the installer is unavailable (no `skills-lock.json`, no update path, but fully
deterministic):

```bash
git clone --depth 1 https://github.com/mattpocock/skills /tmp/mp-skills
git -C /tmp/mp-skills rev-parse HEAD   # record this commit in your docs
mkdir -p .agents/skills
cp -R /tmp/mp-skills/skills/engineering/tdd        .agents/skills/tdd
cp -R /tmp/mp-skills/skills/productivity/grilling  .agents/skills/grilling
```

---

## UNVERIFIED

1. **Which `skills` CLI version wrote this repo's `skills-lock.json`.** The schema (`version: 1`) and hash
   algorithm are identical in the versions sampled, and the file records neither CLI version nor timestamp,
   so the writer cannot be identified from the artifact. Verified only that `skills@1.7.0` produces a
   byte-equivalent lockfile.
2. **How this repo's skills were originally installed** (which flags: whether `-a universal` was used, or
   whether `.claude/` was created and later deleted). The resulting state matches `-a universal` exactly,
   but no record of the invocation exists.
3. **ZCode discrepancy.** In default symlink mode the stderr banner lists `ZCode` as a symlink target while
   no `.zcode/` directory is created; in `--copy` mode a `.zcode/skills/` directory does appear. I did not
   isolate the cause.
4. **`checkAndPromptForDeletions` under `-y`.** The update path detects skills that vanished upstream and
   removes them from the lockfile; I read the code path but did not exercise a real upstream deletion, so
   the exact non-interactive behaviour of `skills update -y` when a skill disappears is unverified.
5. **`--list --json`**: `skills add mattpocock/skills --list --json` returns
   `{"status":"failed","error":"The --json flag requires --yes (or --all) to run non-interactively."}`
   (exit 0). I did not test the `--list --json -y` combination.
6. **`--skill=a,b` / other equals-forms** beyond the single `--skill=tdd` case that I proved installs all
   38 skills. Treat the `=` spelling as unsupported.
7. **Whether `skills@latest` was 1.7.0 when this repo was initialised**, and whether future versions change
   the `--skill` parsing bug documented in §3. The behaviour above is specific to `skills@1.7.0`, which was
   `dist-tags.latest` on 2026-09-23.
8. **Release/changelog semantics of the `mattpocock-skills@1.0.0` legacy tag** (it appears in the ref
   advertisement and on the tags page; I did not read its contents).

---

## Round-2 addendum — grouping and runtime resolution

Second pass, same day (2026-09-23 UTC). Question: how does `skills@1.7.0` **group** skills in its
interactive picker, and how do you install a whole group **non-interactively at run time** — without
freezing the 25 names that happen to exist upstream today? Nothing above this line is changed.

| | |
|---|---|
| Artifact under test | `skills@1.7.0` → `dist/cli.mjs`, **8418 lines**, sha256 `fde68534019765fb69510a0038ca7df2810a6ffed4c26fef9beabdcf6cc6701c` (npm tarball sha256 `8d1466f792baaee945dae88e05ee403d6f9e78a3ae8dcbf61496035ca274418d`) |
| All line numbers below | refer to **that** `dist/cli.mjs` |
| Upstream at round-2 time | `mattpocock/skills` HEAD = `c55ee46073ed923f86ce59a5eb3b6d895095d1b7` (`git ls-remote --symref` → `ref: refs/heads/main`) — **identical to round 1**, so §0–§6 above are still current |
| Method | `dist/cli.mjs` read directly; the interactive picker captured through a **real PTY** (`script -qec`, ANSI stripped); every install run in a throwaway `/tmp` dir with `npm_config_cache=/tmp/npmcache`; no skills installed into this repo |

Headline: **the group is defined by the plugin manifest, not by the bucket directories, and there is no
`--group` flag and no machine-readable listing — so the group must be computed, then fed to `--skill`.**

### R2.1 GROUPING — membership comes from `.claude-plugin/plugin.json`, not from `skills/<bucket>/`

`discoverSkills()` resolves each parsed skill and stamps a group onto it:

```js
		const pluginGroupings = await getPluginGroupings(searchPath);          // line 1308
		const enhanceSkill = (skill) => {                                      // 1309
			const resolvedPath = resolve(skill.path);                          // 1310
			if (pluginGroupings.has(resolvedPath)) skill.pluginName = pluginGroupings.get(resolvedPath);  // 1311
			return skill;
		};
```

`getPluginGroupings()` (1063–1092) builds that map from **two** manifests, in this order — the second
overwrites the first for the same directory:

```js
		const content = await readFile(join(basePath, ".claude-plugin/plugin.json"), "utf-8");   // 1083
		const manifest = JSON.parse(content);                                                    // 1084
		if (manifest.name && manifest.skills && manifest.skills.length > 0) for (const skillPath of manifest.skills) {  // 1085
			if (!isValidRelativePath(skillPath)) continue;                                       // 1086
			const skillDir = join(basePath, skillPath);                                          // 1087
			if (isContainedIn(skillDir, basePath)) groupings.set(resolve(skillDir), manifest.name);  // 1088
		}
```

(`marketplace.json` is read first, 1066–1081, and maps `pluginBase + skillPath → plugin.name` for every
entry of `manifest.plugins[].skills[]`. `isValidRelativePath` requires a leading `./`.)

**Which file produces "Mattpocock Skills": `plugin.json` alone.** I replicated the algorithm verbatim over
the `main` tarball. `marketplace.json` exists but its single plugin entry declares **no** `skills[]`, so
that pass maps **0** directories; `plugin.json` maps **25**, all to one name:

```
after marketplace pass: 0 mapped
after plugin.json pass: 25 mapped; distinct names = ["mattpocock-skills"]
group "mattpocock-skills" -> 25 skills
group "(ungrouped)" -> 13 skills
```

The upstream files, verbatim (`.github`-independent GitHub raw fetch, HTTP 200):

```json
// .claude-plugin/marketplace.json
{
  "name": "mattpocock",
  "owner": { "name": "Matt Pocock", "url": "https://www.aihero.dev" },
  "description": "Matt Pocock's skills for real engineering, as an installable Claude Code plugin.",
  "plugins": [
    {
      "name": "mattpocock-skills",
      "source": "./",
      "description": "Matt Pocock's agent skills for real engineering (grilling, spec/ticket flows, TDD, code review, domain modelling and more).",
      "category": "engineering",
      "keywords": [ "engineering", "skills", "tdd", "code-review", "grilling" ]
    }
  ]
}
```

```json
// .claude-plugin/plugin.json  (head + the whole skills array)
{
  "name": "mattpocock-skills",
  "version": "1.2.3",
  "description": "Matt Pocock's agent skills for real engineering: …",
  "author": { "name": "Matt Pocock", "url": "https://www.aihero.dev" },
  "homepage": "https://www.aihero.dev/s/skills-newsletter",
  "repository": "https://github.com/mattpocock/skills",
  "license": "MIT",
  "keywords": ["engineering","skills","tdd","code-review","grilling","domain-modeling","productivity"],
  "skills": [
    "./skills/engineering/ask-matt", "./skills/engineering/diagnosing-bugs", "./skills/engineering/grill-with-docs",
    "./skills/engineering/triage", "./skills/engineering/improve-codebase-architecture",
    "./skills/engineering/setup-matt-pocock-skills", "./skills/engineering/tdd", "./skills/engineering/to-spec",
    "./skills/engineering/to-tickets", "./skills/engineering/wayfinder", "./skills/engineering/implement",
    "./skills/engineering/prototype", "./skills/engineering/research", "./skills/engineering/domain-modeling",
    "./skills/engineering/codebase-design", "./skills/engineering/code-review",
    "./skills/engineering/resolving-merge-conflicts", "./skills/engineering/wizard",
    "./skills/productivity/grill-me", "./skills/productivity/grilling", "./skills/productivity/handoff",
    "./skills/productivity/teach", "./skills/productivity/to-questionnaire", "./skills/productivity/wait-what",
    "./skills/productivity/writing-for-agents"
  ]
}
```

So "Mattpocock Skills" == exactly the 25 `skills[]` entries of `plugin.json` (18 `engineering/` + 7
`productivity/`), and the 13 unwanted skills are the ones the manifest does **not** list
(`in-progress/` ×9 + `misc/` ×4). **The bucket directories play no part in grouping** — the boundary is
the manifest's declared skill list, which is why the two promoted buckets merge into one group while the
two unpromoted buckets merge into the other. Corroborated by the upstream README's own words
(`package/README.md`, "Plugin Manifest Discovery"): *"If `.claude-plugin/marketplace.json` or
`.claude-plugin/plugin.json` exists, skills declared in those files are also discovered … This enables
compatibility with the Claude Code plugin marketplace ecosystem."*

**The label is derived, never hardcoded.** The only label logic in the picker is:

```js
			const kebabToTitle = (s) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");   // 5311
			const skillChoices = sortedSkills.map((s) => ({
				value: s,
				label: getSkillDisplayName(s),
				group: hasGroups ? s.pluginName ? kebabToTitle(s.pluginName) : "Other" : void 0,                      // 5315
```

`"mattpocock-skills"` → `"Mattpocock Skills"`. Change the `name` field upstream and the picker label
follows automatically.

**The other group's exact label depends on the mode** — there are two hardcoded fallbacks, and they differ:

| surface | code | label for the 13 ungrouped skills |
|---|---|---|
| interactive picker | `dist/cli.mjs:5315` (`: "Other"`) | **`Other`** |
| `--list` text output | `dist/cli.mjs:5264` (`bold("General")`) | **`General`** |
| install summary (non-JSON) | `dist/cli.mjs:5531` | **`General`** |
| per-result lines (non-JSON) | `dist/cli.mjs:5759` | **`General`** |

Verified in the real TUI (PTY capture, ANSI stripped). Note the `Select All (0/38)` counter and the group
node exactly as in the screenshot, plus the `Other` header further down:

```
│ ❯ ○ Select All (0/38)
│   ▾ ○ Mattpocock Skills
│   ├─ ○ ask-matt
│   ├─ ○ code-review
│   ├─ ○ codebase-design
│   ├─ ○ diagnosing-bugs
│   ├─ ○ domain-modeling
│   ├─ ○ grill-me
...
│   ▾ ○ Other
```

and in `npx skills@1.7.0 add mattpocock/skills --list` (stdout, ANSI stripped, verbatim):

```
◇  Available Skills
Mattpocock Skills
│
│    ask-matt
│
│      Ask which skill or flow fits your situation. A router over the skills in this repo.
│
│    code-review
…
│    writing-for-agents
│
│      Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md.

General
│
│    claude-handoff
…
│    setup-pre-commit

│
└  Use --skill <name> to install specific skills
```

Picker ordering: plugin-grouped skills sort **first**, ungrouped last, alphabetical by display name within
each group (5305–5310); `--list` prints sorted group titles (`Object.keys(groupedSkills).sort()`, 5253)
and always puts the ungrouped block last.

### R2.2 NON-INTERACTIVE GROUP SELECTION — no group flag exists; `--skill` rejects group names

The complete add-flag vocabulary is in `parseAddOptions` (`dist/cli.mjs:5836–5888`) and matches `--help`
Add Options exactly:

`-g/--global`, `-y/--yes`, `-l/--list`, `--all`, `-a/--agent`, `-s/--skill`, `--metadata`,
`--full-depth`, `--json`, `--copy`, `--subagent`.

`grep -c '"--group"' dist/cli.mjs` → `0`; there is no `--group`, `--category`, `--bucket`, `--official`
or "promoted-only" flag anywhere in the bundle. Unknown flags are **silently ignored** (the parser has no
unknown-flag branch; a following non-dash token is instead appended to `source`) — so a hypothetical
`--group X` is not rejected, it simply does nothing.

`--skill` matches **skill names only**:

```js
function getSkillDisplayName(skill) {          // 1384
	return skill.name || basename(skill.path);
}
function filterSkills(skills, inputNames) {    // 1387
	const normalizedInputs = inputNames.map((n) => n.toLowerCase());
	return skills.filter((skill) => {
		const name = skill.name.toLowerCase();
		const displayName = getSkillDisplayName(skill).toLowerCase();
		return normalizedInputs.some((input) => input === name || input === displayName);
	});
}
```

Measured, both naming the group rather than a skill:

```console
$ skills add mattpocock/skills -y --json --skill "Mattpocock Skills"
[ { "name": "Mattpocock Skills", "status": "skipped", "reason": "No matching skill found in source" } ]   EXIT=1

$ skills add mattpocock/skills -y --json --skill mattpocock-skills
[ { "name": "mattpocock-skills", "status": "skipped", "reason": "No matching skill found in source" } ]   EXIT=1
```

**There is no TUI-free group selector.** The only way to install the group non-interactively is to compute
its member names at run time and pass them to `--skill` (space-separated — the equals form is broken, §3).
Verbatim invocation, computed from the manifest that defines the group:

```bash
npx skills@latest add mattpocock/skills -y -a universal --json --skill \
  $(curl -fsSL https://raw.githubusercontent.com/mattpocock/skills/main/.claude-plugin/plugin.json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(
        JSON.parse(s).skills.map(p=>p.replace(/\/+$/,"").split("/").pop()).join(" "))})')
```

(One line, no name list in the script. `-a universal` keeps this repo's `.agents/`-only layout; drop it to
also get `.claude/skills/<name>` symlinks, as in §6.) The group-derived variant, which needs no manifest
path knowledge, is in R2.3.

### R2.3 RUNTIME RESOLUTION — no machine-readable grouping exists; two ways to compute the group

**Machine-readable listing: does not exist.** `--json` is explicitly rejected together with `--list`
(guard at `dist/cli.mjs:5120`). This resolves round 1's UNVERIFIED #5:

```console
$ skills add mattpocock/skills --list --json -y
[
  {
    "status": "failed",
    "error": "The --json flag cannot be combined with --list."
  }
]
EXIT=1
```

The install JSON result — the machine-readable output that *does* work — carries **no group field**
(`dist/cli.mjs:5683–5699`). Measured key list for one skill:

```console
$ skills add mattpocock/skills -y --json --skill tdd
keys of first entry: name,status,source,ref,hash,path,scope,agents,mode,security
has pluginName key: false
EXIT=0
```

(`pluginName` is attached to the *human* summary rows at 5581–5583 only.) `skills list` / `ls` lists
**installed** skills from `skills-lock.json` (2657) — it says nothing about source groups. So a JSON
consumer can never learn a skill's group; grouping exists only in the TUI, in the human-readable `--list`
text, and in the manifests.

**Primary runtime method — parse the installer's own group-labelled `--list`** (group-derived, so it
survives a plugin rename and a skill rename alike). It selects every skill under a group heading that is
not the ungrouped `General` bucket:

```bash
# 1. Compute the group's member names at run time. Nothing is written.
NAMES=$(
  npx skills@latest add mattpocock/skills --list 2>/dev/null \
  | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' \
  | node -e '
let s = "";
process.stdin.on("data", d => s += d).on("end", () => {
  const lines = s.split("\n");
  const start = lines.findIndex(l => l.includes("Available Skills"));
  const out = []; let group = null;
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim();
    if (t.startsWith("└")) break;                                  // end of the listing
    if (!raw.includes("│")) {                                       // a group heading line
      if (/^[A-Za-z][A-Za-z0-9 _-]*$/.test(t)) group = t;
      continue;
    }
    const m = raw.match(/^\s*│ {4}([a-z0-9][a-z0-9._-]*)\s*$/);      // "│    <skill-name>"
    if (m && group && group !== "General") out.push(m[1]);
  }
  process.stdout.write(out.join(" "));
});'
)
echo "$NAMES" | wc -w        # -> 25

# 2. Install exactly those, then VERIFY the result (exit codes are not trustworthy, §3).
npx skills@latest add mattpocock/skills -y -a universal --json --skill $NAMES \
| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const j = JSON.parse(s), bad = j.filter(r => r.status !== "installed");
    console.log("installed:", j.length, "| not installed:", bad.length);
    if (bad.length) { console.error(JSON.stringify(bad)); process.exit(1); }})'
```

Note `--skill $NAMES` **unquoted**: the flag takes a space-separated list, and this is the only spelling
that works (never `--skill=` , never commas). Strip the ANSI first — `--list` is colourised on a TTY
(piped output was clean here, but `sed 's/\x1b\[[0-9;]*[A-Za-z]//g'` costs nothing).

**Alternative runtime method — read the manifest that defines the group** (`plugin.json`, the same file
`getPluginGroupings` reads at 1083–1088), one small GET, no ANSI parsing; `raw.githubusercontent.com`
answered **HTTP 200** from this sandbox:

```bash
NAMES=$(curl -fsSL https://raw.githubusercontent.com/mattpocock/skills/main/.claude-plugin/plugin.json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(
      JSON.parse(s).skills.map(p=>p.replace(/\/+$/,"").split("/").pop()).join(" "))})')
```

Skill name == the last path segment of each `skills[]` entry (true for all 38 upstream skills; the
installer itself normalises frontmatter names with `name.toLowerCase().replace(/[\s_]+/g, "-")`, 1225–1227).

**Both methods were run end-to-end and agree:**

```console
METHOD A (plugin.json)      -> 25 names
METHOD B (--list parse)     -> 25 names
sorted sets: diff empty -> SETS_IDENTICAL (order differs: manifest order vs display order)

$ skills add mattpocock/skills -y -a universal --json --skill $NAMES_B
entries: 25   statuses: {"installed":25}   EXIT=0

installed: 25 | reference lockfile (.agents/… in this repo): 25
same name set: true
hash/path mismatches: 0        # every skillPath AND computedHash equals this repo's skills-lock.json
```

So the group-derived invocation installs exactly the 25 skills this repo already pins, at `main` HEAD,
with zero drift — and it will pick up future additions/renames automatically.

Guard rails worth keeping: (a) if upstream ever declares a second plugin group, the `group !== "General"`
rule would over-select — for strictness anchor on the group containing `setup-matt-pocock-skills`, or keep
Method A; (b) always assert `status === "installed"` for every returned entry (a typo yields `skipped`,
and the process exit code has been observed `0` and `1` for the same class of failure, §3).

### R2.4 DEFAULT SELECTION — `-y` with no `--skill` installs **both** groups (38)

Measured, non-JSON so the grouped summary is visible:

```console
$ skills add mattpocock/skills -y -a universal
◇  Installed 38 skills

total installed: 38
promoted present: 25 / 25
extra (General group): 13  claude-handoff git-guardrails-claude-code implement-spec loop-me
                          migrate-to-shoehorn pr retro scaffold-exercises setup-pre-commit
                          setup-ts-deep-modules writing-beats writing-fragments writing-shape
```

That is group `Mattpocock Skills` (25) **plus** group `Other`/`General` (13). The code path is the
`else if (skills.length === 1 || options.yes)` branch (5301–5303): with `-y` and no recognised filter the
selected set is *every discovered skill*. `--all` is literally `--skill '*' --agent '*' -y`
(5112–5116), and `--skill '*'` also selects all (5280–5282). **No flag combination installs only the
promoted group**: the only filters are explicit skill names or the `*` wildcard, so a group-scoped run must
go through the computed-name invocation in R2.2/R2.3. (Also note 5111–5118: if an agent is detected in the
environment, `options.yes` is forced true — a bare `skills add <source>` inside an agent can become
non-interactive all-38 without `-y`.)

### R2.5 `vpx` EQUIVALENCE — present, and resolves the same `latest`

Cheap checks only (vite-plus internals are another agent's scope), all run in `/tmp`:

```console
$ which vpx
/home/leihaohao/.vite-plus/bin/vpx                 # -> /home/leihaohao/.vite-plus/0.3.3/bin/vp (ELF)
$ vpx --version
11.19.0
$ vpx --help | head -3
Execute a command from a local or remote npm package
Usage: vpx [OPTIONS] <pkg[@version]> [args...]
```

`vpx` is an npm-package runner with no own pinning mechanism — a bare package name means "no version",
exactly like `npx`. With a writable npm cache:

```console
$ vpx skills --version           -> 1.7.0
$ vpx skills@latest --version    -> 1.7.0
$ vpx skills@1.7.0 --version     -> 1.7.0
$ npm view skills dist-tags --json
{ "snapshot": "1.5.23-snapshot.2", "latest": "1.7.0" }
$ vpx skills add mattpocock/skills --list
…◇  Found 38 skills … Mattpocock Skills … General
```

So `vpx skills add …` resolves the same `dist-tags.latest` that `npx skills@latest` resolves (both 1.7.0),
produces the same 38-skill discovery and the same two group labels — **equivalent for this purpose**.
Environment caveat, not a vpx property: the first `vpx skills …` attempt failed with
`npm error errno EROFS … /home/leihaohao/.npm/_cacache` (this sandbox mounts `$HOME` read-only); it
succeeded once `npm_config_cache=/tmp/npmcache` was exported. `npx` failed the same way without it. Whether
`~/.npm` is writable for the human running the init recipe is **UNVERIFIED** here.

### R2 UNVERIFIED (new items only; §UNVERIFIED above is unchanged)

1. **Stability of the `--list` text format.** It is human output, not documented as machine-readable
   (the CLI offers no JSON listing, 5120). Parsing it is what makes the selection group-derived, but a
   future `skills` version could restyle it. Mitigation: cross-check the extracted count against the
   group size and require `status === "installed"` for every entry; Method A (manifest) is the fallback.
2. **Multi-group repositories.** Only the single-group case (`mattpocock-skills` + `General`) was
   exercised. If upstream ever declares a second plugin group, `group !== "General"` over-selects; the
   one-plugin invariant of this repo is untested against that.
3. **Semantics of silently-ignored unknown flags.** `--group mattpocock-skills --list` exited `0` and
   still printed every group (i.e. the flag was ignored), but the stray positional token it leaves in
   `source` was not traced through an actual install — untested whether it can alter source resolution.
4. **`vpx` caching/pinning beyond version resolution.** Only the resolved `skills` version was compared
   (1.7.0 = `latest`); I did not inspect vite-plus' cache metadata or source for a lockfile that could
   pin the package on a later run.
5. **`--list` internal-skill filtering.** `INSTALL_INTERNAL_SKILLS` is a real env var in the bundle
   (grepped); its effect on a group-derived name list for `mattpocock/skills` (which has no internal
   skills as far as this repo shows) was not exercised.
