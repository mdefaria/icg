import { BankFile, Language, Tone } from "@icg/shared";
import type { BankEntry } from "@icg/shared";
import { z } from "zod";
import emojiJson from "./data/emoji.json";
import handleWordsJson from "./data/handle-words.json";
import namesJson from "./data/names.json";
import repliesEn from "./data/replies.en.json";
import repliesEs from "./data/replies.es.json";

const Words = z.array(z.string().min(1)).min(1);

const NamePool = z.object({ first: Words, last: Words });
export type NamePool = z.infer<typeof NamePool>;

export const NameRegion = z.enum(["en", "es", "intl"]);
export type NameRegion = z.infer<typeof NameRegion>;

export const NAMES = z.record(NameRegion, NamePool).parse(namesJson);

export const HANDLE_WORDS = z.record(Language, Words).parse(handleWordsJson);

export const EMOJI = z.object({ tones: z.record(Tone, Words), display: Words }).parse(emojiJson);

function parseReplies(json: unknown, language: Language): BankEntry[] {
  const file = BankFile.parse(json);
  if (file.entries.some((e) => e.language !== language)) {
    throw new Error(`replies.${language}.json has entries in another language`);
  }
  return file.entries;
}

export const REPLIES: Record<Language, BankEntry[]> = {
  en: parseReplies(repliesEn, "en"),
  es: parseReplies(repliesEs, "es"),
};
