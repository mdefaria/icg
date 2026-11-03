import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { commentCardSvg } from "./card";
import { SAMPLE_SPEC } from "./sample";

const here = new URL(".", import.meta.url);
const wasmPath = createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");

let fontBuffers: Uint8Array[] = [];

beforeAll(async () => {
  await initWasm(await readFile(wasmPath));
  fontBuffers = [
    new Uint8Array(await readFile(new URL("./fonts/Inter-Regular.ttf", here))),
    new Uint8Array(await readFile(new URL("./fonts/Inter-SemiBold.ttf", here))),
  ];
});

function pngDimensions(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("rendering the sample Comment with resvg-wasm and bundled Inter", () => {
  it("produces a transparent full-Frame PNG with the card drawn in it", async () => {
    const image = new Resvg(commentCardSvg(SAMPLE_SPEC), {
      fitTo: { mode: "original" },
      background: "rgba(0, 0, 0, 0)",
      font: { fontBuffers, defaultFontFamily: "Inter" },
    });
    const rendered = image.render();
    const png = rendered.asPng();
    const pixels = rendered.pixels;
    const { width, height } = rendered;

    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngDimensions(png)).toEqual({ width: 1080, height: 1920 });

    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3]!;
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(width - 1, height - 1)).toBe(0);
    expect(alphaAt(540, Math.round(height * 0.7))).toBeGreaterThan(200);

    if (process.env.ICG_RENDER_OUT) await writeFile(process.env.ICG_RENDER_OUT, png);
    image.free();
  });
});
