# S4: DaVinci Resolve Studio Workflow Integration plugin shell and adapter

Status: built and unit-tested in a cloud session without Resolve. Nothing in this document has been
run inside Resolve; the owner checklist below is how that gets verified on Studio 19 and 20.

## Goal

Prove that ICG can live inside DaVinci Resolve Studio as a Workflow Integration plugin: an Electron
app in the layout Resolve expects, hosting the shared React UI, rendering an Overlay with
resvg-wasm in the renderer process, and Inserting it on the timeline at the playhead through the
Resolve scripting API, behind the `HostAdapter` seam from `@icg/host-sdk`.

## What was built

`apps/resolve/` builds to `apps/resolve/dist/com.icg.resolve/`, the folder that gets copied into
Resolve's plugin directory:

```
com.icg.resolve/
  manifest.xml          plugin id com.icg.resolve, FilePath main.js (same schema as BMD's SamplePlugin)
  package.json          "main": "main.js" (CommonJS, Resolve's own Electron runs it)
  main.js               esbuild bundle of src/main: loads WorkflowIntegration.node, owns every Resolve call, IPC handlers
  preload.js            esbuild bundle of src/preload: contextBridge exposing window.icgResolve (sandboxed renderer)
  renderer/             Vite build of src/renderer: React panel, resvg-wasm, Inter fonts
```

Source layout:

| Path                                     | Role                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main/workflow-integration-paths.ts` | Pure: where to look for `WorkflowIntegration.node` (env override, plugin folder, Resolve's `Developer/Workflow Integrations/Examples/*`). Tested.                        |
| `src/main/workflow-integration.ts`       | Loads the module with `createRequire`, `Initialize("com.icg.resolve")`, `GetResolve()`, reads product name and version, reports a `HostStatus`.                          |
| `src/main/resolve-types.ts`              | Minimal typings for the Resolve object graph we touch. Every call is `await`ed so both the sync and the Promise API shapes work.                                         |
| `src/main/resolve-host.ts`               | `getSequenceInfo` and `insertOverlay` against the Resolve API, parsing every value with zod. Tested against a fake Resolve object graph.                                 |
| `src/main/files.ts`                      | Writes PNGs (temp and durable), reads bundled assets for the renderer, refuses paths outside the plugin folder. Tested.                                                  |
| `src/main/index.ts`                      | Electron entry: window, IPC registration, `CleanUp()` on quit, `ICG_DEVTOOLS=1` opens DevTools.                                                                          |
| `src/preload/index.ts`                   | `contextBridge.exposeInMainWorld("icgResolve", ...)`, nothing but `ipcRenderer.invoke` proxies.                                                                          |
| `src/ipc/contract.ts`                    | zod schemas for every IPC payload and result; `HostStatus`, `InsertRequest`, `InsertResultMessage`.                                                                      |
| `src/timeline/timecode.ts`               | Pure: timecode parsing, frames <-> timecode including drop-frame 29.97 and 59.94, `timelineFrameRate` string parsing. Tested, including DF round trips.                  |
| `src/timeline/playhead.ts`               | Pure: playhead frame = `GetStartFrame()` + (frames(`GetCurrentTimecode`) - frames(`GetStartTimecode`)). Tested with non-zero start and DF.                               |
| `src/timeline/tracks.ts`                 | Pure: lowest video track empty for `[playhead, playhead + duration)`, or "add one". Tested.                                                                              |
| `src/renderer/resolve-host-adapter.ts`   | `ResolveHostAdapter implements HostAdapter` over the bridge; `getTheme()` is `"dark"`, `onThemeChange` is a no-op unsubscribe, `openExternal` goes to `shell`.           |
| `src/renderer/render.ts`                 | resvg-wasm init with the bundled Inter Regular and SemiBold; loads assets via `fetch`, falls back to IPC if `file://` fetch is refused.                                  |
| `src/renderer/card.ts`, `sample.ts`      | One hardcoded TikTok-dark Comment as an `OverlaySpec`, rendered as a full-Frame 1080x1920 SVG. Tested; `card-render.test.ts` rasterises it with the real wasm and fonts. |
| `src/renderer/App.tsx`                   | Panel: host status banner, sequence info, Render / Write temp PNG / Insert buttons, result dump. Falls back to `FakeHostAdapter` when opened in a browser.               |

What is deliberately not here: the shared `packages/ui` (not written yet), the real Templates (S5),
installers (H3), Studio-only enforcement beyond a banner.

## How to run

### Build

```sh
pnpm install
pnpm --filter @icg/resolve build      # -> apps/resolve/dist/com.icg.resolve/
pnpm check                            # lint, typecheck, tests for the whole repo
```

`pnpm --filter @icg/resolve dev` serves the panel in a browser with a `FakeHostAdapter`, useful for
UI work; rendering works there too.

### Install the plugin folder

Copy `apps/resolve/dist/com.icg.resolve/` (the whole folder, keep the name) into Resolve's Workflow
Integration Plugins root:

- macOS: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
- Windows: `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`

Create the `Workflow Integration Plugins` folder if it is missing (it is on a fresh install).

### WorkflowIntegration.node

The plugin does not bundle Blackmagic's native module. On start `main.js` looks for it in this
order and uses the first that exists:

1. `$ICG_WORKFLOW_INTEGRATION_NODE` (explicit override)
2. `<plugin folder>/WorkflowIntegration.node` (a copy next to `main.js`)
3. `<support root>/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node`
4. the same under `SamplePromisePlugin/` and `CompatibleSamplePlugin/`

where `<support root>` is `/Library/Application Support/Blackmagic Design/DaVinci Resolve` on
macOS and `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support` on Windows. If none is found the
panel says so and lists the paths it tried; copy the file from the `Developer` folder of that
Resolve install next to `main.js` and reopen the plugin.

### Open it

Start DaVinci Resolve Studio, open a project with a timeline, then `Workspace > Workflow
Integrations > ICG`. Resolve launches the plugin in a separate window. To get DevTools, start
Resolve from a shell with `ICG_DEVTOOLS=1` in the environment (the plugin inherits Resolve's
environment).

## Owner checklist

Run on macOS and Windows, on Studio 19.x and 20.x. Record the Resolve version string the banner
shows. Use a 1080x1920 25p timeline with a 01:00:00:00 start for steps 1 to 9, then repeat 7 to 9
on a 29.97 DF timeline and on a 23.976 timeline.

| #   | Step                                                                                       | Expected                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Copy the folder, start Resolve Studio, open `Workspace > Workflow Integrations`.           | An `ICG` entry is listed. If not: check the folder name, that `manifest.xml` is at its root, and the Resolve log (`Help > Create Diagnostics Log`) for a manifest parse error.                                                                              |
| 2   | Click `ICG`.                                                                               | A 520x900 dark window titled ICG opens. Banner is green: "Connected to DaVinci Resolve Studio <version> on mac/win", with the `WorkflowIntegration.node` path it loaded and its module version.                                                             |
| 3   | If the banner is red "WorkflowIntegration.node was not found".                             | The listed paths tell you whether this install has a `Developer` folder. Copy the `.node` from the sample plugin next to `main.js`, reopen; banner goes green. Note which path worked per OS and version.                                                   |
| 4   | Read the Sequence block.                                                                   | Timeline name, `1080 x 1920`, frame rate `25`. Switch to another timeline, press Refresh: values follow. Close all timelines (or open a project without one), Refresh: "No timeline is open."                                                               |
| 5   | Click "Render sample Comment".                                                             | Within about a second a preview appears: dark rounded card, avatar circle with M, `mara.cuts` with a blue tick, two lines of text, `3h`, `Reply`, heart `2.4K`, on a transparent checkerboard. Note "Render time" (ms) and "Assets via" (`fetch` or `ipc`). |
| 6   | Click "Write temp PNG".                                                                    | A path under the OS temp dir (`.../icg/ICG-comment-<timestamp>.png`) is printed. Open it in Finder/Explorer: 1080x1920 PNG with transparency.                                                                                                               |
| 7   | Park the playhead at 01:00:10:00 on an empty part of V1, click "Insert at playhead (3 s)". | Result `status: inserted`, `track: 1`, `startSeconds: 10`, `recordFrame: 90250`, `durationFrames: 75`. On the timeline a 3 s clip starts exactly at 01:00:10:00 on V1. The Media Pool gains the PNG.                                                        |
| 8   | Put a clip on V1 and V2 under the playhead, Insert again.                                  | `track: 3`; if the timeline had only two video tracks a V3 was created first. Nothing on V1 or V2 moved or was trimmed.                                                                                                                                     |
| 9   | Put a clip on V1 that starts 1 s after the playhead, with V2 empty, Insert again.          | The Overlay lands on V2 (V1 is not free for the whole 3 s). The V1 clip did not move (no ripple).                                                                                                                                                           |
| 10  | On a 29.97 DF timeline (start 01:00:00;00), park at 01:10:00;00 and Insert.                | `recordFrame` equals `GetStartFrame() + 17982` and the clip starts visually at 01:10:00;00. If it is off by 18 frames, drop-frame handling or `GetStartFrame` convention is wrong; see open questions.                                                      |
| 11  | On a 23.976 timeline, Insert at 00:00:10:00.                                               | `durationFrames: 72`, clip starts at frame 240 from timeline start.                                                                                                                                                                                         |
| 12  | Click the external link at the bottom.                                                     | The default browser opens the URL; nothing navigates inside the plugin window.                                                                                                                                                                              |
| 13  | Close the plugin window, reopen it from the menu.                                          | It comes back and reconnects (banner green). Resolve does not complain about a still-registered plugin.                                                                                                                                                     |
| 14  | Quit Resolve with the plugin open.                                                         | Resolve quits cleanly, the plugin window closes with it.                                                                                                                                                                                                    |
| 15  | Optional: on a machine with Resolve Free, repeat step 1.                                   | No `Workflow Integrations` entry exists, or it is empty. That confirms the landing-page message rather than anything in the plugin.                                                                                                                         |

For every Insert also check Media Pool: the imported clip's file path points into Resolve's
`userData` location for the plugin (`.../overlays/`), not into a temp folder.

## Findings

Sources were read on 3 Nov 2026. Blackmagic's own sites (`blackmagicdesign.com`,
`forum.blackmagicdesign.com`, `resolvedevdoc.readthedocs.io`) were not reachable from this session,
so forum and release-note statements below come from search-engine excerpts and are marked as such.

1. **Plugin layout is simple and the manifest schema is fixed.** Blackmagic's Workflow Integrations
   README (3 Oct 2024) and its `Examples/SamplePlugin` give: a folder named after the plugin id,
   `manifest.xml` with `<BlackmagicDesign><Plugin><Id/><Name/><Version/><Description/><FilePath/>`,
   a `package.json` whose `main` is the Electron entry, and Resolve launching it with Resolve's own
   bundled Electron. Third-party plugins use the same schema; one adds an `<Icon>` element.
   Sources: README and sample files mirrored at
   [jdanna/Resolve_Tools_Public, docs/Workflow Integrations](https://github.com/jdanna/Resolve_Tools_Public/tree/main/docs/Workflow%20Integrations)
   (identical to the copy Resolve installs under `Developer/Workflow Integrations/`);
   [ResolveCafe developer notes](https://github.com/CommandPost/ResolveCafe/blob/main/docs/developers/workflowintegrations.md);
   manifests of [VilleOlof/Toolbox](https://github.com/VilleOlof/Toolbox) and
   [benjaminshresthaa/Davinci-Bin-Manager](https://github.com/benjaminshresthaa/Davinci-Bin-Manager).

2. **Since 19.0.2 the plugin renderer is sandboxed with context isolation.** The README says so
   explicitly and ships a `CompatibleSamplePlugin` that turns `nodeIntegration` back on as a
   migration crutch. `SamplePlugin` loads `WorkflowIntegration.node` in the **main** process and
   exposes functions over `ipcMain.handle` / `contextBridge`. That is exactly the shape of this
   spike, so the `HostAdapter` lives in the renderer and only talks to a typed, zod-parsed bridge.
   Source: same README, "NOTE" block and `Examples/SamplePlugin/main.js`, `preload.js`.

3. **`WorkflowIntegration.node` is an Electron native addon tied to Resolve's Electron.** The
   README tells developers to copy the file from `Examples/SamplePlugin/` into their plugin and to
   "update" it with new Resolve versions, which means a copy bundled for 19 may not load in 20 (or
   the reverse). Loading it from the installed Resolve's `Developer` folder keeps the ABI matched
   automatically and avoids redistributing a Blackmagic binary in our installer. Cost: if an
   install lacks the `Developer` folder the owner must copy it once (checklist step 3 measures how
   common that is). The module API we rely on: `GetInfo()`, `Initialize(pluginId)`, `GetResolve()`,
   `CleanUp()`; `Initialize` must receive the id from `manifest.xml`. Source: README,
   "WorkflowIntegration module API".

4. **The scripting calls for Insert are documented, including `recordFrame` and `trackIndex`.**
   `MediaPool.AppendToTimeline([{clipInfo}])` takes `mediaPoolItem`, `startFrame`, `endFrame` and
   optional `mediaType` (1 video only), `trackIndex`, `recordFrame`. `ImportMedia([paths])` returns
   `MediaPoolItem`s. `Timeline.GetCurrentTimecode()`, `GetStartTimecode()`, `GetStartFrame()`,
   `GetTrackCount("video")`, `GetItemListInTrack("video", i)` (1-based), `AddTrack("video")`,
   `TimelineItem.GetStart()/GetEnd()` all exist. `timelineFrameRate` is a settings key whose value
   can carry a `DF` suffix. Source: scripting README v21.0.4 as mirrored in
   [this gist](https://gist.github.com/X-Raym/2f2bf453fc481b9cca624d7ca0e19de8) (the original is
   `Developer/Scripting/README.txt` in every Resolve install). A BMD forum thread ("Targeting video
   track 2 with script", search excerpt) confirms `trackIndex` and `recordFrame` work in practice and
   that `recordFrame: 90000` equals `01:00:00:00` on a 25p timeline, i.e. `recordFrame` is in the
   same absolute numbering as `GetStartFrame()`. The adapter therefore computes
   `GetStartFrame() + (frames(current) - frames(start))`, which is right whichever convention
   Resolve uses for the start frame of a drop-frame timeline.

5. **Free vs Studio.** The README's first sentence says Workflow Integration plugins are a
   DaVinci Resolve Studio feature; Resolve Free never scans the plugin folder, so the plugin cannot
   show a message there. Blackmagic's 21.1 release notes (search excerpt) additionally move
   "advanced scripting" behind Studio. In the plugin we still read `Resolve.GetProductName()` and
   show a warning banner if it does not contain "Studio", which also covers a future Free build
   that does load plugins. The real message belongs in the installer and on the landing page, as
   PLAN.md already says.

6. **Rendering in the sandboxed renderer works without Node.** `@resvg/resvg-wasm` 2.6.2 accepts
   `font.fontBuffers` (raw TTF bytes) and `initWasm(bytes)`, so no filesystem access is needed.
   Inter 4.1 Regular + SemiBold (OFL, from
   [rsms/inter v4.1](https://github.com/rsms/inter/releases/tag/v4.1)) are 831 KB together; the
   wasm is 2.4 MB. The only uncertainty is how the page gets those bytes: Chromium refuses
   `fetch()` on `file://` in some configurations, so `render.ts` falls back to an IPC read that is
   confined to the plugin folder. The panel shows which path was taken. The pipeline itself is
   verified here: `card-render.test.ts` runs the same wasm and font bytes under Node, asserts a
   1080x1920 PNG with transparent corners and an opaque card at the Placement, and took about
   240 ms per frame on the CI container (set `ICG_RENDER_OUT=<file>` to keep the PNG).

7. **Overlay files must outlive the Insert.** Resolve's Media Pool references the imported path;
   deleting it leaves the clip offline. The spike's "Write temp PNG" button uses the OS temp dir as
   asked, but Insert writes to `app.getPath("userData")/overlays/` so the project keeps working after
   a reboot. The production build needs a retention story (per-project folder next to the project,
   or a cleanup UI).

8. **Still-image duration is a Resolve preference, not an API argument.** PNGs import as stills
   whose length is the "Standard still duration" preference (5 s by default). `endFrame` can only
   trim within that; a 3 s default fits, a user-configured 10 s may be clamped. See open questions.

9. **Timecode math is the only non-trivial logic and it is fully unit-tested.** 29.97 DF drops 2
   frames per minute except every tenth, 59.94 drops 4; `01:00:00;00` is frame 107892 at 29.97 DF
   and 215784 at 59.94 DF; round trips are tested frame by frame for the first hour. 23.976 and
   24 are treated as 24-frame timecode with the true rate used for seconds-to-frames.

## Open questions

Ordered by how much they can change the design.

1. **`recordFrame` into occupied space.** Does `AppendToTimeline` with `recordFrame` on a track
   that already has a clip there overwrite, refuse, or shift the existing clip? We never ask it to
   (we pick an empty track or add one), but the failure mode matters if `GetItemListInTrack` lags
   behind an edit. Checklist step 8 and 9 observe it indirectly; a deliberate test on a busy track
   would settle it.

2. **Does `AppendToTimeline` ripple clips to the right on the same track?** The name suggests no,
   nothing in the README says. Step 9 tests it.

3. **Drop-frame timecode shape and `GetStartFrame` convention.** Does `GetCurrentTimecode()`
   return `;` for DF timelines (we also honour `timelineDropFrameTimecode` and a `DF` suffix on
   `timelineFrameRate`)? For a DF timeline starting at `01:00:00;00`, is `GetStartFrame()` 107892
   or 108000? Our relative computation does not care, but step 10 verifies the clip lands where
   the playhead is. Also: is `timelineFrameRate` returned as `"29.97"`, `"29.970"`, `"29.97 DF"`
   or a number? `parseFrameRate` accepts all four; the banner should be extended to show the raw
   string if step 10 fails.

4. **Timeline vs project settings.** `Timeline.GetSetting("timelineResolutionWidth")` is only
   meaningful when the timeline uses custom settings; we fall back to `Project.GetSetting` when it
   returns empty. Confirm the empty-value shape (empty string, `null`, or `0`).

5. **`endFrame` beyond the still's length.** What happens when `endFrame` exceeds the imported
   still's duration: clamp, failure, or a longer clip? If clamped, the production adapter must set
   the still duration preference or trim after insert.

6. **`GetEnd()` exclusivity.** We treat `TimelineItem.GetEnd()` as exclusive
   (`GetStart() + GetDuration()`), the common reading. If it is inclusive, a clip ending exactly at
   the playhead would wrongly block the track by one frame; harmless but worth one check.

7. **Electron version inside Resolve 19 vs 20.** Unknown, and it decides whether `fetch(file://)`
   works, whether the `wasm-unsafe-eval` CSP keyword is understood, and whether `es2022` output is
   safe. The build targets `chrome120`/`es2022`; the banner plus "Assets via" expose the first two.

8. **`trackIndex` above `GetTrackCount`.** We `AddTrack` first, so we never pass an index that
   does not exist; a forum report of a freeze with `trackIndex` on `CreateTimelineFromClips` in
   19.1.4 (search excerpt) suggests not to probe this.

9. **`Developer` folder presence.** Whether every Studio install (notably the Windows installer
   and the Mac App Store build) ships `Developer/Workflow Integrations/Examples/SamplePlugin/
WorkflowIntegration.node`. If not, the installer must carry a copy per supported major version
   and pick by `GetVersion()`, or ask Blackmagic about redistribution.

10. **Window lifecycle.** The sample calls `app.quit()` on window close and Resolve relaunches the
    plugin from the menu; confirm reopening works repeatedly (step 13) and that `CleanUp()` on quit
    is enough for Resolve not to keep a stale registration.
