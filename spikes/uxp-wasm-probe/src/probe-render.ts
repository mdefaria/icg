import { Resvg } from "@resvg/resvg-wasm";
import { now } from "./now.js";

export const PROBE_WIDTH = 640;
export const PROBE_HEIGHT = 200;

/** A comment-card lookalike: transparent Frame, white card, text set in Inter. */
export const PROBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PROBE_WIDTH}" height="${PROBE_HEIGHT}" viewBox="0 0 ${PROBE_WIDTH} ${PROBE_HEIGHT}">
  <rect x="16" y="16" width="608" height="168" rx="24" fill="#ffffff"/>
  <circle cx="64" cy="72" r="24" fill="#4f7cff"/>
  <text x="104" y="66" font-family="Inter" font-size="22" fill="#111111">uxp_probe</text>
  <text x="104" y="92" font-family="Inter" font-size="16" fill="#777777">2h · resvg-wasm inside Premiere UXP</text>
  <text x="40" y="144" font-family="Inter" font-size="24" fill="#111111">Synchronous WebAssembly.Instance works, ñ ä ø</text>
</svg>`;

export type ProbeRender = {
  png: Uint8Array;
  width: number;
  height: number;
  renderMs: number;
};

/** Render the probe SVG with the given font buffers only; system fonts are never consulted. */
export function renderProbe(fontBuffers: Uint8Array[]): ProbeRender {
  const t0 = now();
  const resvg = new Resvg(PROBE_SVG, {
    font: {
      fontBuffers,
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
      sansSerifFamily: "Inter",
    },
    languages: ["en"],
  });
  const image = resvg.render();
  const result: ProbeRender = {
    png: image.asPng(),
    width: image.width,
    height: image.height,
    renderMs: now() - t0,
  };
  image.free();
  resvg.free();
  return result;
}
