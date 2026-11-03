import type { Author } from "@icg/shared";
import { formatCount } from "../format";
import { ICONS, circle, icon, strokeIcon } from "../svg";
import {
  avatarEl,
  card,
  creatorAvatar,
  finish,
  heartBadge,
  inlineLabel,
  paragraph,
  type CardBody,
  type CardCtx,
  type Palette,
} from "./card";

export const TIKTOK_WIDTH = 344;
const PAD = 16;
const PAD_Y = 14;
const RADIUS = 14;
const TIKTOK_RED = "#FE2C55";
const TIKTOK_BLUE = "#20D5EC";

function palette(dark: boolean): Palette {
  return dark
    ? {
        bg: "#121212",
        text: "#FFFFFF",
        secondary: "rgba(255,255,255,0.5)",
        chipBg: "rgba(255,255,255,0.12)",
        chipText: "#C9CACE",
        divider: "#2F2F2F",
        avatarBg: "#3A3A3A",
        avatarFg: "#8A8B91",
      }
    : {
        bg: "#FFFFFF",
        border: "rgba(22,24,35,0.12)",
        text: "#161823",
        secondary: "rgba(22,24,35,0.5)",
        chipBg: "rgba(22,24,35,0.06)",
        chipText: "#5D5F66",
        divider: "#E6E6E8",
        avatarBg: "#E3E3E4",
        avatarFg: "#FFFFFF",
      };
}

type RowInput = {
  author: Author;
  text: string;
  likes: number;
  timeAgo: string;
  pinned: boolean;
  likedByCreator: boolean;
  isCreator: boolean;
  avatarSize: number;
  x: number;
  y: number;
  replies?: number;
};

function row(ctx: CardCtx, p: Palette, r: RowInput): { svg: string; height: number } {
  const out: string[] = [];
  const copy = ctx.copy;
  const ar = r.avatarSize / 2;
  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, r.y + ar, ar, p, r.author.username));
  const cx = r.x + r.avatarSize + 10;
  const heartSize = 20;
  const count =
    r.likes > 0 ? formatCount(r.likes, { platform: "tiktok", language: ctx.language }) : "";
  const colW = Math.max(heartSize + 8, ctx.measure(count, 400, 12));
  const colCx = TIKTOK_WIDTH - PAD - colW / 2;
  const heartX = colCx - heartSize / 2;
  const maxWidth = colCx - colW / 2 - 10 - cx;

  let nx = cx;
  const nameBase = r.y + 12;
  const name = inlineLabel(
    ctx,
    r.author.displayName || r.author.username,
    nx,
    nameBase,
    500,
    13,
    p.secondary,
    maxWidth * 0.6,
  );
  out.push(name.svg);
  nx += name.width + 4;
  if (r.author.verified) {
    out.push(circle(nx + 6, nameBase - 4.5, 6, TIKTOK_BLUE));
    out.push(icon(ICONS.checkBold, nx + 2, nameBase - 8.5, 8, "#FFFFFF"));
    nx += 16;
  }
  if (r.isCreator) {
    out.push(ctx.text(nx, nameBase, "·", 500, 13, p.secondary));
    nx += ctx.measure("· ", 500, 13);
    out.push(ctx.text(nx, nameBase, copy.creator, 600, 13, TIKTOK_RED));
    nx += ctx.measure(copy.creator, 600, 13) + 6;
  }

  const textTop = r.y + 17;
  const para = paragraph(ctx, r.text, {
    x: cx,
    top: textTop,
    maxWidth,
    size: 15,
    lineHeight: 20,
    weight: 400,
    fill: p.text,
  });
  out.push(para.svg);
  let y = textTop + para.height;

  if (ctx.options.seeTranslation) {
    out.push(ctx.text(cx, y + 15, copy.seeTranslation, 600, 13, p.secondary));
    y += 19;
  }

  const metaBase = y + 6 + 12;
  let mx = cx;
  if (r.pinned) {
    out.push(ctx.text(mx, metaBase, copy.pinned, 600, 13, TIKTOK_RED));
    mx += ctx.measure(copy.pinned, 600, 13);
    out.push(ctx.text(mx, metaBase, " · ", 400, 13, p.secondary));
    mx += ctx.measure(" · ", 400, 13);
  }
  out.push(ctx.text(mx, metaBase, r.timeAgo, 400, 13, p.secondary));
  mx += ctx.measure(r.timeAgo, 400, 13) + 16;
  out.push(ctx.text(mx, metaBase, copy.reply, 600, 13, p.secondary));
  mx += ctx.measure(copy.reply, 600, 13) + 16;
  y = metaBase + 5;

  if (r.likedByCreator) {
    const badgeTop = y + 6;
    out.push(heartBadge(ctx, creatorAvatar(ctx), cx, badgeTop + 8, 16, p, TIKTOK_RED));
    out.push(ctx.text(cx + 22, badgeTop + 12.5, copy.likedByCreator, 400, 12, p.secondary));
    y = badgeTop + 16;
  }

  if (r.replies && r.replies > 0) {
    const base = y + 20;
    const count = formatCount(r.replies, { platform: "tiktok", language: ctx.language });
    const label = copy.viewReplies(r.replies, count);
    out.push(`<rect x="${cx}" y="${base - 4.5}" width="20" height="1" fill="${p.secondary}"/>`);
    out.push(ctx.text(cx + 28, base, label, 600, 13, p.secondary));
    const lw = ctx.measure(label, 600, 13);
    out.push(strokeIcon("M6 9l6 6 6-6", cx + 30 + lw, base - 10.5, 13, p.secondary, 1.6));
    y = base + 5;
  }

  out.push(strokeIcon(ICONS.heartStroke, heartX, r.y + 6, heartSize, p.secondary, 1.7));
  if (count)
    out.push(ctx.text(colCx, r.y + 6 + heartSize + 13, count, 400, 12, p.secondary, "middle"));

  const height = Math.max(y, r.y + r.avatarSize, r.y + heartSize + 24) - r.y;
  return { svg: out.join(""), height };
}

export function buildTikTok(ctx: CardCtx): CardBody {
  const p = palette(ctx.dark);
  const c = ctx.comment;
  const parts: string[] = [];
  let y = PAD_Y;
  const withReply = ctx.template.variant === "creator-reply" && !!c.reply;
  const main = row(ctx, p, {
    author: c.author,
    text: c.text,
    likes: c.likes,
    timeAgo: c.timeAgo,
    pinned: c.pinned,
    likedByCreator: c.likedByCreator,
    isCreator: false,
    avatarSize: 36,
    x: PAD,
    y,
    ...(!withReply && c.replies ? { replies: c.replies } : {}),
  });
  parts.push(main.svg);
  y += main.height;

  if (withReply && c.reply) {
    y += 14;
    const reply = row(ctx, p, {
      author: c.reply.author,
      text: c.reply.text,
      likes: c.reply.likes,
      timeAgo: c.reply.timeAgo,
      pinned: false,
      likedByCreator: false,
      isCreator: true,
      avatarSize: 24,
      x: PAD + 36 + 10,
      y,
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y;
  return finish(
    ctx,
    card(ctx, TIKTOK_WIDTH, height, RADIUS, p, parts.join("")),
    TIKTOK_WIDTH,
    height,
  );
}
