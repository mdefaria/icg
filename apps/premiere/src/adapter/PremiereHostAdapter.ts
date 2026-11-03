import type { HostInfo, Overlay, SequenceInfo, Theme } from "@icg/shared";
import type { HostAdapter, InsertOptions, InsertResult, Unsubscribe } from "@icg/host-sdk";
import { BridgeError, createBridge, evalScriptFrom, type Bridge } from "../cep/bridge";
import { createCepFileWriter, overlayFileName, type OverlayFileWriter } from "../cep/files";
import { cepNode, createCSInterface } from "../cep/globals";
import { createCepShell, type PanelShell } from "../cep/shell";
import {
  AddTrackResult,
  JsxInsertResult,
  PingResult,
  SequenceInfoResult,
  TimelineResult,
  type InsertArgs,
  type TimelineSnapshot,
} from "./schemas";
import { chooseTrack, spanAt, type TrackChoice } from "./trackSelection";

export type PremiereHostDeps = {
  bridge: Bridge;
  files: OverlayFileWriter;
  shell: PanelShell;
};

export class PremiereHostAdapter implements HostAdapter {
  readonly info: HostInfo;
  readonly canInsert = true;
  readonly files: OverlayFileWriter;
  private readonly bridge: Bridge;
  private readonly shell: PanelShell;

  constructor(deps: PremiereHostDeps) {
    this.bridge = deps.bridge;
    this.files = deps.files;
    this.shell = deps.shell;
    this.info = deps.shell.info;
  }

  static fromCep(): PremiereHostAdapter | null {
    const cs = createCSInterface();
    if (!cs) return null;
    const node = cepNode();
    return new PremiereHostAdapter({
      bridge: createBridge(evalScriptFrom(cs)),
      files: node ? createCepFileWriter(node) : nodeUnavailableWriter,
      shell: createCepShell(cs),
    });
  }

  ping(): Promise<PingResult> {
    return this.bridge.call("ping", PingResult);
  }

  getSequenceInfo(): Promise<SequenceInfo | null> {
    return this.bridge.call("getSequenceInfo", SequenceInfoResult);
  }

  async insertOverlay(overlay: Overlay, options: InsertOptions): Promise<InsertResult> {
    try {
      const timeline = await this.bridge.call("getTimeline", TimelineResult);
      if (!timeline) return { status: "no-sequence" };
      const choice = await this.chooseOrCreateTrack(timeline, options.durationSeconds);
      if (!choice)
        return { status: "failed", reason: "Could not find or create a free video track" };
      const path = await this.files.writePng(overlay.png, overlayFileName());
      const args: InsertArgs = {
        path,
        trackIndex: choice.index,
        durationSeconds: options.durationSeconds,
        label: options.label,
      };
      const result = await this.bridge.call("insert", JsxInsertResult, args);
      return {
        status: "inserted",
        track: result.trackIndex + 1,
        startSeconds: result.startSeconds,
      };
    } catch (error) {
      return { status: "failed", reason: describeError(error) };
    }
  }

  private async chooseOrCreateTrack(
    timeline: TimelineSnapshot,
    durationSeconds: number,
  ): Promise<TrackChoice | null> {
    const first = chooseTrack(timeline.tracks, spanAt(timeline.playheadSeconds, durationSeconds));
    if (first.kind === "existing") return first;
    await this.bridge.call("addVideoTrack", AddTrackResult);
    const after = await this.bridge.call("getTimeline", TimelineResult);
    if (!after) return null;
    const second = chooseTrack(after.tracks, spanAt(after.playheadSeconds, durationSeconds));
    return second.kind === "existing" ? second : null;
  }

  getTheme(): Theme {
    return this.shell.getTheme();
  }

  onThemeChange(listener: (theme: Theme) => void): Unsubscribe {
    return this.shell.onThemeChange(listener);
  }

  openExternal(url: string): void {
    this.shell.openExternal(url);
  }
}

const nodeUnavailableWriter: OverlayFileWriter = {
  writePng: () =>
    Promise.reject(new Error("Node is not enabled in this panel (CEFCommandLine --enable-nodejs)")),
};

export function describeError(error: unknown): string {
  if (error instanceof BridgeError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}
