import { FRAME_PRESETS } from "@icg/shared";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { sampleComment } from "./fixtures";
import { loadNodeAssets } from "./node-assets";
import { buildCard, layoutCommentSvg, renderCommentSvg, renderOverlay } from "./render";
import { initRenderer } from "./wasm";

const assets = loadNodeAssets();
const comment = sampleComment("instagram", "en", 0);
const template = { platform: "instagram", theme: "dark", variant: "single" } as const;

describe("renderCommentSvg", () => {
  it("returns a standalone SVG sized at 3 px per pt times scale", () => {
    const svg = renderCommentSvg(comment, template, 1, assets);
    expect(svg.startsWith("<svg")).toBe(true);
    const { width, naturalWidth } = layoutCommentSvg(comment, template, 0.5, assets);
    expect(naturalWidth).toBe(344 * 3);
    expect(width).toBe(344 * 1.5);
  });

  it("inlines emoji as images and never falls back to tofu", () => {
    const svg = renderCommentSvg(comment, template, 1, assets);
    expect(svg).toMatch(/href="data:image\/(svg\+xml|png);base64,/);
    expect(svg).not.toContain("😭");
  });

  it("reports emoji missing from the loader", () => {
    const built = buildCard({ ...comment, text: "🦖 rare" }, template, assets);
    expect(built.missingEmoji).toEqual(["🦖"]);
  });

  it("uses Roboto for YouTube and Inter elsewhere", () => {
    expect(renderCommentSvg(comment, { ...template, platform: "youtube" }, 1, assets)).toContain(
      'font-family="Roboto"',
    );
    expect(renderCommentSvg(comment, template, 1, assets)).toContain('font-family="Inter"');
  });
});

describe("renderOverlay", () => {
  beforeAll(async () => {
    await initRenderer();
  });

  it("renders a transparent full-Frame PNG with the card at the Placement", async () => {
    const overlay = await renderOverlay(
      { comment, template, frame: FRAME_PRESETS["1:1"], placement: { x: 0.5, y: 0.5, scale: 0.5 } },
      assets,
    );
    const png = PNG.sync.read(Buffer.from(overlay.png));
    expect([png.width, png.height]).toEqual([1080, 1080]);
    const alphaAt = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3];
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(540, 540)).toBe(255);
  });

  it("rejects a spec that does not parse", async () => {
    await expect(
      renderOverlay(
        { comment, template, frame: FRAME_PRESETS["1:1"], placement: { x: 1.5, y: 0.5, scale: 1 } },
        assets,
      ),
    ).rejects.toThrow();
  });
});
