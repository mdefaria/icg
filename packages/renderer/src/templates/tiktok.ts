import type { Author } from "@icg/shared";
import { formatCount } from "../format";
import { t } from "../strings";
import { ICONS, circle, icon } from "../svg";
import {
  avatarEl,
  card,
  chip,
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
  return {
    bg: dark ? "#161616" : "#FFFFFF",
    text: dark ? "#FFFFFF" : "#161823",
    secondary: dark ? "#8A8B91" : "#8A8B91",
    chipBg: dark ? "rgba(255,255,255,0.12)" : "rgba(22,24,35,0.06)",
    chipText: dark ? "#C9CACE" : "#5D5F66",
    divider: dark ? "#2F2F2F" : "#E6E6E8",
    avatarBg: "#D0D1D5",
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
};

function row(ctx: CardCtx, p: Palette, r: RowInput): { svg: string; height: number } {
  const out: string[] = [];
  const ar = r.avatarSize / 2;
  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, r.y + ar, ar, p));
  const cx = r.x + r.avatarSize + 12;
  const heartSize = 20;
  const heartX = TIKTOK_WIDTH - PAD - heartSize - 2;
  const maxWidth = heartX - 14 - cx;

  let nx = cx;
  const nameBase = r.y + 11;
  const name = inlineLabel(
    ctx,
    r.author.displayName || r.author.username,
    nx,
    nameBase,
    600,
    13,
    p.secondary,
    maxWidth * 0.6,
  );
  out.push(name.svg);
  nx += name.width + 4;
  if (r.author.verified) {
    out.push(circle(nx + 6.5, nameBase - 4.5, 6.5, TIKTOK_BLUE));
    out.push(icon(ICONS.checkBold, nx + 2.25, nameBase - 8.75, 8.5, "#FFFFFF"));
    nx += 17;
  }
  if (r.isCreator) {
    const c = chip(
      ctx,
      t("creator", ctx.locale),
      nx + 2,
      nameBase - 4.5,
      10,
      p.chipBg,
      p.chipText,
      4,
      2,
      500,
    );
    out.push(c.svg);
    nx += c.width + 6;
  }
  if (r.pinned) {
    out.push(icon(ICONS.pin, nx + 2, nameBase - 10.5, 12, p.secondary));
    out.push(ctx.text(nx + 15, nameBase, t("pinned", ctx.locale), 500, 12, p.secondary));
  }

  const para = paragraph(ctx, r.text, {
    x: cx,
    top: r.y + 17,
    maxWidth,
    size: 15,
    lineHeight: 20,
    weight: 400,
    fill: p.text,
  });
  out.push(para.svg);

  const metaBase = r.y + 17 + para.height + 6 + 12;
  let mx = cx;
  out.push(ctx.text(mx, metaBase, r.timeAgo, 400, 13, p.secondary));
  mx += ctx.measure(r.timeAgo, 400, 13) + 14;
  out.push(ctx.text(mx, metaBase, t("reply", ctx.locale), 600, 13, p.secondary));
  mx += ctx.measure(t("reply", ctx.locale), 600, 13) + 14;
  if (r.likedByCreator && ctx.comment.reply) {
    out.push(heartBadge(ctx, ctx.comment.reply.author.avatar, mx, metaBase - 5, 16, p, TIKTOK_RED));
    mx += 22;
    out.push(ctx.text(mx, metaBase, t("likedByCreator", ctx.locale), 400, 13, p.secondary));
  } else if (r.likedByCreator) {
    out.push(icon(ICONS.heart, mx, metaBase - 11.5, 14, TIKTOK_RED));
    out.push(ctx.text(mx + 18, metaBase, t("likedByCreator", ctx.locale), 400, 13, p.secondary));
  }

  out.push(icon(ICONS.heartOutline, heartX, r.y + 1, heartSize, p.secondary));
  const count = formatCount(r.likes, { platform: "tiktok", language: ctx.locale });
  out.push(
    ctx.text(heartX + heartSize / 2, r.y + heartSize + 14, count, 400, 12, p.secondary, "middle"),
  );

  const height = Math.max(metaBase + 5, r.y + r.avatarSize, r.y + heartSize + 18) - r.y;
  return { svg: out.join(""), height };
}

export function buildTikTok(ctx: CardCtx): CardBody {
  const p = palette(ctx.template.theme === "dark");
  const c = ctx.comment;
  const parts: string[] = [];
  let y = PAD_Y;
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
  });
  parts.push(main.svg);
  y += main.height;

  if (ctx.template.variant === "creator-reply" && c.reply) {
    y += 12;
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
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y;
  return {
    body: card(TIKTOK_WIDTH, height, RADIUS, p, parts.join(""), ctx.defs),
    width: TIKTOK_WIDTH,
    height,
  };
}
