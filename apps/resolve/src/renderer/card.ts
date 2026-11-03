import type { OverlaySpec } from "@icg/shared";

const CARD_WIDTH = 920;
const PADDING = 40;
const AVATAR = 88;
const TEXT_SIZE = 38;
const LINE_HEIGHT = 50;
const META_SIZE = 30;

export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatLikes(likes: number): string {
  if (likes >= 1_000_000) return `${(likes / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (likes >= 1_000) return `${(likes / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(likes);
}

export function commentCardSvg(spec: OverlaySpec): string {
  const { comment, frame, placement, template } = spec;
  const dark = template.theme === "dark";
  const colors = dark
    ? { card: "#161823", text: "#ffffff", muted: "#a3a4ad", accent: "#20d5ec", heart: "#fe2c55" }
    : { card: "#ffffff", text: "#161823", muted: "#7a7b85", accent: "#20d5ec", heart: "#fe2c55" };

  const textX = PADDING + AVATAR + 28;
  const textWidth = CARD_WIDTH - textX - PADDING;
  const lines = wrapText(comment.text, Math.floor(textWidth / (TEXT_SIZE * 0.5)));
  const cardHeight = PADDING * 2 + 48 + lines.length * LINE_HEIGHT + 36 + META_SIZE + 10;

  const scaledWidth = CARD_WIDTH * placement.scale;
  const scaledHeight = cardHeight * placement.scale;
  const left = placement.x * frame.width - scaledWidth / 2;
  const top = placement.y * frame.height - scaledHeight / 2;

  const letter =
    comment.author.avatar.kind === "default" ? comment.author.avatar.letter : undefined;
  const initial = (letter ?? comment.author.displayName.charAt(0) ?? "?").toUpperCase();

  const textLines = lines
    .map(
      (line, i) =>
        `<text x="${textX}" y="${PADDING + 48 + 28 + (i + 1) * LINE_HEIGHT - 12}" font-size="${TEXT_SIZE}" fill="${colors.text}">${escapeXml(line)}</text>`,
    )
    .join("");

  const metaY = cardHeight - PADDING - 4;
  const badge = comment.author.verified
    ? `<g transform="translate(${textX + comment.author.displayName.length * 19 + 14}, ${PADDING + 10})"><circle r="14" cx="14" cy="14" fill="${colors.accent}"/><path d="M8 14.5l4 4 8-9" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" font-family="Inter">
  <g transform="translate(${left.toFixed(2)}, ${top.toFixed(2)}) scale(${placement.scale})">
    <rect width="${CARD_WIDTH}" height="${cardHeight}" rx="32" fill="${colors.card}" fill-opacity="${dark ? 0.92 : 0.96}"/>
    <circle cx="${PADDING + AVATAR / 2}" cy="${PADDING + AVATAR / 2}" r="${AVATAR / 2}" fill="#4b5cc4"/>
    <text x="${PADDING + AVATAR / 2}" y="${PADDING + AVATAR / 2 + 15}" font-size="44" font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(initial)}</text>
    <text x="${textX}" y="${PADDING + 36}" font-size="34" font-weight="600" fill="${colors.text}">${escapeXml(comment.author.displayName)}</text>
    ${badge}
    ${textLines}
    <text x="${textX}" y="${metaY}" font-size="${META_SIZE}" fill="${colors.muted}">${escapeXml(comment.timeAgo)}</text>
    <text x="${textX + 110}" y="${metaY}" font-size="${META_SIZE}" font-weight="600" fill="${colors.muted}">Reply</text>
    <path transform="translate(${CARD_WIDTH - PADDING - 120}, ${metaY - 30}) scale(1.5)" d="M12 21s-7-4.6-9.3-8.2C.6 9.5 2.4 5 6.5 5c2 0 3.4 1 4.5 2.5C12.1 6 13.5 5 15.5 5c4.1 0 5.9 4.5 3.8 7.8C19 16.4 12 21 12 21z" fill="${colors.heart}"/>
    <text x="${CARD_WIDTH - PADDING - 72}" y="${metaY}" font-size="${META_SIZE}" fill="${colors.muted}">${formatLikes(comment.likes)}</text>
  </g>
</svg>`;
}
