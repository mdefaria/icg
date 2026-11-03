import { Comment } from "@icg/shared";
import { describe, expect, it } from "vitest";
import { FakeEngine } from "./FakeEngine";

const options = { platform: "tiktok", language: "es", variant: "creator-reply" } as const;

describe("FakeEngine", () => {
  it("produces valid, deterministic Comments", () => {
    const a = new FakeEngine({ seed: "s", avatarIds: ["a-01"] }).generateMany(options, 5);
    const b = new FakeEngine({ seed: "s", avatarIds: ["a-01"] }).generateMany(options, 5);
    expect(a).toEqual(b);
    for (const comment of a) expect(Comment.parse(comment)).toEqual(comment);
    expect(a.every((c) => c.reply !== undefined)).toBe(true);
  });

  it("regenerates only the requested field", () => {
    const engine = new FakeEngine({ avatarIds: ["a-01", "a-02", "a-03"] });
    const comment = engine.generate({ ...options, variant: "single" });
    const next = engine.regenerate(comment, "likes", options);
    expect({ ...next, likes: comment.likes }).toEqual(comment);
  });

  it("makes language-neutral Manual Comments", () => {
    const manual = new FakeEngine().manual({ ...options, variant: "single" });
    expect(manual).toMatchObject({
      origin: "manual",
      text: "",
      author: { avatar: { kind: "default" } },
    });
  });
});
