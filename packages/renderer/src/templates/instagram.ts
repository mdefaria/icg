import type { Author } from "@icg/shared";
import { formatCount } from "../format";
import { t } from "../strings";
import { ICONS, icon } from "../svg";
import {
  avatarEl,
  card,
  chip,
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
  return {
    bg: dark ? "#000000" : "#FFFFFF",
    text: dark ? "#F5F5F5" : "#000000",
    secondary: dark ? "#A8A8A8" : "#737373",
    chipBg: dark ? "#262626" : "#EFEFEF",
    chipText: dark ? "#F5F5F5" : "#262626",
    divider: dark ? "#262626" : "#DBDBDB",
    avatarBg: dark ? "#363636" : "#DBDBDB",
    avatarFg: dark ? "#A8A8A8" : "#FFFFFF",
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
  const cx = r.x + r.avatarSize + 12;
  const heartSize = 14;
  const heartX = INSTAGRAM_WIDTH - PAD - heartSize - 4;
  const maxWidth = heartX - 16 - cx;
  let y = r.y;

  if (r.pinned) {
    out.push(icon(ICONS.pin, cx - 1, y + 1, 12, p.secondary));
    out.push(ctx.text(cx + 14, y + 11, t("pinned", ctx.locale), 400, 12, p.secondary));
    y += 18;
  }

  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, y + ar, ar, p));

  let nx = cx;
  const nameBase = y + 11;
  const name = ctx.truncate(r.author.username, 600, 13, maxWidth * 0.6);
  out.push(ctx.text(nx, nameBase, name, 600, 13, p.text));
  nx += ctx.measure(name, 600, 13) + 4;
  if (r.author.verified) {
    out.push(icon(ICONS.igVerified, nx, nameBase - 10.5, 12, IG_BLUE));
    out.push(icon(ICONS.checkBold, nx + 2.5, nameBase - 8, 7, "#FFFFFF"));
    nx += 16;
  }
  out.push(ctx.text(nx, nameBase, r.timeAgo, 400, 12, p.secondary));
  nx += ctx.measure(r.timeAgo, 400, 12) + 8;
  if (r.isCreator) {
    const c = chip(
      ctx,
      t("author", ctx.locale),
      nx,
      nameBase - 4.5,
      10,
      p.chipBg,
      p.chipText,
      5,
      4,
      500,
    );
    out.push(c.svg);
  }

  const para = paragraph(ctx, r.text, {
    x: cx,
    top: y + 16,
    maxWidth,
    size: 14,
    lineHeight: 18,
    weight: 400,
    fill: p.text,
  });
  out.push(para.svg);

  const metaBase = y + 16 + para.height + 6 + 11;
  let mx = cx;
  out.push(ctx.text(mx, metaBase, t("reply", ctx.locale), 600, 12, p.secondary));
  mx += ctx.measure(t("reply", ctx.locale), 600, 12) + 16;
  if (r.likedByCreator) {
    const creatorAvatar = ctx.comment.reply?.author.avatar ?? { kind: "default" as const };
    out.push(heartBadge(ctx, creatorAvatar, mx, metaBase - 4.5, 14, p, IG_RED));
    mx += 20;
    out.push(ctx.text(mx, metaBase, t("likedByCreator", ctx.locale), 400, 12, p.secondary));
  }

  out.push(icon(ICONS.heartOutline, heartX, y + 2, heartSize, p.secondary));
  if (r.likes > 0) {
    const count = formatCount(r.likes, { platform: "instagram", language: ctx.locale });
    out.push(
      ctx.text(heartX + heartSize / 2, y + heartSize + 14, count, 400, 11, p.secondary, "middle"),
    );
  }

  const height = Math.max(metaBase + 4, y + r.avatarSize, y + heartSize + 18) - r.y;
  return { svg: out.join(""), height };
}

export function buildInstagram(ctx: CardCtx): CardBody {
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
      x: PAD + 32 + 12,
      y,
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y;
  return {
    body: card(INSTAGRAM_WIDTH, height, RADIUS, p, parts.join(""), ctx.defs),
    width: INSTAGRAM_WIDTH,
    height,
  };
}
