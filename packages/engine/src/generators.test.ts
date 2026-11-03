import { Platform } from "@icg/shared";
import { describe, expect, it } from "vitest";
import { generateAuthor, USERNAME_RULES } from "./authors";
import { fixtureAvatarPicker } from "./fixtures";
import { sampleLikes } from "./likes";
import { createRng } from "./rng";
import { formatAge, parseAge, sampleAge } from "./time";

const percentile = (sorted: number[], p: number) => sorted[Math.floor((sorted.length - 1) * p)]!;

describe("usernames", () => {
  for (const platform of Platform.options) {
    it(`are valid ${platform} handles`, () => {
      const rng = createRng(platform);
      const names = new Set<string>();
      for (let i = 0; i < 2000; i++) {
        const author = generateAuthor(rng, platform, i % 2 ? "es" : "en", fixtureAvatarPicker);
        expect(author.username).toMatch(USERNAME_RULES[platform]);
        expect(author.username.startsWith("@")).toBe(false);
        expect(author.displayName.length).toBeGreaterThan(0);
        names.add(author.username);
      }
      expect(names.size).toBeGreaterThan(1800);
    });
  }

  it("uses the user-digits pattern on TikTok about 10% of the time", () => {
    const rng = createRng("tt");
    let count = 0;
    for (let i = 0; i < 2000; i++) {
      if (/^user\d{7,11}$/.test(generateAuthor(rng, "tiktok", "en", fixtureAvatarPicker).username))
        count++;
    }
    expect(count / 2000).toBeGreaterThan(0.06);
    expect(count / 2000).toBeLessThan(0.14);
  });

  it("marks about 3% verified", () => {
    const rng = createRng("v");
    let count = 0;
    for (let i = 0; i < 4000; i++)
      if (generateAuthor(rng, "x", "en", fixtureAvatarPicker).verified) count++;
    expect(count / 4000).toBeGreaterThan(0.015);
    expect(count / 4000).toBeLessThan(0.05);
  });
});

describe("likes", () => {
  const samples = (flags: { pinned: boolean; likedByCreator: boolean }, seed: string) => {
    const rng = createRng(seed);
    return Array.from({ length: 1000 }, () => sampleLikes(rng, flags)).sort((a, b) => a - b);
  };

  it("follow a long tail: most under 100, some thousands, rare 10K+", () => {
    const s = samples({ pinned: false, likedByCreator: false }, "likes");
    expect(percentile(s, 0.5)).toBeGreaterThanOrEqual(2);
    expect(percentile(s, 0.5)).toBeLessThanOrEqual(20);
    expect(s.filter((n) => n < 100).length / s.length).toBeGreaterThan(0.75);
    const thousands = s.filter((n) => n >= 1000).length / s.length;
    expect(thousands).toBeGreaterThan(0.01);
    expect(thousands).toBeLessThan(0.08);
    const huge = s.filter((n) => n >= 10_000).length / s.length;
    expect(huge).toBeGreaterThan(0);
    expect(huge).toBeLessThan(0.025);
    expect(s.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it("skew higher when pinned or liked by the creator", () => {
    const plain = percentile(samples({ pinned: false, likedByCreator: false }, "a"), 0.5);
    const liked = percentile(samples({ pinned: false, likedByCreator: true }, "b"), 0.5);
    const pinned = percentile(samples({ pinned: true, likedByCreator: false }, "c"), 0.5);
    expect(liked).toBeGreaterThan(plain * 2);
    expect(pinned).toBeGreaterThan(liked * 2);
  });
});

describe("timeAgo", () => {
  it("formats per Platform and language", () => {
    expect(formatAge(5, "tiktok", "en")).toBe("5m");
    expect(formatAge(125, "tiktok", "en")).toBe("2h");
    expect(formatAge(3 * 1440 + 10, "instagram", "en")).toBe("3d");
    expect(formatAge(9 * 1440, "tiktok", "en")).toBe("1w");
    expect(formatAge(60 * 1440, "youtube", "en")).toBe("2mo");
    expect(formatAge(400 * 1440, "youtube", "en")).toBe("1y");
    expect(formatAge(60 * 1440, "instagram", "en")).toBe("8w");
    expect(formatAge(0.5, "x", "en")).toBe("30s");
    expect(formatAge(7 * 60, "x", "en")).toBe("7h");
    expect(formatAge(125, "tiktok", "es")).toBe("2 h");
    expect(formatAge(5, "x", "es")).toBe("5 min");
    expect(formatAge(14 * 1440, "instagram", "es")).toBe("2 sem");
    expect(formatAge(31 * 1440, "youtube", "es")).toBe("1 mes");
    expect(formatAge(90 * 1440, "youtube", "es")).toBe("3 meses");
    expect(formatAge(800 * 1440, "youtube", "es")).toBe("2 años");
  });

  it("stays within each Platform's range and round-trips through parseAge", () => {
    const rng = createRng("age");
    for (const platform of Platform.options) {
      for (let i = 0; i < 500; i++) {
        const text = formatAge(sampleAge(rng, platform), platform, i % 2 ? "es" : "en");
        expect(parseAge(text), text).toBeTypeOf("number");
        if (platform === "x") expect(text).toMatch(/^\d+ ?(s|m|min|h)$/);
        if (platform === "tiktok") expect(parseAge(text)!).toBeLessThanOrEqual(4 * 7 * 1440);
      }
    }
  });
});
