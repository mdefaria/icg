# S8: can resvg-wasm run inside a Premiere Pro UXP plugin?

Informational probe, one-day hard stop (PLAN.md section 6, ADR 0003, ADR 0005). It does not ship anything; it exists to scope the UXP port due before December 2028.

## Goal

Answer one question on a real machine: inside a Premiere Pro UXP panel, can the same `@resvg/resvg-wasm` module the web, CEP and Resolve shells use be instantiated with UXP's synchronous WebAssembly API, render an SVG with a bundled font to PNG, write that PNG to `plugin-temp:/` and show it in an `<img>`? The answer decides whether the UXP port needs a native (C++ hybrid addon) rasteriser or not.

Facts taken as given, not re-researched: UXP has no canvas text/image/pixel APIs and no `@font-face`; WebAssembly works in UXP only through `new WebAssembly.Module(bytes)` + `new WebAssembly.Instance(module, imports)`, no async `WebAssembly.instantiate`, no Workers, single thread; `require("fs")` writes binary files to `plugin-temp:/`; `<img src>` takes a UXP File entry or a path; Premiere 25.6+ ships UXP 8.1+.

## What was built

Everything lives in `spikes/uxp-wasm-probe/`; it is a workspace package (`spikes/*` was added to `pnpm-workspace.yaml`) so `pnpm check` lints, typechecks and tests it with the rest of the repo.

- `src/sync-init.ts`: `initResvgSync(bytes)`. The glue problem and the fix are described under Findings.
- `src/probe-render.ts`: the hardcoded 640x200 comment-card SVG (white card, avatar circle, three lines of text in Inter) and `renderProbe(fontBuffers)`, which renders it with `loadSystemFonts: false` and returns PNG bytes plus timing.
- `plugin-src/`: the UXP plugin sources. `manifest.json` (manifestVersion 5, host `premierepro` minVersion 25.6.0, `requiredPermissions.localFileSystem: "plugin"`, one panel entrypoint), `index.html` (button, log `<pre>`, `<img>`; flexbox only), `index.js` (plain JS, no framework; bundled to a classic IIFE script). On click it prints the environment (host and UXP versions, presence of `WebAssembly.Module`, `WebAssembly.instantiate`, `TextEncoder`, `TextDecoder`, `performance.now`, `btoa`), reads `index_bg.wasm` and `Inter-Regular.ttf` from the plugin folder as ArrayBuffers via `uxp.storage.localFileSystem`, runs `initResvgSync`, renders, writes `plugin-temp:/probe.png` with `require("fs").writeFile` (falls back to `File.write` from the storage API and says so), then tries to show the PNG by path, by File entry, then by data URL, reporting which one loaded. Every step prints its duration; any error prints its stack and `RESULT: FAIL`.
- `build.mjs`: esbuild bundles `plugin-src/index.js` and copies the manifest, HTML, the `.wasm` from `node_modules`, the font and its OFL licence into `dist/plugin/`. Panel icons are rendered by resvg at build time so no binary is committed.
- `src/probe.node.test.ts`: vitest harness. It replaces `WebAssembly.instantiate` with a rejecting function to simulate UXP, runs `initResvgSync`, asserts the shim was the path taken and was removed afterwards, renders with the bundled font and checks PNG signature and IHDR dimensions, and checks that rendering with no font produces visibly less PNG data (proof that the font buffer was actually used for shaping).
- `fonts/Inter-Regular.ttf` (Inter 4.1, static Regular, OFL; licence beside it).

Commands, from the repo root after `pnpm install`:

```
pnpm --filter @icg/spike-uxp-wasm-probe test    # Node harness, also run by `pnpm check`
pnpm --filter @icg/spike-uxp-wasm-probe build   # writes spikes/uxp-wasm-probe/dist/plugin/
```

## Owner checklist (needs Premiere Pro 26.x, mac and win)

1. `pnpm install && pnpm --filter @icg/spike-uxp-wasm-probe build`. Confirm `dist/plugin/` holds `manifest.json`, `index.html`, `index.js`, `index_bg.wasm` (about 2.4 MB), `Inter-Regular.ttf`, `icons/`.
2. Open Adobe UXP Developer Tool (UDT), with Premiere Pro 26.x running. Add Plugin, pick `dist/plugin/manifest.json`. If UDT rejects the manifest, note the exact message; the likely culprits are the host app id (`premierepro`) or the icon entry, both trivial to adjust.
3. Load the plugin (UDT: `...` > Load). Open the panel: Window > Extensions (UXP) > ICG WASM Probe, or wherever Premiere 26 lists UXP panels.
4. In UDT, open Debug for the plugin so the console is visible; every log line is mirrored to the console with a `[wasm-probe]` prefix.
5. Click "Run probe" once. Wait for the status next to the button to read PASS or FAIL.
6. Click "Run probe" a second time. The log should say the wasm instance is being reused and render again.
7. Repeat on the other OS.

Expected outcomes, in order of appearance in the log:

- Environment line shows `WebAssembly: object, .Module: function`. `.instantiate` may be `function` or `undefined`; both are fine, the probe never calls the native one.
- `read index_bg.wasm 2478606 B and Inter-Regular.ttf 411640 B in N ms`.
- `new WebAssembly.Module: N ms` and `new WebAssembly.Instance (via shim ...): N ms`. Node baseline on a Linux container: about 6 ms and 0.5 ms (V8 compiles lazily; a UXP build with a different V8 configuration may take hundreds of ms on the first click, which is acceptable).
- `render 640x200 PNG ~15300 B in N ms`. Node baseline: about 55 ms first render.
- `wrote plugin-temp:/probe.png via fs.writeFile in N ms`.
- `img: loaded from path plugin-temp:/probe.png` (or from File entry, or data URL; which one is a finding).
- `RESULT: PASS` and a white comment card with "uxp_probe" and "Synchronous WebAssembly.Instance works, ñ ä ø" set in Inter on a grey background in the panel.

What to screenshot and attach to the PLAN item: the whole panel after the first click (log plus image) on each OS, the UDT console if anything is red, and, if the status is FAIL, the full stack from the log. Also note the Premiere build number and the `uxp:` version from the environment line.

Partial results are informative too:

- FAIL at `new WebAssembly.Module`: UXP's WebAssembly cannot compile a 2.4 MB module synchronously (size limit or missing feature). Record the error text; check whether a tiny module compiles by pasting `new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))` into the UDT console.
- FAIL mentioning `TextEncoder`/`TextDecoder`: the glue needs them for string passing; a 30-line polyfill fixes it and the rest of the probe should be re-run.
- FAIL at `Could not replace WebAssembly.instantiate`: UXP froze the `WebAssembly` object. Use the vendored-glue fallback under Findings and rebuild.
- PASS for render and write but the `<img>` shows nothing: the rendering question is answered yes; only the preview path needs work.

## What the result means for the UXP port

- WASM works (PASS, or PASS except for the `<img>` path): the UXP port needs no native addon. `packages/renderer`'s WASM wrapper gains a synchronous init entry point (the shim below, or an `initSync` upstream), fonts are read from the plugin folder instead of fetched, and the Overlay PNG is written to `plugin-temp:/` and imported from there. ADR 0003's open problem closes, and the port's minimum version stays at the UXP GA line (Premiere 25.6) rather than the hybrid-addon line (26.2). Timing on the owner's machines says whether a 1080p or 4K Frame is acceptable on one thread; if the first `new WebAssembly.Module` is slow, compile once at panel load, not on first Insert.
- WASM fails (FAIL at Module or Instance that no polyfill fixes): the port needs a hybrid C++ addon wrapping the same resvg (`resvg` crate behind a thin C API, built per OS and architecture), which raises the UXP minimum to Premiere 26.2 and adds a native build matrix to CI. Write a new ADR superseding the relevant part of 0003 before scheduling that work.

## Findings (from the Node side; nothing here has run in Premiere yet)

- `@resvg/resvg-wasm` 2.6.2 exports only `initWasm` (async) and `Resvg`. Its bundled wasm-bindgen glue has no `initSync`, and the imports object (`__wbg_get_imports`) and finaliser are module-private, so an Instance constructed outside the package cannot be handed in.
- `initWasm` accepts a precompiled `WebAssembly.Module`. When given one, the glue calls `await WebAssembly.instantiate(module, imports)`, which is the one call UXP cannot make. `initResvgSync` therefore compiles with `new WebAssembly.Module(bytes)`, installs a replacement `WebAssembly.instantiate` for the duration of `initWasm` that runs `new WebAssembly.Instance(module, imports)` synchronously and returns it in an already-resolved Promise, then restores whatever was there (or removes the property if nothing was). The package is used unmodified. The only asynchrony left is `await` on already-resolved values, which is microtask plumbing every UXP version has. The function verifies the shim was actually hit and throws otherwise, so a future glue version cannot silently turn the probe into an async test.
- Fallback if the `WebAssembly` object turns out to be frozen in UXP: vendor `node_modules/@resvg/resvg-wasm/index.mjs` into `plugin-src/` and replace the single line `const instance = await WebAssembly.instantiate(module, imports);` in `__wbg_load` with `const instance = new WebAssembly.Instance(module, imports);`, then import that file instead of the package. Nothing else in the glue needs to change.
- The Node harness passes with `WebAssembly.instantiate` poisoned, so the synchronous path is sufficient for the whole module, not just for instantiation: the glue makes no further async calls after init.
- Node timings (Linux container, Node 22, first call): compile 5.7 ms, instantiate 0.5 ms, render 55 ms for 640x200 with one 411 KB font buffer, PNG 15.3 KB. The 2.4 MB module compiles synchronously without complaint in V8; UXP also runs V8, so a size limit is not expected but is exactly what the first checklist item tests.
- `loadSystemFonts: false` with `fontBuffers` is the right configuration for UXP: the wasm build cannot read system font directories anyway, and the probe confirms text shapes from the buffer alone (PNG with the font is measurably larger than without).
- esbuild `format: "iife", platform: "browser"` with `uxp` and `fs` marked external emits `__require("uxp")`, which dispatches to the global `require` when present, so the bundle needs no UXP-specific loader tricks. `plugin-src/index.js` imports the TypeScript helpers from `src/` directly; esbuild resolves them, tsc never sees the JS file.

## Open questions

- Does UXP's V8 compile a 2.4 MB module synchronously on the main thread without a size cap (browsers cap sync compile at 4 KB; Node and, per prior research, UXP do not)? First checklist item.
- Does `TextEncoder`/`TextDecoder` exist in UXP 8.1 on both OSes? If not, polyfill and re-run.
- Which `<img src>` form actually displays a file from `plugin-temp:/` in Premiere 26: path, File entry or data URL? The probe tries all three and reports.
- Memory: the wasm instance grows its linear memory per render; a 4K Overlay (3840x2160x4 bytes RGBA plus PNG encode) in a single-threaded panel may be slow or hit a UXP memory ceiling. Not measured here; worth a second click with a larger SVG once the basic probe passes.
- Whether the host app id for Premiere in manifest v5 is `premierepro` on the installed UDT version; UDT's validation message will say.
- Colour emoji: not part of this probe. If the port goes WASM, the CEP shell's emoji font path (ADR 0003) should be re-run in UXP since font buffers are the only input.
