import { Resvg } from "@resvg/resvg-wasm";
import {
  OverlaySpec,
  type Avatar,
  type Comment,
  type Language,
  type Overlay,
  type Template,
} from "@icg/shared";
import { z } from "zod";
import type { RenderAssets } from "./assets";
import { emojiFileName, emojiSequences, emojiSetFor, otherEmojiSet } from "./emoji";
import { emojiRenderable } from "./emoji-raster";
import type { BundledFamily } from "./fonts";
import { encodeFramePng, frameEncoderAvailable } from "./png";
import { n } from "./svg";
import { CardCtx, type CardBody } from "./templates/card";
import { buildInstagram } from "./templates/instagram";
import { buildTikTok } from "./templates/tiktok";
import { buildX } from "./templates/x";
import { buildYouTube } from "./templates/youtube";
import { initRenderer } from "./wasm";

export const DENSITY = 3;

export const RenderOptions = z.object({
  card: z.enum(["sheet", "transparent"]).default("sheet"),
  seeTranslation: z.boolean().default(false),
});
export type RenderOptions = z.input<typeof RenderOptions>;

export type CardOptionsInput = RenderOptions & { language?: Language | undefined };

export type RenderReport = {
  missingEmoji: string[];
  missingAvatars: string[];
  unsupportedText: string[];
};

export type RenderedOverlay = Overlay & RenderReport;

const BUILDERS = {
  tiktok: buildTikTok,
  instagram: buildInstagram,
  youtube: buildYouTube,
  x: buildX,
} as const satisfies Record<Template["platform"], (ctx: CardCtx) => CardBody>;

export const fontFamilyFor = (platform: Template["platform"]): BundledFamily =>
  platform === "youtube" ? "Roboto" : "Inter";

export type CardSvg = {
  svg: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  missingEmoji: string[];
  unsupportedText: string[];
};

export function buildCard(
  comment: Comment,
  template: Template,
  assets: RenderAssets,
  options: CardOptionsInput & { scale?: number } = {},
): CardBody {
  const parsed = RenderOptions.parse(options);
  const ctx = new CardCtx(
    comment,
    template,
    {
      language: options.language ?? "en",
      card: parsed.card,
      seeTranslation: parsed.seeTranslation,
    },
    assets,
    fontFamilyFor(template.platform),
    emojiSetFor(template.platform),
    DENSITY * (options.scale ?? 1),
  );
  return BUILDERS[template.platform](ctx);
}

export function layoutCommentSvg(
  comment: Comment,
  template: Template,
  scale: number,
  assets: RenderAssets,
  options: CardOptionsInput = {},
): CardSvg {
  const body = buildCard(comment, template, assets, { ...options, scale });
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
    missingEmoji: body.missingEmoji,
    unsupportedText: body.unsupportedText,
  };
}

export function renderCommentSvg(
  comment: Comment,
  template: Template,
  scale: number,
  assets: RenderAssets,
  options: CardOptionsInput = {},
): string {
  return layoutCommentSvg(comment, template, scale, assets, options).svg;
}

type Box = { tx: number; ty: number; k: number; x0: number; y0: number; x1: number; y1: number };

function placementBox(spec: OverlaySpec, body: CardBody): Box {
  const k = DENSITY * spec.placement.scale;
  const w = body.width * k;
  const h = body.height * k;
  const tx = spec.placement.x * spec.frame.width - w / 2;
  const ty = spec.placement.y * spec.frame.height - h / 2;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return {
    tx,
    ty,
    k,
    x0: clamp(Math.floor(tx), spec.frame.width),
    y0: clamp(Math.floor(ty), spec.frame.height),
    x1: clamp(Math.ceil(tx + w), spec.frame.width),
    y1: clamp(Math.ceil(ty + h), spec.frame.height),
  };
}

function specCard(spec: OverlaySpec, assets: RenderAssets, options: RenderOptions): CardBody {
  return buildCard(spec.comment, spec.template, assets, {
    ...options,
    language: spec.language,
    scale: spec.placement.scale,
  });
}

export function overlaySvg(
  spec: OverlaySpec,
  assets: RenderAssets,
  options: RenderOptions = {},
): string {
  const body = specCard(spec, assets, options);
  const b = placementBox(spec, body);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.frame.width}" height="${spec.frame.height}" viewBox="0 0 ${spec.frame.width} ${spec.frame.height}"><g transform="translate(${n(b.tx)} ${n(b.ty)}) scale(${n(b.k)})">${body.body}</g></svg>`;
}

function resvgFor(svg: string, assets: RenderAssets, platform: Template["platform"]) {
  return new Resvg(svg, {
    font: {
      fontBuffers: assets.fonts.buffers(),
      loadSystemFonts: false,
      defaultFontFamily: fontFamilyFor(platform),
    },
  });
}

function rasterPng(svg: string, assets: RenderAssets, platform: Template["platform"]): Uint8Array {
  const resvg = resvgFor(svg, assets, platform);
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

function rasterPixels(
  svg: string,
  assets: RenderAssets,
  platform: Template["platform"],
): Uint8Array {
  const resvg = resvgFor(svg, assets, platform);
  try {
    const image = resvg.render();
    try {
      return image.pixels;
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}

function avatarsOf(comment: Comment): Avatar[] {
  return [comment.author.avatar, ...(comment.reply ? [comment.reply.author.avatar] : [])];
}

export async function prepareComment(
  comment: Comment,
  template: Template,
  assets: RenderAssets,
): Promise<void> {
  const texts = [comment.text, comment.author.displayName];
  if (comment.reply) texts.push(comment.reply.text, comment.reply.author.displayName);
  const sequences = emojiSequences(texts).map((s) => s.codepoints);
  const primary = emojiSetFor(template.platform);
  await Promise.all([
    assets.emoji.prepare(primary, sequences).then(() => {
      const missing = sequences.filter((s) => {
        const svg = assets.emoji.svg(primary, s);
        return !svg || !emojiRenderable(`${primary}/${emojiFileName(primary, s)}`, svg);
      });
      return missing.length ? assets.emoji.prepare(otherEmojiSet(primary), missing) : undefined;
    }),
    ...avatarsOf(comment).map((a) => assets.avatars.prepare(a)),
  ]);
}

function report(body: CardBody, comment: Comment, assets: RenderAssets): RenderReport {
  const failures = assets.avatars.missingAvatars();
  const missingAvatars = avatarsOf(comment)
    .filter((a) => a.kind !== "default" && !assets.avatars.href(a))
    .map((a) => {
      const label = a.kind === "pool" ? `pool:${a.id}` : "user";
      return failures.find((f) => f.startsWith(`${label}:`)) ?? label;
    });
  return {
    missingEmoji: body.missingEmoji,
    missingAvatars,
    unsupportedText: body.unsupportedText,
  };
}

async function rasterOverlay(
  spec: OverlaySpec,
  body: CardBody,
  assets: RenderAssets,
): Promise<Uint8Array> {
  const { width, height } = spec.frame;
  const platform = spec.template.platform;
  const b = placementBox(spec, body);
  if (!(await frameEncoderAvailable())) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${n(b.tx)} ${n(b.ty)}) scale(${n(b.k)})">${body.body}</g></svg>`;
    return rasterPng(svg, assets, platform);
  }
  const pw = b.x1 - b.x0;
  const ph = b.y1 - b.y0;
  if (pw <= 0 || ph <= 0) return encodeFramePng(width, height, undefined);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}"><g transform="translate(${n(b.tx - b.x0)} ${n(b.ty - b.y0)}) scale(${n(b.k)})">${body.body}</g></svg>`;
  const rgba = rasterPixels(svg, assets, platform);
  return encodeFramePng(width, height, { x: b.x0, y: b.y0, width: pw, height: ph, rgba });
}

export async function renderOverlay(
  spec: OverlaySpec,
  assets: RenderAssets,
  options: RenderOptions = {},
): Promise<RenderedOverlay> {
  const parsed = OverlaySpec.parse(spec);
  const opts = RenderOptions.parse(options);
  await initRenderer();
  await prepareComment(parsed.comment, parsed.template, assets);
  const body = specCard(parsed, assets, opts);
  const png = await rasterOverlay(parsed, body, assets);
  return { png, frame: parsed.frame, spec: parsed, ...report(body, parsed.comment, assets) };
}

export async function renderOverlays(
  specs: OverlaySpec[],
  assets: RenderAssets,
  options: RenderOptions = {},
): Promise<RenderedOverlay[]> {
  const parsed = specs.map((s) => OverlaySpec.parse(s));
  await initRenderer();
  await Promise.all(parsed.map((s) => prepareComment(s.comment, s.template, assets)));
  const out: RenderedOverlay[] = [];
  for (const spec of parsed) out.push(await renderOverlay(spec, assets, options));
  return out;
}

export async function renderCommentPng(
  comment: Comment,
  template: Template,
  scale: number,
  assets: RenderAssets,
  options: CardOptionsInput = {},
): Promise<Uint8Array> {
  await initRenderer();
  await prepareComment(comment, template, assets);
  const { svg } = layoutCommentSvg(comment, template, scale, assets, options);
  return rasterPng(svg, assets, template.platform);
}
