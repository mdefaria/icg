# S1 + S2: Premiere Pro CEP shell and ExtendScript adapter

## Goal

Prove, on Premiere 23 and 26 on mac and win, that a CEP 11+ panel can (S1) load our React UI,
render one Template to a transparent full-Frame PNG in-panel with resvg-wasm and write it to disk,
and (S2) Insert that Overlay at the playhead through ExtendScript: import, overwrite on a free
video track above the footage, create a track when none is free, set the clip duration, read the
sequence frame size and rate.

This session had no Premiere. Everything below the "verified here" line is built and unit-tested
against fakes; nothing has run inside Premiere yet. The owner checklist is the verification.

## What was built

`apps/premiere/` is a pnpm workspace app. `pnpm --filter @icg/premiere build` writes
`apps/premiere/dist/`, which is the complete extension folder:

```
dist/
  CSXS/manifest.xml        ExtensionBundleId com.icg.premiere, PPRO [23.0,99.9], CSXS 11.0, --enable-nodejs
  .debug                   remote debugging on port 8092 (dev only, harmless in the build)
  index.html               loads vendor/CSInterface.js then assets/panel.js (classic deferred script)
  assets/panel.js          React panel, zod, resvg-wasm JS glue, built by Vite as one IIFE for Chromium 88
  assets/index_bg-*.wasm   resvg 2.6.2 (2.4 MB)
  assets/Inter-*.ttf       Inter 4.1 Regular + SemiBold (830 KB, OFL, licence in assets/fonts)
  jsx/icg.jsx              the ExtendScript side, ES3, JSON polyfilled, one global `ICG`
  vendor/CSInterface.js    Adobe's CSInterface v11.0.0, vendored from Adobe-CEP/CEP-Resources
```

Source layout (`src/`):

- `cep/globals.ts`: the only file that knows CEP globals (`window.__adobe_cep__`, `CSInterface`,
  `cep_node`, `cep.util`). Everything else receives interfaces.
- `cep/bridge.ts`: `evalScript` wrapper. Calls `ICG.<fn>(<one JSON string literal>)`, parses the
  `{ok,result}|{ok:false,error}` envelope and validates `result` with a zod schema. Turns the
  CSInterface sentinel `"EvalScript error."` into a typed `BridgeError`.
- `cep/files.ts`: writes the PNG with Node `fs` from `cep_node.require` into `<os.tmpdir()>/icg/`.
- `cep/assets.ts`: loads fonts and the wasm through Node `fs` inside CEP (Chromium cannot
  `fetch()` a `file://` URL) and through `fetch` in the browser dev server.
- `cep/shell.ts`: Theme from `appSkinInfo.panelBackgroundColor` luminance, `ThemeColorChanged`
  subscription, `openExternal` through `cep.util.openURLInDefaultBrowser`, `HostInfo`.
- `adapter/PremiereHostAdapter.ts`: implements `HostAdapter` from `@icg/host-sdk`. The Insert
  flow is `getTimeline` -> `chooseTrack` (pure, in TS) -> optional `addVideoTrack` -> write PNG ->
  `insert`. `adapter/trackSelection.ts` holds the track rule; `adapter/schemas.ts` the zod schemas
  for everything that crosses the ExtendScript boundary (`SequenceInfo` comes from `@icg/shared`).
- `render/commentCard.ts`: one hardcoded TikTok dark single Comment as full-Frame SVG, composited
  at the Placement. `render/renderOverlay.ts` rasterises it with resvg-wasm and the bundled fonts.
  The emoji is a Twemoji SVG (`assets/emoji/1f525.svg`, CC-BY 4.0) nested inline, because Inter
  has no emoji glyphs.
- `App.tsx`: shows jsx status, sequence info, the rendered PNG as `<img>`, and buttons for
  Insert at playhead, Write PNG to temp, Refresh, Open CEP docs. Every result lands in the log
  pane so the owner can copy it into the checklist.
- `main.tsx`: `PremiereHostAdapter.fromCep()` when CSInterface is present, `FakeHostAdapter`
  otherwise, so `pnpm dev` works in a plain browser.

Track rule (`chooseTrack`): take the highest video track that has a clip overlapping
`[playhead, playhead + duration)`, and pick the first free track above it; with nothing occupied
that is V1; with no free track above, ask for a new one. A free track _below_ occupied content is
never used, because the Overlay would be hidden. The jsx re-checks that the chosen track is free at
insert time and refuses with `track-occupied` rather than overwrite footage.

ExtendScript entry points (all return JSON strings):

| Function            | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping()`            | `app.version`, whether `app.enableQE()` exposed `qe.project`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `getSequenceInfo()` | name, `frameSizeHorizontal/Vertical`, frame rate = 254016000000 / `timebase` (falls back to `getSettings()`); `null` without an active sequence                                                                                                                                                                                                                                                                                                                                                                       |
| `getTimeline()`     | playhead seconds plus `[start,end)` seconds of every clip on every video track                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `addVideoTrack()`   | `qe.project.getActiveSequence().addTracks(1, numVideoTracks, 0, 1, numAudioTracks, 0, 0)`, verifies `videoTracks.numTracks` grew, else tries `addTracks(1)`, reports which form worked                                                                                                                                                                                                                                                                                                                                |
| `insert(args)`      | checks the track is free, `app.project.importFiles([path], true, insertionBin or root, false)`, finds the item by `getMediaPath()`, `setOutPoint(duration, video)`, `setScaleToFrameSize()`, re-checks the free span against the still's real in/out length, then `overwriteClip` with seconds -> ticks -> Time until a clip appears at the playhead (removing a clip that lands elsewhere), sets `trackItem.end` to playhead + duration rounded to frames, names the clip, returns `overwriteForm` and a `steps` log |

Verified here (Linux, no Premiere):

- `pnpm check` at the repo root passes: lint, typecheck, 55 tests in this app plus the existing ones.
- `icgJsx.test.ts` executes the real `jsx/icg.jsx` inside `new Function` against a fake Premiere
  DOM (Time in ticks, tracks, QE `addTracks`, `importFiles`), including the three `overwriteClip`
  argument forms, the misplaced-clip cleanup, the occupied-track refusal and the ES3 JSON polyfill.
- `renderOverlay.test.ts` runs resvg-wasm in Node with the bundled fonts and asserts a
  1080x1920 RGBA PNG, transparent outside the card and opaque inside it.
- `pnpm --filter @icg/premiere render:sample [out.png]` writes the sample Overlay for eyeballing.
- `dist/assets/panel.js` contains no API newer than Chromium 88 (checked for `Object.hasOwn`,
  `.at(`, `structuredClone`, `replaceAll`, `findLast`).

## How to run

### Build

```sh
pnpm install
pnpm --filter @icg/premiere build      # -> apps/premiere/dist
pnpm --filter @icg/premiere dev        # browser only, FakeHostAdapter, http://localhost:5173
```

### Allow unsigned panels (PlayerDebugMode)

The key is per CEP major version. Premiere 23 and 24 run CEP 11, Premiere 25 and 26 run CEP 12.
Set both; it is harmless.

macOS:

```sh
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
killall cfprefsd      # the plist is cached; log out/in if the panel still does not load
```

Windows (PowerShell or cmd, current user, no admin needed):

```bat
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
```

If Premiere 26 ships a newer CEP (check Help > About; or look for `CSXS.13` in
`~/Library/Preferences` / the registry after a first launch), repeat for that number.

### Copy the folder

Copy `apps/premiere/dist` as a folder named `com.icg.premiere` into the per-user extensions dir:

macOS:

```sh
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
rm -rf ~/Library/Application\ Support/Adobe/CEP/extensions/com.icg.premiere
cp -R apps/premiere/dist ~/Library/Application\ Support/Adobe/CEP/extensions/com.icg.premiere
```

Windows:

```bat
rmdir /s /q "%APPDATA%\Adobe\CEP\extensions\com.icg.premiere"
xcopy /e /i apps\premiere\dist "%APPDATA%\Adobe\CEP\extensions\com.icg.premiere"
```

System-wide alternatives (what the S3 installer will use): `/Library/Application Support/Adobe/CEP/extensions`
and `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions` (also `C:\Program Files\Common Files\Adobe\CEP\extensions`).

Start Premiere (restart it if it was running), open a project with a sequence, then
Window > Extensions > ICG.

### Debugging

`dist/.debug` maps the panel to port 8092. CEP 11 is Chromium 88 and CEP 12 is Chromium 99; a
current Chrome cannot attach to their DevTools protocol directly. Options: open
`http://localhost:8092` in Chrome, copy the page's `ws=` target into
`devtools://devtools/bundled/inspector.html?ws=localhost:8092/devtools/page/<id>`, or use a
Chromium of the matching major version. The panel also prints every result into its own log pane,
which is enough for this checklist.

CEP log files, when the panel does not appear at all: macOS `~/Library/Logs/CSXS/CEP11-PPRO.log`
(or `CEP12-PPRO.log`), Windows `%TEMP%\CEP11-PPRO.log`. A manifest error is reported there.

## Owner checklist

Run the whole table once per cell of {Premiere 23, Premiere 26} x {mac, win}. Record the panel log
line for every step; the strings in `steps` and `overwriteForm` are the data this spike exists to
collect.

Setup: a project with one sequence 1080x1920 at 29.97 or 30 fps, V1 holding a 20 s clip from 0 s,
V2 and V3 empty. Playhead at 5 s.

| #   | Step                                                                                                                                    | Expected                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Set PlayerDebugMode, copy the folder, start Premiere, open the project, Window > Extensions > ICG                                       | Panel opens, header reads `premiere <version> · mac/win · dark` (light when the Appearance preference is set to the brightest setting)                                                                                                                                           |
| 2   | Read the status line under the header                                                                                                   | `icg.jsx ok, Premiere 23.x/26.x, QE on`. `icg.jsx unreachable: evalscript` means `jsx/icg.jsx` did not load or threw at load; check the CEP log and note the version                                                                                                             |
| 3   | Read the sequence line                                                                                                                  | `Sequence: <name> · 1080x1920 @ 29.97` (or `30`). Note any mismatch                                                                                                                                                                                                              |
| 4   | Wait for the preview                                                                                                                    | Within 2 s the checkerboard shows the comment card near the bottom of a portrait frame; the log says `rendered 1080x1920 PNG (~45000 bytes)` and `Rendered in N ms` appears. Record N. If it says `render failed`, record the message (first suspect: wasm or font path, see F4) |
| 5   | Click **Write PNG to temp**                                                                                                             | Log shows `wrote /var/folders/.../icg/icg-<n>.png` (mac) or `C:\Users\...\Temp\icg\icg-<n>.png` (win). Open the file: transparent 1080x1920 PNG. If the button is disabled, Node is not enabled; record it                                                                       |
| 6   | Click **Insert at playhead**                                                                                                            | A 3 s clip named `ICG comment` appears on **V2** from 5.00 s to 8.00 s, V1 untouched; the project panel gains `ICG comment`; log shows `insert: {"status":"inserted","track":2,"startSeconds":5}`. Record `overwriteForm` and `steps` from the jsx (they are in the log line)    |
| 7   | Program monitor at 6 s                                                                                                                  | Card readable over the footage, transparent elsewhere, no stretching. If the card is letterboxed or scaled oddly, note it (F6, setScaleToFrameSize)                                                                                                                              |
| 8   | Without moving the playhead click **Insert at playhead** again                                                                          | Second clip lands on **V3** 5 s to 8 s; nothing on V2 changed                                                                                                                                                                                                                    |
| 9   | Click **Insert at playhead** a third time                                                                                               | A new video track **V4** is created and the clip lands there; log shows `track:4`. Record whether the new track appeared at the top (expected) or at the bottom pushing others up (prepend bug, see F2). If it fails with `add-track-failed`, record the message                 |
| 10  | Move the playhead to 30 s (past the V1 clip), insert                                                                                    | Clip lands on **V1** at 30 s (nothing is occupied there, so the lowest track is correct)                                                                                                                                                                                         |
| 11  | Undo (Cmd/Ctrl+Z) three times                                                                                                           | Each undo removes one inserted clip; Premiere stays stable                                                                                                                                                                                                                       |
| 12  | Select the inserted clip on V2, check its duration in the Info panel                                                                    | Exactly 3 s (90 frames at 30 fps, 90 at 29.97). If it is 5 s the `end` write did not apply; the `steps` entry `end set to ...` or `setting end failed` says why                                                                                                                  |
| 13  | Set Preferences > Timeline > Still Image Default Duration to 1 s, insert again on an empty track                                        | Still 3 s. This proves the clip is extended past the still default, not only trimmed                                                                                                                                                                                             |
| 14  | Change Preferences > Appearance brightness from darkest to brightest while the panel is open                                            | Header flips `dark` -> `light` and the panel restyles without reopening. If it does not, record it (F9); reopening the panel should at least pick up the new theme                                                                                                               |
| 15  | Click **Open CEP docs**                                                                                                                 | Default browser opens the Adobe-CEP/CEP-Resources GitHub page                                                                                                                                                                                                                    |
| 16  | Close all sequences, click **Refresh** then **Insert at playhead**                                                                      | `Sequence: none active`; insert logs `{"status":"no-sequence"}`                                                                                                                                                                                                                  |
| 17  | Reopen the sequence, place a clip on V2 at 5 s to 6 s, playhead 5 s, insert                                                             | Clip lands on V3 (first free track above the highest occupied one). V2's clip untouched                                                                                                                                                                                          |
| 18  | Open a 1920x1080 sequence, insert                                                                                                       | Insert works; note how the 1080x1920 Overlay is fitted (expected pillarboxed and scaled to frame height). This informs the open question on Frame-follows-sequence                                                                                                               |
| 19  | Quit Premiere, empty the OS temp folder (or reboot on win), reopen the project                                                          | The inserted `ICG comment` items go offline. This is expected with the temp location and is the reason for open question Q1; record it so the decision is grounded                                                                                                               |
| 20  | Record totals: time from clicking Insert to the clip appearing, panel memory in Activity Monitor/Task Manager (`CEPHtmlEngine` process) | Insert under 1 s, panel well under 300 MB                                                                                                                                                                                                                                        |

Copy the four filled tables (or the panel log pane contents) back into this file under Findings.

## Findings

F1. **`overwriteClip` time argument differs by documentation and sample.** The scripting guide
types the `time` parameter of `Track.overwriteClip(projectItem, time)` as "String, in ticks"
([track.md](https://github.com/docsforadobe/premiere-scripting-guide/blob/master/docs/sequence/track.md)),
while Adobe's own PProPanel sample calls `vTrack1.overwriteClip(first, now.seconds)` with a number
([Premiere.jsx](https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/jsx/PPRO/Premiere.jsx),
`overWrite`) and passes a `Time` object to `sequence.insertClip`. `icg.jsx` therefore tries
seconds, then ticks string, then the Time object, accepts the first form that puts a clip at the
playhead (within one frame), and removes a clip that lands elsewhere before trying the next form.
The chosen form comes back as `overwriteForm`; the owner's table tells us which to hardcode per
version.

F2. **Track creation only exists in the QE DOM, which Adobe calls unsupported.** There is no
`addTrack` in the documented DOM. `app.enableQE(); qe.project.getActiveSequence().addTracks(...)`
is used by the community; Adobe staff describe the QE DOM as an internal QE testing API with no
support planned
([add track thread](https://community.adobe.com/t5/premiere-pro-discussions/add-track-audio-video-to-sequence/m-p/8892706),
[follow-up](https://community.adobe.com/t5/premiere-pro-discussions/add-track-audio-video-to-sequence/m-p/14653220),
[QE sequence lookup](https://community.adobe.com/t5/premiere-pro-discussions/get-specific-sequence-with-qe-dom-extendscript/m-p/11313652)).
Reported forms: `addTracks(n)` (always also adds an audio track, and one report says it
_prepends_ video tracks) and a 7-argument form `addTracks(numVideo, videoIndex, numAudio,
audioType, audioIndex, numSubmix, submixType)` reported working on CC 2018. The adapter tries the
7-argument form with `videoIndex = numVideoTracks` (append at top, no audio), verifies the track
count, falls back to `addTracks(1)`, and re-snapshots the timeline before choosing a track, so a
prepended track still yields a correct, visible Insert. Checklist step 9 settles the behaviour on
23 and 26. If QE disappears, the fallback to evaluate is `sequence.insertClip(item, time,
numVideoTracks, numAudioTracks)` (undocumented whether it creates the track) or asking the user to
add a track.

F3. **CEP version per Premiere version, and the manifest that covers all of them.** Premiere
23 and 24 ship CEP 11, Premiere 25 (and the 25.0 beta announcement) moved to CEP 12
([CEP panel developers update for 25.0 beta](https://community.adobe.com/t5/premiere-pro-beta-discussions/cep-panel-developers-update-necessary-to-load-unsigned-panels-in-25-0-beta/m-p/14782378)).
The manifest uses `ExtensionManifest Version="7.0"` (the manifest schema version, unchanged since
CEP 7) with `RequiredRuntime Name="CSXS" Version="11.0"` (the minimum CEP), matching the CEP 11
test extension sample and the CEP 11.1 cookbook
([Adobe-CEP/CEP-Resources CEP_11.x](https://github.com/Adobe-CEP/CEP-Resources/tree/master/CEP_11.x)).
PlayerDebugMode remains supported in CEP 12 but is keyed `CSXS.12`; there is an open bug report
about it being ignored on macOS 15 with Premiere 25
([bug report](https://community.adobe.com/t5/premiere-pro-bugs/cannot-load-unsigned-cep-12-extensions-in-premiere-pro-25-on-macos-15-playerdebugmode-ignored/idi-p/15333242)).
If step 1 fails on the Premiere 26 mac cell for that reason, the S3 installer's signed bundle is
the real fix; for the spike, try a different user account or the system-wide extensions folder.

F4. **Vite output must be a classic script and assets must be read through Node.** CEP loads the
panel from `file://`. ES module scripts fail the CORS check on `file://` in Chromium and
`fetch()` does not support the `file:` scheme, so the build emits one IIFE (`format: "iife"`,
`inlineDynamicImports`, `target: "chrome88"`) and the HTML transform rewrites Vite's
`<script type="module" crossorigin>` to `<script defer>`. Vite then resolves asset URLs at runtime
from `document.currentScript.src`, which gives absolute `file:///...` URLs; `cep/assets.ts` maps
those to paths (`file:///C:/...` on win, `file:///Users/...` on mac) and reads them with
`cep_node.require("fs")`. In the browser dev server the same code falls back to `fetch`. The
PProPanel sample's `--allow-file-access-from-files` is kept in the manifest as belt and braces.

F5. **resvg-wasm renders the Overlay in-panel without system fonts, and colour emoji works by
inlining SVG.** `new Resvg(svg, { font: { fontBuffers, defaultFontFamily: "Inter" } })` with the
two bundled TTFs renders the 1080x1920 sample in 150 to 360 ms in Node (first call includes wasm
compilation; the wasm is 2.4 MB, 960 KB gzipped). Inter has no emoji glyphs; a nested
`<svg viewBox="0 0 36 36">` from Twemoji renders crisp colour emoji with no font at all, which
confirms the "emoji runs" plan in ADR 0003 and avoids a 10 MB Noto Color Emoji. The spike has no
text shaping, so run widths (and therefore the emoji x position) are estimated per character;
C3 needs real measurement (opentype.js/harfbuzzjs advance widths, or resvg `getBBox` on a probe)
before Templates can be pixel-matched.

F6. **Still duration needs two writes.** An imported PNG takes Preferences > Still Image Default
Duration (5 s by default). `icg.jsx` first calls `projectItem.setOutPoint(duration, 1)` so the
overwritten span is no longer than requested, re-reads `getInPoint/getOutPoint` to learn the real
length and refuses if that longer span is not free, then after `overwriteClip` sets
`trackItem.end` (documented read/write, [trackitem.md](https://github.com/docsforadobe/premiere-scripting-guide/blob/master/docs/item/trackitem.md))
to playhead + duration rounded to whole frames via `sequence.timebase`. `setScaleToFrameSize()` is
called so an Overlay whose Frame differs from the sequence is fitted rather than cropped; step 18
shows whether that is the behaviour we want.

F7. **Node in CEP.** `--enable-nodejs` exposes `cep_node.require/Buffer/process` without
`--mixed-context`; the adapter supports both (`window.cep_node` first, then a global `require`).
Node is 15.x in CEP 11 and 17.x in CEP 12 per the cookbooks; `fs.mkdirSync({recursive:true})` and
`writeFileSync(Uint8Array)` are available in both. `--mixed-context` was deliberately left out so
Node globals (`module`, `exports`) cannot confuse bundled UMD code.

F8. **The temp folder is the wrong permanent home for Overlay media.** Premiere links the imported
PNG by path. Writing to `os.tmpdir()/icg/` (this spike) means the clips go offline when the OS
cleans temp (step 19 demonstrates it). Production should write next to the project
(`app.project.path`'s folder, e.g. `<project>/ICG Overlays/`) or into
`CSInterface.getSystemPath(SystemPath.USER_DATA)`, and the `HostAdapter` contract already hides
that choice from the UI.

F9. **Theme.** `CSInterface.getHostEnvironment().appSkinInfo.panelBackgroundColor.color` gives the
panel background; luminance under 128 maps to `dark`. The PProPanel sample subscribes to
`com.adobe.csxs.events.ThemeColorChanged`, so Premiere does dispatch it, but whether Premiere 26
still does is step 14. `cep.util.openURLInDefaultBrowser` is what `CSInterface.openURLInDefaultBrowser`
wraps ([CSInterface.js](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/CSInterface.js)).

F10. **Sizes.** `panel.js` 342 KB (106 KB gzip), fonts 831 KB, wasm 2.4 MB, jsx 13 KB; the whole
`dist` is about 3.7 MB. Only the fonts count against the 2 MB font budget in the task.

Sources also used: the CEP 11.1 HTML Extension Cookbook
([CEP_11.x/Documentation](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/Documentation/CEP%2011.1%20HTML%20Extension%20Cookbook.md))
for the manifest format, `.debug` format, Node flags, PlayerDebugMode and extension folders; the
Premiere scripting guide pages for
[Sequence](https://github.com/docsforadobe/premiere-scripting-guide/blob/master/docs/sequence/sequence.md)
(`frameSizeHorizontal`, `timebase`, `getPlayerPosition`, `getSettings`),
[ProjectItem](https://github.com/docsforadobe/premiere-scripting-guide/blob/master/docs/item/projectitem.md)
(`setOutPoint`, `getMediaPath`, `setScaleToFrameSize`),
[Project](https://github.com/docsforadobe/premiere-scripting-guide/blob/master/docs/general/project.md)
(`importFiles`, `getInsertionBin`) and
[Time](https://github.com/docsforadobe/premiere-scripting-guide/blob/master/docs/other/time.md)
(254016000000 ticks per second).

## Open questions

Q1. Where should Overlay PNGs live permanently (F8)? Proposal: a folder beside the project file,
falling back to USER_DATA for unsaved projects, with a cleanup command in the panel.

Q2. Which `overwriteClip` argument form works on 23 and on 26 (F1)? Once the table is filled,
hardcode the form per `app.version` and keep the verification as a safety net.

Q3. Does the 7-argument `addTracks` append at the top on both versions (F2), and does Premiere 26
still expose `qe` at all? If not, which fallback: `sequence.insertClip` beyond the last index, or
ask the user to add a track.

Q4. Should the Frame follow the sequence (render at `SequenceInfo.width x height`) instead of a
fixed 1080x1920, making `setScaleToFrameSize` unnecessary? Step 18 gives the data. The renderer
already takes any Frame; it is a UI and Template decision.

Q5. Is `trackItem.end` writable on Premiere 23 and does it extend a still beyond its out point
(step 13)? If not, the fallback is `setInPoint/setOutPoint` on the project item only, which caps
the Overlay at the still default duration.

Q6. Theme change event on 26 (step 14). If it no longer fires, poll `getHostEnvironment()` on
panel focus.

Q7. Debugging workflow: do we want a dev mode where `index.html` loads `http://localhost:5173`
for HMR inside Premiere? Not built; rebuilding and reopening the panel is the loop for now.

Q8. Multiple Overlays in one Insert (C4 batch): the adapter does one import + overwrite per
Overlay; is a single undo step per batch required? ExtendScript has no undo grouping API, which
would push batch Insert towards one composite PNG per track.
