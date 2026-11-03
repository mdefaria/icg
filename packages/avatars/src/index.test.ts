import { describe, expect, it } from "vitest";
import {
  createRng,
  loadPool,
  pickAvatar,
  pickAvatarForPlatform,
  pickAvatars,
  pickCategory,
} from "./index";
import { fixturePool } from "./pool.fixture";

const pool = loadPool(fixturePool);

describe("loadPool", () => {
  it("parses a pool index from an object or a JSON string", () => {
    expect(pool.entries).toHaveLength(8);
    expect(loadPool(JSON.stringify(fixturePool)).entries[0]?.id).toBe("a1b2c3d4e5f6");
  });

  it("rejects an index with an identifying field or a bad id", () => {
    expect(() => loadPool({ ...fixturePool, version: 2 })).toThrow();
    expect(() =>
      loadPool({ ...fixturePool, entries: [{ ...fixturePool.entries[0], id: "not a hash" }] }),
    ).toThrow();
    expect(() =>
      loadPool({ ...fixturePool, entries: [{ ...fixturePool.entries[3], category: "person" }] }),
    ).toThrow();
  });
});

describe("createRng", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});

describe("pickAvatar", () => {
  it("picks the same Avatar for the same seed", () => {
    const picks = [1, 2, 3].map(() => {
      const rng = createRng(7);
      return [pickAvatar(pool, rng)?.id, pickAvatar(pool, rng)?.id, pickAvatar(pool, rng)?.id];
    });
    expect(picks[1]).toEqual(picks[0]);
    expect(picks[2]).toEqual(picks[0]);
  });

  it("honours category, tags, age bucket and presentation", () => {
    const rng = createRng(1);
    expect(pickAvatar(pool, rng, { category: "pet" })?.id).toBe("1111aaaa2222");
    expect(pickAvatar(pool, rng, { category: ["pet", "landscape"] })?.category).toMatch(
      /pet|landscape/,
    );
    expect(pickAvatar(pool, rng, { tags: ["age:senior"] })?.id).toBe("0f1e2d3c4b5a");
    expect(pickAvatar(pool, rng, { category: "face", presentation: "feminine" })?.id).toBe(
      "a1b2c3d4e5f6",
    );
    expect(pickAvatar(pool, rng, { ageBucket: "young-adult" })).toBeUndefined();
  });

  it("keeps the matching Platform's defaults and every Platform-free entry", () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const entry = pickAvatar(pool, rng, { platform: "tiktok" });
      expect(entry?.platform === undefined || entry.platform === "tiktok").toBe(true);
    }
    expect(pickAvatar(pool, rng, { category: "default", platform: "youtube" })?.letter).toBe("L");
    expect(pickAvatar(pool, rng, { category: "default", platform: "instagram" })).toBeUndefined();
  });

  it("skips excluded ids", () => {
    const rng = createRng(5);
    const faces = pool.entries.filter((e) => e.category === "face").map((e) => e.id);
    expect(pickAvatar(pool, rng, { category: "face", exclude: faces.slice(0, 2) })?.id).toBe(
      faces[2],
    );
    expect(pickAvatar(pool, rng, { category: "face", exclude: new Set(faces) })).toBeUndefined();
  });
});

describe("pickAvatars", () => {
  it("returns distinct Avatars and stops when the filter runs dry", () => {
    const rng = createRng(11);
    const picked = pickAvatars(pool, rng, 10, { category: "face" });
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((e) => e.id)).size).toBe(3);
  });
});

describe("composition", () => {
  it("draws categories roughly in the 60/25/15 split", () => {
    const rng = createRng(2026);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      const c = pickCategory(rng);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    expect(counts["face"]! / 10000).toBeCloseTo(0.6, 1);
    expect(counts["default"]! / 10000).toBeCloseTo(0.15, 1);
  });

  it("falls back to any Avatar when the drawn category is empty in the pool", () => {
    const rng = createRng(9);
    for (let i = 0; i < 100; i++) {
      const entry = pickAvatarForPlatform(pool, rng, "x");
      expect(entry).toBeDefined();
      expect(entry?.platform === undefined || entry.platform === "x").toBe(true);
    }
  });
});
