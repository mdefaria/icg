import type { Context, FramePreset, Language, Platform, Theme, Tone, Variant } from "@icg/shared";

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
};

export const THEME_LABELS: Record<Theme, string> = { dark: "Dark", light: "Light" };

export const VARIANT_LABELS: Record<Variant, string> = {
  single: "Single",
  "creator-reply": "Creator reply",
};

export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", es: "Spanish" };

export const TONE_LABELS: Record<Tone, string> = {
  hype: "Hype",
  funny: "Funny",
  question: "Question",
  critical: "Critical",
  relatable: "Relatable",
  emoji: "Emoji only",
  request: "Request",
  story: "Story reaction",
  product: "Product question",
};

export const CONTEXT_LABELS: Record<Context, string> = {
  "short-film": "Short film",
  ad: "Ad",
  tutorial: "Tutorial",
  vlog: "Vlog",
  music: "Music",
};

export const FRAME_LABELS: Record<FramePreset, string> = {
  "9:16": "9:16 vertical",
  "4:5": "4:5 portrait",
  "1:1": "1:1 square",
  "16:9": "16:9 landscape",
};

export function options<K extends string>(
  labels: Record<K, string>,
): { value: K; label: string }[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}
