import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TICKS = 254016000000;
const source = readFileSync(fileURLToPath(new URL("../../jsx/icg.jsx", import.meta.url)), "utf8");

class FakeTime {
  private _ticks = 0;
  get ticks(): string {
    return String(this._ticks);
  }
  set ticks(value: string) {
    this._ticks = Number(value);
  }
  get seconds(): number {
    return this._ticks / TICKS;
  }
  set seconds(value: number) {
    this._ticks = Math.round(value * TICKS);
  }
  static at(seconds: number): FakeTime {
    const t = new FakeTime();
    t.seconds = seconds;
    return t;
  }
}

type FakeClip = { name: string; nodeId: string; start: FakeTime; end: FakeTime; remove(): void };
type OverwriteMode = "ticks-only" | "seconds-only" | "time-only";

let nextId = 1;

class FakeTrack {
  readonly items: FakeClip[] = [];
  constructor(
    readonly name: string,
    private readonly mode: OverwriteMode,
  ) {}

  get clips() {
    const collection: Record<number, FakeClip> & { numItems: number } = {
      numItems: this.items.length,
    };
    this.items.forEach((clip, i) => (collection[i] = clip));
    return collection;
  }

  addClip(startSeconds: number, endSeconds: number, name = "footage"): FakeClip {
    const clip: FakeClip = {
      name,
      nodeId: `clip-${nextId++}`,
      start: FakeTime.at(startSeconds),
      end: FakeTime.at(endSeconds),
      remove: () => this.items.splice(this.items.indexOf(clip), 1),
    };
    this.items.push(clip);
    this.items.sort((a, b) => a.start.seconds - b.start.seconds);
    return clip;
  }

  overwriteClip(item: { name: string; durationSeconds: number }, time: unknown): boolean {
    let startSeconds: number;
    if (typeof time === "number") {
      if (this.mode !== "seconds-only") startSeconds = time / TICKS;
      else startSeconds = time;
    } else if (typeof time === "string") {
      if (this.mode !== "ticks-only") throw new Error("overwriteClip: bad argument");
      startSeconds = Number(time) / TICKS;
    } else if (time instanceof FakeTime) {
      if (this.mode !== "time-only") throw new Error("overwriteClip: bad argument");
      startSeconds = time.seconds;
    } else {
      throw new Error("overwriteClip: unsupported time");
    }
    this.addClip(startSeconds, startSeconds + item.durationSeconds, item.name);
    return true;
  }
}

function collection<T>(items: T[], countKey: "numTracks" | "numItems") {
  const out: Record<number, T> & Record<string, unknown> = {};
  items.forEach((item, i) => (out[i] = item));
  out[countKey] = items.length;
  return out;
}

function fakePremiere(
  options: { mode?: OverwriteMode; playhead?: number; sequence?: boolean } = {},
) {
  const mode = options.mode ?? "seconds-only";
  const tracks: FakeTrack[] = [new FakeTrack("Video 1", mode), new FakeTrack("Video 2", mode)];
  const bin = { type: 2, children: collection([] as unknown[], "numItems") };
  const imported: unknown[] = [];
  const sequence = {
    name: "Reel 01",
    frameSizeHorizontal: 1080,
    frameSizeVertical: 1920,
    timebase: String(TICKS / 30),
    get videoTracks() {
      return collection(tracks, "numTracks");
    },
    audioTracks: collection([{}], "numTracks"),
    getPlayerPosition: () => FakeTime.at(options.playhead ?? 10),
    getSettings: () => ({ videoFrameWidth: 1080, videoFrameHeight: 1920 }),
  };
  const addTracksCalls: unknown[][] = [];
  const app = {
    version: "25.2.0",
    enableQE: () => undefined,
    project: {
      activeSequence: options.sequence === false ? 0 : sequence,
      rootItem: bin,
      getInsertionBin: () => 0,
      importFiles: (paths: string[], _suppress: boolean, target: unknown) => {
        expect(target).toBe(bin);
        for (const path of paths) {
          const item = {
            type: 1,
            name: path.split(/[\\/]/).pop(),
            durationSeconds: 5,
            getMediaPath: () => path,
            setOutPoint(seconds: number) {
              item.durationSeconds = seconds;
            },
            getInPoint: () => FakeTime.at(0),
            getOutPoint: () => FakeTime.at(item.durationSeconds),
            setScaleToFrameSize: () => undefined,
          };
          imported.push(item);
          bin.children = collection(imported, "numItems");
        }
        return true;
      },
    },
  };
  const qe = {
    project: {
      getActiveSequence: () => ({
        addTracks: (...args: unknown[]) => {
          addTracksCalls.push(args);
          if (args.length === 7) tracks.push(new FakeTrack(`Video ${tracks.length + 1}`, mode));
        },
      }),
    },
  };
  const factory = new Function(
    "app",
    "qe",
    "Time",
    "ProjectItemType",
    "JSON",
    `${source}\nreturn ICG;`,
  );
  const ICG = factory(app, qe, FakeTime, { BIN: 2, CLIP: 1 }, JSON) as Record<
    string,
    (arg?: string) => string
  >;
  return { ICG, tracks, imported, addTracksCalls };
}

const call = (ICG: Record<string, (arg?: string) => string>, fn: string, args?: unknown) =>
  JSON.parse(ICG[fn]!(args === undefined ? undefined : JSON.stringify(args)) as string) as {
    ok: boolean;
    result?: Record<string, unknown>;
    error?: { code: string; message: string };
  };

describe("icg.jsx against a fake Premiere DOM", () => {
  it("reports sequence info with frame rate derived from the timebase", () => {
    const { ICG } = fakePremiere();
    expect(call(ICG, "getSequenceInfo")).toEqual({
      ok: true,
      result: { name: "Reel 01", width: 1080, height: 1920, frameRate: 30 },
    });
    expect(call(ICG, "ping")).toEqual({ ok: true, result: { version: "25.2.0", qe: true } });
  });

  it("returns null without an active sequence", () => {
    const { ICG } = fakePremiere({ sequence: false });
    expect(call(ICG, "getSequenceInfo")).toEqual({ ok: true, result: null });
    expect(call(ICG, "getTimeline")).toEqual({ ok: true, result: null });
    expect(
      call(ICG, "insert", { path: "/tmp/x.png", trackIndex: 0, durationSeconds: 3, label: "x" })
        .error?.code,
    ).toBe("no-sequence");
  });

  it("snapshots the playhead and every video track's clip ranges", () => {
    const { ICG, tracks } = fakePremiere();
    tracks[0]!.addClip(0, 60);
    tracks[1]!.addClip(2, 4);
    expect(call(ICG, "getTimeline")).toEqual({
      ok: true,
      result: {
        playheadSeconds: 10,
        tracks: [
          { index: 0, name: "Video 1", clips: [{ startSeconds: 0, endSeconds: 60 }] },
          { index: 1, name: "Video 2", clips: [{ startSeconds: 2, endSeconds: 4 }] },
        ],
      },
    });
  });

  it("imports, overwrites at the playhead and trims the still to the requested duration", () => {
    const { ICG, tracks, imported } = fakePremiere({ mode: "seconds-only" });
    tracks[0]!.addClip(0, 60);
    const response = call(ICG, "insert", {
      path: "C:\\Temp\\icg\\icg-1.png",
      trackIndex: 1,
      durationSeconds: 3,
      label: "ICG comment",
    });
    expect(response.ok).toBe(true);
    expect(response.result).toMatchObject({
      trackIndex: 1,
      startSeconds: 10,
      endSeconds: 13,
      overwriteForm: "seconds",
    });
    expect(response.result?.steps).toEqual([
      "imported ICG comment",
      "setOutPoint 3s",
      "setScaleToFrameSize",
      "overwriteClip accepted seconds",
      "end set to 13s",
    ]);
    expect(imported).toHaveLength(1);
    expect(tracks[1]!.items.map((c) => [c.name, c.start.seconds, c.end.seconds])).toEqual([
      ["ICG comment", 10, 13],
    ]);
  });

  it("falls back to the ticks form and removes the misplaced clip when seconds are misread", () => {
    const { ICG, tracks } = fakePremiere({ mode: "ticks-only" });
    const response = call(ICG, "insert", {
      path: "/tmp/icg/icg-2.png",
      trackIndex: 0,
      durationSeconds: 3,
      label: "ICG comment",
    });
    expect(response.ok).toBe(true);
    expect(response.result?.overwriteForm).toBe("ticks");
    expect(tracks[0]!.items.map((c) => c.start.seconds)).toEqual([10]);
  });

  it("accepts a Time object when that is the only form the host takes", () => {
    const { ICG } = fakePremiere({ mode: "time-only" });
    const response = call(ICG, "insert", {
      path: "/tmp/icg/icg-3.png",
      trackIndex: 0,
      durationSeconds: 3,
      label: "ICG comment",
    });
    expect(response.result?.overwriteForm).toBe("time");
  });

  it("refuses to overwrite an occupied track instead of destroying footage", () => {
    const { ICG, tracks, imported } = fakePremiere();
    tracks[0]!.addClip(9, 11);
    const response = call(ICG, "insert", {
      path: "/tmp/icg/icg-4.png",
      trackIndex: 0,
      durationSeconds: 3,
      label: "ICG comment",
    });
    expect(response).toEqual({
      ok: false,
      error: { code: "track-occupied", message: "V1 is not free at the playhead" },
    });
    expect(imported).toHaveLength(0);
    expect(
      call(ICG, "insert", { path: "/tmp/x.png", trackIndex: 5, durationSeconds: 3, label: "x" })
        .error?.code,
    ).toBe("no-track");
  });

  it("adds a video track through the QE DOM and reports the method that worked", () => {
    const { ICG, addTracksCalls } = fakePremiere();
    expect(call(ICG, "addVideoTrack")).toEqual({
      ok: true,
      result: { method: "addTracks/7", numVideoTracks: 3 },
    });
    expect(addTracksCalls).toEqual([[1, 2, 0, 1, 1, 0, 0]]);
  });

  it("round-trips JSON through the ES3 polyfill when the engine has none", () => {
    const factory = new Function(
      "app",
      "qe",
      "Time",
      "ProjectItemType",
      "JSON",
      `${source}\nreturn JSON;`,
    );
    const polyfill = factory({}, {}, FakeTime, {}, undefined) as {
      stringify: (v: unknown) => string;
      parse: (s: string) => unknown;
    };
    const value = {
      text: 'quote " backslash \\ newline \n tab \t émoji 🔥',
      n: 1.5,
      ok: true,
      none: null,
      list: [1, "two", { three: 3 }],
    };
    const encoded = polyfill.stringify(value);
    expect(JSON.parse(encoded)).toEqual(value);
    expect(polyfill.parse(JSON.stringify(value))).toEqual(value);
    expect(() => polyfill.parse("alert(1)")).toThrow("Invalid JSON");
  });
});
