import { describe, expect, it } from "vitest";
import { ResolveHost } from "./resolve-host";
import type {
  ClipInfo,
  MediaPoolItemApi,
  ResolveApi,
  TimelineApi,
  TimelineItemApi,
} from "./resolve-types";

type FakeTimelineOptions = {
  name?: string;
  frameRate?: string;
  startTimecode?: string;
  startFrame?: number;
  currentTimecode?: string;
  tracks?: Array<Array<[number, number]>>;
  dropFrameSetting?: string;
};

function fakeResolve(options: FakeTimelineOptions = {}) {
  const calls: { addTrack: number; imported: string[]; appended: ClipInfo[] } = {
    addTrack: 0,
    imported: [],
    appended: [],
  };
  const tracks: TimelineItemApi[][] = (options.tracks ?? [[]]).map((items) =>
    items.map(([start, end]) => ({ GetStart: () => start, GetEnd: () => end })),
  );
  const settings: Record<string, string> = {
    timelineFrameRate: options.frameRate ?? "25",
    timelineResolutionWidth: "1080",
    timelineResolutionHeight: "1920",
  };
  const timeline: TimelineApi = {
    GetName: () => options.name ?? "Timeline 1",
    GetSetting: (key) => settings[key] ?? null,
    GetStartFrame: () => options.startFrame ?? 90000,
    GetStartTimecode: () => options.startTimecode ?? "01:00:00:00",
    GetCurrentTimecode: () => options.currentTimecode ?? "01:00:10:00",
    GetTrackCount: () => tracks.length,
    GetItemListInTrack: (_type, index) => tracks[index - 1] ?? null,
    AddTrack: () => {
      calls.addTrack++;
      tracks.push([]);
      return true;
    },
  };
  const mediaPoolItem: MediaPoolItemApi = { GetName: () => "overlay.png" };
  const resolve: ResolveApi = {
    GetProductName: () => "DaVinci Resolve Studio",
    GetVersionString: () => "20.0.0.0049",
    GetProjectManager: () => ({
      GetCurrentProject: () => ({
        GetName: () => "Project",
        GetSetting: (key) =>
          key === "timelineDropFrameTimecode" ? (options.dropFrameSetting ?? "0") : null,
        GetCurrentTimeline: () => Promise.resolve(timeline),
        GetMediaPool: () => ({
          ImportMedia: (paths) => {
            calls.imported.push(...paths);
            return [mediaPoolItem];
          },
          AppendToTimeline: (clips) => {
            calls.appended.push(...clips);
            return clips.map(() => ({ GetStart: () => 0, GetEnd: () => 0 }));
          },
        }),
      }),
    }),
  };
  return { resolve, calls, mediaPoolItem };
}

const png = new Uint8Array([137, 80, 78, 71]);
const writer = (_png: Uint8Array, label: string) => Promise.resolve(`/tmp/${label}.png`);

describe("ResolveHost.getSequenceInfo", () => {
  it("reads the timeline name, size and frame rate", async () => {
    const { resolve } = fakeResolve({ name: "Reel", frameRate: "29.97" });
    expect(await new ResolveHost(resolve).getSequenceInfo()).toEqual({
      name: "Reel",
      width: 1080,
      height: 1920,
      frameRate: 29.97,
    });
  });

  it("falls back to project settings when the timeline has none of its own", async () => {
    const { resolve } = fakeResolve({ frameRate: "" });
    const projectManager = await resolve.GetProjectManager();
    const project = await projectManager!.GetCurrentProject();
    const projectSettings: Record<string, string> = {
      timelineFrameRate: "23.976",
      timelineResolutionWidth: "3840",
      timelineResolutionHeight: "2160",
    };
    const timeline = await project!.GetCurrentTimeline();
    const withProjectSettings: ResolveApi = {
      ...resolve,
      GetProjectManager: () => ({
        GetCurrentProject: () => ({
          ...project!,
          GetSetting: (key) => projectSettings[key] ?? null,
          GetCurrentTimeline: () => ({ ...timeline!, GetSetting: () => "" }),
        }),
      }),
    };
    expect(await new ResolveHost(withProjectSettings).getSequenceInfo()).toEqual({
      name: "Timeline 1",
      width: 3840,
      height: 2160,
      frameRate: 23.976,
    });
  });

  it("returns null without a current timeline", async () => {
    const resolve: ResolveApi = {
      GetProductName: () => "DaVinci Resolve Studio",
      GetVersionString: () => "19.1.4",
      GetProjectManager: () => ({
        GetCurrentProject: () => ({
          GetName: () => "P",
          GetSetting: () => null,
          GetCurrentTimeline: () => null,
          GetMediaPool: () => null,
        }),
      }),
    };
    expect(await new ResolveHost(resolve).getSequenceInfo()).toBeNull();
  });
});

describe("ResolveHost.insertOverlay", () => {
  it("imports the file and appends it at the playhead on the lowest free track", async () => {
    const { resolve, calls, mediaPoolItem } = fakeResolve({
      tracks: [[[90000, 91000]], []],
    });
    const result = await new ResolveHost(resolve).insertOverlay(
      { png, durationSeconds: 3, label: "ICG comment" },
      writer,
    );
    expect(result).toEqual({
      status: "inserted",
      track: 2,
      startSeconds: 10,
      recordFrame: 90250,
      durationFrames: 75,
      filePath: "/tmp/ICG comment.png",
    });
    expect(calls.imported).toEqual(["/tmp/ICG comment.png"]);
    expect(calls.addTrack).toBe(0);
    expect(calls.appended).toEqual([
      {
        mediaPoolItem,
        startFrame: 0,
        endFrame: 74,
        trackIndex: 2,
        recordFrame: 90250,
        mediaType: 1,
      },
    ]);
  });

  it("adds a video track when every track is busy at the playhead", async () => {
    const { resolve, calls } = fakeResolve({ tracks: [[[90000, 91000]]] });
    const result = await new ResolveHost(resolve).insertOverlay(
      { png, durationSeconds: 3, label: "ICG comment" },
      writer,
    );
    expect(result).toMatchObject({ status: "inserted", track: 2 });
    expect(calls.addTrack).toBe(1);
  });

  it("converts drop-frame timecode with the timeline's own start frame", async () => {
    const { resolve, calls } = fakeResolve({
      frameRate: "29.97",
      dropFrameSetting: "1",
      startTimecode: "01:00:00;00",
      startFrame: 107892,
      currentTimecode: "01:10:00;00",
    });
    const result = await new ResolveHost(resolve).insertOverlay(
      { png, durationSeconds: 3, label: "ICG comment" },
      writer,
    );
    expect(result).toMatchObject({ recordFrame: 107892 + 17982, durationFrames: 90 });
    expect(calls.appended[0]).toMatchObject({ recordFrame: 125874, endFrame: 89 });
  });

  it("reports a missing timeline instead of throwing", async () => {
    const resolve: ResolveApi = {
      GetProductName: () => "DaVinci Resolve Studio",
      GetVersionString: () => "19.1.4",
      GetProjectManager: () => ({ GetCurrentProject: () => null }),
    };
    expect(
      await new ResolveHost(resolve).insertOverlay(
        { png, durationSeconds: 3, label: "ICG comment" },
        writer,
      ),
    ).toEqual({ status: "no-sequence" });
  });

  it("fails cleanly when ImportMedia returns nothing", async () => {
    const { resolve } = fakeResolve();
    const broken = {
      ...resolve,
      GetProjectManager: async () => {
        const pm = await resolve.GetProjectManager();
        const project = await pm!.GetCurrentProject();
        return {
          GetCurrentProject: () => ({
            ...project!,
            GetMediaPool: () => ({ ImportMedia: () => [], AppendToTimeline: () => [] }),
          }),
        };
      },
    };
    expect(
      await new ResolveHost(broken).insertOverlay(
        { png, durationSeconds: 3, label: "ICG comment" },
        writer,
      ),
    ).toMatchObject({ status: "failed" });
  });
});
