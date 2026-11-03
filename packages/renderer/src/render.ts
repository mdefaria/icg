import { Resvg } from "@resvg/resvg-wasm";
import { OverlaySpec, type Comment, type Overlay, type Template } from "@icg/shared";
import type { RenderAssets } from "./assets";
import { emojiSetFor } from "./emoji";
import type { FontFamily } from "./fonts";
import { n } from "./svg";
import { CardCtx, type CardBody } from "./templates/card";
import { buildInstagram } from "./templates/instagram";
import { buildTikTok } from "./templates/tiktok";
import { buildX } from "./templates/x";
import { buildYouTube } from "./templates/youtube";
import { initRenderer } from "./wasm";

export const DENSITY = 3;

let defaults: RenderAssets | undefined;

export function setDefaultAssets(assets: RenderAssets): void {
  defaults = assets;
}

function resolveAssets(assets?: RenderAssets): RenderAssets {
  const chosen = assets ?? defaults;
  if (!chosen) throw new Error("renderer assets missing: pass assets or call setDefaultAssets()");
  return chosen;
}

const BUILDERS = {
  tiktok: buildTikTok,
  instagram: buildInstagram,
  youtube: buildYouTube,
  x: buildX,
} as const satisfies Record<Template["platform"], (ctx: CardCtx) => CardBody>;

export const fontFamilyFor = (platform: Template["platform"]): FontFamily =>
  platform === "youtube" ? "Roboto" : "Inter";

export type CardSvg = {
  svg: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
};

export function buildCard(
  comment: Comment,
  template: Template,
  assets?: RenderAssets,
  scale = 1,
): CardBody {
  const a = resolveAssets(assets);
  const ctx = new CardCtx(
    comment,
    template,
    a.locale ?? "en",
    a,
    fontFamilyFor(template.platform),
    emojiSetFor(template.platform),
    DENSITY * scale,
  );
  const built = BUILDERS[template.platform](ctx);
  return { ...built, missingEmoji: [...ctx.missingEmoji] };
}

export function layoutCommentSvg(
  comment: Comment,
  template: Template,
  scale: number,
  assets?: RenderAssets,
): CardSvg {
  const body = buildCard(comment, template, assets, scale);
  const k = DENSITY * scale;
  const width = body.width * k;
  const height = body.height * k;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(body.width)} ${n(body.height)}">${body.body}</svg>`;
  return {
    svg,
    width,
    height,
    naturalWidth: body.width * DENSITY,
    naturalHeight: body.height * DENSITY,
  };
}

export function renderCommentSvg(
  comment: Comment,
  template: Template,
  scale: number,
  assets?: RenderAssets,
): string {
  return layoutCommentSvg(comment, template, scale, assets).svg;
}

export function overlaySvg(spec: OverlaySpec, assets?: RenderAssets): string {
  const body = buildCard(spec.comment, spec.template, assets, spec.placement.scale);
  const k = DENSITY * spec.placement.scale;
  const w = body.width * k;
  const h = body.height * k;
  const tx = spec.placement.x * spec.frame.width - w / 2;
  const ty = spec.placement.y * spec.frame.height - h / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.frame.width}" height="${spec.frame.height}" viewBox="0 0 ${spec.frame.width} ${spec.frame.height}"><g transform="translate(${n(tx)} ${n(ty)}) scale(${n(k)})">${body.body}</g></svg>`;
}

function resvgOptions(assets: RenderAssets, platform: Template["platform"]) {
  return {
    font: {
      fontBuffers: assets.fonts.buffers(),
      loadSystemFonts: false,
      defaultFontFamily: fontFamilyFor(platform),
    },
  };
}

export async function rasterise(
  svg: string,
  assets: RenderAssets,
  platform: Template["platform"],
): Promise<Uint8Array> {
  await initRenderer();
  const resvg = new Resvg(svg, resvgOptions(assets, platform));
  try {
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}

export async function renderOverlay(spec: OverlaySpec, assets: RenderAssets): Promise<Overlay> {
  const parsed = OverlaySpec.parse(spec);
  await initRenderer();
  const svg = overlaySvg(parsed, assets);
  const png = await rasterise(svg, assets, parsed.template.platform);
  return { png, frame: parsed.frame, spec: parsed };
}

export async function renderCommentPng(
  comment: Comment,
  template: Template,
  scale: number,
  assets: RenderAssets,
): Promise<Uint8Array> {
  await initRenderer();
  const { svg } = layoutCommentSvg(comment, template, scale, assets);
  return rasterise(svg, assets, template.platform);
}
