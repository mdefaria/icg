import type { Comment, OverlaySpec, Theme } from "@icg/shared";

export type EmojiAssets = Record<string, string>;

export const CARD = {
  width: 920,
  padding: 36,
  avatar: 96,
  gap: 24,
  usernameSize: 30,
  textSize: 40,
  lineHeight: 52,
  metaSize: 28,
  maxChars: 32,
  radius: 28,
} as const;

type Palette = {
  background: string;
  backgroundOpacity: number;
  text: string;
  secondary: string;
  avatar: string;
  heart: string;
};

const PALETTES: Record<Theme, Palette> = {
  dark: {
    background: "#161823",
    backgroundOpacity: 0.94,
    text: "#ffffff",
    secondary: "#a8a9ad",
    avatar: "#3d4f8a",
    heart: "#8a8b91",
  },
  light: {
    background: "#ffffff",
    backgroundOpacity: 0.96,
    text: "#161823",
    secondary: "#75767b",
    avatar: "#3d4f8a",
    heart: "#75767b",
  },
};

export type TextRun = { kind: "text"; value: string } | { kind: "emoji"; value: string };

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const NARROW = new Set([..."iljtfI.,:;'!| "]);
const WIDE = new Set([..."mwMW@"]);

export function estimateWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    if (NARROW.has(char)) em += 0.3;
    else if (WIDE.has(char)) em += 0.86;
    else if (/[A-Z0-9]/.test(char)) em += 0.66;
    else em += 0.56;
  }
  return em * fontSize;
}

export function splitRuns(text: string, knownEmoji: string[]): TextRun[] {
  const runs: TextRun[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) runs.push({ kind: "text", value: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const emoji = knownEmoji.find((e) => text.startsWith(e, i));
    if (emoji) {
      flush();
      runs.push({ kind: "emoji", value: emoji });
      i += emoji.length;
    } else {
      buffer += text[i];
      i += 1;
    }
  }
  flush();
  return runs;
}

export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if ([...candidate].length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${trimZero((count / 1_000_000).toFixed(1))}M`;
  if (count >= 1_000) return `${trimZero((count / 1_000).toFixed(1))}K`;
  return String(count);
}

function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

export function inlineEmojiSvg(markup: string, x: number, y: number, size: number): string {
  const viewBox = /viewBox="([^"]+)"/.exec(markup)?.[1] ?? "0 0 36 36";
  const inner = markup.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${viewBox}">${inner}</svg>`;
}

function textRunsSvg(
  runs: TextRun[],
  x: number,
  baseline: number,
  fontSize: number,
  fill: string,
  emoji: EmojiAssets,
): string {
  let cursor = x;
  const parts: string[] = [];
  for (const run of runs) {
    if (run.kind === "text") {
      parts.push(
        `<text x="${cursor}" y="${baseline}" font-family="Inter" font-size="${fontSize}" fill="${fill}" xml:space="preserve">${escapeXml(run.value)}</text>`,
      );
      cursor += estimateWidth(run.value, fontSize);
    } else {
      const size = fontSize * 1.15;
      const markup = emoji[run.value];
      if (markup) parts.push(inlineEmojiSvg(markup, cursor, baseline - size * 0.82, size));
      cursor += size + fontSize * 0.1;
    }
  }
  return parts.join("");
}

export function cardHeight(lineCount: number): number {
  return (
    CARD.padding +
    CARD.usernameSize +
    14 +
    lineCount * CARD.lineHeight +
    14 +
    CARD.metaSize +
    CARD.padding
  );
}

function avatarLetter(comment: Comment): string {
  const avatar = comment.author.avatar;
  if (avatar.kind === "default" && avatar.letter) return avatar.letter.toUpperCase();
  return (comment.author.displayName || comment.author.username).slice(0, 1).toUpperCase();
}

export function commentCardSvg(spec: OverlaySpec, emoji: EmojiAssets): string {
  const { comment, frame, placement, template } = spec;
  const palette = PALETTES[template.theme];
  const knownEmoji = Object.keys(emoji);
  const lines = wrapText(comment.text, CARD.maxChars);
  const height = cardHeight(lines.length);
  const textX = CARD.padding + CARD.avatar + CARD.gap;
  const usernameBaseline = CARD.padding + CARD.usernameSize - 4;
  const firstTextBaseline = usernameBaseline + 14 + CARD.lineHeight - 8;
  const metaBaseline =
    firstTextBaseline + (lines.length - 1) * CARD.lineHeight + 14 + CARD.metaSize;
  const scale = placement.scale;
  const originX = frame.width * placement.x - (CARD.width * scale) / 2;
  const originY = frame.height * placement.y - (height * scale) / 2;

  const lineSvg = lines
    .map((line, i) =>
      textRunsSvg(
        splitRuns(line, knownEmoji),
        textX,
        firstTextBaseline + i * CARD.lineHeight,
        CARD.textSize,
        palette.text,
        emoji,
      ),
    )
    .join("");

  const verified = comment.author.verified
    ? `<g transform="translate(${textX + estimateWidth(comment.author.username, CARD.usernameSize) + 10} ${usernameBaseline - 22})"><circle cx="12" cy="12" r="12" fill="#20d5ec"/><path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`
    : "";

  const likedByCreator = comment.likedByCreator
    ? `<text x="${textX + 70}" y="${metaBaseline}" font-family="Inter" font-size="${CARD.metaSize}" fill="${palette.secondary}">Liked by creator</text>`
    : "";

  const heartX = CARD.width - CARD.padding - 24;
  const heartY = firstTextBaseline - 30;
  const heart = `<g transform="translate(${heartX - 20} ${heartY})"><path d="M20 36s-16-9.4-16-21A9 9 0 0 1 20 9a9 9 0 0 1 16 6c0 11.6-16 21-16 21z" fill="none" stroke="${palette.heart}" stroke-width="3"/></g><text x="${heartX}" y="${heartY + 66}" text-anchor="middle" font-family="Inter" font-size="${CARD.metaSize}" fill="${palette.secondary}">${escapeXml(formatCount(comment.likes))}</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`,
    `<g transform="translate(${originX} ${originY}) scale(${scale})">`,
    `<rect width="${CARD.width}" height="${height}" rx="${CARD.radius}" fill="${palette.background}" fill-opacity="${palette.backgroundOpacity}"/>`,
    `<circle cx="${CARD.padding + CARD.avatar / 2}" cy="${CARD.padding + CARD.avatar / 2}" r="${CARD.avatar / 2}" fill="${palette.avatar}"/>`,
    `<text x="${CARD.padding + CARD.avatar / 2}" y="${CARD.padding + CARD.avatar / 2 + 16}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="44" fill="#ffffff">${escapeXml(avatarLetter(comment))}</text>`,
    `<text x="${textX}" y="${usernameBaseline}" font-family="Inter" font-weight="600" font-size="${CARD.usernameSize}" fill="${palette.secondary}">${escapeXml(comment.author.username)}</text>`,
    verified,
    lineSvg,
    `<text x="${textX}" y="${metaBaseline}" font-family="Inter" font-size="${CARD.metaSize}" fill="${palette.secondary}">${escapeXml(comment.timeAgo)}</text>`,
    likedByCreator,
    heart,
    `</g></svg>`,
  ].join("");
}
