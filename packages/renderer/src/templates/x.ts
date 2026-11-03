import type { Author } from "@icg/shared";
import { formatCount } from "../format";
import { t } from "../strings";
import { ICONS, icon, n } from "../svg";
import {
  avatarEl,
  card,
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
  return {
    bg: dark ? "#000000" : "#FFFFFF",
    text: dark ? "#E7E9EA" : "#0F1419",
    secondary: dark ? "#71767B" : "#536471",
    chipBg: dark ? "#202327" : "#EFF3F4",
    chipText: dark ? "#E7E9EA" : "#0F1419",
    divider: dark ? "#333639" : "#CFD9DE",
    avatarBg: dark ? "#333639" : "#CFD9DE",
    avatarFg: "#FFFFFF",
  };
}

type RowInput = {
  author: Author;
  text: string;
  likes: number;
  timeAgo: string;
  pinned: boolean;
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
  let y = r.y;

  if (r.pinned) {
    out.push(icon(ICONS.pin, cx - 24, y, 14, p.secondary));
    out.push(ctx.text(cx, y + 12, t("pinned", ctx.locale), 700, 13, p.secondary));
    y += 20;
  }

  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, y + ar, ar, p));

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

  const actionTop = y + 20 + para.height + 10;
  const iconSize = 18;
  const base = actionTop + 14;
  const style = { platform: "x" as const, language: ctx.locale };
  const slots: Array<[string, number]> = [
    [ICONS.xReply, r.replies],
    [ICONS.xRepost, r.reposts],
    [ICONS.xHeart, r.likes],
    [ICONS.xViews, r.views],
  ];
  const items = slots.map(([path, count]) => {
    const label = count > 0 ? formatCount(count, style) : "";
    const labelWidth = label ? ctx.measure(label, 400, 13) + 4 : 0;
    return { path, label, width: iconSize + labelWidth };
  });
  const minGap = 6;
  const itemsWidth = items.reduce((sum, it) => sum + it.width, 0) + minGap * (items.length - 1);
  const showBookmark = itemsWidth <= maxWidth - (iconSize * 2 + 14) - 12;
  const rightCluster = showBookmark ? iconSize * 2 + 14 : iconSize;
  const usable = maxWidth - rightCluster - 12;
  const gap = Math.max(
    minGap,
    (usable - itemsWidth + minGap * (items.length - 1)) / (items.length - 1),
  );
  let ax = cx;
  for (const it of items) {
    out.push(icon(it.path, ax, actionTop, iconSize, p.secondary));
    if (it.label) out.push(ctx.text(ax + iconSize + 4, base, it.label, 400, 13, p.secondary));
    ax += it.width + gap;
  }
  if (showBookmark)
    out.push(
      icon(ICONS.xBookmark, X_WIDTH - PAD - iconSize * 2 - 14, actionTop, iconSize, p.secondary),
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

function derived(likes: number): { replies: number; reposts: number; views: number } {
  return {
    replies: Math.round(likes * 0.08),
    reposts: Math.round(likes * 0.12),
    views: Math.round(likes * 38 + 1200),
  };
}

export function buildX(ctx: CardCtx): CardBody {
  const p = palette(ctx.template.theme === "dark");
  const c = ctx.comment;
  const parts: string[] = [];
  const isThread = ctx.template.variant === "creator-reply" && !!c.reply;
  let y = PAD_Y;
  const main = row(ctx, p, {
    author: c.author,
    text: c.text,
    likes: c.likes,
    timeAgo: c.timeAgo,
    pinned: c.pinned,
    x: PAD,
    y,
    ...derived(c.likes),
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
      pinned: false,
      x: PAD,
      y,
      ...derived(c.reply.likes),
      threadLine: false,
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y + 2;
  return {
    body: card(X_WIDTH, height, RADIUS, p, parts.join(""), ctx.defs),
    width: X_WIDTH,
    height,
  };
}
