---
status: accepted
---
# One SVG renderer (resvg) packaged three ways

Overlays are rendered from SVG Templates by resvg with bundled fonts (Inter/Roboto substitutes, Noto Color Emoji, Twemoji for X). The same renderer ships as WASM in the web app, as a native Node module inside the Resolve Workflow Integration plugin (Electron), and as a hybrid C++ addon inside the Premiere UXP plugin. We needed a renderer that runs offline in every Host and produces pixel-identical output, and the Premiere UXP panel cannot rasterise anything itself: its canvas has no text, image or pixel-export APIs, `@font-face` is unsupported, and a localhost helper process is blocked on macOS. Hybrid addons (Premiere 26.2+) are the only officially supported offline path there. A one-day WebAssembly probe runs first; if resvg-WASM works in Premiere on both OSes, the hybrid addon is dropped.

## Consequences

- Minimum Premiere Pro is 26.2 while the hybrid addon is in use.
- The addon does exactly one thing: SVG and font bytes in, PNG bytes out. All layout and logic stay in TypeScript so a renderer bug cannot take Premiere down.
- Native builds for macOS arm64/x64 and Windows x64 run in CI; the macOS binary is Developer ID signed and notarised.
- Overlays are full-Frame PNGs with the Comment composited at its Placement, so no Host needs transform maths.
