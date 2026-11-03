import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  avatarDirectory,
  createAvatarLoader,
  type AvatarImage,
  type AvatarLoader,
  type RenderAssets,
} from "./assets";
import { BUNDLED_FONTS } from "./bundled";
import { createEmojiLoader, type EmojiLoader } from "./emoji";
import { FontSet, type FontFace } from "./fonts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const PACKAGE_PATHS = {
  root: packageRoot,
  fonts: join(packageRoot, "fonts"),
  emoji: join(packageRoot, "fixtures", "emoji"),
  fullEmoji: join(packageRoot, "assets", "emoji"),
  avatars: join(packageRoot, "fixtures", "avatars"),
  samples: join(packageRoot, "samples"),
  golden: join(packageRoot, "fixtures", "golden"),
};

export function loadBundledFonts(dir = PACKAGE_PATHS.fonts, extra: FontFace[] = []): FontSet {
  return new FontSet([
    ...BUNDLED_FONTS.map(({ family, weight, file }) => ({
      family,
      weight,
      data: new Uint8Array(readFileSync(join(dir, file))),
    })),
    ...extra,
  ]);
}

const readOptional = async (path: string): Promise<Uint8Array | undefined> => {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return undefined;
  }
};

export function createNodeEmojiLoader(dir = PACKAGE_PATHS.emoji): EmojiLoader {
  return createEmojiLoader({
    read: async (set, file) => {
      const bytes = await readOptional(join(dir, set, file));
      return bytes ? new TextDecoder().decode(bytes) : undefined;
    },
  });
}

export async function sharpToPng(image: AvatarImage): Promise<Uint8Array> {
  const specifier = "sharp";
  let sharp: (input: Uint8Array) => { png(): { toBuffer(): Promise<Uint8Array> } };
  try {
    sharp = ((await import(/* @vite-ignore */ specifier)) as { default: typeof sharp }).default;
  } catch {
    throw new Error("converting WebP avatars in Node needs the optional `sharp` package");
  }
  return new Uint8Array(await sharp(image.data).png().toBuffer());
}

export function createNodeAvatarLoader(dir = PACKAGE_PATHS.avatars): AvatarLoader {
  return createAvatarLoader({
    pool: avatarDirectory((file) => readOptional(join(dir, file))),
    toPng: sharpToPng,
  });
}

export type NodeAssetOptions = {
  fontsDir?: string;
  extraFonts?: FontFace[];
  emojiDir?: string;
  avatarsDir?: string;
};

export function createNodeAssets(options: NodeAssetOptions = {}): RenderAssets {
  return {
    fonts: loadBundledFonts(options.fontsDir, options.extraFonts),
    emoji: createNodeEmojiLoader(options.emojiDir),
    avatars: createNodeAvatarLoader(options.avatarsDir),
  };
}

export const fullEmojiAvailable = (): boolean =>
  existsSync(join(PACKAGE_PATHS.fullEmoji, "noto")) &&
  existsSync(join(PACKAGE_PATHS.fullEmoji, "twemoji"));

let cached: RenderAssets | undefined;

export function loadNodeAssets(): RenderAssets {
  cached ??= createNodeAssets();
  return cached;
}
