import { z } from "zod";
import { Context, Language, Platform, Tone } from "./platform";

export const BankEntry = z.object({
  id: z.string().min(1),
  language: Language,
  tone: Tone,
  text: z.string().min(1),
  platforms: z.array(Platform).default([]),
  contexts: z.array(Context).default([]),
  weight: z.number().positive().default(1),
});
export type BankEntry = z.infer<typeof BankEntry>;
export type BankEntryInput = z.input<typeof BankEntry>;

export const BankFile = z.object({
  language: Language,
  entries: z.array(BankEntry),
});
export type BankFile = z.infer<typeof BankFile>;
