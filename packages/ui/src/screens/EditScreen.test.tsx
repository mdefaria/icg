import type { Comment } from "@icg/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { button, setup, tab } from "../test/panel";

async function editFirst() {
  const ctx = setup({ settings: { generate: { ...base, count: 2 } } });
  await ctx.user.click(button("Generate"));
  await ctx.user.click(button("Edit Comment 1"));
  return ctx;
}

const base = {
  platform: "tiktok",
  theme: "dark",
  variant: "single",
  language: "en",
  tones: [],
  context: null,
  count: 1,
};

const lastRendered = (render: ReturnType<typeof setup>["render"]): Comment =>
  render.mock.calls.at(-1)![0].comment;

describe("Edit", () => {
  it("updates the Comment from every inline field", async () => {
    const { user, render, host } = await editFirst();

    const text = screen.getByLabelText("Text");
    await user.clear(text);
    await user.type(text, "best ending ever");
    const username = screen.getByLabelText("Username");
    await user.clear(username);
    await user.type(username, "mira.cuts");
    const displayName = screen.getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Mira");
    const likes = screen.getByLabelText("Likes");
    await user.clear(likes);
    await user.type(likes, "1200");
    const timeAgo = screen.getByLabelText("Time ago");
    await user.clear(timeAgo);
    await user.type(timeAgo, "3h");
    await user.click(screen.getByLabelText("Verified"));
    await user.click(screen.getByLabelText("Pinned"));
    const liked = screen.getByLabelText("Liked by creator") as HTMLInputElement;
    const likedBefore = liked.checked;
    await user.click(liked);

    await waitFor(() => expect(lastRendered(render).text).toBe("best ending ever"));
    const edited = lastRendered(render);
    expect(edited).toMatchObject({
      text: "best ending ever",
      likes: 1200,
      timeAgo: "3h",
      pinned: true,
      likedByCreator: !likedBefore,
      author: { username: "mira.cuts", displayName: "Mira" },
    });

    await user.click(tab("Insert"));
    await user.click(button("Insert at playhead"));
    await waitFor(() => expect(host.inserts).toHaveLength(2));
    expect(host.inserts[0]!.overlay.spec.comment).toEqual(edited);
  });

  it("keeps an invalid draft out of the Comment and says why", async () => {
    const { user } = await editFirst();
    const before = (screen.getByLabelText("Username") as HTMLInputElement).value;
    await user.clear(screen.getByLabelText("Username"));
    expect(screen.getByRole("alert").textContent).toBe("Required");
    await user.click(tab("Generate"));
    const first = within(screen.getByRole("list", { name: "Comments" })).getAllByRole(
      "listitem",
    )[0]!;
    expect(first.textContent).toContain(`1. @${before}`);
  });

  it("regenerates exactly the field whose button was pressed", async () => {
    const { user, engine } = await editFirst();
    const regenerate = vi.spyOn(engine, "regenerate");
    const cases = [
      ["Regenerate text", "text"],
      ["Regenerate username", "author"],
      ["Regenerate likes", "likes"],
      ["Regenerate time", "timeAgo"],
      ["Shuffle Avatar", "avatar"],
      ["Add creator reply", "reply"],
      ["Regenerate reply", "reply"],
    ] as const;
    for (const [label, field] of cases) {
      const current = regenerate.mock.results.at(-1)?.value as Comment | undefined;
      await user.click(button(label));
      const call = regenerate.mock.calls.at(-1)!;
      expect(call[1]).toBe(field);
      expect(call[2]).toMatchObject({ platform: "tiktok", language: "en", variant: "single" });
      if (current) expect(call[0]).toEqual(current);
    }
    expect(regenerate).toHaveBeenCalledTimes(cases.length);
  });

  it("uploads an Avatar image and picks a default silhouette", async () => {
    const { user, render } = await editFirst();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "me.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Upload Avatar image"), file);
    await waitFor(() => expect(lastRendered(render).author.avatar.kind).toBe("user"));
    const avatar = lastRendered(render).author.avatar;
    expect(avatar.kind === "user" && avatar.dataUrl.startsWith("data:image/png;base64,")).toBe(
      true,
    );

    await user.click(button("Default Avatar 1"));
    await waitFor(() => expect(lastRendered(render).author.avatar).toEqual({ kind: "default" }));
  });

  it("rejects a file that is not an image inline", async () => {
    await editFirst();
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Upload Avatar image"), { target: { files: [file] } });
    expect((await screen.findByRole("alert")).textContent).toBe("Choose an image file");
  });
});
