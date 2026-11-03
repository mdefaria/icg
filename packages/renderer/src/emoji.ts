export type EmojiSet = "noto" | "twemoji";

export type Segment =
  { kind: "text"; text: string } | { kind: "emoji"; cluster: string; codepoints: number[] };

const ZWJ = 0x200d;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const REGIONAL = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function isEmojiCluster(cluster: string): boolean {
  if (REGIONAL.test(cluster)) return true;
  if (cluster.includes(String.fromCodePoint(KEYCAP))) return true;
  if (EMOJI_PRESENTATION.test(cluster)) return true;
  if (!EXTENDED_PICTOGRAPHIC.test(cluster)) return false;
  return (
    cluster.includes(String.fromCodePoint(VS16)) ||
    cluster.includes(String.fromCodePoint(ZWJ)) ||
    SKIN_TONE.test(cluster)
  );
}

export function codepointsOf(cluster: string): number[] {
  return Array.from(cluster, (c) => c.codePointAt(0) ?? 0);
}

export function segmentEmoji(text: string): Segment[] {
  const out: Segment[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ kind: "text", text: buffer });
    buffer = "";
  };
  for (const { segment } of segmenter.segment(text)) {
    if (isEmojiCluster(segment)) {
      flush();
      out.push({ kind: "emoji", cluster: segment, codepoints: codepointsOf(segment) });
    } else {
      buffer += segment;
    }
  }
  flush();
  return out;
}

const hex = (cp: number) => cp.toString(16);

export function emojiFileName(set: EmojiSet, codepoints: number[]): string {
  if (set === "noto") {
    return `emoji_u${codepoints
      .filter((cp) => cp !== VS16)
      .map(hex)
      .join("_")}.svg`;
  }
  const hasZwj = codepoints.includes(ZWJ);
  return `${codepoints
    .filter((cp) => hasZwj || cp !== VS16)
    .map(hex)
    .join("-")}.svg`;
}

export function emojiFallbacks(codepoints: number[]): number[][] {
  const out: number[][] = [codepoints];
  const noVs = codepoints.filter((cp) => cp !== VS16);
  if (noVs.length !== codepoints.length) out.push(noVs);
  const noTone = noVs.filter((cp) => !SKIN_TONE.test(String.fromCodePoint(cp)));
  if (noTone.length !== noVs.length) out.push(noTone);
  const first = noTone[0];
  if (noTone.length > 1 && first !== undefined) out.push([first]);
  return out;
}

export interface EmojiLoader {
  svg(set: EmojiSet, codepoints: number[]): string | undefined;
}

export function createEmojiLoader(
  files: Partial<Record<EmojiSet, Record<string, string>>>,
): EmojiLoader {
  return {
    svg(set, codepoints) {
      const table = files[set];
      if (!table) return undefined;
      for (const candidate of emojiFallbacks(codepoints)) {
        const hit = table[emojiFileName(set, candidate)];
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

export const emojiSetFor = (platform: string): EmojiSet => (platform === "x" ? "twemoji" : "noto");

export function emojiDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
