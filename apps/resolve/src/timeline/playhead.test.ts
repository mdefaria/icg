import { describe, expect, it } from "vitest";
import { durationToFrames, resolvePlayhead } from "./playhead";

describe("resolvePlayhead", () => {
  it("anchors the playhead on the frame number Resolve reports for the timeline start", () => {
    expect(
      resolvePlayhead({
        currentTimecode: "01:00:10:00",
        startTimecode: "01:00:00:00",
        startFrame: 90000,
        frameRate: 25,
        dropFrame: false,
      }),
    ).toEqual({ frame: 90250, offsetFrames: 250, offsetSeconds: 10 });
  });

  it("keeps working when the start frame does not match the start timecode", () => {
    expect(
      resolvePlayhead({
        currentTimecode: "01:00:10:00",
        startTimecode: "01:00:00:00",
        startFrame: 0,
        frameRate: 25,
        dropFrame: false,
      }),
    ).toMatchObject({ frame: 250 });
  });

  it("uses drop-frame counting when the timeline is drop-frame", () => {
    expect(
      resolvePlayhead({
        currentTimecode: "01:10:00;00",
        startTimecode: "01:00:00;00",
        startFrame: 107892,
        frameRate: 29.97,
        dropFrame: true,
      }),
    ).toMatchObject({ frame: 107892 + 17982, offsetFrames: 17982 });
  });

  it("never goes before the timeline start", () => {
    expect(
      resolvePlayhead({
        currentTimecode: "00:59:59:00",
        startTimecode: "01:00:00:00",
        startFrame: 90000,
        frameRate: 25,
        dropFrame: false,
      }),
    ).toMatchObject({ frame: 90000, offsetFrames: 0 });
  });

  it("returns null for unparsable timecode", () => {
    expect(
      resolvePlayhead({
        currentTimecode: "garbage",
        startTimecode: "01:00:00:00",
        startFrame: 90000,
        frameRate: 25,
        dropFrame: false,
      }),
    ).toBeNull();
  });
});

describe("durationToFrames", () => {
  it("rounds to whole frames and never returns zero", () => {
    expect(durationToFrames(3, 25)).toBe(75);
    expect(durationToFrames(3, 29.97)).toBe(90);
    expect(durationToFrames(3, 23.976)).toBe(72);
    expect(durationToFrames(0.001, 25)).toBe(1);
  });
});
