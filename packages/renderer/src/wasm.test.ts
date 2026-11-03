import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-wasm";
import { describe, expect, it } from "vitest";
import { initRenderer, isRendererReady } from "./wasm";

describe("initRenderer", () => {
  it("initialises from an ArrayBuffer and only once", async () => {
    const path = createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");
    const bytes = readFileSync(path);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(isRendererReady()).toBe(false);
    await initRenderer(buffer);
    expect(isRendererReady()).toBe(true);
    await initRenderer(new URL("https://example.invalid/never-fetched.wasm"));
    const r = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
    expect(r.width).toBe(4);
    r.free();
  });
});
