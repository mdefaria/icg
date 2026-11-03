# Handoff (Nov 2026, end of cloud session)

Branch: `claude/loving-bardeen-nxilfz`. Everything listed as merged is pushed. `pnpm check` passes at HEAD (30 tasks).

## Merged

- Step 0: monorepo, `packages/shared` contracts, `packages/host-sdk` (`HostAdapter`, `FakeHostAdapter`), `AGENTS.md`.
- Step 1 spikes, all seven: `apps/premiere` (CEP shell + ExtendScript adapter), `apps/resolve` (Workflow Integration shell + adapter), `packages/renderer` (spike-level, 16 samples), `apps/api` (Cloudflare Worker commerce flow), `packages/avatars` (GPU pipeline), `installers/`, `spikes/uxp-wasm-probe`. Each has a `SPIKE.md` with an owner checklist for a real machine.
- Step 2 done: C1 `packages/engine` (36 tests), C5 `packages/licensing` with the Ed25519 pure-JS fallback for CEP (F1), F2 Avatar curation on YuNet + SFace.

## In flight when the session ended (re-run locally if their branches never arrived)

Each was a separate agent in its own worktree, committing on a `worktree-agent-*` branch. If these packages are missing from the branch, the work was lost with the container and must be redone from the briefs below. All three were briefed with: read `AGENTS.md`, `CONTEXT.md`, the ADRs and `PLAN.md` section 6; own one directory; never edit `packages/shared` or `packages/host-sdk`; `pnpm check` must pass; no code comments; zod at every boundary.

- **C2 Bank v1** (`packages/bank/`): MERGED (1,788 EN, 1,844 ES entries; lint and preview scripts in place). Original brief: `data/{en,es}/<tone>.json` arrays of `BankEntry`, about 1,500 per language (hype 220, funny 220, relatable 200, question 180, story 180, request 150, critical 130, emoji 120, product 100), hand-written in native register (ES: Spain, Mexico, Rioplatense, Colombia, neutral LatAm; EN: US, UK, internet). `{creator}`, `{n}`, `{emoji}` slots. `product` tone and `ad` context are neutral questions and jokes only, never endorsements (PLAN.md legal row). `scripts/lint-bank.ts` enforces schema, near-duplicate rejection (Jaccard > 0.8), slot syntax, an endorsement phrase blacklist and per-tone counts; `scripts/preview.ts` prints 20 random entries per language and tone; `src/index.ts` exports `loadBank`, `loadBankByLanguage`, `BANK_STATS`. The engine ships a 42-entry fixture Bank per language in `packages/engine/src/fixtures/` to run against until this lands.
- **C3 renderer to production** (`packages/renderer/`): `OverlaySpec.language` drives UI copy and number formats; `Comment.replies/reposts/views` feed X and YouTube rows; fidelity pass per Platform including light themes; `card: "sheet" | "transparent"` option; full emoji loader with `scripts/fetch-emoji.ts` (Noto for TikTok/Instagram/YouTube, Twemoji for X) and the per-size raster cache; real advance+kerning measurement for every bundled weight; `initRenderer` accepting Module, ArrayBuffer, Response or URL; `createBrowserAssets`; Avatar loader for pool ids, user data URLs (WebP conversion), defaults; `renderOverlays` batching; `scripts/bench.ts` (targets: 1080p < 150 ms, 4K < 400 ms); regenerate goldens and samples; turn `SPIKE.md` into `README.md`.
- **C4 shared UI** (`packages/ui/`): React 18, UXP CSS subset (flexbox, absolute positioning, pointer events with `setPointerCapture`; no grid, transitions, filters, HTML5 drag-and-drop). Root `<IcgPanel engine host render assets settings />` where `settings` is a small get/set/subscribe store. Screens: Generate (Platform, theme, variant, language, tone chips, context, creator identity, batch count, Generate and Manual), Edit (every field inline, per-field regenerate, Avatar shuffle/upload/default), Placement (Frame preview from `host.getSequenceInfo()` or preset, drag, 9-point snap, scale, per-Platform safe zones, arrow-key nudge, remembered per Platform), Insert (label from `host.canInsert`, duration default 3 s, batch stagger default 0.5 s with downward Placement nudge, per-item `InsertResult`), Activation placeholder behind an `ActivationClient` interface, `<UpdateBanner>`. Vite harness in `packages/ui/harness/` with `FakeHostAdapter`, a `FakeEngine` and the real renderer; Playwright screenshots at 360 and 480 px in both themes committed under `harness/screenshots/`. Tests with vitest + testing-library.

## Merging a worktree branch

```bash
git merge --no-ff <branch>
# on a pnpm-lock.yaml conflict:
git checkout --theirs pnpm-lock.yaml && pnpm install && git add pnpm-lock.yaml && git merge --continue
pnpm install --frozen-lockfile && pnpm check
```

Prettier is configured to skip `apps/premiere/jsx`, `**/vendor`, `pnpm-lock.yaml`, dist, samples and fixtures. Keep it that way: it reformatted the ES3 ExtendScript once and the tests did not catch it.

## Next after step 2

- C6 `apps/web`: mount `IcgPanel` with a web `HostAdapter` whose `insertOverlay` downloads the PNG, Frame presets + 1080p/4K, service worker caching the app, wasm, fonts, emoji and Avatar pool, Activation via `@icg/licensing` with `localStorage`.
- Step 3 Hosts: wire `IcgPanel`, `@icg/engine` with the real Bank, `@icg/renderer` and `@icg/licensing` into `apps/premiere` and `apps/resolve`; theme sync; update banner; production Overlay location (beside the project, not temp).
- Step 4 Commerce: `apps/landing` (Astro, Cloudflare Pages), Device page against `apps/api`, downloads from R2, legal pages, crash reporting opt-in.
- Open decisions carried forward: refund handling for issued Keys (token lives 10 years offline), X time-ago beyond 24 h (engine keeps X Comments under a day), whether creator replies move from the engine into the Bank, `ActivationResult` network-failure handling (currently a thrown typed error in the client).

## Owner verification still pending (needs real machines)

Premiere 23 and 26 on mac and win (`apps/premiere/SPIKE.md`), Resolve Studio 19 and 20 (`apps/resolve/SPIKE.md`), clean-machine installers (`installers/README.md`), GPU dry run and the 200-image Avatar sample (`packages/avatars/SPIKE.md`), Stripe test-mode purchase (`apps/api/SPIKE.md`), UXP probe (`spikes/uxp-wasm-probe/SPIKE.md`), noble Ed25519 path inside CEP (`packages/licensing/README.md`).
