import type { Overlay, OverlaySpec } from "@icg/shared";
import { Resvg, initWasm, type InitInput } from "@resvg/resvg-wasm";
import { commentCardSvg, type EmojiAssets } from "./commentCard";

export type RenderAssets = {
  fonts: Uint8Array[];
  emoji: EmojiAssets;
};

let wasmReady: Promise<void> | null = null;

export function ensureWasm(load: () => Promise<InitInput>): Promise<void> {
  if (!wasmReady) {
    wasmReady = load()
      .then((input) => initWasm(input))
      .catch((error: unknown) => {
        wasmReady = null;
        throw error;
      });
  }
  return wasmReady;
}

export function renderOverlay(spec: OverlaySpec, assets: RenderAssets): Overlay {
  const svg = commentCardSvg(spec, assets.emoji);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { fontBuffers: assets.fonts, defaultFontFamily: "Inter" },
  });
  const image = resvg.render();
  const png = image.asPng();
  image.free();
  resvg.free();
  return { png, frame: spec.frame, spec };
}
