import type { Avatar, Comment, Language, Template } from "@icg/shared";
import { bytesToDataUrl, type RenderAssets } from "../assets";
import { emojiFileName, type EmojiSet } from "../emoji";
import { emojiHref } from "../emoji-raster";
import type { FontFamily, FontWeight } from "../fonts";
import { ICONS, circle, icon, n, roundedRect, textEl } from "../svg";
import { wrapText, type Line } from "../wrap";

export type CardBody = { body: string; width: number; height: number; missingEmoji?: string[] };

export type Palette = {
  bg: string;
  text: string;
  secondary: string;
  chipBg: string;
  chipText: string;
  divider: string;
  avatarBg: string;
  avatarFg: string;
};

export class CardCtx {
  private counter = 0;
  readonly defs: string[] = [];
  readonly missingEmoji = new Set<string>();

  constructor(
    readonly comment: Comment,
    readonly template: Template,
    readonly locale: Language,
    readonly assets: RenderAssets,
    readonly family: FontFamily,
    readonly emojiSet: EmojiSet,
    readonly pixelScale = 3,
  ) {}

  uid(prefix: string): string {
    return `${prefix}${++this.counter}`;
  }

  measure(text: string, weight: FontWeight, size: number): number {
    return this.assets.fonts.measure(text, this.family, weight, size);
  }

  text(
    x: number,
    baseline: number,
    text: string,
    weight: FontWeight,
    size: number,
    fill: string,
    anchor?: "start" | "middle" | "end",
  ): string {
    return textEl(x, baseline, text, {
      family: this.family,
      weight,
      size,
      fill,
      ...(anchor ? { anchor } : {}),
    });
  }

  truncate(text: string, weight: FontWeight, size: number, maxWidth: number): string {
    if (this.measure(text, weight, size) <= maxWidth) return text;
    const chars = Array.from(text);
    while (chars.length > 1) {
      chars.pop();
      const candidate = chars.join("").trimEnd() + "…";
      if (this.measure(candidate, weight, size) <= maxWidth) return candidate;
    }
    return "…";
  }

  emojiHref(codepoints: number[], sizePt: number): string | undefined {
    const svg = this.assets.emoji.svg(this.emojiSet, codepoints);
    if (!svg) return undefined;
    return emojiHref(
      `${this.emojiSet}/${emojiFileName(this.emojiSet, codepoints)}`,
      svg,
      sizePt * this.pixelScale,
    );
  }
}

export type ParagraphOptions = {
  x: number;
  top: number;
  maxWidth: number;
  size: number;
  lineHeight: number;
  weight: FontWeight;
  fill: string;
  maxLines?: number;
  emojiScale?: number;
};

export type Paragraph = { svg: string; height: number; lines: Line[]; lastLineWidth: number };

export function paragraph(ctx: CardCtx, text: string, o: ParagraphOptions): Paragraph {
  const emojiWidth = o.size * 1.25;
  const lines = wrapText(text, {
    maxWidth: o.maxWidth,
    measure: (s) => ctx.measure(s, o.weight, o.size),
    emojiWidth,
    ...(o.maxLines ? { maxLines: o.maxLines } : {}),
  });
  const parts: string[] = [];
  const imgSize = o.size * (o.emojiScale ?? 1.2);
  lines.forEach((line, i) => {
    const baseline = o.top + o.lineHeight * i + o.lineHeight / 2 + o.size * 0.36;
    for (const run of line.runs) {
      if (run.kind === "text") {
        parts.push(ctx.text(o.x + run.x, baseline, run.text, o.weight, o.size, o.fill));
      } else {
        const href = ctx.emojiHref(run.codepoints, imgSize);
        const cx = o.x + run.x + run.width / 2;
        const cy = baseline - o.size * 0.34;
        if (href) {
          parts.push(
            `<image x="${n(cx - imgSize / 2)}" y="${n(cy - imgSize / 2)}" width="${n(imgSize)}" height="${n(imgSize)}" href="${href}"/>`,
          );
        } else {
          ctx.missingEmoji.add(run.cluster);
        }
      }
    }
  });
  const last = lines[lines.length - 1];
  return {
    svg: parts.join(""),
    height: lines.length * o.lineHeight,
    lines,
    lastLineWidth: last ? last.width : 0,
  };
}

export type Label = { svg: string; width: number };

export function inlineLabel(
  ctx: CardCtx,
  text: string,
  x: number,
  baseline: number,
  weight: FontWeight,
  size: number,
  fill: string,
  maxWidth: number,
): Label {
  const para = paragraph(ctx, text, {
    x,
    top: baseline - size * 0.36 - size * 0.6,
    maxWidth,
    size,
    lineHeight: size * 1.2,
    weight,
    fill,
    maxLines: 1,
  });
  return { svg: para.svg, width: para.lastLineWidth };
}

export function avatarEl(
  ctx: CardCtx,
  avatar: Avatar,
  cx: number,
  cy: number,
  r: number,
  palette: Palette,
): string {
  const id = ctx.uid("av");
  ctx.defs.push(
    `<clipPath id="${id}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath>`,
  );
  const image = (href: string) =>
    `<image x="${n(cx - r)}" y="${n(cy - r)}" width="${n(2 * r)}" height="${n(2 * r)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" href="${href}"/>`;
  if (avatar.kind === "user") return image(avatar.dataUrl);
  if (avatar.kind === "pool") {
    const img = ctx.assets.avatars.pool(avatar.id);
    if (img) return image(bytesToDataUrl(img.mime, img.data));
  }
  const letter = avatar.kind === "default" ? avatar.letter : undefined;
  const bg = circle(cx, cy, r, palette.avatarBg);
  if (letter) {
    return (
      bg +
      ctx.text(cx, cy + r * 0.38, letter.toUpperCase(), 600, r * 1.05, palette.avatarFg, "middle")
    );
  }
  const k = r * 2 * 0.85;
  return (
    bg +
    `<g clip-path="url(#${id})">${icon(ICONS.person, cx - k / 2, cy - k / 2 + r * 0.12, k, palette.avatarFg)}</g>`
  );
}

export type Chip = { svg: string; width: number };

export function chip(
  ctx: CardCtx,
  label: string,
  x: number,
  cy: number,
  size: number,
  bg: string,
  fg: string,
  padX = 5,
  radius = 3,
  weight: FontWeight = 500,
): Chip {
  const w = ctx.measure(label, weight, size) + padX * 2;
  const h = size + 6;
  return {
    svg:
      roundedRect(x, cy - h / 2, w, h, radius, bg) +
      ctx.text(x + padX, cy + size * 0.36, label, weight, size, fg),
    width: w,
  };
}

export function heartBadge(
  ctx: CardCtx,
  avatar: Avatar,
  x: number,
  cy: number,
  size: number,
  palette: Palette,
  heartColor: string,
): string {
  const r = size / 2;
  const b = size * 0.62;
  const bx = x + size - b / 2 + 1;
  const by = cy + r - b / 2 + 1;
  return (
    avatarEl(ctx, avatar, x + r, cy, r, palette) +
    circle(bx, by, b / 2 + 1, palette.bg) +
    circle(bx, by, b / 2, heartColor) +
    icon(ICONS.heart, bx - b * 0.32, by - b * 0.32, b * 0.64, "#fff")
  );
}

export function card(
  width: number,
  height: number,
  radius: number,
  palette: Palette,
  body: string,
  defs: string[],
): string {
  return (
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    roundedRect(0, 0, width, height, radius, palette.bg) +
    body
  );
}
