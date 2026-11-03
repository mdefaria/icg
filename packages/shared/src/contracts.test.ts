import { describe, expect, it } from "vitest";
import { BankEntry, Comment, FRAME_PRESETS, KeyPayload, OverlaySpec, Placement } from "./index";

const author = {
  username: "lena.makes",
  displayName: "Lena",
  avatar: { kind: "pool", id: "f-0042" },
  verified: false,
} as const;

describe("Comment", () => {
  it("accepts a generated comment with a creator reply", () => {
    const parsed = Comment.parse({
      id: "c1",
      origin: "generated",
      author,
      text: "the ending??? 😭",
      likes: 1240,
      timeAgo: "2h",
      pinned: false,
      likedByCreator: true,
      reply: {
        author: { ...author, username: "creator", verified: true },
        text: "part 2 soon",
        likes: 88,
        timeAgo: "1h",
      },
    });
    expect(parsed.reply?.author.verified).toBe(true);
  });

  it("rejects a user avatar that is not a data url", () => {
    expect(() =>
      Comment.parse({
        id: "c2",
        origin: "manual",
        author: { ...author, avatar: { kind: "user", dataUrl: "https://example.com/a.png" } },
        text: "",
        likes: 0,
        timeAgo: "1m",
        pinned: false,
        likedByCreator: false,
      }),
    ).toThrow();
  });
});

describe("Placement", () => {
  it("is normalised to the frame", () => {
    expect(Placement.safeParse({ x: 1.2, y: 0.5, scale: 1 }).success).toBe(false);
    expect(Placement.safeParse({ x: 0.5, y: 0.5, scale: 0.75 }).success).toBe(true);
  });
});

describe("OverlaySpec", () => {
  it("composes comment, template, frame and placement", () => {
    const spec = OverlaySpec.parse({
      comment: Comment.parse({
        id: "c3",
        origin: "generated",
        author,
        text: "ok this is fire 🔥",
        likes: 12,
        timeAgo: "5m",
        pinned: false,
        likedByCreator: false,
      }),
      template: { platform: "tiktok", theme: "dark", variant: "single" },
      frame: FRAME_PRESETS["9:16"],
      placement: { x: 0.5, y: 0.7, scale: 1 },
    });
    expect(spec.frame.height).toBe(1920);
  });
});

describe("BankEntry", () => {
  it("defaults platforms, contexts and weight", () => {
    const entry = BankEntry.parse({
      id: "en-hype-001",
      language: "en",
      tone: "hype",
      text: "no way 😭😭",
    });
    expect(entry.platforms).toEqual([]);
    expect(entry.weight).toBe(1);
  });
});

describe("KeyPayload", () => {
  it("pins the key version", () => {
    expect(KeyPayload.safeParse({ v: 2, id: "k", issuedAt: 1, devices: 3 }).success).toBe(false);
  });
});
