import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_CARD } from "../cards";
import { snapLines } from "../placement";
import { button, setup, tab } from "../test/panel";

function stubFrame(width: number, height: number) {
  const frame = screen.getByTestId("frame-preview");
  frame.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
}

async function openPlacement(settings: Record<string, unknown> = {}, generate = true) {
  const ctx = setup({ settings: { snap: false, ...settings } });
  if (generate) await ctx.user.click(button("Generate"));
  await ctx.user.click(tab("Placement"));
  stubFrame(200, 400);
  return ctx;
}

function drag(dx: number, dy: number) {
  const card = screen.getByTestId("placement-card");
  fireEvent.pointerDown(card, { pointerId: 7, clientX: 100, clientY: 280 });
  fireEvent.pointerMove(card, { pointerId: 7, clientX: 100 + dx / 2, clientY: 280 + dy / 2 });
  fireEvent.pointerMove(card, { pointerId: 7, clientX: 100 + dx, clientY: 280 + dy });
  fireEvent.pointerUp(card, { pointerId: 7, clientX: 100 + dx, clientY: 280 + dy });
}

describe("Placement", () => {
  it("drags the card to normalised coordinates and remembers them for the Platform", async () => {
    const { settings } = await openPlacement();
    drag(30, 40);
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0.65, y: 0.8, scale: 1 } });
    expect(screen.getByText(/x 65% · y 80% · scale 100%/)).toBeTruthy();
  });

  it("clamps the Placement to the Frame", async () => {
    const { settings } = await openPlacement();
    drag(-500, 900);
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0, y: 1, scale: 1 } });
  });

  it("snaps to the 9-point grid when snapping is on", async () => {
    const { settings, user } = await openPlacement({ snap: true }, false);
    expect(screen.getByText(/No Comment yet/)).toBeTruthy();
    const card = { width: PLACEHOLDER_CARD.width / 1080, height: PLACEHOLDER_CARD.height / 1920 };
    const { ys } = snapLines(card);
    drag(0, -200);
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0.5, y: ys[0], scale: 1 } });
    await user.keyboard("{ArrowDown}");
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0.5, y: 0.5, scale: 1 } });
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0.5, y: ys[2], scale: 1 } });
  });

  it("nudges with the arrow keys", async () => {
    const { settings, user } = await openPlacement();
    screen.getByTestId("placement-card").focus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowRight}");
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0.51, y: 0.68, scale: 1 } });
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0.46, y: 0.68, scale: 1 } });
  });

  it("changes scale with the slider", async () => {
    const { settings } = await openPlacement();
    fireEvent.change(screen.getByLabelText("Scale"), { target: { value: "0.75" } });
    expect(settings.get("placements")).toEqual({ tiktok: { x: 0.5, y: 0.7, scale: 0.75 } });
  });

  it("restores the last Placement of each Platform", async () => {
    const { user } = await openPlacement({
      placements: { instagram: { x: 0.3, y: 0.2, scale: 0.8 } },
    });
    expect(screen.getByText(/x 50% · y 70%/)).toBeTruthy();
    await user.click(tab("Generate"));
    await user.click(button("Instagram"));
    await user.click(tab("Placement"));
    expect(screen.getByText(/x 30% · y 20% · scale 80%/)).toBeTruthy();
  });

  it("draws the Platform's safe zones on vertical Frames", async () => {
    await openPlacement();
    expect(screen.getByText("Rail")).toBeTruthy();
    expect(screen.getByText("Caption")).toBeTruthy();
  });

  it("uses the Frame preset when no sequence is open", async () => {
    const ctx = setup({ host: { sequence: null }, settings: { frame: "16:9" } });
    await ctx.user.click(tab("Placement"));
    const frame = screen.getByTestId("frame-preview");
    expect(frame.style.paddingBottom).toBe("56.25%");
    await ctx.user.selectOptions(screen.getByLabelText("Frame"), "1:1 square");
    expect(frame.style.paddingBottom).toBe("100%");
    expect(ctx.settings.get("frame")).toBe("1:1");
  });

  it("uses the sequence frame size when a sequence is open", async () => {
    setup({ host: { sequence: { name: "Wide", width: 1920, height: 1080, frameRate: 25 } } });
    await screen.findByRole("tab", { name: "Placement" });
    fireEvent.click(tab("Placement"));
    expect(await screen.findByText("Wide · 1920×1080")).toBeTruthy();
    expect(screen.getByTestId("frame-preview").style.paddingBottom).toBe("56.25%");
  });
});
