import { Language, Tone } from "@icg/shared";
import { loadBankByLanguage } from "../src/index";

const SAMPLE_NAMES: Record<Language, string[]> = {
  en: ["maya", "jordan", "the_kev", "lucyfilms", "sam"],
  es: ["lucía", "nacho", "valen", "dani_edita", "caro"],
};
const SAMPLE_EMOJI = ["🔥", "😭", "😂", "❤️", "👏", "💀", "✨"];

function usage(): never {
  console.error("usage: pnpm --filter @icg/bank preview <language> <tone> [count]");
  console.error(`  language: ${Language.options.join(" | ")}`);
  console.error(`  tone:     ${Tone.options.join(" | ")} | all`);
  process.exit(1);
}

const [languageArg, toneArg = "all", countArg = "20"] = process.argv.slice(2);
const language = Language.safeParse(languageArg);
if (!language.success) usage();
const tone = toneArg === "all" ? undefined : Tone.safeParse(toneArg);
if (tone && !tone.success) usage();
const count = Number.parseInt(countArg, 10);
if (!Number.isFinite(count) || count < 1) usage();

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

const pool = loadBankByLanguage(language.data).filter((e) => !tone || e.tone === tone.data);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [pool[i], pool[j]] = [pool[j]!, pool[i]!];
}

const creator = pick(SAMPLE_NAMES[language.data]);
for (const entry of pool.slice(0, count)) {
  const text = entry.text
    .replaceAll("{creator}", `@${creator}`)
    .replaceAll("{n}", String(2 + Math.floor(Math.random() * 8)))
    .replace(/\{emoji\}/g, () => pick(SAMPLE_EMOJI));
  const tags = [...entry.platforms, ...entry.contexts].join(",");
  console.log(
    `${entry.id.padEnd(16)} ${tags ? `[${tags}] ` : ""}${text.replaceAll("\n", "\n" + " ".repeat(17))}`,
  );
}
console.log(
  `\n${Math.min(count, pool.length)} of ${pool.length} ${language.data}/${toneArg} entries`,
);
