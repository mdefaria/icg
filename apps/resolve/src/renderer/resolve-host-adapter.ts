import type { HostAdapter, InsertOptions, InsertResult, Unsubscribe } from "@icg/host-sdk";
import type { HostInfo, Overlay, SequenceInfo, Theme } from "@icg/shared";
import {
  HostStatus,
  InsertResultMessage,
  SequenceInfoResult,
  WriteTempFileResult,
} from "../ipc/contract";
import type { ResolveBridge } from "../preload/index";

export class ResolveHostAdapter implements HostAdapter {
  readonly canInsert = true;

  constructor(
    private readonly bridge: ResolveBridge,
    readonly info: HostInfo,
  ) {}

  static async connect(
    bridge: ResolveBridge,
  ): Promise<{ status: HostStatus; adapter: ResolveHostAdapter }> {
    const status = HostStatus.parse(await bridge.hostStatus());
    return { status, adapter: new ResolveHostAdapter(bridge, status.info) };
  }

  async getSequenceInfo(): Promise<SequenceInfo | null> {
    return SequenceInfoResult.parse(await this.bridge.sequenceInfo());
  }

  async insertOverlay(overlay: Overlay, options: InsertOptions): Promise<InsertResult> {
    const result = await this.insertOverlayDetailed(overlay, options);
    if (result.status === "inserted") {
      return { status: "inserted", track: result.track, startSeconds: result.startSeconds };
    }
    return result;
  }

  async insertOverlayDetailed(
    overlay: Overlay,
    options: InsertOptions,
  ): Promise<InsertResultMessage> {
    return InsertResultMessage.parse(
      await this.bridge.insertOverlay({
        png: overlay.png,
        durationSeconds: options.durationSeconds,
        label: options.label,
      }),
    );
  }

  async writeTempFile(overlay: Overlay, label: string): Promise<string> {
    return WriteTempFileResult.parse(await this.bridge.writeTempFile({ png: overlay.png, label }))
      .path;
  }

  getTheme(): Theme {
    return "dark";
  }

  onThemeChange(_listener: (theme: Theme) => void): Unsubscribe {
    return () => {};
  }

  openExternal(url: string): void {
    void this.bridge.openExternal(url);
  }
}
