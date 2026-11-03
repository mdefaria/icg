import type { Author } from "@icg/shared";
import { formatCount } from "../format";
import { ICONS, icon, n, scallopedBadge, strokeIcon } from "../svg";
import {
  avatarEl,
  card,
  creatorAvatar,
  finish,
  heartBadge,
  paragraph,
  type CardBody,
  type CardCtx,
  type Palette,
} from "./card";

export const INSTAGRAM_WIDTH = 344;
const PAD = 16;
const PAD_Y = 14;
const RADIUS = 14;
const IG_BLUE = "#0095F6";
const IG_RED = "#FF3040";

function palette(dark: boolean): Palette {
  return dark
    ? {
        bg: "#262626",
        text: "#F5F5F5",
        secondary: "#A8A8A8",
        chipBg: "#363636",
        chipText: "#F5F5F5",
        divider: "#363636",
        avatarBg: "#363636",
        avatarFg: "#737373",
      }
    : {
        bg: "#FFFFFF",
        border: "rgba(0,0,0,0.1)",
        text: "#000000",
        secondary: "#737373",
        chipBg: "#EFEFEF",
        chipText: "#262626",
        divider: "#DBDBDB",
        avatarBg: "#DBDBDB",
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
  const cx = r.x + r.avatarSize + 12;
  const heartSize = 15;
  const count =
    r.likes > 0 ? formatCount(r.likes, { platform: "instagram", language: ctx.language }) : "";
  const colW = Math.max(30, ctx.measure(count, 400, 11));
  const colCx = INSTAGRAM_WIDTH - PAD - colW / 2;
  const heartX = colCx - heartSize / 2;
  const maxWidth = colCx - colW / 2 - 10 - cx;
  const y = r.y;

  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, y + ar, ar, p, r.author.username));

  let nx = cx;
  const nameBase = y + 11;
  const name = ctx.truncate(r.author.username, 600, 13, maxWidth * 0.62);
  out.push(ctx.text(nx, nameBase, name, 600, 13, p.text));
  nx += ctx.measure(name, 600, 13) + 4;
  if (r.author.verified) {
    out.push(scallopedBadge(nx + 6, nameBase - 4.5, 6.5, 12, 0.14, IG_BLUE));
    out.push(icon(ICONS.checkBold, nx + 2.6, nameBase - 7.9, 6.8, "#FFFFFF"));
    nx += 16;
  } else nx += 2;
  out.push(ctx.text(nx, nameBase, r.timeAgo, 400, 12, p.secondary));
  nx += ctx.measure(r.timeAgo, 400, 12);
  if (r.isCreator) {
    const label = ` · ${copy.creator}`;
    out.push(ctx.text(nx, nameBase, label, 400, 12, p.secondary));
    nx += ctx.measure(label, 400, 12);
  }
  if (r.pinned) {
    const label = ` · ${copy.pinned}`;
    out.push(ctx.text(nx, nameBase, label, 400, 12, p.secondary));
  }

  const textTop = y + 15;
  const para = paragraph(ctx, r.text, {
    x: cx,
    top: textTop,
    maxWidth,
    size: 14,
    lineHeight: 18,
    weight: 400,
    fill: p.text,
  });
  out.push(para.svg);

  const metaBase = textTop + para.height + 6 + 11;
  let mx = cx;
  out.push(ctx.text(mx, metaBase, copy.reply, 600, 12, p.secondary));
  mx += ctx.measure(copy.reply, 600, 12) + 16;
  if (ctx.options.seeTranslation) {
    out.push(ctx.text(mx, metaBase, copy.seeTranslation, 600, 12, p.secondary));
    mx += ctx.measure(copy.seeTranslation, 600, 12) + 16;
  }
  let bottom = metaBase + 4;
  if (r.likedByCreator) {
    const label = copy.likedByCreator;
    const fits = mx + 20 + ctx.measure(label, 400, 12) <= cx + maxWidth;
    const bx = fits ? mx : cx;
    const bb = fits ? metaBase : metaBase + 22;
    out.push(heartBadge(ctx, creatorAvatar(ctx), bx, bb - 4.5, 14, p, IG_RED));
    out.push(ctx.text(bx + 20, bb, label, 400, 12, p.secondary));
    bottom = bb + 4;
  }

  if (r.replies && r.replies > 0) {
    const base = bottom + 22;
    const count = formatCount(r.replies, { platform: "instagram", language: ctx.language });
    out.push(
      `<rect x="${n(cx)}" y="${n(base - 4.5)}" width="24" height="0.75" fill="${p.secondary}"/>`,
    );
    out.push(ctx.text(cx + 34, base, copy.viewReplies(r.replies, count), 600, 12, p.secondary));
    bottom = base + 4;
  }

  out.push(strokeIcon(ICONS.heartStroke, heartX, y + 9, heartSize, p.secondary, 1.6));
  if (count)
    out.push(ctx.text(colCx, y + 9 + heartSize + 12, count, 400, 11, p.secondary, "middle"));

  const height = Math.max(bottom, y + r.avatarSize, y + heartSize + 24) - r.y;
  return { svg: out.join(""), height };
}

export function buildInstagram(ctx: CardCtx): CardBody {
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
    avatarSize: 32,
    x: PAD,
    y,
    ...(!withReply && c.replies ? { replies: c.replies } : {}),
  });
  parts.push(main.svg);
  y += main.height;

  if (withReply && c.reply) {
    y += 16;
    const reply = row(ctx, p, {
      author: c.reply.author,
      text: c.reply.text,
      likes: c.reply.likes,
      timeAgo: c.reply.timeAgo,
      pinned: false,
      likedByCreator: false,
      isCreator: true,
      avatarSize: 24,
      x: PAD + 32 + 12,
      y,
      ...(c.replies && c.replies > 1 ? { replies: c.replies - 1 } : {}),
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y;
  return finish(
    ctx,
    card(ctx, INSTAGRAM_WIDTH, height, RADIUS, p, parts.join("")),
    INSTAGRAM_WIDTH,
    height,
  );
}
