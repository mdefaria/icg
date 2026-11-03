import type { FontFamily, FontWeight } from "./fonts";

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const n = (v: number): string => (Math.round(v * 100) / 100).toString();

export type TextStyle = {
  family: FontFamily;
  weight: FontWeight;
  size: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  opacity?: number;
  letterSpacing?: number;
};

export function textEl(x: number, baseline: number, text: string, s: TextStyle): string {
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(baseline)}"`,
    `font-family="${s.family}"`,
    `font-weight="${s.weight}"`,
    `font-size="${n(s.size)}"`,
    `fill="${s.fill}"`,
  ];
  if (s.anchor && s.anchor !== "start") attrs.push(`text-anchor="${s.anchor}"`);
  if (s.opacity !== undefined && s.opacity !== 1) attrs.push(`fill-opacity="${n(s.opacity)}"`);
  if (s.letterSpacing) attrs.push(`letter-spacing="${n(s.letterSpacing)}"`);
  return `<text ${attrs.join(" ")} xml:space="preserve">${esc(text)}</text>`;
}

export function icon(
  path: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  viewBox = 24,
): string {
  const k = size / viewBox;
  return `<path transform="translate(${n(x)} ${n(y)}) scale(${n(k)})" d="${path}" fill="${fill}"/>`;
}

export function strokeIcon(
  path: string,
  x: number,
  y: number,
  size: number,
  stroke: string,
  strokeWidth: number,
  viewBox = 24,
): string {
  const k = size / viewBox;
  return `<path transform="translate(${n(x)} ${n(y)}) scale(${n(k)})" d="${path}" fill="none" stroke="${stroke}" stroke-width="${n(strokeWidth / k)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export const ICONS = {
  heart:
    "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  pin: "M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z",
  checkBold: "M9.55 18.2 3.65 12.3l1.9-1.9 4 4 9-9 1.9 1.9z",
  chevronDown: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
  xReply:
    "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z",
  xRepost:
    "M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z",
  xHeart:
    "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z",
  xViews: "M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z",
  xBookmark:
    "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z",
  xShare:
    "M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z",
  xVerified:
    "M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z",
  heartStroke:
    "M12 20.2s-7.6-4.5-9.3-9.3C1.5 7.5 3.6 4.3 7 4.3c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.4 0 5.5 3.2 4.3 6.6-1.7 4.8-9.3 9.3-9.3 9.3z",
  ytThumbUp:
    "M13.11 5.72l-.57 2.89c-.12.59.04 1.2.42 1.66.38.46.94.73 1.54.73H20v1.08L17.43 18H9.34c-.18 0-.34-.16-.34-.34V9.82l4.11-4.1M14 2L7.59 8.41C7.21 8.79 7 9.3 7 9.83v7.83C7 18.95 8.05 20 9.34 20h8.1c.71 0 1.36-.37 1.72-.97l2.67-6.15c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2zM4 9H2v11h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1z",
  ytComment:
    "M8 7h8v1.5H8zm0 3.25h6v1.5H8zM20 3H4c-1.1 0-2 .9-2 2v16l4-4h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm.5 12c0 .28-.22.5-.5.5H5.38L3.5 17.38V5c0-.28.22-.5.5-.5h16c.28 0 .5.22.5.5v10z",
  dotsVertical:
    "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  checkCircle:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
} as const;

export function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  extra = "",
): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
}

export function circle(cx: number, cy: number, r: number, fill: string, extra = ""): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
}

export function scallopedBadge(
  cx: number,
  cy: number,
  r: number,
  lobes: number,
  depth: number,
  fill: string,
): string {
  const steps = lobes * 8;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (1 - depth / 2 + (depth / 2) * Math.cos(a * lobes));
    points.push(`${n(cx + rr * Math.cos(a))} ${n(cy + rr * Math.sin(a))}`);
  }
  return `<path d="M${points.join("L")}Z" fill="${fill}"/>`;
}
