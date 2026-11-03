import type { Frame, Placement, Platform } from "@icg/shared";
import type { Box } from "./images";

export type CardFraction = { width: number; height: number };

export function cardFraction(
  card: { width: number; height: number },
  frame: Frame,
  scale: number,
): CardFraction {
  return {
    width: (card.width * scale) / frame.width,
    height: (card.height * scale) / frame.height,
  };
}

export const SNAP_MARGIN = 0.04;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function clampPlacement(p: Placement): Placement {
  return { x: clamp01(p.x), y: clamp01(p.y), scale: p.scale };
}

export function snapLines(size: CardFraction): { xs: number[]; ys: number[] } {
  const line = (extent: number) => {
    const half = extent / 2;
    const low = clamp01(SNAP_MARGIN + half);
    const high = clamp01(1 - SNAP_MARGIN - half);
    return low <= 0.5 && high >= 0.5 ? [low, 0.5, high] : [0.5, 0.5, 0.5];
  };
  return { xs: line(size.width), ys: line(size.height) };
}

const nearestIndex = (lines: number[], v: number) =>
  lines.reduce((best, line, i) => (Math.abs(line - v) < Math.abs(lines[best]! - v) ? i : best), 0);

export function snapPlacement(p: Placement, size: CardFraction): Placement {
  const { xs, ys } = snapLines(size);
  return { ...p, x: xs[nearestIndex(xs, p.x)]!, y: ys[nearestIndex(ys, p.y)]! };
}

export const NUDGE_STEP = 0.01;
export const NUDGE_STEP_LARGE = 0.05;

export type Direction = "left" | "right" | "up" | "down";

export function nudgePlacement(
  p: Placement,
  direction: Direction,
  options: { snap: CardFraction | null; large: boolean },
): Placement {
  const dx = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  const dy = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  if (options.snap) {
    const { xs, ys } = snapLines(options.snap);
    const xi = Math.min(2, Math.max(0, nearestIndex(xs, p.x) + dx));
    const yi = Math.min(2, Math.max(0, nearestIndex(ys, p.y) + dy));
    return { ...p, x: xs[xi]!, y: ys[yi]! };
  }
  const step = options.large ? NUDGE_STEP_LARGE : NUDGE_STEP;
  return clampPlacement({ ...p, x: round(p.x + dx * step), y: round(p.y + dy * step) });
}

export const round = (v: number) => Math.round(v * 10000) / 10000;

export type SafeZone = { label: string; box: Box };

export const SAFE_ZONES: Record<Platform, SafeZone[]> = {
  tiktok: [
    { label: "Rail", box: { x: 0.84, y: 0.36, width: 0.16, height: 0.52 } },
    { label: "Caption", box: { x: 0, y: 0.78, width: 0.8, height: 0.14 } },
  ],
  instagram: [{ label: "Bottom bar", box: { x: 0, y: 0.8, width: 1, height: 0.2 } }],
  youtube: [{ label: "Rail", box: { x: 0.84, y: 0.44, width: 0.16, height: 0.44 } }],
  x: [],
};

export const isPortrait = (frame: Frame) => frame.height / frame.width >= 1.2;

export type BatchItem = { placement: Placement; offsetSeconds: number };

export const STACK_GAP = 0.01;
export const STACK_FALLBACK_HEIGHT = 0.06;

export function planBatch(
  base: Placement,
  heights: (number | null)[],
  staggerSeconds: number,
): BatchItem[] {
  let y = base.y;
  return heights.map((height, i) => {
    if (i > 0) {
      const prev = heights[i - 1] ?? STACK_FALLBACK_HEIGHT;
      y += prev / 2 + (height ?? STACK_FALLBACK_HEIGHT) / 2 + STACK_GAP;
    }
    return {
      placement: { ...base, y: round(clamp01(y)) },
      offsetSeconds: round(i * staggerSeconds),
    };
  });
}
