# Compose Vite+ and Nitro Vite+-first, not Nitro-first

> Status: **superseded in part by [ADR-0007](0007-backend-profile-shape.md)**. Nitro's production
> output is `dist/` (`output: { dir: "dist" }`), which the scaffold's ignore rules already cover,
> so `.output` is *not* added to `.gitignore` — the "must be added" consequence below is out of
> date. The composition verdict of this ADR (Vite+-first, no migration step) is unchanged.

The 全栈 and 后端 形态 build their server side on Nitro v3 as a Vite plugin (`nitro/vite`) added to a project Vite+ already created (`vp create`) — rather than scaffolding with Nitro's own `create-nitro-app` and migrating Vite+ in. Nitro's documentation never mentions Vite+ (zero hits), and a stock Nitro starter hard-fails `vp build` until `vp migrate` runs, so this integration is undocumented and had to be proven empirically. It was, end to end: `vp check` 0, `vp test` 0, `vp dev` serving both the client page and `/api/hello`, `vp build` emitting `.output/` with client and Nitro phases, and `node .output/server/index.mjs` serving both.

## Considered Options

- **`create-nitro-app` → `vp migrate`** — rejected: it inserts a whole-project rewrite, and the starter's frontend is Nitro's own vanilla app, so any other frontend framework would need a second, larger adaptation on top.
- **Nitro alone, without Vite+** (`nitro dev` / `nitro build`) — rejected: it drops Vite+'s check/test/format layer — in particular the only type checking in the stack, whose absence is silent.

## Consequences

- No migration step: on a `vp create`-ed project with Nitro added, `vp migrate` reports the project is already on Vite+ and leaves every file byte-identical.
- `vite` must keep resolving to `@voidzero-dev/vite-plus-core`; with a real `vite` installed, `vp build` fails outright (`Expected @voidzero-dev/vite-plus-core@X, but found vite@Y`).
- The scaffold's `vite.config.ts` has no `plugins` array, so wiring Nitro means creating one. Importing `nitro` without calling it in `plugins` is silently inert: exit 0, `/api/*` 404s.
- `.output` must be added to `.gitignore` — the scaffold ignores `dist`, and an unignored `.output` makes `vp check` fail after every build.
- Verified on `vanilla-ts`; other framework templates add their own plugin, so the guide's verify step (dev serves `/api`, build emits `.output/`) is what covers them at init time.
