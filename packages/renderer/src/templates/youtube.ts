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

export const YOUTUBE_WIDTH = 344;
const PAD = 12;
const PAD_Y = 12;
const RADIUS = 12;
const YT_RED = "#FF0000";
const YT_BLUE = "#3EA6FF";

function palette(dark: boolean): Palette {
  return {
    bg: dark ? "#0F0F0F" : "#FFFFFF",
    text: dark ? "#F1F1F1" : "#0F0F0F",
    secondary: dark ? "#AAAAAA" : "#606060",
    chipBg: dark ? "#272727" : "#F2F2F2",
    chipText: dark ? "#F1F1F1" : "#0F0F0F",
    divider: dark ? "#272727" : "#E5E5E5",
    avatarBg: dark ? "#3F3F3F" : "#CCCCCC",
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
  replyCount?: number;
};

function handle(author: Author): string {
  return author.username.startsWith("@") ? author.username : `@${author.username}`;
}

function row(ctx: CardCtx, p: Palette, r: RowInput): { svg: string; height: number } {
  const out: string[] = [];
  const ar = r.avatarSize / 2;
  const cx = r.x + r.avatarSize + 12;
  const maxWidth = YOUTUBE_WIDTH - PAD - 28 - cx;
  let y = r.y;

  if (r.pinned) {
    const by = ctx.comment.reply?.author ?? r.author;
    out.push(icon(ICONS.pin, cx - 1, y + 0.5, 13, p.secondary));
    out.push(
      ctx.text(cx + 15, y + 11, `${t("pinnedBy", ctx.locale)} ${handle(by)}`, 400, 12, p.secondary),
    );
    y += 19;
  }

  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, y + ar, ar, p));

  let nx = cx;
  const nameBase = y + 11;
  const h = ctx.truncate(handle(r.author), 400, 12, maxWidth * 0.65);
  if (r.isCreator) {
    const c = chip(ctx, h, nx, nameBase - 4.5, 12, p.chipBg, p.chipText, 6, 10, 400);
    out.push(c.svg);
    nx += c.width + 4;
  } else {
    out.push(ctx.text(nx, nameBase, h, 400, 12, p.secondary));
    nx += ctx.measure(h, 400, 12) + 4;
  }
  if (r.author.verified) {
    out.push(icon(ICONS.check, nx, nameBase - 10.5, 12, p.secondary));
    nx += 14;
  }
  out.push(ctx.text(nx, nameBase, `• ${r.timeAgo}`, 400, 12, p.secondary));

  const para = paragraph(ctx, r.text, {
    x: cx,
    top: y + 16,
    maxWidth,
    size: 14,
    lineHeight: 20,
    weight: 400,
    fill: p.text,
  });
  out.push(para.svg);

  const actionTop = y + 16 + para.height + 8;
  const iconSize = 16;
  const actionBase = actionTop + iconSize - 3;
  let ax = cx;
  out.push(icon(ICONS.thumbUp, ax, actionTop, iconSize, p.text));
  ax += iconSize + 6;
  if (r.likes > 0) {
    const count = formatCount(r.likes, { platform: "youtube", language: ctx.locale });
    out.push(ctx.text(ax, actionBase, count, 400, 12, p.secondary));
    ax += ctx.measure(count, 400, 12) + 18;
  } else ax += 14;
  out.push(icon(ICONS.thumbDown, ax, actionTop, iconSize, p.text));
  ax += iconSize + 18;
  if (r.likedByCreator) {
    const creatorAvatar = ctx.comment.reply?.author.avatar ?? { kind: "default" as const };
    out.push(heartBadge(ctx, creatorAvatar, ax, actionTop + iconSize / 2, 16, p, YT_RED));
    ax += 16 + 18;
  }
  out.push(icon(ICONS.bubble, ax, actionTop, iconSize, p.text));
  let height = actionTop + iconSize - r.y;

  if (r.replyCount && r.replyCount > 0) {
    const label = `${r.replyCount} ${r.replyCount === 1 ? t("reply1", ctx.locale) : t("replies", ctx.locale)}`;
    const ly = actionTop + iconSize + 10;
    out.push(icon(ICONS.chevronDown, cx - 2, ly + 1, 16, YT_BLUE));
    out.push(ctx.text(cx + 18, ly + 12, label, 500, 12, YT_BLUE));
    height = ly + 16 - r.y;
  }

  out.push(icon(ICONS.dots, YOUTUBE_WIDTH - PAD - 18, y - 2, 18, p.secondary));
  return { svg: out.join(""), height: Math.max(height, y + r.avatarSize - r.y) };
}

export function buildYouTube(ctx: CardCtx): CardBody {
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
    avatarSize: 24,
    x: PAD,
    y,
    ...(ctx.template.variant === "single" && c.reply ? { replyCount: 1 } : {}),
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
      x: PAD + 24 + 12,
      y,
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y + 2;
  return {
    body: card(YOUTUBE_WIDTH, height, RADIUS, p, parts.join(""), ctx.defs),
    width: YOUTUBE_WIDTH,
    height,
  };
}
