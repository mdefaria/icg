import type { Platform } from "@icg/shared";
import {
  POOL_COMPOSITION,
  PoolIndex,
  type AgeBucket,
  type PoolCategory,
  type PoolEntry,
  type Presentation,
} from "./pool";

export * from "./pool";

/** Returns a number in [0, 1). The engine passes its own seeded RNG. */
export type Rng = () => number;

export type AvatarFilter = {
  category?: PoolCategory | readonly PoolCategory[];
  /**
   * Keep Platform defaults of this Platform and every entry without a
   * Platform. Defaults of another Platform are dropped.
   */
  platform?: Platform;
  ageBucket?: AgeBucket;
  presentation?: Presentation;
  /** Every listed tag must be present. */
  tags?: readonly string[];
  /** Ids to skip, for example Avatars already used in the same batch. */
  exclude?: ReadonlySet<string> | readonly string[];
};

/** Parses index.json. Throws a ZodError when the file is not a pool index. */
export function loadPool(indexJson: unknown): PoolIndex {
  const data = typeof indexJson === "string" ? JSON.parse(indexJson) : indexJson;
  return PoolIndex.parse(data);
}

/** mulberry32: small, fast, deterministic. Good enough for picking Avatars. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function matchesFilter(entry: PoolEntry, filter: AvatarFilter = {}): boolean {
  if (filter.category !== undefined) {
    const wanted = typeof filter.category === "string" ? [filter.category] : filter.category;
    if (!wanted.includes(entry.category)) return false;
  }
  if (
    filter.platform !== undefined &&
    entry.platform !== undefined &&
    entry.platform !== filter.platform
  ) {
    return false;
  }
  if (filter.ageBucket !== undefined && entry.ageBucket !== filter.ageBucket) return false;
  if (filter.presentation !== undefined && entry.presentation !== filter.presentation) return false;
  if (filter.tags !== undefined && !filter.tags.every((t) => entry.tags.includes(t))) return false;
  if (filter.exclude !== undefined) {
    const excluded = filter.exclude instanceof Set ? filter.exclude : new Set(filter.exclude);
    if (excluded.has(entry.id)) return false;
  }
  return true;
}

/** Uniform pick among the entries that match; `undefined` when none do. */
export function pickAvatar(
  pool: PoolIndex,
  rng: Rng,
  filter: AvatarFilter = {},
): PoolEntry | undefined {
  const candidates = pool.entries.filter((e) => matchesFilter(e, filter));
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Up to `count` distinct Avatars; fewer when the filter leaves fewer. */
export function pickAvatars(
  pool: PoolIndex,
  rng: Rng,
  count: number,
  filter: AvatarFilter = {},
): PoolEntry[] {
  const picked: PoolEntry[] = [];
  const exclude = new Set(filter.exclude ?? []);
  for (let i = 0; i < count; i++) {
    const entry = pickAvatar(pool, rng, { ...filter, exclude });
    if (!entry) break;
    picked.push(entry);
    exclude.add(entry.id);
  }
  return picked;
}

/**
 * Draws a category with the pool's intended composition (60% face, 25%
 * non-face, 15% default), so a comment section looks like a real one even
 * when the pool is not perfectly balanced.
 */
export function pickCategory(
  rng: Rng,
  weights: Readonly<Record<string, number>> = POOL_COMPOSITION,
): PoolCategory {
  const keys = Object.keys(weights) as PoolCategory[];
  const total = keys.reduce((sum, k) => sum + (weights[k] ?? 0), 0);
  let r = rng() * total;
  for (const key of keys) {
    r -= weights[key] ?? 0;
    if (r < 0) return key;
  }
  return keys[keys.length - 1] ?? "face";
}

/** A composition-weighted pick: the usual call for a generated Comment. */
export function pickAvatarForPlatform(
  pool: PoolIndex,
  rng: Rng,
  platform: Platform,
): PoolEntry | undefined {
  const category = pickCategory(rng);
  return pickAvatar(pool, rng, { category, platform }) ?? pickAvatar(pool, rng, { platform });
}
