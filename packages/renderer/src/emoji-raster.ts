import { Resvg } from "@resvg/resvg-wasm";
import { bytesToDataUrl } from "./assets";
import { emojiDataUrl } from "./emoji";
import { isRendererReady } from "./wasm";

const MIN_PX = 64;
const MAX_PX = 512;

const cache = new Map<string, string>();

export function rasterBucket(px: number): number {
  let size = MIN_PX;
  while (size < px * 1.5 && size < MAX_PX) size *= 2;
  return size;
}

export function emojiHref(key: string, svg: string, px: number): string {
  if (!isRendererReady()) return emojiDataUrl(svg);
  const bucket = rasterBucket(px);
  const cacheKey = `${key}@${bucket}`;
  let href = cache.get(cacheKey);
  if (!href) {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: bucket },
      font: { loadSystemFonts: false },
    });
    try {
      const image = resvg.render();
      try {
        href = bytesToDataUrl("image/png", image.asPng());
      } finally {
        image.free();
      }
    } finally {
      resvg.free();
    }
    cache.set(cacheKey, href);
  }
  return href;
}

export const emojiRasterCacheSize = (): number => cache.size;
