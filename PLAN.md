# ICG - Social Comment Overlay Plugin for Premiere Pro and DaVinci Resolve

Status: draft plan, pre-grill. Items marked **[decide]** are open questions to settle before building.

## 1. Product summary

A paid tool that generates believable TikTok / Instagram style comments (avatar + username + text + likes/metadata), lets the user edit them, pick where they sit on the frame, and drops them onto the timeline from inside Premiere Pro or DaVinci Resolve Studio. Sold through a landing page with payment, license key and gated downloads. Installs without touching a terminal.

Everything the user asked for is feasible. Two platform facts (verified Nov 2026) shape the architecture:

1. **Premiere Pro**: UXP plugins are generally available since v25.6 (Dec 2025). CEP still works but is on a migration timeline. New work should be UXP. UXP panels are not a browser: React is the supported UI stack, Angular will not run there.
2. **DaVinci Resolve**: the free edition dropped scripting support entirely in 21.1. Workflow Integration plugins and the scripting API are Studio-only. Free users can only be served with "export PNG, drag it in".

## 2. Architecture: one engine, thin hosts

```
                 +--------------------+
                 |  Landing (Angular) |  marketing, reviews, checkout, downloads
                 +---------+----------+
                           |
+------------+   +---------v----------+   +---------------------+
| Premiere   |   |   API (.NET)       |   | Render service      |
| UXP panel  +--->  auth/licensing    +--->  HTML/CSS template  |
| (React)    |   |  LLM proxy         |   |  -> PNG with alpha  |
+------------+   |  avatar pool       |   |  (Satori/resvg or   |
                 |  payments webhooks |   |   headless Chromium)|
+------------+   |  downloads/updates |   +---------------------+
| Resolve WI |   +---------+----------+
| plugin     +------------>|
| (Electron, |             |
|  React)    |   +---------v----------+
+------------+   |  Web app (React)   |  fallback for Resolve Free, CapCut, FCP, anyone
                 |  app.<domain>      |  same UI as the panels, downloads the PNG
                 +--------------------+
```

Principles:

- **One UI codebase** (`packages/generator-ui`, React + TypeScript) mounted in three shells: Premiere UXP, Resolve Workflow Integration (Electron), and the web app. Only the "insert into timeline" adapter differs per host.
- **Render once, server-side.** The final PNG is produced by one renderer so the output is pixel-identical in every host and the preview is the same image the user gets. Panels never need html-to-image hacks (which do not work in UXP anyway).
- **Keys stay on the server.** LLM and image providers are called from the .NET API behind the license check. Plugins never hold secrets, which also makes licensing enforceable.
- **Full-frame PNG export.** The comment is composited at the chosen position onto a transparent canvas of the chosen frame preset (9:16, 4:5, 1:1, 16:9). The host just drops the clip over the footage; no per-host transform math, works identically in the web fallback. Advanced users can switch to a tight crop.

Stack note: Angular is kept for the landing page and .NET for the API as per project preference. The panel UI has to be React because of UXP. **[decide]** Accept React for the shared panel UI, or keep Angular in an Electron desktop app and make the Premiere panel a thin remote control over localhost (worse in-host UX, two UIs to maintain). Recommendation: React.

## 3. Feature breakdown

### 3.1 Generation
- Inputs: platform (TikTok / Instagram), theme (dark / light), language, tone (funny, supportive, hater, question, emoji-heavy...), optional video topic / transcript snippet, count.
- Output per comment: username, display name, avatar, text, like count, time ago, flags (verified, pinned, "Creator" reply, liked by creator, reply arrow, translated label).
- LLM: Claude via the API for usernames + comments. Prompted with platform conventions per language. Offline/cheap fallback: a bundled template bank for when the user is out of credits or offline.
- Avatars: pre-generate a large pool of synthetic faces once (no real people), store on CDN, serve random picks with "shuffle". Cheaper and faster than per-request image generation, avoids consent problems. Also non-face options (pets, landscapes, logos, letter avatars) since many real accounts look like that. **[decide]** also offer on-demand AI avatar generation as a premium action.
- Edit everything: avatar (shuffle, upload own, crop), username, display name, text, numbers, flags, theme.

### 3.2 Templates
- Pixel-accurate replicas of the current TikTok and Instagram comment rows (and the "comment reply" variant), dark and light. Versioned so UI changes on the platforms can ship as template updates without a plugin update.
- Fonts: platform fonts are proprietary. Ship open metric-compatible substitutes (Inter / SF alternative). Flag in marketing as "inspired by".
- Later: animated variants (pop-in, like-count tick) exported as PNG sequence or ProRes 4444. Static PNG first.

### 3.3 Positioning
- Canvas preview of the chosen frame preset with platform-accurate safe zones (TikTok right rail, caption area, IG bottom bar) overlaid.
- 9-point snap grid plus free drag, scale slider, optional stack of several comments with spacing.
- Position is stored per project so the next comment lands in the same spot.

### 3.4 Host integration
- **Premiere (UXP)**: import PNG into the project bin, insert on the first empty video track above the playhead, default duration 3 s (setting), overwrite vs insert setting. Verify in spike that the UXP Premiere API exposes import + track insert at a time.
- **Resolve Studio (Workflow Integration)**: `MediaPool.ImportMedia` + `AppendToTimeline` with `recordFrame` at playhead and chosen `trackIndex`. Detect Studio vs Free on startup and show the web fallback message on Free.
- **Web app**: download PNG, drag into any NLE.
- Credits/usage shown in the panel, link to account page.

### 3.5 Commercial
- Landing page (Angular SSR): hero demo video, feature sections, pricing, reviews, FAQ, changelog, docs. Reviews: hand-collected testimonials at launch, structured data for SEO, later an embedded reviews widget.
- Payments: merchant of record (Lemon Squeezy or Paddle) so VAT/sales tax is handled and license keys come built in. Stripe only if a MoR is not acceptable. **[decide]**
- Flow: pay -> email with license key + link -> account page with downloads (Premiere `.ccx`, Resolve installer, web app) -> activate in panel with key (device limit, e.g. 2).
- **[decide]** pricing model. Generation has a per-call cost (LLM + storage), so pure one-time unlimited is risky. Options: subscription; one-time license + monthly AI credits; one-time with template-bank generation free and AI generation as credits.

### 3.6 Installation (non-technical users)
- Premiere: `.ccx` file, double-click installs via the Creative Cloud desktop app. Optionally also list on Adobe Exchange for discovery.
- Resolve: signed `.pkg` (macOS, notarized) and `.exe` (Windows, Inno Setup) that copies the plugin into the Workflow Integration Plugins folder. Needs Apple Developer and a Windows code-signing certificate, otherwise users see scary warnings.
- Updates: panel checks the API for a newer version and shows a banner with a one-click download. Templates update silently from the server.
- Linux Resolve: out of scope initially.

## 4. Repository layout (monorepo)

```
apps/
  api/              .NET 10 Web API: auth, licensing, generation proxy, payments webhooks, downloads
  landing/          Angular SSR marketing site + account/downloads page
  web/              React web app shell for packages/generator-ui
  premiere-uxp/     UXP plugin shell (manifest, host adapter), builds .ccx
  resolve-plugin/   Workflow Integration plugin shell (Electron), host adapter
packages/
  generator-ui/     shared React UI: generation, editing, positioning, insert button
  templates/        comment templates (HTML/CSS + data contract), versioned
  renderer/         template -> PNG (Node), used by the API render endpoint
  host-sdk/         TS interface every host adapter implements (importAndInsert, getPlayhead, getFrameSize)
  shared/           DTOs/types shared by API clients and UI
installers/
  macos/  windows/  scripts and signing config
docs/
  PLAN.md, ADRs, spikes/ findings
```

## 5. Phases

**Phase 0 - Spikes (1 to 2 weeks).** De-risk before building.
1. UXP Premiere: hello-world panel that imports a PNG and inserts it at the playhead on a chosen track. Confirm API coverage and `.ccx` install flow.
2. Resolve Studio: Workflow Integration panel doing the same via `AppendToTimeline` with `recordFrame`.
3. Renderer: TikTok + IG dark/light rows rendered to PNG with alpha, compared side by side with real screenshots. Choose Satori/resvg vs headless Chromium.
4. Avatars: generate a 200-face sample, judge believability and variety, estimate pool cost.
5. Payments: create a test product in Lemon Squeezy and Paddle, check license key API and webhooks from .NET.

**Phase 1 - Core product as web app.** API, renderer, templates, generation, editing, positioning, license gating. Sellable on its own to Resolve Free / CapCut / FCP users.

**Phase 2 - Premiere UXP panel.** Shell + host adapter + `.ccx` packaging.

**Phase 3 - Resolve Studio plugin.** Shell + host adapter + installers + signing/notarization.

**Phase 4 - Commercial.** Landing page, checkout, license keys, account/download page, update checks, telemetry (opt-in), support email, docs.

**Phase 5 - Launch and iterate.** Collect reviews, template updates, animated comments, more platforms (YouTube, X) as new templates.

## 6. Risks and open questions for the grill

- **[decide]** Pricing model (see 3.5) and target price point.
- **[decide]** Product name and branding. Avoid "Tok"/"Insta" in the name to stay clear of trademarks. Does "icg" stand for something to keep?
- **[decide]** React for the shared UI vs Angular-in-Electron with thin panels.
- **[decide]** Merchant of record vs Stripe.
- **[decide]** Avatars: pool only, or pool + on-demand generation.
- **[decide]** Platforms at launch: macOS + Windows both? Premiere and Resolve on day one, or Premiere first?
- **[decide]** Languages for generated comments at launch.
- **[decide]** Offline behaviour: template bank only, or no offline mode.
- **[decide]** Telemetry and crash reporting.
- Legal: UI replicas of TikTok/Instagram, no logos, synthetic faces only, ToS clause that users are responsible for disclosure where required.
- Resolve Free users cannot be integrated. Messaging on the landing page must be clear to avoid refunds.
- CEP is still in use by many editors on older Premiere versions. Minimum supported Premiere version = 25.6. **[decide]** whether a CEP build for older versions is worth it (probably not).
- Platform UI drift: TikTok/IG change their comment UI a few times a year; templates must be hot-updatable.
- Code signing costs: Apple Developer program, Windows OV/EV certificate.
- Hosting costs for the API and renderer; render endpoint must be cheap (prefer Satori/resvg over Chromium).

## 7. Sources checked

- Adobe Developer Blog, "UXP Arrives in Premiere" (Dec 2025): UXP GA in Premiere 25.6.
- Adobe partner update on UXP migration timeline for extensibility partners.
- Puget Systems (Sep 2026): DaVinci Resolve Free 21.1 removes scripting support.
