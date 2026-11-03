import { describe, expect, it } from "vitest";
import {
  framesToTimecode,
  parseFrameRate,
  parseTimecode,
  supportsDropFrame,
  timecodeToFrames,
} from "./timecode";

describe("parseTimecode", () => {
  it("reads non-drop and drop-frame separators", () => {
    expect(parseTimecode("01:02:03:04")).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 3,
      frames: 4,
      dropFrame: false,
    });
    expect(parseTimecode("01:02:03;04")).toMatchObject({ dropFrame: true });
    expect(parseTimecode(" 00:00:00:00 ")).toMatchObject({ hours: 0 });
  });

  it("rejects malformed input", () => {
    expect(parseTimecode("1:2:3:4")).toBeNull();
    expect(parseTimecode("")).toBeNull();
    expect(parseTimecode("01:00:00")).toBeNull();
  });
});

describe("parseFrameRate", () => {
  it("accepts Resolve's setting strings", () => {
    expect(parseFrameRate("25")).toEqual({ frameRate: 25, dropFrame: false });
    expect(parseFrameRate("29.97")).toEqual({ frameRate: 29.97, dropFrame: false });
    expect(parseFrameRate("29.97 DF")).toEqual({ frameRate: 29.97, dropFrame: true });
    expect(parseFrameRate("23.976")).toEqual({ frameRate: 23.976, dropFrame: false });
    expect(parseFrameRate("")).toBeNull();
    expect(parseFrameRate("0")).toBeNull();
  });
});

describe("timecodeToFrames", () => {
  it("counts non-drop frames at integer and fractional rates", () => {
    expect(timecodeToFrames("01:00:00:00", 25)).toBe(90000);
    expect(timecodeToFrames("01:00:00:00", 30)).toBe(108000);
    expect(timecodeToFrames("00:00:01:00", 23.976)).toBe(24);
    expect(timecodeToFrames("00:00:10:12", 24)).toBe(252);
  });

  it("counts drop-frame timecode at 29.97", () => {
    expect(timecodeToFrames("00:00:00;00", 29.97)).toBe(0);
    expect(timecodeToFrames("00:00:59;29", 29.97)).toBe(1799);
    expect(timecodeToFrames("00:01:00;02", 29.97)).toBe(1800);
    expect(timecodeToFrames("00:10:00;00", 29.97)).toBe(17982);
    expect(timecodeToFrames("01:00:00;00", 29.97)).toBe(107892);
  });

  it("counts drop-frame timecode at 59.94", () => {
    expect(timecodeToFrames("00:01:00;04", 59.94)).toBe(3600);
    expect(timecodeToFrames("01:00:00;00", 59.94)).toBe(215784);
  });

  it("lets an explicit flag override the separator", () => {
    expect(timecodeToFrames("01:00:00:00", 29.97, true)).toBe(107892);
    expect(timecodeToFrames("01:00:00;00", 29.97, false)).toBe(108000);
  });

  it("ignores drop-frame at rates that cannot drop", () => {
    expect(supportsDropFrame(25)).toBe(false);
    expect(supportsDropFrame(30)).toBe(false);
    expect(supportsDropFrame(29.97)).toBe(true);
    expect(supportsDropFrame(59.94)).toBe(true);
    expect(timecodeToFrames("01:00:00;00", 25)).toBe(90000);
  });

  it("returns null for malformed timecode", () => {
    expect(timecodeToFrames("nope", 25)).toBeNull();
  });
});

describe("framesToTimecode", () => {
  it("formats non-drop timecode", () => {
    expect(framesToTimecode(90000, 25, false)).toBe("01:00:00:00");
    expect(framesToTimecode(252, 24, false)).toBe("00:00:10:12");
  });

  it("formats drop-frame timecode and skips dropped numbers", () => {
    expect(framesToTimecode(1799, 29.97, true)).toBe("00:00:59;29");
    expect(framesToTimecode(1800, 29.97, true)).toBe("00:01:00;02");
    expect(framesToTimecode(17982, 29.97, true)).toBe("00:10:00;00");
    expect(framesToTimecode(107892, 29.97, true)).toBe("01:00:00;00");
    expect(framesToTimecode(3600, 59.94, true)).toBe("00:01:00;04");
  });

  it("round-trips every frame of the first hour at 29.97 DF", () => {
    for (let frame = 0; frame < 107892; frame += 7) {
      expect(timecodeToFrames(framesToTimecode(frame, 29.97, true), 29.97)).toBe(frame);
    }
  });

  it("round-trips sampled frames at 59.94 DF", () => {
    for (let frame = 0; frame < 215784; frame += 131) {
      expect(timecodeToFrames(framesToTimecode(frame, 59.94, true), 59.94)).toBe(frame);
    }
  });
});
