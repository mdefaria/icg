import { describe, expect, it } from "vitest";
import {
  STACK_FALLBACK_HEIGHT,
  STACK_GAP,
  SNAP_MARGIN,
  cardFraction,
  nudgePlacement,
  planBatch,
  snapLines,
  snapPlacement,
} from "./placement";

describe("planBatch", () => {
  it("staggers offsets and stacks each card below the previous one", () => {
    const plan = planBatch({ x: 0.5, y: 0.2, scale: 1 }, [0.1, 0.2, null], 0.5);
    expect(plan.map((p) => p.offsetSeconds)).toEqual([0, 0.5, 1]);
    expect(plan[0]!.placement.y).toBe(0.2);
    expect(plan[1]!.placement.y).toBeCloseTo(0.2 + 0.05 + 0.1 + STACK_GAP, 4);
    expect(plan[2]!.placement.y).toBeCloseTo(
      plan[1]!.placement.y + 0.1 + STACK_FALLBACK_HEIGHT / 2 + STACK_GAP,
      4,
    );
  });

  it("never pushes a card below the Frame", () => {
    const plan = planBatch({ x: 0.5, y: 0.9, scale: 1 }, [0.3, 0.3, 0.3], 0);
    expect(plan.map((p) => p.placement.y)).toEqual([0.9, 1, 1]);
    expect(plan.map((p) => p.offsetSeconds)).toEqual([0, 0, 0]);
  });
});

describe("snapping", () => {
  const size = cardFraction({ width: 540, height: 384 }, { width: 1080, height: 1920 }, 1);

  it("offers left, centre and right lines inside the margin", () => {
    expect(size).toEqual({ width: 0.5, height: 0.2 });
    const { xs, ys } = snapLines(size);
    expect(xs).toEqual([SNAP_MARGIN + 0.25, 0.5, 1 - SNAP_MARGIN - 0.25]);
    expect(ys[0]).toBeCloseTo(SNAP_MARGIN + 0.1);
  });

  it("snaps to the nearest of the nine points", () => {
    expect(snapPlacement({ x: 0.1, y: 0.95, scale: 1 }, size)).toMatchObject({
      x: SNAP_MARGIN + 0.25,
      y: 1 - SNAP_MARGIN - 0.1,
    });
  });

  it("collapses to the centre when the card is too wide to move", () => {
    expect(snapLines({ width: 0.98, height: 0.2 }).xs).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("nudgePlacement", () => {
  it("moves by small and large steps and clamps", () => {
    const p = { x: 0.5, y: 0.005, scale: 1 };
    expect(nudgePlacement(p, "right", { snap: null, large: false })).toMatchObject({ x: 0.51 });
    expect(nudgePlacement(p, "left", { snap: null, large: true })).toMatchObject({ x: 0.45 });
    expect(nudgePlacement(p, "up", { snap: null, large: false })).toMatchObject({ y: 0 });
  });
});
