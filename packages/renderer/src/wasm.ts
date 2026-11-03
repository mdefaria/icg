import { initWasm } from "@resvg/resvg-wasm";

export type WasmSource = Parameters<typeof initWasm>[0];

let ready: Promise<void> | undefined;
let initialised = false;

export function initRenderer(source?: WasmSource): Promise<void> {
  if (!ready) {
    ready = initWasm(source ?? loadBundledWasm()).then(() => {
      initialised = true;
    });
  }
  return ready;
}

export const isRendererReady = (): boolean => initialised;

async function loadBundledWasm(): Promise<BufferSource> {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const path = require.resolve("@resvg/resvg-wasm/index_bg.wasm");
  return readFile(path);
}
