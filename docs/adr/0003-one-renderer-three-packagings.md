---
status: accepted
---

# One SVG renderer (resvg-wasm) in every Host

Overlays are rendered from SVG Templates by resvg compiled to WebAssembly, with bundled fonts (Inter/Roboto substitutes, Noto Color Emoji, Twemoji for X). The same WASM module runs in the web app, inside the Premiere CEP panel (Chromium) and inside the Resolve Workflow Integration plugin (Electron). We needed a renderer that works offline in every Host and produces pixel-identical output; HTML-to-image approaches differ per browser engine and depend on installed fonts, and a server renderer would break offline use. The native resvg Node module is kept as an option for Resolve only if profiling shows WASM too slow at 4K.

## Consequences

- Overlays are full-Frame PNGs with the Comment composited at its Placement, so no Host needs transform maths.
- Template work is SVG plus a small layout step in TypeScript (text wrapping, emoji runs); nothing Host-specific.
- When Premiere moves to UXP (ADR 0005) the renderer is the open problem: UXP cannot rasterise in-panel, so the port needs either confirmed WASM support in UXP or a hybrid C++ addon wrapping the same resvg.
