import { describe, expect, it } from "vitest";
import { isRangeFree, planInsert } from "./tracks";

describe("isRangeFree", () => {
  it("treats item end as exclusive", () => {
    expect(isRangeFree([{ start: 0, end: 100 }], 100, 50)).toBe(true);
    expect(isRangeFree([{ start: 0, end: 100 }], 99, 50)).toBe(false);
    expect(isRangeFree([{ start: 150, end: 200 }], 100, 50)).toBe(true);
    expect(isRangeFree([{ start: 149, end: 200 }], 100, 50)).toBe(false);
  });

  it("detects an item that swallows the range", () => {
    expect(isRangeFree([{ start: 0, end: 1000 }], 100, 50)).toBe(false);
  });
});

describe("planInsert", () => {
  it("picks the lowest track that is empty for the whole duration", () => {
    const plan = planInsert(
      [
        { index: 1, items: [{ start: 0, end: 500 }] },
        { index: 2, items: [{ start: 120, end: 130 }] },
        { index: 3, items: [] },
      ],
      100,
      75,
    );
    expect(plan).toEqual({ trackIndex: 3, tracksToAdd: 0 });
  });

  it("uses V1 when it is empty at the playhead", () => {
    expect(planInsert([{ index: 1, items: [{ start: 0, end: 90 }] }], 100, 75)).toEqual({
      trackIndex: 1,
      tracksToAdd: 0,
    });
  });

  it("asks for a new track above the highest one when every track is busy", () => {
    expect(
      planInsert(
        [
          { index: 1, items: [{ start: 0, end: 500 }] },
          { index: 2, items: [{ start: 0, end: 500 }] },
        ],
        100,
        75,
      ),
    ).toEqual({ trackIndex: 3, tracksToAdd: 1 });
  });

  it("asks for V1 on a timeline with no video tracks", () => {
    expect(planInsert([], 0, 75)).toEqual({ trackIndex: 1, tracksToAdd: 1 });
  });

  it("does not depend on the order tracks are listed in", () => {
    expect(
      planInsert(
        [
          { index: 2, items: [] },
          { index: 1, items: [] },
        ],
        0,
        10,
      ),
    ).toEqual({ trackIndex: 1, tracksToAdd: 0 });
  });
});
