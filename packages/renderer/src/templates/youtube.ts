import type { Author } from "@icg/shared";
import { formatCount } from "../format";
import { ICONS, icon, n } from "../svg";
import {
  avatarEl,
  card,
  chip,
  creatorAvatar,
  finish,
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
const YT_RED = "#FF0033";

function palette(dark: boolean): Palette {
  return dark
    ? {
        bg: "#212121",
        text: "#F1F1F1",
        secondary: "#AAAAAA",
        chipBg: "#3F3F3F",
        chipText: "#F1F1F1",
        divider: "#3F3F3F",
        avatarBg: "#3F3F3F",
        avatarFg: "#AAAAAA",
      }
    : {
        bg: "#FFFFFF",
        border: "rgba(0,0,0,0.1)",
        text: "#0F0F0F",
        secondary: "#606060",
        chipBg: "#F2F2F2",
        chipText: "#0F0F0F",
        divider: "#E5E5E5",
        avatarBg: "#CCCCCC",
        avatarFg: "#FFFFFF",
      };
}

const link = (dark: boolean) => (dark ? "#3EA6FF" : "#065FD4");

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
  const copy = ctx.copy;
  const ar = r.avatarSize / 2;
  const cx = r.x + r.avatarSize + 12;
  const maxWidth = YOUTUBE_WIDTH - PAD - 26 - cx;
  let y = r.y;

  if (r.pinned) {
    const by = ctx.comment.reply?.author ?? r.author;
    out.push(icon(ICONS.pin, cx - 1, y, 13, p.secondary));
    out.push(ctx.text(cx + 15, y + 10.5, copy.pinnedBy(handle(by)), 400, 12, p.secondary));
    y += 20;
  }

  out.push(avatarEl(ctx, r.author.avatar, r.x + ar, y + ar, ar, p, r.author.username));

  let nx = cx;
  const nameBase = y + 11;
  const h = ctx.truncate(handle(r.author), r.isCreator ? 500 : 400, 12, maxWidth * 0.65);
  if (r.isCreator) {
    const c = chip(ctx, h, nx - 2, nameBase - 4, 12, p.chipBg, p.chipText, 6, 9, 500, 3);
    out.push(c.svg);
    nx += c.width + 2;
  } else {
    out.push(ctx.text(nx, nameBase, h, 400, 12, p.secondary));
    nx += ctx.measure(h, 400, 12) + 3;
  }
  if (r.author.verified) {
    out.push(icon(ICONS.checkCircle, nx, nameBase - 10, 12, p.secondary));
    nx += 14;
  } else nx += 1;
  out.push(ctx.text(nx, nameBase, `· ${r.timeAgo}`, 400, 12, p.secondary));

  const textTop = y + 16;
  const para = paragraph(ctx, r.text, {
    x: cx,
    top: textTop,
    maxWidth,
    size: 14,
    lineHeight: 20,
    weight: 400,
    fill: p.text,
  });
  out.push(para.svg);
  let bottom = textTop + para.height;

  if (ctx.options.seeTranslation) {
    out.push(ctx.text(cx, bottom + 14, copy.seeTranslation, 500, 12, p.text));
    bottom += 20;
  }

  const actionTop = bottom + 8;
  const iconSize = 16;
  const actionBase = actionTop + iconSize - 3.5;
  let ax = cx;
  out.push(icon(ICONS.ytThumbUp, ax, actionTop, iconSize, p.text));
  ax += iconSize + 6;
  if (r.likes > 0) {
    const count = formatCount(r.likes, { platform: "youtube", language: ctx.language });
    out.push(ctx.text(ax, actionBase, count, 400, 12, p.secondary));
    ax += ctx.measure(count, 400, 12) + 20;
  } else ax += 14;
  out.push(
    `<g transform="rotate(180 ${n(ax + iconSize / 2)} ${n(actionTop + 1 + iconSize / 2)})">${icon(ICONS.ytThumbUp, ax, actionTop + 1, iconSize, p.text)}</g>`,
  );
  ax += iconSize + 22;
  out.push(icon(ICONS.ytComment, ax, actionTop + 1, iconSize, p.text));
  ax += iconSize + 22;
  if (r.likedByCreator) {
    out.push(heartBadge(ctx, creatorAvatar(ctx), ax, actionTop + iconSize / 2, 16, p, YT_RED));
  }
  bottom = actionTop + iconSize;

  if (r.replyCount && r.replyCount > 0) {
    const count = formatCount(r.replyCount, { platform: "youtube", language: ctx.language });
    const label = copy.viewReplies(r.replyCount, count);
    const ly = bottom + 10;
    out.push(icon(ICONS.chevronDown, cx - 3, ly, 18, link(ctx.dark)));
    out.push(ctx.text(cx + 18, ly + 13, label, 500, 13, link(ctx.dark)));
    bottom = ly + 16;
  }

  out.push(icon(ICONS.dotsVertical, YOUTUBE_WIDTH - PAD - 16, y - 1, 16, p.text));
  return { svg: out.join(""), height: Math.max(bottom, y + r.avatarSize) - r.y };
}

export function buildYouTube(ctx: CardCtx): CardBody {
  const p = palette(ctx.dark);
  const c = ctx.comment;
  const parts: string[] = [];
  let y = PAD_Y;
  const withReply = ctx.template.variant === "creator-reply" && !!c.reply;
  const replyCount = c.replies ?? (c.reply ? 1 : 0);
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
    ...(!withReply && replyCount > 0 ? { replyCount } : {}),
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
      x: PAD + 24 + 12,
      y,
    });
    parts.push(reply.svg);
    y += reply.height;
  }

  const height = y + PAD_Y + 2;
  return finish(
    ctx,
    card(ctx, YOUTUBE_WIDTH, height, RADIUS, p, parts.join("")),
    YOUTUBE_WIDTH,
    height,
  );
}
