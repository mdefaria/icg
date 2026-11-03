import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FakeActivationClient } from "./fakes";
import { button, setup, tab } from "./test/panel";

describe("Generate", () => {
  it("generates a batch through the engine and renders a preview per Comment", async () => {
    const { engine, render, user } = setup();
    const generateMany = vi.spyOn(engine, "generateMany");
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const rendered = render.getMockImplementation()!;
    render.mockImplementation(async (spec) => {
      await gate;
      return rendered(spec);
    });

    await user.click(button("Instagram"));
    await user.click(button("Creator reply"));
    await user.click(button("ES"));
    await user.click(button("Funny"));
    await user.click(button("Question"));
    await user.selectOptions(screen.getByLabelText("Context"), "Short film");
    const count = screen.getByLabelText("Count");
    await user.clear(count);
    await user.type(count, "4");
    await user.click(button("Generate"));

    expect(generateMany).toHaveBeenCalledTimes(1);
    const [options, n] = generateMany.mock.calls[0]!;
    expect(n).toBe(4);
    expect(options).toMatchObject({
      platform: "instagram",
      language: "es",
      variant: "creator-reply",
      tones: ["funny", "question"],
      contexts: ["short-film"],
      creator: { username: "yourchannel" },
    });

    const list = screen.getByRole("list", { name: "Comments" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getAllByTestId("card-skeleton")).toHaveLength(4);
    release();

    await waitFor(() =>
      expect(within(list).getAllByRole("img", { name: /^Instagram Comment by / })).toHaveLength(4),
    );
    const specs = render.mock.calls.map(([spec]) => spec);
    expect(specs.map((s) => s.comment.id).sort()).toEqual(
      generateMany.mock.results[0]!.value.map((c: { id: string }) => c.id).sort(),
    );
    expect(specs[0]).toMatchObject({
      template: { platform: "instagram", theme: "dark", variant: "creator-reply" },
      language: "es",
    });
    expect(specs[0]!.placement.scale).toBeLessThan(1);
  });

  it("remembers the generate options and creator identity in settings", async () => {
    const { settings, user } = setup();
    await user.click(button("X"));
    const username = screen.getByLabelText("Creator username");
    await user.clear(username);
    await user.type(username, "nicocuts");
    expect(settings.get("generate")).toMatchObject({ platform: "x" });
    expect(settings.get("creator")).toMatchObject({ username: "nicocuts" });
  });

  it("adds a Manual Comment and opens it for editing", async () => {
    const { engine, user } = setup();
    const manual = vi.spyOn(engine, "manual");
    await user.click(button("Manual"));
    expect(manual).toHaveBeenCalledTimes(1);
    expect(tab("Edit").getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("username");
  });

  it("shows engine errors inline", async () => {
    const { engine, user } = setup();
    vi.spyOn(engine, "generateMany").mockImplementation(() => {
      throw new Error("Bank is empty for this tone");
    });
    await user.click(button("Generate"));
    expect(screen.getByRole("alert").textContent).toContain("Bank is empty for this tone");
  });
});

describe("Insert label", () => {
  it("offers Insert at playhead when the Host can insert", async () => {
    const { user } = setup({ host: { canInsert: true } });
    await user.click(button("Generate"));
    await user.click(tab("Insert"));
    expect(button("Insert at playhead")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download PNG" })).toBeNull();
  });

  it("offers Download PNG when the Host cannot insert", async () => {
    const { user } = setup({ host: { canInsert: false, sequence: null } });
    await user.click(button("Generate"));
    await user.click(tab("Insert"));
    expect(button("Download PNG")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Insert at playhead" })).toBeNull();
  });
});

describe("theme", () => {
  it("follows the Host theme and its changes", () => {
    const { host } = setup({ host: { theme: "dark" } });
    const panel = screen.getByTestId("icg-panel");
    expect(panel.dataset.theme).toBe("dark");
    expect(panel.className).toContain("dark");
    act(() => host.setTheme("light"));
    expect(panel.dataset.theme).toBe("light");
    expect(panel.className).toContain("light");
    expect(panel.className).not.toContain("dark");
  });
});

describe("Activation", () => {
  it("activates a Key and reports invalid ones inline", async () => {
    const activation = new FakeActivationClient({ validKeys: ["GOOD"] });
    const { user } = setup({ activation });
    expect(screen.getByText("Not activated")).toBeTruthy();
    await user.click(button("Enter Key"));

    await user.type(screen.getByLabelText("Key"), "BAD");
    await user.click(button("Activate"));
    expect((await screen.findByRole("alert")).textContent).toContain("not valid");

    await user.clear(screen.getByLabelText("Key"));
    await user.type(screen.getByLabelText("Key"), "GOOD");
    await user.click(button("Activate"));
    expect(await screen.findByText(/^Activated\. /)).toBeTruthy();
    expect(activation.attempts).toEqual(["BAD", "GOOD"]);

    await user.click(button("Back"));
    expect(screen.getByText("Activated")).toBeTruthy();
  });
});
