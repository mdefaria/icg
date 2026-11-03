import type { Author, Language, Platform } from "@icg/shared";
import { EMOJI, HANDLE_WORDS, NAMES } from "./data";
import type { NameRegion } from "./data";
import type { AvatarPicker, Rng } from "./engine";
import { alphanumeric, chance, digits, int, pick, weighted } from "./rng";

type Person = { first: string; last: string; region: NameRegion };

type Pattern = { weight: number; build: (p: Parts) => string };

type Parts = {
  f: string;
  l: string;
  F: string;
  L: string;
  w: string;
  rng: Rng;
};

const REGION_MIX: Record<Language, Array<{ region: NameRegion; weight: number }>> = {
  en: [
    { region: "en", weight: 60 },
    { region: "es", weight: 15 },
    { region: "intl", weight: 25 },
  ],
  es: [
    { region: "es", weight: 65 },
    { region: "en", weight: 15 },
    { region: "intl", weight: 20 },
  ],
};

export const USERNAME_RULES: Record<Platform, RegExp> = {
  tiktok: /^(?!.*\.\.)(?!.*\.$)[a-z0-9._]{2,24}$/,
  instagram: /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/,
  youtube: /^[A-Za-z0-9._-]{3,30}$/,
  x: /^[A-Za-z0-9_]{4,15}$/,
};

const MAX_LENGTH: Record<Platform, number> = { tiktok: 24, instagram: 30, youtube: 30, x: 15 };

export function fold(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function person(rng: Rng, language: Language): Person {
  const { region } = weighted(rng, REGION_MIX[language], (r) => r.weight);
  const pool = NAMES[region];
  return { first: pick(rng, pool.first), last: pick(rng, pool.last), region };
}

const year = (rng: Rng) => pick(rng, ["9", "0", "1"]) + int(rng, 0, 9).toString();

const PATTERNS: Record<Platform, Pattern[]> = {
  tiktok: [
    { weight: 14, build: ({ f, w }) => `${f}.${w}` },
    { weight: 8, build: ({ f, w }) => `_${f}_${w}` },
    { weight: 10, build: ({ f, l }) => `${f}${l}` },
    { weight: 10, build: ({ f, l, rng }) => `${f}_${l}${digits(rng, int(rng, 1, 3))}` },
    { weight: 10, build: ({ f, l }) => `${f}.${l}` },
    { weight: 8, build: ({ f, rng }) => `${f}${year(rng)}` },
    { weight: 6, build: ({ f, w, rng }) => `${f}.${w}${digits(rng, 1)}` },
    { weight: 5, build: ({ f, l }) => `${f}x${l}` },
    { weight: 5, build: ({ w, f }) => `${w}.${f}` },
    { weight: 4, build: ({ f, l }) => `${f}_${l}_` },
  ],
  instagram: [
    { weight: 14, build: ({ f, l }) => `${f}.${l}` },
    { weight: 10, build: ({ f, l }) => `${f}_${l}` },
    { weight: 12, build: ({ f, w }) => `${f}.${w}` },
    { weight: 8, build: ({ f, l, rng }) => `${f}${l}${digits(rng, 2)}` },
    { weight: 5, build: ({ f, l }) => `_${f}.${l}_` },
    { weight: 5, build: ({ f, l, w }) => `${f}.${l}.${w}` },
    { weight: 4, build: ({ f, l }) => `the${f}${l}` },
    { weight: 6, build: ({ f }) => `${f}__` },
    { weight: 6, build: ({ f, l }) => `${f.charAt(0)}${l}` },
  ],
  youtube: [
    { weight: 14, build: ({ F, L }) => `${F}${L}` },
    { weight: 12, build: ({ F, L, rng }) => `${F}${L}-${alphanumeric(rng, int(rng, 2, 5))}` },
    { weight: 10, build: ({ f, l, rng }) => `${f}${l}${digits(rng, int(rng, 2, 4))}` },
    { weight: 8, build: ({ f, w }) => `${f}.${w}` },
    { weight: 6, build: ({ F, w }) => `${F}${capital(w)}` },
    { weight: 5, build: ({ f, l }) => `${f}_${l}` },
    { weight: 4, build: ({ f, l }) => `${f}-${l}` },
  ],
  x: [
    { weight: 12, build: ({ F, L }) => `${F}${L}` },
    { weight: 10, build: ({ f, w }) => `${f}_${w}` },
    { weight: 10, build: ({ f, l, rng }) => `${f}${l}${digits(rng, 2)}` },
    { weight: 8, build: ({ F, L }) => `${F}_${L}` },
    { weight: 8, build: ({ F, L, rng }) => `${F}${L}`.slice(0, 7) + digits(rng, 8) },
    { weight: 6, build: ({ f, rng }) => `${f}${digits(rng, int(rng, 3, 4))}` },
    { weight: 4, build: ({ F, w }) => `${w}${F}` },
  ],
};

function tidy(handle: string, platform: Platform, rng: Rng): string {
  let out = handle.slice(0, MAX_LENGTH[platform]).replace(/\.{2,}/g, ".");
  if (platform === "tiktok" || platform === "instagram") out = out.replace(/\.+$/, "");
  if (platform === "instagram") out = out.replace(/^\.+/, "");
  if (platform === "youtube") out = out.replace(/-+$/, "");
  while (out.length < (platform === "x" ? 4 : 3)) out += digits(rng, 1);
  return out;
}

export function generateUsername(
  rng: Rng,
  platform: Platform,
  who: Person,
  language: Language,
): string {
  if (platform === "tiktok" && chance(rng, 0.1)) return `user${digits(rng, int(rng, 7, 11))}`;
  if (platform === "youtube" && chance(rng, 0.06)) return `user-${alphanumeric(rng, 10)}`;
  const f = fold(who.first);
  const l = fold(who.last);
  const parts: Parts = {
    f,
    l,
    F: capital(f),
    L: capital(l),
    w: pick(rng, HANDLE_WORDS[language]),
    rng,
  };
  let handle = weighted(rng, PATTERNS[platform], (p) => p.weight).build(parts);
  if (platform === "instagram" && chance(rng, 0.2)) handle += digits(rng, int(rng, 1, 3));
  return tidy(handle, platform, rng);
}

export function generateDisplayName(
  rng: Rng,
  platform: Platform,
  who: Person,
  username: string,
): string {
  const emoji = () => pick(rng, EMOJI.display);
  const emojiOdds = platform === "x" ? 0.25 : 0.12;
  if (username.startsWith("user")) return chance(rng, 0.5) ? username : who.first;
  const options: Array<{ weight: number; build: () => string }> = [
    { weight: platform === "youtube" ? 10 : 30, build: () => who.first },
    { weight: platform === "youtube" ? 45 : 22, build: () => `${who.first} ${who.last}` },
    { weight: 8, build: () => `${who.first} ${who.last.charAt(0)}.` },
    { weight: 8, build: () => who.first.toLowerCase() },
    { weight: 10, build: () => username },
  ];
  const name = weighted(rng, options, (o) => o.weight).build();
  return name !== username && chance(rng, emojiOdds) ? `${name} ${emoji()}` : name;
}

export function generateAuthor(
  rng: Rng,
  platform: Platform,
  language: Language,
  pickAvatar: AvatarPicker,
  verifiedOdds = 0.03,
): Author {
  const who = person(rng, language);
  const username = generateUsername(rng, platform, who, language);
  const displayName = generateDisplayName(rng, platform, who, username);
  return {
    username,
    displayName,
    avatar: pickAvatar(rng, platform),
    verified: chance(rng, verifiedOdds),
  };
}

export const creatorName = (creator: Author): string => creator.displayName || creator.username;
