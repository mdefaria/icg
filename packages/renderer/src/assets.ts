import type { Language } from "@icg/shared";
import type { EmojiLoader } from "./emoji";
import type { FontSet } from "./fonts";

export type AvatarImage = { data: Uint8Array; mime: "image/png" | "image/webp" | "image/jpeg" };

export interface AvatarLoader {
  pool(id: string): AvatarImage | undefined;
}

export type RenderAssets = {
  fonts: FontSet;
  emoji: EmojiLoader;
  avatars: AvatarLoader;
  locale?: Language;
};

export function sniffImageMime(bytes: Uint8Array): AvatarImage["mime"] | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return "image/webp";
  return undefined;
}

export function createAvatarLoader(files: Record<string, Uint8Array>): AvatarLoader {
  return {
    pool(id) {
      const data = files[id];
      if (!data) return undefined;
      const mime = sniffImageMime(data);
      return mime ? { data, mime } : undefined;
    },
  };
}

export function bytesToDataUrl(mime: string, bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
