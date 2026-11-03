import { FRAME_PRESETS, type Overlay } from "@icg/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_INSERT_OPTIONS, FakeHostAdapter } from "./index";

const overlay: Overlay = {
  png: new Uint8Array([137, 80, 78, 71]),
  frame: FRAME_PRESETS["9:16"],
  spec: {
    comment: {
      id: "c1",
      origin: "generated",
      author: { username: "a", displayName: "A", avatar: { kind: "default" }, verified: false },
      text: "hi",
      likes: 0,
      timeAgo: "1m",
      pinned: false,
      likedByCreator: false,
    },
    template: { platform: "tiktok", theme: "dark", variant: "single" },
    frame: FRAME_PRESETS["9:16"],
    placement: { x: 0.5, y: 0.7, scale: 1 },
  },
};

describe("FakeHostAdapter", () => {
  it("inserts at the playhead on the lowest free track", async () => {
    const host = new FakeHostAdapter({ playheadSeconds: 10 });
    expect(await host.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).toEqual({
      status: "inserted",
      track: 1,
      startSeconds: 10,
    });
    expect(await host.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).toMatchObject({ track: 2 });
    host.playheadSeconds = 20;
    expect(await host.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).toMatchObject({ track: 1 });
  });

  it("downloads when the host cannot insert", async () => {
    const host = new FakeHostAdapter({ canInsert: false, sequence: null });
    expect(await host.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).toEqual({
      status: "downloaded",
      fileName: "ICG comment.png",
    });
  });

  it("reports a missing sequence", async () => {
    const host = new FakeHostAdapter({ sequence: null });
    expect(await host.insertOverlay(overlay, DEFAULT_INSERT_OPTIONS)).toEqual({
      status: "no-sequence",
    });
  });

  it("notifies theme changes until unsubscribed", () => {
    const host = new FakeHostAdapter();
    const seen: string[] = [];
    const stop = host.onThemeChange((t) => seen.push(t));
    host.setTheme("light");
    stop();
    host.setTheme("dark");
    expect(seen).toEqual(["light"]);
  });
});
