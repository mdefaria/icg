import { SequenceInfo } from "@icg/shared";
import { z } from "zod";
import type { InsertResultMessage } from "../ipc/contract";
import { durationToFrames, resolvePlayhead } from "../timeline/playhead";
import { parseFrameRate, parseTimecode } from "../timeline/timecode";
import { planInsert, type VideoTrack } from "../timeline/tracks";
import type { ProjectApi, ResolveApi, TimelineApi } from "./resolve-types";

export type OverlayFileWriter = (png: Uint8Array, label: string) => Promise<string>;

export type InsertInput = {
  png: Uint8Array;
  durationSeconds: number;
  label: string;
};

type TimelineContext = {
  project: ProjectApi;
  timeline: TimelineApi;
  info: SequenceInfo;
  dropFrame: boolean;
};

const Setting = z.union([z.string(), z.number()]).transform(String);
const PositiveInt = z.coerce.number().int().positive();
const Frame = z.coerce.number().int();

export class ResolveHost {
  constructor(private readonly resolve: ResolveApi) {}

  async getSequenceInfo(): Promise<SequenceInfo | null> {
    const context = await this.currentTimeline();
    return context?.info ?? null;
  }

  async insertOverlay(
    input: InsertInput,
    writeOverlayFile: OverlayFileWriter,
  ): Promise<InsertResultMessage> {
    const context = await this.currentTimeline();
    if (!context) return { status: "no-sequence" };
    const { timeline, info, dropFrame } = context;

    const playhead = resolvePlayhead({
      currentTimecode: String(await timeline.GetCurrentTimecode()),
      startTimecode: String(await timeline.GetStartTimecode()),
      startFrame: Frame.parse(await timeline.GetStartFrame()),
      frameRate: info.frameRate,
      dropFrame,
    });
    if (!playhead) return { status: "failed", reason: "Could not read the playhead timecode" };

    const durationFrames = durationToFrames(input.durationSeconds, info.frameRate);
    const tracks = await this.videoTracks(timeline);
    const plan = planInsert(tracks, playhead.frame, durationFrames);
    for (let i = 0; i < plan.tracksToAdd; i++) {
      if (!(await timeline.AddTrack("video"))) {
        return { status: "failed", reason: "Resolve refused to add a video track" };
      }
    }

    const mediaPool = await context.project.GetMediaPool();
    if (!mediaPool) return { status: "failed", reason: "No media pool" };
    const filePath = await writeOverlayFile(input.png, input.label);
    const imported = (await mediaPool.ImportMedia([filePath])) ?? [];
    const mediaPoolItem = imported[0];
    if (!mediaPoolItem)
      return { status: "failed", reason: `ImportMedia returned nothing for ${filePath}` };

    const appended = await mediaPool.AppendToTimeline([
      {
        mediaPoolItem,
        startFrame: 0,
        endFrame: durationFrames - 1,
        trackIndex: plan.trackIndex,
        recordFrame: playhead.frame,
        mediaType: 1,
      },
    ]);
    if (!appended || appended.length === 0) {
      return { status: "failed", reason: "AppendToTimeline returned no timeline items" };
    }
    return {
      status: "inserted",
      track: plan.trackIndex,
      startSeconds: playhead.offsetSeconds,
      recordFrame: playhead.frame,
      durationFrames,
      filePath,
    };
  }

  private async currentTimeline(): Promise<TimelineContext | null> {
    const projectManager = await this.resolve.GetProjectManager();
    const project = projectManager ? await projectManager.GetCurrentProject() : null;
    const timeline = project ? await project.GetCurrentTimeline() : null;
    if (!project || !timeline) return null;

    const setting = async (name: string) =>
      Setting.parse((await timeline.GetSetting(name)) || (await project.GetSetting(name)));

    const rateSetting = await setting("timelineFrameRate");
    const rate = parseFrameRate(rateSetting);
    if (!rate) throw new Error(`Unreadable timelineFrameRate: ${rateSetting}`);

    const info = SequenceInfo.parse({
      name: String(await timeline.GetName()),
      width: PositiveInt.parse(await setting("timelineResolutionWidth")),
      height: PositiveInt.parse(await setting("timelineResolutionHeight")),
      frameRate: rate.frameRate,
    });

    const dropFrameSetting = await project.GetSetting("timelineDropFrameTimecode");
    const startTimecode = parseTimecode(String(await timeline.GetStartTimecode()));
    const dropFrame =
      rate.dropFrame || String(dropFrameSetting) === "1" || (startTimecode?.dropFrame ?? false);

    return { project, timeline, info, dropFrame };
  }

  private async videoTracks(timeline: TimelineApi): Promise<VideoTrack[]> {
    const count = Frame.parse(await timeline.GetTrackCount("video"));
    const tracks: VideoTrack[] = [];
    for (let index = 1; index <= count; index++) {
      const items = (await timeline.GetItemListInTrack("video", index)) ?? [];
      const ranges = [];
      for (const item of items) {
        ranges.push({
          start: Frame.parse(await item.GetStart()),
          end: Frame.parse(await item.GetEnd()),
        });
      }
      tracks.push({ index, items: ranges });
    }
    return tracks;
  }
}
