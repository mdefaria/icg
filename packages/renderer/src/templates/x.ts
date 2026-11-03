import type { Author } from "@icg/shared";
import { formatCount } from "../format";
import { ICONS, icon, n } from "../svg";
import {
  avatarEl,
  card,
  finish,
  inlineLabel,
  paragraph,
  type CardBody,
  type CardCtx,
  type Palette,
} from "./card";

export const X_WIDTH = 356;
const PAD = 12;
const PAD_Y = 12;
const RADIUS = 14;
const X_BLUE = "#1D9BF0";

function palette(dark: boolean): Palette {
  return dark
    ? {
        bg: "#000000",
        border: "#2F3336",
        text: "#E7E9EA",
        secondary: "#71767B",
        chipBg: "#202327",
        chipText: "#E7E9EA",
        divider: "#333639",
        avatarBg: "#CFD9DE",
        avatarFg: "#FFFFFF",
      }
    : {
        bg: "#FFFFFF",
        border: "#EFF3F4",
        text: "#0F1419",
        secondary: "#536471",
        chipBg: "#EFF3F4",
        chipText: "#0F1419",
        divider: "#CFD9DE",
        avatarBg: "#CFD9DE",
        avatarFg: "#FFFFFF",
      };
}

type RowInput = {
  author: Author;
  text: string;
  likes: number;
  timeAgo: string;
  x: number;
  y: number;
  replies: number;
  reposts: number;
  views: number;
  threadLine: boolean;
};

function handle(author: Author): string {
  return author.username.startsWith("@") ? author.username : `@${author.username}`;
}

function row(ctx: CardCtx, p: Palette, r: RowInput): { svg: string; height: number } {
  const out: string[] = [];
  const avatarSize = 40;
  const ar = avatarSize / 2;
  const cx = r.x + avatarSize + 12;
  const maxWidth = X_WIDTH - PAD - cx;
  const y = r.y;

  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, y + ar, ar, p, r.author.username));

  const nameBase = y + 15;
  const nameSize = 15;
  const handleText = `${handle(r.author)} · ${r.timeAgo}`;
  const handleWidth = ctx.measure(handleText, 400, nameSize);
  const badgeWidth = r.author.verified ? 20 : 0;
  const name = inlineLabel(
    ctx,
    r.author.displayName || r.author.username,
    cx,
    nameBase,
    700,
    nameSize,
    p.text,
    maxWidth - handleWidth - badgeWidth - 6,
  );
  let nx = cx;
  out.push(name.svg);
  nx += name.width + 3;
  if (r.author.verified) {
    out.push(icon(ICONS.xVerified, nx, nameBase - 13.5, 17, X_BLUE));
    nx += badgeWidth;
  } else nx += 2;
  out.push(ctx.text(nx, nameBase, handleText, 400, nameSize, p.secondary));

  const para = paragraph(ctx, r.text, {
    x: cx,
    top: y + 20,
    maxWidth,
    size: 15,
    lineHeight: 20,
    weight: 400,
    fill: p.text,
  });
  out.push(para.svg);
  let bottom = y + 20 + para.height;
  if (ctx.options.seeTranslation) {
    out.push(ctx.text(cx, bottom + 16, ctx.copy.seeTranslation, 400, 14, X_BLUE));
    bottom += 22;
  }

  const actionTop = bottom + 10;
  const iconSize = 18;
  const base = actionTop + 14;
  const style = { platform: "x" as const, language: ctx.language };
  const slots: Array<[string, number]> = [
    [ICONS.xReply, r.replies],
    [ICONS.xRepost, r.reposts],
    [ICONS.xHeart, r.likes],
    [ICONS.xViews, r.views],
  ];
  const items = slots.map(([path, count]) => {
    const label = count > 0 ? formatCount(count, style) : "";
    const labelWidth = label ? ctx.measure(label, 400, 13) + 3 : 0;
    return { path, label, width: iconSize + labelWidth };
  });
  const minGap = 4;
  const bookmarkGap = 10;
  const itemsWidth = items.reduce((sum, it) => sum + it.width, 0);
  const showBookmark = itemsWidth + minGap * items.length + iconSize * 2 + bookmarkGap <= maxWidth;
  const rightCluster = showBookmark ? iconSize * 2 + bookmarkGap : iconSize;
  const gap = Math.max(minGap, (maxWidth - rightCluster - itemsWidth) / items.length);
  let ax = cx;
  for (const it of items) {
    out.push(icon(it.path, ax, actionTop, iconSize, p.secondary));
    if (it.label) out.push(ctx.text(ax + iconSize + 3, base, it.label, 400, 13, p.secondary));
    ax += it.width + gap;
  }
  if (showBookmark)
    out.push(
      icon(
        ICONS.xBookmark,
        X_WIDTH - PAD - iconSize * 2 - bookmarkGap,
        actionTop,
        iconSize,
        p.secondary,
      ),
    );
  out.push(icon(ICONS.xShare, X_WIDTH - PAD - iconSize, actionTop, iconSize, p.secondary));

  const height = actionTop + iconSize + 2 - r.y;
  if (r.threadLine) {
    out.push(
      `<line x1="${n(r.x + ar)}" y1="${n(y + avatarSize + 4)}" x2="${n(r.x + ar)}" y2="${n(r.y + height + 14)}" stroke="${p.divider}" stroke-width="2"/>`,
    );
  }
  return { svg: out.join(""), height };
}

type Counts = {
  replies?: number | undefined;
  reposts?: number | undefined;
  views?: number | undefined;
};

export function xCounts(
  likes: number,
  given: Counts = {},
): { replies: number; reposts: number; views: number } {
  return {
    replies: given.replies ?? Math.round(likes * 0.08),
    reposts: given.reposts ?? Math.round(likes * 0.12),
    views: given.views ?? Math.round(likes * 38 + 1200),
  };
}

export function buildX(ctx: CardCtx): CardBody {
  const p = palette(ctx.dark);
  const c = ctx.comment;
  const parts: string[] = [];
  const isThread = ctx.template.variant === "creator-reply" && !!c.reply;
  let y = PAD_Y;
  const main = row(ctx, p, {
    author: c.author,
    text: c.text,
    likes: c.likes,
    timeAgo: c.timeAgo,
    x: PAD,
    y,
    ...xCounts(c.likes, c),
    threadLine: isThread,
  });
  parts.push(main.svg);
  y += main.height;

  if (isThread && c.reply) {
    y += 16;
    const reply = row(ctx, p, {
      author: c.reply.author,
      text: c.reply.text,
      likes: c.reply.likes,
      timeAgo: c.reply.timeAgo,
      x: PAD,
      y,
      ...xCounts(c.reply.likes),
      threadLine: false,
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y + 2;
  return finish(ctx, card(ctx, X_WIDTH, height, RADIUS, p, parts.join("")), X_WIDTH, height);
}
