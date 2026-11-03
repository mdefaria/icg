import { Resvg } from "@resvg/resvg-wasm";
import { bytesToDataUrl } from "./bytes";
import { emojiDataUrl } from "./emoji";
import { isRendererReady } from "./wasm";

const MIN_PX = 64;
const MAX_PX = 512;
const MAX_ENTRIES = 2048;

const cache = new Map<string, string | null>();

export function rasterBucket(px: number): number {
  let size = MIN_PX;
  while (size < px * 1.5 && size < MAX_PX) size *= 2;
  return size;
}

function rasterise(svg: string, bucket: number): string | null {
  let resvg: InstanceType<typeof Resvg> | undefined;
  try {
    resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: bucket },
      font: { loadSystemFonts: false },
    });
    const image = resvg.render();
    const href = bytesToDataUrl("image/png", image.asPng());
    image.free();
    resvg.free();
    return href;
  } catch {
    return null;
  }
}

export function emojiHref(key: string, svg: string, px: number): string | undefined {
  if (!isRendererReady()) return emojiDataUrl(svg);
  const cacheKey = `${key}@${rasterBucket(px)}`;
  let href = cache.get(cacheKey);
  if (href !== undefined) {
    cache.delete(cacheKey);
  } else {
    href = rasterise(svg, rasterBucket(px));
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  cache.set(cacheKey, href);
  return href ?? undefined;
}

export function emojiRenderable(key: string, svg: string): boolean {
  if (!isRendererReady()) return true;
  return emojiHref(key, svg, MIN_PX / 1.5) !== undefined;
}

export const emojiRasterCacheSize = (): number => cache.size;

export const clearEmojiRasterCache = (): void => cache.clear();
