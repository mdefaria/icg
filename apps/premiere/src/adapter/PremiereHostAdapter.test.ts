import { FRAME_PRESETS, type Overlay } from "@icg/shared";
import { DEFAULT_INSERT_OPTIONS } from "@icg/host-sdk";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { BridgeError, type Bridge } from "../cep/bridge";
import type { OverlayFileWriter } from "../cep/files";
import type { PanelShell } from "../cep/shell";
import { PremiereHostAdapter } from "./PremiereHostAdapter";
import { sampleSpec } from "../render/sample";
import type { TimelineSnapshot } from "./schemas";

type Handler = (args: unknown) => unknown;

class FakeBridge implements Bridge {
  readonly calls: { fn: string; args: unknown }[] = [];
  constructor(private readonly handlers: Record<string, Handler>) {}

  call<T>(fn: string, schema: z.ZodType<T>, args?: unknown): Promise<T> {
    this.calls.push({ fn, args });
    const handler = this.handlers[fn];
    if (!handler) return Promise.reject(new BridgeError("missing", `no handler for ${fn}`));
    try {
      return Promise.resolve(schema.parse(handler(args)));
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

class FakeFiles implements OverlayFileWriter {
  readonly written: { bytes: Uint8Array; fileName: string }[] = [];
  fail: string | null = null;

  writePng(bytes: Uint8Array, fileName: string): Promise<string> {
    if (this.fail) return Promise.reject(new Error(this.fail));
    this.written.push({ bytes, fileName });
    return Promise.resolve(`/tmp/icg/${fileName}`);
  }
}

const shell: PanelShell = {
  info: { kind: "premiere", version: "25.2", os: "mac" },
  getTheme: () => "light",
  onThemeChange: () => () => undefined,
  openExternal: () => undefined,
};

const overlay: Overlay = {
  png: new Uint8Array([137, 80, 78, 71]),
  frame: FRAME_PRESETS["9:16"],
  spec: sampleSpec,
};

const clip = (startSeconds: number, endSeconds: number) => ({ startSeconds, endSeconds });

function timeline(
  playheadSeconds: number,
  ...clipsPerTrack: ReturnType<typeof clip>[][]
): TimelineSnapshot {
  return {
    playheadSeconds,
    tracks: clipsPerTrack.map((clips, index) => ({ index, name: `Video ${index + 1}`, clips })),
  };
}

function insertEcho(args: unknown) {
  const a = args as { trackIndex: number; durationSeconds: number };
  return {
    trackIndex: a.trackIndex,
    startSeconds: 10,
    endSeconds: 10 + a.durationSeconds,
    overwriteForm: "seconds",
    steps: ["imported"],
  };
}

function adapterWith(handlers: Record<string, Handler>, files = new FakeFiles()) {
  const bridge = new FakeBridge(handlers);
  return { bridge, files, adapter: new PremiereHostAdapter({ bridge, files, shell }) };
}

describe("PremiereHostAdapter", () => {
  it("exposes the shell's host info and theme", () => {
    const { adapter } = adapterWith({});
    expect(adapter.info).toEqual({ kind: "premiere", version: "25.2", os: "mac" });
    expect(adapter.canInsert).toBe(true);
    expect(adapter.getTheme()).toBe("light");
  });

  it("parses sequence info through the shared schema", async () => {
    const { adapter } = adapterWith({
      getSequenceInfo: () => ({ name: "Reel", width: 1080, height: 1920, frameRate: 29.97 }),
    });
    await expect(adapter.getSequenceInfo()).resolves.toEqual({
      name: "Reel",
      width: 1080,
      height: 1920,
      frameRate: 29.97,
    });
  });

  it("reports a missing sequence without touching the file system", async () => {
    const { adapter, files } = adapterWith({ getTimeline: () => null });
    await expect(adapter.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).resolves.toEqual({
      status: "no-sequence",
    });
    expect(files.written).toHaveLength(0);
  });

  it("writes the PNG and overwrites on the first free track above the footage", async () => {
    const { adapter, bridge, files } = adapterWith({
      getTimeline: () => timeline(10, [clip(0, 60)], []),
      insert: insertEcho,
    });
    await expect(adapter.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).resolves.toEqual({
      status: "inserted",
      track: 2,
      startSeconds: 10,
    });
    expect(files.written).toHaveLength(1);
    expect(files.written[0]?.bytes).toBe(overlay.png);
    expect(files.written[0]?.fileName).toMatch(/^icg-\d+-[0-9a-f]{6}\.png$/);
    const insertCall = bridge.calls.find((c) => c.fn === "insert");
    expect(insertCall?.args).toEqual({
      path: `/tmp/icg/${files.written[0]?.fileName}`,
      trackIndex: 1,
      durationSeconds: 3,
      label: "ICG comment",
    });
    expect(bridge.calls.map((c) => c.fn)).toEqual(["getTimeline", "insert"]);
  });

  it("creates a video track through QE when no track is free", async () => {
    let tracks = timeline(10, [clip(0, 60)]);
    const { adapter, bridge } = adapterWith({
      getTimeline: () => tracks,
      addVideoTrack: () => {
        tracks = timeline(10, [clip(0, 60)], []);
        return { method: "addTracks/7", numVideoTracks: 2 };
      },
      insert: insertEcho,
    });
    await expect(adapter.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).resolves.toMatchObject({
      status: "inserted",
      track: 2,
    });
    expect(bridge.calls.map((c) => c.fn)).toEqual([
      "getTimeline",
      "addVideoTrack",
      "getTimeline",
      "insert",
    ]);
  });

  it("fails cleanly when the new track is still not usable", async () => {
    const { adapter, files } = adapterWith({
      getTimeline: () => timeline(10, [clip(0, 60)]),
      addVideoTrack: () => ({ method: "addTracks/1", numVideoTracks: 2 }),
    });
    await expect(adapter.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).resolves.toEqual({
      status: "failed",
      reason: "Could not find or create a free video track",
    });
    expect(files.written).toHaveLength(0);
  });

  it("surfaces ExtendScript error codes in the failure reason", async () => {
    const { adapter } = adapterWith({
      getTimeline: () => timeline(10, []),
      insert: () => {
        throw new BridgeError("track-occupied", "V1 is not free at the playhead");
      },
    });
    await expect(adapter.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).resolves.toEqual({
      status: "failed",
      reason: "track-occupied: V1 is not free at the playhead",
    });
  });

  it("fails when the PNG cannot be written", async () => {
    const files = new FakeFiles();
    files.fail = "EACCES";
    const { adapter, bridge } = adapterWith(
      { getTimeline: () => timeline(0, []), insert: insertEcho },
      files,
    );
    await expect(adapter.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).resolves.toEqual({
      status: "failed",
      reason: "EACCES",
    });
    expect(bridge.calls.map((c) => c.fn)).toEqual(["getTimeline"]);
  });

  it("delegates openExternal and theme changes to the shell", () => {
    const opened: string[] = [];
    const listeners: ((theme: "dark" | "light") => void)[] = [];
    const adapter = new PremiereHostAdapter({
      bridge: new FakeBridge({}),
      files: new FakeFiles(),
      shell: {
        ...shell,
        openExternal: (url) => opened.push(url),
        onThemeChange: (listener) => {
          listeners.push(listener);
          return () => listeners.splice(listeners.indexOf(listener), 1);
        },
      },
    });
    adapter.openExternal("https://example.com");
    expect(opened).toEqual(["https://example.com"]);
    const seen: string[] = [];
    const stop = adapter.onThemeChange((t) => seen.push(t));
    listeners[0]?.("dark");
    stop();
    expect(seen).toEqual(["dark"]);
    expect(listeners).toHaveLength(0);
  });
});
