import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { PROBE_HEIGHT, PROBE_WIDTH, renderProbe } from "./probe-render.js";
import { initResvgSync, type SyncInitReport } from "./sync-init.js";

const require = createRequire(import.meta.url);
const wasmBytes = readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
const fontBytes = readFileSync(new URL("../fonts/Inter-Regular.ttf", import.meta.url));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("resvg-wasm through the synchronous WebAssembly path UXP allows", () => {
  let report: SyncInitReport;
  const poisoned = (() =>
    Promise.reject(
      new Error("async WebAssembly.instantiate is unavailable (UXP simulation)"),
    )) as unknown as typeof WebAssembly.instantiate;

  beforeAll(async () => {
    const native = Object.getOwnPropertyDescriptor(WebAssembly, "instantiate");
    Object.defineProperty(WebAssembly, "instantiate", {
      value: poisoned,
      configurable: true,
      writable: true,
    });
    try {
      report = await initResvgSync(wasmBytes);
      expect(WebAssembly.instantiate, "shim must be removed after init").toBe(poisoned);
    } finally {
      if (native) Object.defineProperty(WebAssembly, "instantiate", native);
    }
  });

  it("instantiates with new WebAssembly.Module + new WebAssembly.Instance only", () => {
    expect(report.shimUsed).toBe(true);
    expect(report.hadNativeInstantiate).toBe(true);
    expect(report.compileMs).toBeGreaterThanOrEqual(0);
    expect(report.instantiateMs).toBeGreaterThanOrEqual(0);
  });

  it("renders the probe SVG with the bundled Inter font to a PNG of the expected size", () => {
    const { png, width, height, renderMs } = renderProbe([fontBytes]);
    console.info(
      `node baseline: compile ${report.compileMs.toFixed(1)} ms, instantiate ${report.instantiateMs.toFixed(1)} ms, render ${renderMs.toFixed(1)} ms, png ${png.byteLength} B`,
    );
    expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect({ width, height }).toEqual({ width: PROBE_WIDTH, height: PROBE_HEIGHT });
    expect(pngSize(png)).toEqual({ width: PROBE_WIDTH, height: PROBE_HEIGHT });
    expect(renderMs).toBeGreaterThanOrEqual(0);
  });

  it("actually shapes text with the bundled font (no font => visibly less PNG data)", () => {
    const withFont = renderProbe([fontBytes]);
    const withoutFont = renderProbe([]);
    expect(withFont.png.byteLength).toBeGreaterThan(withoutFont.png.byteLength);
  });
});
