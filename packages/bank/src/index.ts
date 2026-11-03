import { BankEntry, type Language, type Tone } from "@icg/shared";
import enCritical from "../data/en/critical.json";
import enEmoji from "../data/en/emoji.json";
import enFunny from "../data/en/funny.json";
import enHype from "../data/en/hype.json";
import enProduct from "../data/en/product.json";
import enQuestion from "../data/en/question.json";
import enRelatable from "../data/en/relatable.json";
import enRequest from "../data/en/request.json";
import enStory from "../data/en/story.json";
import esCritical from "../data/es/critical.json";
import esEmoji from "../data/es/emoji.json";
import esFunny from "../data/es/funny.json";
import esHype from "../data/es/hype.json";
import esProduct from "../data/es/product.json";
import esQuestion from "../data/es/question.json";
import esRelatable from "../data/es/relatable.json";
import esRequest from "../data/es/request.json";
import esStory from "../data/es/story.json";

const FILES: Record<Language, Record<Tone, unknown[]>> = {
  en: {
    hype: enHype,
    funny: enFunny,
    question: enQuestion,
    critical: enCritical,
    relatable: enRelatable,
    emoji: enEmoji,
    request: enRequest,
    story: enStory,
    product: enProduct,
  },
  es: {
    hype: esHype,
    funny: esFunny,
    question: esQuestion,
    critical: esCritical,
    relatable: esRelatable,
    emoji: esEmoji,
    request: esRequest,
    story: esStory,
    product: esProduct,
  },
};

let cache: Record<Language, BankEntry[]> | undefined;

function parsed(): Record<Language, BankEntry[]> {
  if (!cache) {
    const byLanguage = (language: Language) =>
      Object.values(FILES[language]).flatMap((entries) => entries.map((e) => BankEntry.parse(e)));
    cache = { en: byLanguage("en"), es: byLanguage("es") };
  }
  return cache;
}

export function loadBank(): BankEntry[] {
  const { en, es } = parsed();
  return [...en, ...es];
}

export function loadBankByLanguage(language: Language): BankEntry[] {
  return [...parsed()[language]];
}

export type BankStats = Record<Language, { total: number; tones: Record<Tone, number> }>;

function stats(): BankStats {
  const out = {} as BankStats;
  for (const language of Object.keys(FILES) as Language[]) {
    const tones = {} as Record<Tone, number>;
    for (const [tone, entries] of Object.entries(FILES[language]) as Array<[Tone, unknown[]]>) {
      tones[tone] = entries.length;
    }
    out[language] = { total: Object.values(tones).reduce((a, b) => a + b, 0), tones };
  }
  return out;
}

export const BANK_STATS: BankStats = stats();
