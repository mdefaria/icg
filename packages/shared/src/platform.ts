import { z } from "zod";

export const Platform = z.enum(["tiktok", "instagram", "youtube", "x"]);
export type Platform = z.infer<typeof Platform>;

export const Theme = z.enum(["dark", "light"]);
export type Theme = z.infer<typeof Theme>;

export const Variant = z.enum(["single", "creator-reply"]);
export type Variant = z.infer<typeof Variant>;

export const Template = z.object({
  platform: Platform,
  theme: Theme,
  variant: Variant,
});
export type Template = z.infer<typeof Template>;

export const Language = z.enum(["en", "es"]);
export type Language = z.infer<typeof Language>;

export const Tone = z.enum([
  "hype",
  "funny",
  "question",
  "critical",
  "relatable",
  "emoji",
  "request",
  "story",
  "product",
]);
export type Tone = z.infer<typeof Tone>;

export const Context = z.enum(["short-film", "ad", "tutorial", "vlog", "music"]);
export type Context = z.infer<typeof Context>;
