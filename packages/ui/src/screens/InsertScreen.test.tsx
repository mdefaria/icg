import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STACK_FALLBACK_HEIGHT, STACK_GAP } from "../placement";
import { button, setup, tab } from "../test/panel";
import type { StaggeredInsertOptions } from "./InsertScreen";

const generate = (count: number) => ({
  platform: "youtube",
  theme: "light",
  variant: "single",
  language: "en",
  tones: [],
  context: null,
  count,
});

const status = (n: number) => screen.getByTestId(`insert-status-${n}`).textContent;

describe("Insert", () => {
  it("inserts a batch with staggered start offsets, stacked Placements and per-item results", async () => {
    const { host, user, render } = setup({
      host: { playheadSeconds: 4 },
      settings: {
        generate: generate(3),
        placements: { youtube: { x: 0.4, y: 0.3, scale: 0.5 } },
        insert: { durationSeconds: 2.5, staggerSeconds: 0.75 },
      },
    });
    const insertOverlay = vi.spyOn(host, "insertOverlay");
    await user.click(button("Generate"));
    await user.click(tab("Insert"));
    await user.click(button("Insert at playhead"));

    await waitFor(() => expect(insertOverlay).toHaveBeenCalledTimes(3));
    const options = insertOverlay.mock.calls.map(([, o]) => o as StaggeredInsertOptions);
    expect(options).toEqual([
      { durationSeconds: 2.5, label: "ICG comment 1", offsetSeconds: 0 },
      { durationSeconds: 2.5, label: "ICG comment 2", offsetSeconds: 0.75 },
      { durationSeconds: 2.5, label: "ICG comment 3", offsetSeconds: 1.5 },
    ]);

    const placements = insertOverlay.mock.calls.map(([overlay]) => overlay.spec.placement);
    expect(placements.map((p) => [p.x, p.scale])).toEqual([
      [0.4, 0.5],
      [0.4, 0.5],
      [0.4, 0.5],
    ]);
    expect(placements[0]!.y).toBe(0.3);
    expect(placements[1]!.y).toBeGreaterThan(placements[0]!.y);
    expect(placements[2]!.y).toBeGreaterThan(placements[1]!.y);

    const full = render.mock.calls.filter(([spec]) => spec.frame.width === 1080);
    expect(full).toHaveLength(3);
    expect(full[0]![0]).toMatchObject({
      template: { platform: "youtube", theme: "light", variant: "single" },
      frame: { width: 1080, height: 1920 },
    });

    await waitFor(() => expect(status(3)).toBe("Inserted on V3 at 4s"));
    expect(status(1)).toBe("Inserted on V1 at 4s");
    expect(status(2)).toBe("Inserted on V2 at 4s");
  });

  it("stacks with a fallback step when a card size is unknown", async () => {
    const { host, user, render } = setup({ settings: { generate: generate(2) } });
    const insertOverlay = vi.spyOn(host, "insertOverlay");
    render.mockImplementation(async (spec) => {
      if (spec.frame.width !== 1080) throw new Error("no preview");
      return { png: new Uint8Array(), frame: spec.frame, spec };
    });
    await user.click(button("Generate"));
    expect((await screen.findAllByText(/Preview failed: no preview/)).length).toBe(2);
    await user.click(tab("Insert"));
    await user.click(button("Insert at playhead"));
    await waitFor(() => expect(insertOverlay).toHaveBeenCalledTimes(2));
    const ys = insertOverlay.mock.calls.map(([overlay]) => overlay.spec.placement.y);
    expect(ys[1]! - ys[0]!).toBeCloseTo(STACK_FALLBACK_HEIGHT + STACK_GAP, 6);
  });

  it("shows failures inline per item and carries on", async () => {
    const { host, user } = setup({ settings: { generate: generate(2) } });
    host.failNextInsert = "Track is locked";
    await user.click(button("Generate"));
    await user.click(tab("Insert"));
    await user.click(button("Insert at playhead"));
    await waitFor(() => expect(status(2)).toBe("Inserted on V1 at 0s"));
    expect(status(1)).toBe("Failed: Track is locked");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports render errors inline", async () => {
    const { host, user, render } = setup({ settings: { generate: generate(1) } });
    await user.click(button("Generate"));
    render.mockRejectedValue(new Error("font missing"));
    await user.click(tab("Insert"));
    await user.click(button("Insert at playhead"));
    await waitFor(() => expect(status(1)).toBe("Failed: font missing"));
    expect(host.inserts).toHaveLength(0);
  });

  it("downloads when the Host cannot insert", async () => {
    const { user } = setup({ host: { canInsert: false }, settings: { generate: generate(1) } });
    await user.click(button("Generate"));
    await user.click(tab("Insert"));
    await user.click(button("Download PNG"));
    await waitFor(() => expect(status(1)).toBe("Downloaded ICG comment.png"));
  });

  it("says when no sequence is open", async () => {
    const { user } = setup({ host: { sequence: null }, settings: { generate: generate(1) } });
    await user.click(button("Generate"));
    await user.click(tab("Insert"));
    expect(await screen.findByText(/Open a sequence/)).toBeTruthy();
    await user.click(button("Insert at playhead"));
    await waitFor(() => expect(status(1)).toBe("No sequence open"));
  });

  it("remembers duration and stagger", async () => {
    const { user, settings } = setup({ settings: { generate: generate(1) } });
    await user.click(button("Generate"));
    await user.click(tab("Insert"));
    const duration = screen.getByLabelText("Duration (s)");
    await user.clear(duration);
    await user.type(duration, "5");
    expect(settings.get("insert")).toEqual({ durationSeconds: 5, staggerSeconds: 0.5 });
  });
});
