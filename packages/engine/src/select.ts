import type { BankEntry, Context, Language, Platform, Tone } from "@icg/shared";
import { EMOJI } from "./data";
import type { Rng } from "./engine";
import { int, pick, weighted } from "./rng";

export type Filter = {
  language: Language;
  platform: Platform;
  tones?: Tone[] | undefined;
  contexts?: Context[] | undefined;
};

const toneOk = (e: BankEntry, tones: Tone[] | undefined) =>
  !tones || tones.length === 0 || tones.includes(e.tone);

const platformOk = (e: BankEntry, platform: Platform | undefined) =>
  !platform || e.platforms.length === 0 || e.platforms.includes(platform);

const contextOk = (e: BankEntry, contexts: Context[] | undefined) =>
  !contexts ||
  contexts.length === 0 ||
  e.contexts.length === 0 ||
  e.contexts.some((c) => contexts.includes(c));

export function candidates(bank: readonly BankEntry[], filter: Filter): BankEntry[] {
  const inLanguage = bank.filter((e) => e.language === filter.language);
  const relaxations: Array<(e: BankEntry) => boolean> = [
    (e) =>
      toneOk(e, filter.tones) && platformOk(e, filter.platform) && contextOk(e, filter.contexts),
    (e) => toneOk(e, filter.tones) && platformOk(e, filter.platform),
    (e) => platformOk(e, filter.platform),
    () => true,
  ];
  for (const ok of relaxations) {
    const found = inLanguage.filter(ok);
    if (found.length > 0) return found;
  }
  throw new Error(`The Bank has no entries in language "${filter.language}"`);
}

export function pickEntry(
  rng: Rng,
  pool: readonly BankEntry[],
  avoid: ReadonlyArray<ReadonlySet<string>>,
): BankEntry {
  for (let level = 0; level <= avoid.length; level++) {
    const blocked = avoid.slice(level);
    const open = pool.filter((e) => !blocked.some((set) => set.has(e.id)));
    if (open.length > 0) return weighted(rng, open, (e) => e.weight);
  }
  return weighted(rng, pool, (e) => e.weight);
}

export function fillSlots(text: string, rng: Rng, tone: Tone, creator: string): string {
  const emoji = pick(rng, EMOJI.tones[tone]);
  return text.replace(/\{(creator|n|emoji)\}/g, (_, slot: string) => {
    if (slot === "creator") return creator;
    if (slot === "n") return int(rng, 2, 12).toString();
    return emoji;
  });
}

export class RecentIds {
  private readonly ids: string[] = [];
  readonly set = new Set<string>();

  constructor(private readonly capacity: number) {}

  add(id: string): void {
    if (this.set.has(id)) this.ids.splice(this.ids.indexOf(id), 1);
    this.ids.push(id);
    this.set.add(id);
    while (this.ids.length > this.capacity) this.set.delete(this.ids.shift() as string);
  }
}
