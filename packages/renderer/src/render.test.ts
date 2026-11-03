import { FRAME_PRESETS, type Comment, type OverlaySpec } from "@icg/shared";
import { Resvg } from "@resvg/resvg-wasm";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { sampleComment } from "./fixtures";
import { loadNodeAssets } from "./node-assets";
import {
  buildCard,
  layoutCommentSvg,
  overlaySvg,
  prepareComment,
  renderCommentSvg,
  renderOverlay,
  renderOverlays,
} from "./render";
import { initRenderer } from "./wasm";

const assets = loadNodeAssets();
const comment = sampleComment("instagram", "en", 0);
const template = { platform: "instagram", theme: "dark", variant: "single" } as const;

const textOf = (svg: string) =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join("|");

describe("renderCommentSvg", () => {
  beforeAll(async () => {
    await prepareComment(comment, template, assets);
  });

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

  it("reports emoji missing from every set", async () => {
    const c = { ...comment, text: "🦖 rare" };
    await prepareComment(c, template, assets);
    expect(buildCard(c, template, assets).missingEmoji).toEqual(["🦖"]);
    expect(assets.emoji.missingEmoji()).toContain("🦖");
  });

  it("reports text the bundled fonts cannot draw", () => {
    const body = buildCard({ ...comment, text: "好看 ok" }, template, assets);
    expect(body.unsupportedText).toEqual(["好", "看"]);
  });

  it("uses Roboto for YouTube and Inter elsewhere", () => {
    expect(renderCommentSvg(comment, { ...template, platform: "youtube" }, 1, assets)).toContain(
      'font-family="Roboto"',
    );
    expect(renderCommentSvg(comment, template, 1, assets)).toContain('font-family="Inter"');
  });

  it("takes UI copy from the language", () => {
    const tiktok = { platform: "tiktok", theme: "light", variant: "creator-reply" } as const;
    const en = textOf(renderCommentSvg(comment, tiktok, 1, assets));
    const es = textOf(renderCommentSvg(comment, tiktok, 1, assets, { language: "es" }));
    expect(en).toContain("Reply");
    expect(en).toContain("Creator");
    expect(en).toContain("Liked by creator");
    expect(es).toContain("Responder");
    expect(es).toContain("Creador");
    expect(es).toContain("Le gusta al creador");
    expect(es).toContain("Fijado");
    const ig = textOf(
      renderCommentSvg(comment, { ...tiktok, platform: "instagram" }, 1, assets, {
        language: "es",
        seeTranslation: true,
      }),
    );
    expect(ig).toContain("Autor");
    expect(ig).toContain("Ver traducción");
  });

  it("uses the Comment's counts on X and derives them when absent", () => {
    const x = { platform: "x", theme: "dark", variant: "single" } as const;
    const given: Comment = { ...comment, likes: 500, replies: 7, reposts: 1234, views: 98_765 };
    const withCounts = textOf(renderCommentSvg(given, x, 1, assets));
    expect(withCounts).toContain("|7|1,234|500|98.7K");
    const derived = textOf(renderCommentSvg({ ...given, replies: undefined }, x, 1, assets));
    expect(derived).toContain("|40|");
  });

  it("shows YouTube reply counts from the Comment", () => {
    const yt = { platform: "youtube", theme: "light", variant: "single" } as const;
    expect(textOf(renderCommentSvg({ ...comment, replies: 1500 }, yt, 1, assets))).toContain(
      "1.5K replies",
    );
    expect(textOf(renderCommentSvg(comment, yt, 1, assets))).toContain("1 reply");
  });

  it("draws no background in the transparent card style", () => {
    const sheet = renderCommentSvg(comment, template, 1, assets);
    const bare = renderCommentSvg(comment, template, 1, assets, { card: "transparent" });
    expect(sheet).toContain('fill="#262626"');
    expect(bare).not.toMatch(/<rect x="0" y="0"/);
    expect(bare.length).toBeLessThan(sheet.length);
  });
});

describe("renderOverlay", () => {
  beforeAll(async () => {
    await initRenderer();
  });

  const spec: OverlaySpec = {
    comment,
    template,
    frame: FRAME_PRESETS["1:1"],
    placement: { x: 0.5, y: 0.5, scale: 0.5 },
  };

  it("renders a transparent full-Frame PNG with the card at the Placement", async () => {
    const overlay = await renderOverlay(spec, assets);
    const png = PNG.sync.read(Buffer.from(overlay.png));
    expect([png.width, png.height]).toEqual([1080, 1080]);
    const alphaAt = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3];
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(540, 540)).toBe(255);
    expect(overlay.missingEmoji).toEqual([]);
    expect(overlay.missingAvatars).toEqual([]);
  });

  it("matches a whole-Frame resvg render, including a Placement partly off the Frame", async () => {
    const offFrame = { ...spec, placement: { x: 0.95, y: 0.1, scale: 1.1 } };
    for (const s of [spec, offFrame]) {
      const fast = PNG.sync.read(Buffer.from((await renderOverlay(s, assets)).png));
      const r = new Resvg(overlaySvg(s, assets), {
        font: { fontBuffers: assets.fonts.buffers(), loadSystemFonts: false },
      });
      const reference = PNG.sync.read(Buffer.from(r.render().asPng()));
      r.free();
      const diff = pixelmatch(fast.data, reference.data, undefined, 1080, 1080, {
        threshold: 0.05,
      });
      expect(diff).toBeLessThan(20);
    }
  });

  it("renders an empty Frame when the card is entirely outside it", async () => {
    const overlay = await renderOverlay(
      { ...spec, placement: { x: 0, y: 0, scale: 0.05 }, frame: { width: 2000, height: 2000 } },
      assets,
    );
    const png = PNG.sync.read(Buffer.from(overlay.png));
    expect(png.width).toBe(2000);
  });

  it("rejects a spec that does not parse", async () => {
    await expect(
      renderOverlay({ ...spec, placement: { x: 1.5, y: 0.5, scale: 1 } }, assets),
    ).rejects.toThrow();
  });

  it("batches several specs in order", async () => {
    const overlays = await renderOverlays(
      [spec, { ...spec, template: { ...template, platform: "x" }, language: "es" }],
      assets,
      { card: "transparent" },
    );
    expect(overlays.map((o) => o.spec.template.platform)).toEqual(["instagram", "x"]);
    expect(overlays[1]!.spec.language).toBe("es");
  });
});
