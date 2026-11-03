import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import interRegularUrl from "../assets/fonts/Inter-Regular.ttf?url";
import interSemiBoldUrl from "../assets/fonts/Inter-SemiBold.ttf?url";
import fireSvg from "../assets/emoji/1f525.svg?raw";
import type { BinaryLoader } from "./cep/assets";
import { ensureWasm, type RenderAssets } from "./render/renderOverlay";

export const EMOJI_SVGS: Record<string, string> = { "🔥": fireSvg };

export async function loadRenderAssets(load: BinaryLoader): Promise<RenderAssets> {
  const [fonts] = await Promise.all([
    Promise.all([load(interRegularUrl), load(interSemiBoldUrl)]),
    ensureWasm(() => load(resvgWasmUrl)),
  ]);
  return { fonts, emoji: EMOJI_SVGS };
}
