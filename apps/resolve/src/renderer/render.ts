import type { Overlay, OverlaySpec } from "@icg/shared";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import { ReadAssetResult } from "../ipc/contract";
import { getBridge } from "./bridge";
import { commentCardSvg } from "./card";
import interRegularUrl from "./fonts/Inter-Regular.ttf?url";
import interSemiBoldUrl from "./fonts/Inter-SemiBold.ttf?url";

export type AssetSource = "fetch" | "ipc";

type LoadedAsset = { bytes: Uint8Array; source: AssetSource };

async function loadAsset(url: string): Promise<LoadedAsset> {
  const absolute = new URL(url, document.baseURI).href;
  try {
    const response = await fetch(absolute);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), source: "fetch" };
  } catch (error) {
    const bridge = getBridge();
    if (!bridge) throw error;
    return { bytes: ReadAssetResult.parse(await bridge.readAsset(absolute)), source: "ipc" };
  }
}

export type Renderer = {
  assetSource: AssetSource;
  render(spec: OverlaySpec): { overlay: Overlay; svg: string; ms: number };
};

let renderer: Promise<Renderer> | null = null;

export function getRenderer(): Promise<Renderer> {
  renderer ??= createRenderer();
  return renderer;
}

async function createRenderer(): Promise<Renderer> {
  const [wasm, regular, semiBold] = await Promise.all([
    loadAsset(wasmUrl),
    loadAsset(interRegularUrl),
    loadAsset(interSemiBoldUrl),
  ]);
  await initWasm(wasm.bytes);
  const fontBuffers = [regular.bytes, semiBold.bytes];
  return {
    assetSource: wasm.source,
    render(spec) {
      const started = performance.now();
      const svg = commentCardSvg(spec);
      const image = new Resvg(svg, {
        fitTo: { mode: "original" },
        background: "rgba(0, 0, 0, 0)",
        font: { fontBuffers, defaultFontFamily: "Inter" },
      });
      const png = image.render().asPng();
      image.free();
      return {
        overlay: { png, frame: spec.frame, spec },
        svg,
        ms: Math.round(performance.now() - started),
      };
    },
  };
}
