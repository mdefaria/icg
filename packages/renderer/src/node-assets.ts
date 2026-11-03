import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAvatarLoader, type RenderAssets } from "./assets";
import { createEmojiLoader, type EmojiSet } from "./emoji";
import { FontSet, type FontFace } from "./fonts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const PACKAGE_PATHS = {
  root: packageRoot,
  fonts: join(packageRoot, "fonts"),
  emoji: join(packageRoot, "fixtures", "emoji"),
  avatars: join(packageRoot, "fixtures", "avatars"),
  samples: join(packageRoot, "samples"),
  golden: join(packageRoot, "fixtures", "golden"),
};

const FACES: Array<Omit<FontFace, "data"> & { file: string }> = [
  { family: "Inter", weight: 400, file: "Inter-Regular.ttf" },
  { family: "Inter", weight: 500, file: "Inter-Medium.ttf" },
  { family: "Inter", weight: 600, file: "Inter-SemiBold.ttf" },
  { family: "Inter", weight: 700, file: "Inter-Bold.ttf" },
  { family: "Roboto", weight: 400, file: "Roboto-Regular.ttf" },
  { family: "Roboto", weight: 500, file: "Roboto-Medium.ttf" },
  { family: "Roboto", weight: 700, file: "Roboto-Bold.ttf" },
];

export function loadBundledFonts(): FontSet {
  return new FontSet(
    FACES.map(({ family, weight, file }) => ({
      family,
      weight,
      data: new Uint8Array(readFileSync(join(PACKAGE_PATHS.fonts, file))),
    })),
  );
}

function readDir(dir: string, ext: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext));
  } catch {
    return [];
  }
}

export function loadBundledEmoji() {
  const sets: Partial<Record<EmojiSet, Record<string, string>>> = {};
  for (const set of ["noto", "twemoji"] as const) {
    const dir = join(PACKAGE_PATHS.emoji, set);
    const table: Record<string, string> = {};
    for (const file of readDir(dir, ".svg")) table[file] = readFileSync(join(dir, file), "utf8");
    sets[set] = table;
  }
  return createEmojiLoader(sets);
}

export function loadFixtureAvatars(dir = PACKAGE_PATHS.avatars) {
  const files: Record<string, Uint8Array> = {};
  for (const file of readDir(dir, ".png")) {
    files[file.replace(/\.png$/, "")] = new Uint8Array(readFileSync(join(dir, file)));
  }
  for (const file of readDir(dir, ".webp")) {
    files[file.replace(/\.webp$/, "")] = new Uint8Array(readFileSync(join(dir, file)));
  }
  return createAvatarLoader(files);
}

let cached: RenderAssets | undefined;

export function loadNodeAssets(): RenderAssets {
  cached ??= {
    fonts: loadBundledFonts(),
    emoji: loadBundledEmoji(),
    avatars: loadFixtureAvatars(),
  };
  return cached;
}
