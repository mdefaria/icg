import { describe, expect, it } from "vitest";
import { chooseTrack, isTrackFree, overlaps, spanAt, type TrackOccupancy } from "./trackSelection";

const span = spanAt(10, 3);
const clip = (startSeconds: number, endSeconds: number) => ({ startSeconds, endSeconds });
const track = (index: number, ...clips: ReturnType<typeof clip>[]): TrackOccupancy => ({
  index,
  clips,
});

describe("overlaps", () => {
  it("treats touching edges as free", () => {
    expect(overlaps(clip(0, 10), span)).toBe(false);
    expect(overlaps(clip(13, 20), span)).toBe(false);
    expect(overlaps(clip(9, 10.5), span)).toBe(true);
    expect(overlaps(clip(12.9, 20), span)).toBe(true);
    expect(overlaps(clip(0, 100), span)).toBe(true);
  });
});

describe("isTrackFree", () => {
  it("is free when no clip overlaps the span", () => {
    expect(isTrackFree(track(0, clip(0, 10), clip(13, 15)), span)).toBe(true);
    expect(isTrackFree(track(0, clip(0, 10), clip(11, 12)), span)).toBe(false);
  });
});

describe("chooseTrack", () => {
  it("asks for a track when the sequence has none", () => {
    expect(chooseTrack([], span)).toEqual({ kind: "create", index: 0 });
  });

  it("picks V1 when it is free and nothing above is occupied", () => {
    expect(chooseTrack([track(0), track(1)], span)).toEqual({ kind: "existing", index: 0 });
  });

  it("picks the first free track above the footage", () => {
    const tracks = [track(0, clip(0, 60)), track(1), track(2)];
    expect(chooseTrack(tracks, span)).toEqual({ kind: "existing", index: 1 });
  });

  it("skips a free track that sits below occupied content", () => {
    const tracks = [track(0), track(1, clip(5, 20)), track(2)];
    expect(chooseTrack(tracks, span)).toEqual({ kind: "existing", index: 2 });
  });

  it("asks for a new track when every track is occupied or below content", () => {
    const tracks = [track(0, clip(0, 60)), track(1), track(2, clip(11, 12))];
    expect(chooseTrack(tracks, span)).toEqual({ kind: "create", index: 3 });
  });

  it("ignores the order tracks arrive in", () => {
    const tracks = [track(2), track(0, clip(0, 60)), track(1)];
    expect(chooseTrack(tracks, span)).toEqual({ kind: "existing", index: 1 });
  });
});
