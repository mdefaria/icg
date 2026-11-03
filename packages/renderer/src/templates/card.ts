import type { Avatar, Comment, Language, Platform, Template } from "@icg/shared";
import type { RenderAssets } from "../assets";
import { emojiFileName, otherEmojiSet, type EmojiSet } from "../emoji";
import { emojiHref } from "../emoji-raster";
import type { BundledFamily, FontWeight } from "../fonts";
import { copyFor, type Copy } from "../strings";
import { ICONS, circle, icon, n, roundedRect, textEl } from "../svg";
import { wrapText, type Line } from "../wrap";

export type CardStyle = "sheet" | "transparent";

export type CardBody = {
  body: string;
  width: number;
  height: number;
  missingEmoji: string[];
  unsupportedText: string[];
};

export type Palette = {
  bg: string;
  border?: string;
  text: string;
  secondary: string;
  chipBg: string;
  chipText: string;
  divider: string;
  avatarBg: string;
  avatarFg: string;
};

export type CardOptions = {
  language: Language;
  card: CardStyle;
  seeTranslation: boolean;
};

export class CardCtx {
  private counter = 0;
  readonly defs: string[] = [];
  readonly missingEmoji = new Set<string>();
  readonly unsupported = new Set<string>();
  readonly copy: Copy;

  constructor(
    readonly comment: Comment,
    readonly template: Template,
    readonly options: CardOptions,
    readonly assets: RenderAssets,
    readonly family: BundledFamily,
    readonly emojiSet: EmojiSet,
    readonly pixelScale = 3,
  ) {
    this.copy = copyFor(template.platform, options.language);
  }

  get platform(): Platform {
    return this.template.platform;
  }

  get language(): Language {
    return this.options.language;
  }

  get dark(): boolean {
    return this.template.theme === "dark";
  }

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
    for (const ch of this.assets.fonts.unsupported(text)) this.unsupported.add(ch);
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
    for (const set of [this.emojiSet, otherEmojiSet(this.emojiSet)]) {
      const svg = this.assets.emoji.svg(set, codepoints);
      const href =
        svg && emojiHref(`${set}/${emojiFileName(set, codepoints)}`, svg, sizePt * this.pixelScale);
      if (href) return href;
    }
    return undefined;
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
  const emojiWidth = o.size * 1.3;
  const lines = wrapText(text, {
    maxWidth: o.maxWidth,
    measure: (s) => ctx.measure(s, o.weight, o.size),
    emojiWidth,
    ...(o.maxLines ? { maxLines: o.maxLines } : {}),
  });
  const parts: string[] = [];
  const imgSize = o.size * (o.emojiScale ?? 1.16);
  lines.forEach((line, i) => {
    const baseline = o.top + o.lineHeight * i + o.lineHeight / 2 + o.size * 0.36;
    for (const run of line.runs) {
      if (run.kind === "text") {
        parts.push(ctx.text(o.x + run.x, baseline, run.text, o.weight, o.size, o.fill));
        continue;
      }
      const href = ctx.emojiHref(run.codepoints, imgSize);
      const cx = o.x + run.x + run.width / 2;
      const cy = baseline - o.size * 0.34;
      if (href) {
        parts.push(
          `<image x="${n(cx - imgSize / 2)}" y="${n(cy - imgSize / 2)}" width="${n(imgSize)}" height="${n(imgSize)}" href="${href}"/>`,
        );
      } else {
        ctx.missingEmoji.add(run.cluster);
        ctx.assets.emoji.noteMissing(run.cluster);
      }
    }
  });
  const last = lines[lines.length - 1];
  return {
    svg: parts.join(""),
    height: text.length === 0 ? 0 : lines.length * o.lineHeight,
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

const LETTER_COLOURS = [
  "#F4511E",
  "#EF6C00",
  "#F09300",
  "#33B679",
  "#0B8043",
  "#039BE5",
  "#3F51B5",
  "#7986CB",
  "#8E24AA",
  "#E67C73",
  "#5C6BC0",
  "#D81B60",
];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return h;
}

type Silhouette = { head: number; headY: number; bodyW: number; bodyY: number };

const SILHOUETTES: Record<Platform, Silhouette> = {
  tiktok: { head: 0.2, headY: 0.4, bodyW: 0.38, bodyY: 0.68 },
  instagram: { head: 0.19, headY: 0.39, bodyW: 0.34, bodyY: 0.69 },
  youtube: { head: 0.2, headY: 0.39, bodyW: 0.36, bodyY: 0.7 },
  x: { head: 0.21, headY: 0.4, bodyW: 0.4, bodyY: 0.7 },
};

export function avatarEl(
  ctx: CardCtx,
  avatar: Avatar,
  cx: number,
  cy: number,
  r: number,
  palette: Palette,
  seed = "",
): string {
  const id = ctx.uid("av");
  ctx.defs.push(
    `<clipPath id="${id}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath>`,
  );
  const href = ctx.assets.avatars.href(avatar);
  if (href) {
    return `<image x="${n(cx - r)}" y="${n(cy - r)}" width="${n(2 * r)}" height="${n(2 * r)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" href="${href}"/>`;
  }
  const letter = avatar.kind === "default" ? avatar.letter : undefined;
  if (letter) {
    const bg = LETTER_COLOURS[hash(seed || letter) % LETTER_COLOURS.length]!;
    return (
      circle(cx, cy, r, bg) +
      ctx.text(cx, cy + r * 0.37, letter.toUpperCase(), 500, r * 1.05, "#FFFFFF", "middle")
    );
  }
  const s = SILHOUETTES[ctx.platform];
  const d = r * 2;
  const top = cy - r;
  const headR = s.head * d;
  const headCy = top + s.headY * d;
  const bodyTop = top + s.bodyY * d;
  const bodyRx = s.bodyW * d;
  const body = `<ellipse cx="${n(cx)}" cy="${n(bodyTop + bodyRx * 0.95)}" rx="${n(bodyRx)}" ry="${n(bodyRx * 0.95)}" fill="${palette.avatarFg}"/>`;
  return (
    circle(cx, cy, r, palette.avatarBg) +
    `<g clip-path="url(#${id})">${circle(cx, headCy, headR, palette.avatarFg)}${body}</g>`
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
  padY = 3,
): Chip {
  const w = ctx.measure(label, weight, size) + padX * 2;
  const h = size + padY * 2;
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
  const ring = ctx.options.card === "sheet" ? circle(bx, by, b / 2 + 1, palette.bg) : "";
  return (
    avatarEl(ctx, avatar, x + r, cy, r, palette) +
    ring +
    circle(bx, by, b / 2, heartColor) +
    icon(ICONS.heart, bx - b * 0.32, by - b * 0.32, b * 0.64, "#fff")
  );
}

export function creatorAvatar(ctx: CardCtx): Avatar {
  return ctx.comment.reply?.author.avatar ?? { kind: "default" };
}

export function card(
  ctx: CardCtx,
  width: number,
  height: number,
  radius: number,
  palette: Palette,
  body: string,
): string {
  const defs = ctx.defs.length ? `<defs>${ctx.defs.join("")}</defs>` : "";
  if (ctx.options.card === "transparent") return defs + body;
  const border = palette.border ? `stroke="${palette.border}" stroke-width="0.5"` : "";
  const inset = palette.border ? 0.25 : 0;
  return (
    defs +
    roundedRect(inset, inset, width - inset * 2, height - inset * 2, radius, palette.bg, border) +
    body
  );
}

export function finish(ctx: CardCtx, body: string, width: number, height: number): CardBody {
  return {
    body,
    width,
    height,
    missingEmoji: [...ctx.missingEmoji],
    unsupportedText: [...ctx.unsupported],
  };
}
