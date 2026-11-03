type MaybePromise<T> = T | Promise<T>;

export interface WorkflowIntegrationModule {
  GetInfo?(): MaybePromise<{ version?: string } | null>;
  Initialize(pluginId: string): MaybePromise<boolean>;
  GetResolve(): MaybePromise<ResolveApi | null>;
  CleanUp(): MaybePromise<boolean>;
}

export interface ResolveApi {
  GetProductName(): MaybePromise<string>;
  GetVersionString(): MaybePromise<string>;
  GetProjectManager(): MaybePromise<ProjectManagerApi | null>;
}

export interface ProjectManagerApi {
  GetCurrentProject(): MaybePromise<ProjectApi | null>;
}

export interface ProjectApi {
  GetName(): MaybePromise<string>;
  GetSetting(name: string): MaybePromise<string | number | null>;
  GetCurrentTimeline(): MaybePromise<TimelineApi | null>;
  GetMediaPool(): MaybePromise<MediaPoolApi | null>;
}

export interface TimelineApi {
  GetName(): MaybePromise<string>;
  GetSetting(name: string): MaybePromise<string | number | null>;
  GetStartFrame(): MaybePromise<number>;
  GetStartTimecode(): MaybePromise<string>;
  GetCurrentTimecode(): MaybePromise<string>;
  GetTrackCount(trackType: "video" | "audio" | "subtitle"): MaybePromise<number>;
  GetItemListInTrack(
    trackType: "video" | "audio" | "subtitle",
    index: number,
  ): MaybePromise<TimelineItemApi[] | null>;
  AddTrack(trackType: "video" | "audio" | "subtitle"): MaybePromise<boolean>;
}

export interface TimelineItemApi {
  GetStart(): MaybePromise<number>;
  GetEnd(): MaybePromise<number>;
}

export interface MediaPoolItemApi {
  GetName(): MaybePromise<string>;
}

export type ClipInfo = {
  mediaPoolItem: MediaPoolItemApi;
  startFrame: number;
  endFrame: number;
  trackIndex: number;
  recordFrame: number;
  mediaType: 1 | 2;
};

export interface MediaPoolApi {
  ImportMedia(paths: string[]): MaybePromise<MediaPoolItemApi[] | null>;
  AppendToTimeline(clips: ClipInfo[]): MaybePromise<TimelineItemApi[] | null>;
}
