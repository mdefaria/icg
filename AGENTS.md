# ICG

Social-media comment overlays for Premiere Pro, DaVinci Resolve Studio and the web. Sold once, offline after activation, no AI at runtime.

Read before changing anything:

- `CONTEXT.md`: the glossary. Code, files and UI copy use these names and no synonyms.
- `docs/adr/`: decisions already made. Reopen one by writing a new ADR that supersedes it, not by quietly deviating.
- `PLAN.md` section 6: the work breakdown; each item names the directory it owns.

## Layout

- `packages/shared`: contracts (zod schemas and their types) shared by every package and app.
- `packages/host-sdk`: the `HostAdapter` interface and `FakeHostAdapter`. UI and engine code depend on this, never on a Host API.
- `packages/*`: Host-agnostic code. `apps/*`: one shell per Host plus the API and landing site.

## Contracts are frozen

`packages/shared` and `packages/host-sdk` are the seams every parallel session builds against. Treat them as frozen: build against what is there, and when a change is unavoidable make it in its own commit, additive, with the reason in the commit message, so the owner can review it before merging anything that depends on it.

## Conventions

- TypeScript everywhere, ESM, packages export source (`src/index.ts`), no build step for packages. Apps bundle.
- Every boundary that receives data (files, network, Host APIs) parses it with the schema from `@icg/shared`.
- The shared UI targets UXP's CSS subset even though no shell needs it yet: flexbox and absolute positioning, no grid, transitions, filters or HTML5 drag-and-drop.
- Comments in code only when the why is not recoverable from the code and the ADRs.
- Tests live beside the code as `*.test.ts` and run with vitest. Host behaviour is tested through `FakeHostAdapter`.
- `pnpm check` runs lint, typecheck and tests for the whole repo and must pass before a push.

## Hosts

Anything touching Premiere or Resolve can only be verified on a machine with the application installed. A session without one delivers a runnable build and a checklist for the owner, and says so instead of claiming it works.
