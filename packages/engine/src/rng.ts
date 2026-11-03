import type { Rng } from "./engine";

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: string): Rng {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

export const chance = (rng: Rng, p: number): boolean => rng() < p;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick from an empty list");
  return items[Math.floor(rng() * items.length)] as T;
}

export function weighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return pick(rng, items);
}

export function digits(rng: Rng, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += int(rng, 0, 9).toString();
  return out;
}

const ALPHANUM = "abcdefghijklmnopqrstuvwxyz0123456789";

export function alphanumeric(rng: Rng, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += ALPHANUM[int(rng, 0, ALPHANUM.length - 1)];
  return out;
}
