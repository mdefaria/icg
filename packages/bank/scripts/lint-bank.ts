import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BankEntry, Language, Tone } from "@icg/shared";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

export const TONE_TARGETS: Record<Tone, number> = {
  hype: 220,
  funny: 220,
  relatable: 200,
  question: 180,
  story: 180,
  request: 150,
  critical: 130,
  emoji: 120,
  product: 100,
};
export const TONE_FLOOR = 0.75;
export const LANGUAGE_FLOOR = 1200;
export const NEAR_DUPLICATE = 0.8;
export const SLOTS = ["creator", "n", "emoji"] as const;

// Matched against normalised text of every entry, because untagged entries can land on an ad too.
export const BLACKLIST: Record<Language, string[]> = {
  en: [
    "changed my life",
    "life changing",
    "life-changing",
    "i bought",
    "just bought",
    "bought one",
    "bought it",
    "bought two",
    "bought 3",
    "i ordered",
    "just ordered",
    "ordered mine",
    "ordered one",
    "ordered it",
    "works great",
    "works perfectly",
    "works so well",
    "actually works",
    "highly recommend",
    "i recommend",
    "recommend it",
    "recommend this",
    "best product",
    "best purchase",
    "worth every penny",
    "worth the money",
    "worth it",
    "game changer",
    "gamechanger",
    "holy grail",
    "five stars",
    "5 stars",
    "10 10 would buy",
    "would buy again",
    "buy again",
    "been using",
    "i use it",
    "i use this",
    "using it for",
    "using this for",
    "my skin",
    "cleared my",
    "cured",
    "lost weight",
    "weight loss",
    "anxiety",
    "depression",
    "doctor",
    "invest",
    "crypto",
    "stocks",
    "passive income",
    "guaranteed",
    "discount code",
    "promo code",
    "link in bio",
    "use my code",
    "sexy",
    "nudes",
    "onlyfans",
  ],
  es: [
    "me cambio la vida",
    "cambio mi vida",
    "lo compre",
    "la compre",
    "los compre",
    "las compre",
    "ya lo pedi",
    "ya la pedi",
    "me lo compre",
    "me la compre",
    "compre dos",
    "compre 3",
    "me llego",
    "funciona genial",
    "funciona perfecto",
    "funciona de maravilla",
    "si funciona",
    "lo recomiendo",
    "la recomiendo",
    "recomendadisimo",
    "100 recomendado",
    "mejor producto",
    "mejor compra",
    "vale cada",
    "vale la pena comprarlo",
    "lo uso",
    "la uso",
    "lo llevo usando",
    "llevo usandolo",
    "mi piel",
    "me curo",
    "cura",
    "adelgace",
    "bajar de peso",
    "baje de peso",
    "ansiedad",
    "depresion",
    "medico",
    "invertir",
    "inversion",
    "cripto",
    "acciones de bolsa",
    "ingresos pasivos",
    "garantizado",
    "codigo de descuento",
    "cupon",
    "link en bio",
    "sexy",
    "nudes",
    "onlyfans",
  ],
};

// Brand and celebrity names are out everywhere; Platform names are allowed because Comments sit on them.
export const BRANDS = [
  "netflix",
  "spotify",
  "apple",
  "iphone",
  "samsung",
  "amazon",
  "nike",
  "adidas",
  "gucci",
  "zara",
  "disney",
  "marvel",
  "pixar",
  "tesla",
  "starbucks",
  "mcdonalds",
  "coca cola",
  "pepsi",
  "shein",
  "temu",
  "ikea",
  "playstation",
  "xbox",
  "nintendo",
  "taylor swift",
  "beyonce",
  "bad bunny",
  "shakira",
  "messi",
  "ronaldo",
  "mrbeast",
];

export type BankFileInput = { path: string; language: string; tone: string; data: unknown };

export type LintReport = {
  errors: string[];
  warnings: string[];
  counts: Record<string, Record<string, number>>;
};

export function normalise(text: string): string {
  return text
    .replace(/\{[a-z]+\}/g, " ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}\s]/gu, " ")
    .replace(/(\p{Extended_Pictographic}|\p{Regional_Indicator}{2})/gu, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalise(text);
  return n === "" ? [] : n.split(" ");
}

type Bag = { counts: Map<string, number>; size: number };

function bag(xs: string[]): Bag {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return { counts, size: xs.length };
}

function bagJaccard(a: Bag, b: Bag): number {
  let inter = 0;
  for (const [k, x] of a.counts) inter += Math.min(x, b.counts.get(k) ?? 0);
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

// Multiset Jaccard so that "😭😭😭" and "😭" stay distinct while reordered word salads still collide.
export function jaccard(a: string[], b: string[]): number {
  return bagJaccard(bag(a), bag(b));
}

export function slotErrors(text: string): string[] {
  const errors: string[] = [];
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    if (!(SLOTS as readonly string[]).includes(m[1] ?? "")) errors.push(`unknown slot {${m[1]}}`);
  }
  const stripped = text.replace(/\{[^{}]*\}/g, "");
  if (/[{}]/.test(stripped)) errors.push("unbalanced brace");
  return errors;
}

function blacklistHits(text: string, language: Language): string[] {
  const n = ` ${normalise(text)} `;
  return [...BLACKLIST[language], ...BRANDS].filter((phrase) =>
    n.includes(` ${normalise(phrase)} `),
  );
}

export function lintFiles(files: BankFileInput[]): LintReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, Record<string, number>> = {};
  const ids = new Set<string>();
  const byLanguage = new Map<Language, Array<{ entry: BankEntry; bag: Bag; norm: string }>>();

  for (const file of files) {
    const lang = Language.safeParse(file.language);
    const tone = Tone.safeParse(file.tone);
    if (!lang.success || !tone.success) {
      errors.push(`${file.path}: file must live at data/<language>/<tone>.json`);
      continue;
    }
    if (!Array.isArray(file.data)) {
      errors.push(`${file.path}: must be a JSON array of BankEntry`);
      continue;
    }
    const langCounts = (counts[lang.data] ??= {});
    langCounts[tone.data] = 0;
    for (const [i, raw] of file.data.entries()) {
      const at = `${file.path}[${i}]`;
      const parsed = BankEntry.safeParse(raw);
      if (!parsed.success) {
        errors.push(`${at}: ${parsed.error.issues.map((x) => x.message).join("; ")}`);
        continue;
      }
      const e = parsed.data;
      const where = `${at} ${e.id}`;
      langCounts[tone.data] = (langCounts[tone.data] ?? 0) + 1;
      if (e.language !== lang.data || e.tone !== tone.data) {
        errors.push(`${where}: language/tone do not match the file`);
      }
      if (!new RegExp(`^${e.language}-${e.tone}-\\d{4}$`).test(e.id)) {
        errors.push(`${where}: id must look like ${e.language}-${e.tone}-0001`);
      }
      if (ids.has(e.id)) errors.push(`${where}: duplicate id`);
      ids.add(e.id);
      if (e.text !== e.text.trim()) errors.push(`${where}: leading or trailing whitespace`);
      if (/ {2}|\n{2}|\t/.test(e.text)) errors.push(`${where}: double space, blank line or tab`);
      if (e.text.split("\n").length > 3) errors.push(`${where}: more than three lines`);
      if (e.text.length > 280) errors.push(`${where}: longer than 280 characters`);
      for (const s of slotErrors(e.text)) errors.push(`${where}: ${s}`);
      if (new Set(e.contexts).size !== e.contexts.length) errors.push(`${where}: repeated context`);
      if (new Set(e.platforms).size !== e.platforms.length)
        errors.push(`${where}: repeated platform`);
      const hits = blacklistHits(e.text, e.language);
      if (hits.length > 0)
        errors.push(`${where}: blacklisted phrase ${hits.map((h) => `"${h}"`).join(", ")}`);
      const norm = normalise(e.text);
      if (e.tone === "emoji") {
        if (/\p{L}/u.test(e.text.replace(/\{emoji\}/g, "")))
          errors.push(`${where}: emoji entries carry no words`);
      } else if (!/\p{L}/u.test(norm)) {
        errors.push(`${where}: only the emoji tone may be wordless`);
      }
      const list = byLanguage.get(e.language) ?? [];
      list.push({ entry: e, bag: bag(tokens(e.text)), norm: norm === "" ? e.text : norm });
      byLanguage.set(e.language, list);
    }
  }

  for (const [language, list] of byLanguage) {
    const seen = new Map<string, string>();
    for (const item of list) {
      const prior = seen.get(item.norm);
      if (prior)
        errors.push(`${language}: ${item.entry.id} duplicates ${prior}: "${item.entry.text}"`);
      else seen.set(item.norm, item.entry.id);
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (a.norm === b.norm || a.bag.size === 0 || b.bag.size === 0) continue;
        // Jaccard can never exceed the ratio of the two sizes, so most pairs are skipped here.
        if (Math.min(a.bag.size, b.bag.size) / Math.max(a.bag.size, b.bag.size) <= NEAR_DUPLICATE)
          continue;
        const score = bagJaccard(a.bag, b.bag);
        if (score > NEAR_DUPLICATE) {
          errors.push(
            `${language}: ${b.entry.id} near-duplicates ${a.entry.id} (${score.toFixed(2)}): "${b.entry.text}" ~ "${a.entry.text}"`,
          );
        }
      }
    }
    const creator = list.filter((x) => x.entry.text.includes("{creator}")).length / list.length;
    if (creator < 0.05 || creator > 0.15) {
      warnings.push(
        `${language}: {creator} appears in ${(creator * 100).toFixed(1)}% of entries (aim for ~10%)`,
      );
    }
  }

  for (const language of Language.options) {
    const langCounts = counts[language] ?? {};
    let total = 0;
    for (const tone of Tone.options) {
      const n = langCounts[tone] ?? 0;
      total += n;
      const floor = Math.ceil(TONE_TARGETS[tone] * TONE_FLOOR);
      if (n < floor)
        errors.push(
          `${language}/${tone}: ${n} entries, needs at least ${floor} (target ${TONE_TARGETS[tone]})`,
        );
    }
    if (total < LANGUAGE_FLOOR)
      errors.push(`${language}: ${total} entries, needs at least ${LANGUAGE_FLOOR}`);
  }

  return { errors, warnings, counts };
}

export function readBankFiles(dir = DATA_DIR): BankFileInput[] {
  const files: BankFileInput[] = [];
  for (const language of readdirSync(dir)) {
    for (const name of readdirSync(join(dir, language))) {
      if (!name.endsWith(".json")) continue;
      const path = join(language, name);
      files.push({
        path,
        language,
        tone: name.replace(/\.json$/, ""),
        data: JSON.parse(readFileSync(join(dir, path), "utf8")),
      });
    }
  }
  return files;
}

function main() {
  const report = lintFiles(readBankFiles());
  const tones = Tone.options;
  console.log(
    ["tone".padEnd(10), ...Language.options.map((l) => l.padStart(6)), "target".padStart(8)].join(
      "",
    ),
  );
  for (const tone of tones) {
    console.log(
      [
        tone.padEnd(10),
        ...Language.options.map((l) => String(report.counts[l]?.[tone] ?? 0).padStart(6)),
        String(TONE_TARGETS[tone]).padStart(8),
      ].join(""),
    );
  }
  console.log(
    [
      "total".padEnd(10),
      ...Language.options.map((l) =>
        String(Object.values(report.counts[l] ?? {}).reduce((a, b) => a + b, 0)).padStart(6),
      ),
    ].join(""),
  );
  for (const w of report.warnings) console.warn(`warn  ${w}`);
  for (const e of report.errors) console.error(`error ${e}`);
  if (report.errors.length > 0) {
    console.error(`\nbank lint failed: ${report.errors.length} error(s)`);
    process.exit(1);
  }
  console.log("\nbank lint passed");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
