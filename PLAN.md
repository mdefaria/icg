# ICG - Social Comment Overlays for Premiere Pro, DaVinci Resolve Studio and the web

Status: settled after grilling (Nov 2026). Vocabulary in `CONTEXT.md`, decisions in `docs/adr/`.

## 1. Product

ICG generates believable TikTok, Instagram, YouTube and X comments (Avatar, username, text, likes, time, flags), lets the user edit every part or write a Manual Comment, choose a Placement on the Frame, and Insert the resulting Overlay on the Host timeline at the playhead. Sold once, works offline after one Activation. Buyers: solo short-film and ad creators, freelance editors, small agencies.

Positioning: a storytelling, skit and mockup tool. Terms make the user responsible for compliance with fake-review and advertising law (UK DMCC Act 2024, EU, FTC). The Bank keeps ad-flavoured entries neutral (questions, jokes), never endorsements.

## 2. Settled decisions

| Area            | Decision                                                                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generation      | No AI at runtime. Curated Bank + procedural usernames, likes, timestamps. Build-time AI allowed for drafting the Bank and producing Avatars. (ADR 0001)                                                                                                                                                                          |
| Hosts at launch | Premiere Pro (CEP panel, min Premiere 23; UXP port before Dec 2028, ADR 0005), DaVinci Resolve Studio (Workflow Integration plugin, min 19), web app. All at once. macOS and Windows. Resolve Free is not supported (no plugin loading since 21.1); landing page says so and points to the web app.                              |
| UI              | One shared React + TypeScript UI in all three Hosts. (ADR 0002)                                                                                                                                                                                                                                                                  |
| Rendering       | SVG Templates rendered by resvg-wasm, the same module in the web app, the CEP panel and the Resolve plugin. Native resvg only if 4K profiling demands it in Resolve. (ADR 0003)                                                                                                                                                  |
| Output          | Static full-Frame transparent PNG at the sequence's frame size (Frame presets + 1080p/4K only in the web app). One Comment per Overlay; batch = N Overlays staggered in time and Placement. Animation is a future feature.                                                                                                       |
| Insert          | Lowest empty video track above the playhead for the whole duration, new track if none. Default 3 s, configurable. Overwrite into empty space only, never ripple.                                                                                                                                                                 |
| Placement       | Drag on a Frame preview, 9-point snap, scale slider, per-Platform safe-zone guides. Last Placement remembered globally per Platform.                                                                                                                                                                                             |
| Platforms       | TikTok, Instagram, YouTube, X. Dark and light. Single and creator-reply variants. Facebook/Threads later.                                                                                                                                                                                                                        |
| Languages       | Comments in English and Spanish. Manual Comment is language-neutral. UI in English.                                                                                                                                                                                                                                              |
| Bank            | Nine tones (hype, funny, question, critical, relatable, emoji-only, request, story reaction, neutral product question) and context tags (short film, ad, tutorial, vlog, music). ~1,500 entries per language at launch, drafted by Claude, curated by the owner as data files in the repo with a sample-render preview script.   |
| Avatars         | ~3,000 synthetic images bundled in every Host build (~60 MB): 60% faces across age/gender/ethnicity, 25% non-face (pets, cars, anime, landscapes), 15% Platform defaults. Generated once on the owner's local GPU, auto-curated (face detection, embedding dedupe) plus a visual pass. Manual Comments accept any user image.    |
| Fonts           | Open substitutes (Inter, Roboto). Noto Color Emoji by default, Twemoji for the X Template.                                                                                                                                                                                                                                       |
| Offline         | Everything offline after Activation, including the web app (service worker cache). Network only for Activation, non-blocking version check, opt-in crash reports. No hot content updates; new Bank/Templates ship as a new version behind the update banner.                                                                     |
| Commerce        | Stripe Checkout + Stripe Tax, UK business, EU OSS handled by the owner. One-time price around £10 (to be reviewed). 14-day refund. Quantity field; one Key per Seat; 3 Devices per Key, web app counts as a Device. Keyless: Key by email, resend-Key form, Key-gated downloads, self-service Device management page. (ADR 0004) |
| Backend         | One Cloudflare Worker (TypeScript), D1, R2, transactional email.                                                                                                                                                                                                                                                                 |
| Landing         | Astro static site on Cloudflare Pages: demo video, features, pricing, FAQ/docs, changelog, Terms/Privacy/Refund, testimonials from a two-week beta (15 to 20 editors, free Key). Cloudflare Web Analytics. Brand: "ICG" / "somethingicg", never spelled out.                                                                     |
| Distribution    | Premiere and Resolve: one signed `.pkg` (notarised) and one signed `.exe` each, standard wizard, uninstaller included. Web app: nothing. The UXP port will add a `.ccx`.                                                                                                                                                         |
| Future          | Pop-in animation, runtime AI as an optional online feature, local MCP server (engine exposes an internal API from day one), more Platforms and languages, content packs.                                                                                                                                                         |
| Telemetry       | Opt-in crash reports only, off by default.                                                                                                                                                                                                                                                                                       |
| Support         | Email + FAQ.                                                                                                                                                                                                                                                                                                                     |

## 3. Architecture

```
apps/
  landing/          Astro static site (Cloudflare Pages)
  web/              web app shell: React UI + resvg WASM + service worker
  premiere/         CEP panel: React UI + resvg-wasm + ExtendScript adapter (import, overwrite at playhead)
  resolve/          Workflow Integration plugin (Electron): React UI + resvg-wasm + Resolve adapter
  api/              Cloudflare Worker: Stripe webhook, Keys, Activation, Devices, version, downloads
packages/
  ui/               shared React generator UI (UXP CSS subset)
  engine/           generation: Bank lookup, username/likes/time generators, internal API (future MCP)
  renderer/         SVG Templates, text/emoji layout, font embedding, resvg-wasm wrapper
  bank/             Bank data files per Platform and language + preview script
  avatars/          Avatar pool build pipeline (generate, curate, pack)
  host-sdk/         Host adapter interface: getSequenceInfo, writeFile, importAndInsert, getPlayhead
  licensing/        Key format, signature verification, Activation client
installers/
  macos/ windows/   Premiere (CEP) and Resolve installers, signing and notarisation
docs/adr/
```

Host adapter facts (verified against Adobe typings and samples):

- Premiere (CEP/ExtendScript): `app.project.importFiles`, `track.overwriteClip(projectItem, time)` at `sequence.getPlayerPosition()`, clip `end` for duration, `sequence.frameSizeHorizontal/Vertical` and `timebase`; track creation via the QE DOM; files written from the panel's Node side.
- Premiere (UXP, for the 2028 port): `project.importFiles`, `SequenceEditor.createOverwriteItemAction` inside `project.lockedAccess` + `executeTransaction`, `createSetOutPointAction`, `sequence.getFrameSize()`; rendering needs confirmed WASM or a hybrid addon.
- Resolve: `MediaPool.ImportMedia`, `AppendToTimeline` with `recordFrame` and `trackIndex`, `Timeline.AddTrack` when needed.

## 4. Phases

**Phase 0 - Spikes (2 weeks)**

1. CEP panel: React UI + resvg-wasm rendering a Template to PNG in-panel, mac + win, Premiere 23 and 26.
2. Premiere adapter (ExtendScript): import, overwrite at playhead on chosen track, create track, set duration, read frame size.
3. Installer: signed extension folder installed by `.pkg`/`.exe`, loads without PlayerDebugMode on both OSes.
4. Informational, one day hard stop: resvg-WASM inside Premiere UXP, to scope the 2028 port.
5. Resolve adapter: same via Workflow Integration plugin on Studio 19/20.
6. Renderer fidelity: all four Platforms, dark/light, against real screenshots; colour emoji path confirmed.
7. Avatar pipeline: 200-image sample from the local GPU, curation script.
8. Stripe test product, webhook to Worker, Key issue + email, Activation round trip.

**Phase 1 - Core**: engine, renderer, Templates, Bank v1 (EN/ES), Avatar pool, shared UI (generate, edit, Manual Comment, Placement), licensing client. Web app shipping first as the integration target.

**Phase 2 - Hosts**: Premiere CEP panel and Resolve plugin, installers, signing, notarisation.

**Phase 3 - Commerce**: Worker endpoints, Device page, downloads, landing page, legal pages, update banner, crash reporting opt-in.

**Phase 4 - Beta**: 15 to 20 editors, two weeks, installer and fidelity feedback, testimonials.

**Phase 5 - Launch**, then animation, MCP, more Platforms/languages.

## 5. Risks

- CEP sunset: disabled by default in Premiere from December 2028. The UXP port is a dated roadmap item; its rendering path (WASM in UXP or hybrid addon) is still unproven.
- Platform UI drift: Templates need refreshing a few times a year; each refresh is a version.
- Bank repetition at agency volumes; track Bank size as a KPI.
- Price around £10 leaves thin margin per sale after Stripe fees; support must be self-service.
- Resolve Free users cannot be integrated; messaging must prevent refunds.
- Trademark: never spell out the acronym, no Platform logos, descriptive use only.

## 6. Work breakdown for parallel sessions

Rule: step 0 runs alone and merges first. Everything after it forks from that commit; each session owns one directory and touches `packages/shared` and `packages/host-sdk` only by agreement.

### Step 0 - Foundation (one session, sequential)

- pnpm workspace + Turborepo, TypeScript base config, lint/format, CI skeleton (lint, typecheck, test).
- `packages/shared`: `Comment`, `ManualComment`, `Avatar`, `Template` (platform, theme, variant), `Placement`, `Frame`, `Overlay` request/result, `Bank` entry schema, `Key` payload. Mirrors `CONTEXT.md` names exactly.
- `packages/host-sdk`: `HostAdapter` interface: `getSequenceInfo()`, `getPlayhead()`, `writeFile()`, `importAndInsert()`, `getPlatformTheme()`, plus a fake adapter for tests.
- `AGENTS.md` pointing at `CONTEXT.md`, `docs/adr/`, package ownership and the "contracts are frozen" rule.

### Step 1 - Spikes (parallel, each its own session and worktree)

Cloud sessions write the code; spikes marked (local) need you to run them in Premiere/Resolve on a real machine.

- S1 CEP shell: panel loads the React UI, renders one Template to a transparent PNG in-panel with resvg-wasm, writes it to disk. (local, mac + win, Premiere 23 and 26)
- S2 ExtendScript adapter: import, overwrite at playhead on a chosen track, create track, set duration, read frame size. (local)
- S3 Installer: signed CEP extension folder installed by `.pkg` / `.exe`, loads without PlayerDebugMode, uninstaller. (local)
- S4 Resolve adapter: Workflow Integration plugin shell, `ImportMedia` + `AppendToTimeline` at playhead, `AddTrack`. (local, Studio 19/20)
- S5 Renderer fidelity: Templates for TikTok, Instagram, YouTube, X, dark/light, single + creator reply, compared to real screenshots; colour emoji path confirmed.
- S6 Avatar pipeline: generation prompts and scripts for the local GPU, face detection, embedding dedupe, pack format. (local GPU, 200-image sample)
- S7 Commerce round trip: Stripe test product, Worker webhook, signed Key, email, Activation + Device record in D1.
- S8 Informational: resvg-wasm inside Premiere UXP, one day hard stop. (local)

### Step 2 - Core (parallel, after S5 fixes the Template contract)

- C1 `packages/engine`: Bank lookup by Platform/language/tone/context, username generator per Platform, likes/time generators, seeded randomness, internal API surface.
- C2 `packages/bank`: EN and ES drafts, ~1,500 each, tagged; preview script that renders random samples.
- C3 `packages/renderer`: production Templates, text wrapping, emoji runs, font embedding, WASM wrapper, golden-image tests.
- C4 `packages/ui`: generate, edit, Manual Comment, Avatar picker/upload, Placement canvas with safe zones, batch, Insert button, Activation screen; built against the fake adapter and UXP's CSS subset.
- C5 `packages/licensing`: Key verification, Activation client, Device fingerprint, offline grace.
- C6 `apps/web`: shell, service worker cache, Frame presets and 1080p/4K, PNG download.

### Step 3 - Hosts (parallel, after C3 + C4)

- H1 `apps/premiere`: CEP shell from S1 + adapter from S2 + UI; panel theme sync; update banner.
- H2 `apps/resolve`: Electron shell from S4 + UI; update banner.
- H3 `installers/`: production signing, notarisation, both Hosts, CI release job.

### Step 4 - Commerce (parallel with step 3)

- M1 `apps/api`: checkout session, webhook, Key issue + email, resend-Key, Activation, Device list/remove, version check, Key-gated R2 downloads.
- M2 `apps/landing`: Astro site, pricing + Stripe Checkout, downloads page, Device page, FAQ/docs, changelog, Terms/Privacy/Refund drafts, Cloudflare Web Analytics.
- M3 Crash reporting opt-in wiring in both Hosts and the web app.

### Step 5 - Beta and launch (sequential)

- B1 Beta build, 15 to 20 editors, two weeks, bug triage, testimonials.
- B2 Launch: price final, Stripe live, DNS, release tags.
- Post-launch roadmap: pop-in animation, UXP port (due before Dec 2028), MCP, more Platforms and languages.
