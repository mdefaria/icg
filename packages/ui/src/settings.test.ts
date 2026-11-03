import { describe, expect, it, vi } from "vitest";
import {
  createLocalStorageSettings,
  createMemorySettings,
  readSetting,
  SETTINGS,
} from "./settings";

describe("createLocalStorageSettings", () => {
  it("round-trips JSON under a prefix and notifies subscribers", () => {
    localStorage.clear();
    const store = createLocalStorageSettings(localStorage, "t.");
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set("snap", false);
    expect(localStorage.getItem("t.snap")).toBe("false");
    expect(store.get("snap")).toBe(false);
    expect(listener).toHaveBeenCalledWith("snap");
    stop();
    store.set("snap", true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("treats unreadable values as missing", () => {
    localStorage.setItem("t.frame", "{not json");
    expect(createLocalStorageSettings(localStorage, "t.").get("frame")).toBeUndefined();
  });
});

describe("readSetting", () => {
  it("falls back to defaults when the stored value does not parse", () => {
    const store = createMemorySettings({
      insert: { durationSeconds: -1, staggerSeconds: 0.5 },
      placements: { tiktok: { x: 2, y: 0, scale: 1 } },
      frame: "4:5",
    });
    expect(readSetting(store, "insert")).toEqual(SETTINGS.insert.fallback);
    expect(readSetting(store, "placements")).toEqual({});
    expect(readSetting(store, "frame")).toBe("4:5");
    expect(readSetting(store, "generate").count).toBe(3);
  });
});
