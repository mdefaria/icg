import { Language, Tone } from "@icg/shared";
import { describe, expect, it } from "vitest";
import { jaccard, lintFiles, normalise } from "../scripts/lint-bank";
import { BANK_STATS, loadBank, loadBankByLanguage } from "./index";

describe("loadBank", () => {
  it("returns every entry of both languages, parsed with defaults applied", () => {
    const bank = loadBank();
    expect(bank.length).toBe(BANK_STATS.en.total + BANK_STATS.es.total);
    for (const entry of bank) {
      expect(Array.isArray(entry.platforms)).toBe(true);
      expect(Array.isArray(entry.contexts)).toBe(true);
      expect(entry.weight).toBeGreaterThan(0);
    }
  });

  it("has unique ids", () => {
    const ids = loadBank().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every tone in every language", () => {
    for (const language of Language.options) {
      const tones = new Set(loadBankByLanguage(language).map((e) => e.tone));
      expect([...tones].sort()).toEqual([...Tone.options].sort());
    }
  });
});

describe("loadBankByLanguage", () => {
  it("returns only that language", () => {
    for (const language of Language.options) {
      const entries = loadBankByLanguage(language);
      expect(entries.length).toBe(BANK_STATS[language].total);
      expect(entries.every((e) => e.language === language)).toBe(true);
    }
  });

  it("returns a copy the caller can mutate", () => {
    const first = loadBankByLanguage("en");
    first.length = 0;
    expect(loadBankByLanguage("en").length).toBe(BANK_STATS.en.total);
  });
});

describe("BANK_STATS", () => {
  it("matches the per-tone counts of the loaded entries", () => {
    for (const language of Language.options) {
      const entries = loadBankByLanguage(language);
      for (const tone of Tone.options) {
        expect(BANK_STATS[language].tones[tone]).toBe(
          entries.filter((e) => e.tone === tone).length,
        );
      }
    }
  });
});

describe("lint", () => {
  it("normalises case, accents, punctuation and slots", () => {
    expect(normalise("¡QUÉ pasada, {creator}!!")).toBe("que pasada");
    expect(normalise("😭😭 lol")).toBe("😭 😭 lol");
  });

  it("counts repeated tokens in jaccard", () => {
    expect(jaccard(["😭", "😭", "😭"], ["😭"])).toBeCloseTo(1 / 3);
    expect(jaccard(["a", "b"], ["b", "a"])).toBe(1);
  });

  const file = (data: unknown[]) => ({
    path: "en/funny.json",
    language: "en",
    tone: "funny",
    data,
  });
  const entry = (n: number, text: string) => ({
    id: `en-funny-${String(n).padStart(4, "0")}`,
    language: "en",
    tone: "funny",
    text,
  });

  it("flags near duplicates, unknown slots and endorsements", () => {
    const { errors } = lintFiles([
      file([
        entry(1, "the dog in the back is the real star"),
        entry(2, "The dog in the back is the real star!!"),
        entry(3, "{username} lol"),
        entry(4, "honestly this changed my life"),
        entry(5, "the dog in the back is the real star tbh"),
      ]),
    ]);
    expect(errors.some((e) => e.includes("en-funny-0002 duplicates en-funny-0001"))).toBe(true);
    expect(errors.some((e) => e.includes("unknown slot {username}"))).toBe(true);
    expect(errors.some((e) => e.includes('"changed my life"'))).toBe(true);
    expect(errors.some((e) => e.includes("en-funny-0005 near-duplicates en-funny-0001"))).toBe(
      true,
    );
  });
});
