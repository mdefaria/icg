import { avatarDirectory, createAvatarLoader, type AvatarImage, type RenderAssets } from "./assets";
import { BUNDLED_FONTS } from "./bundled";
import { createEmojiLoader } from "./emoji";
import { FontSet, type FontFace } from "./fonts";

export type BrowserAssetOptions = {
  fontsBaseUrl: string;
  emojiBaseUrl: string;
  avatarsBaseUrl: string;
  extraFonts?: FontFace[];
  fetch?: typeof fetch;
};

const join = (base: string, file: string) => `${base.replace(/\/$/, "")}/${file}`;

export async function canvasToPng(image: AvatarImage): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([image.data as BlobPart], { type: image.mime }));
  try {
    let blob: Blob | null;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      blob = await canvas.convertToBlob({ type: "image/png" });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    }
    if (!blob) throw new Error("canvas could not encode PNG");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export async function createBrowserAssets(options: BrowserAssetOptions): Promise<RenderAssets> {
  const doFetch = options.fetch ?? fetch;
  const faces = await Promise.all(
    BUNDLED_FONTS.map(async ({ family, weight, file }) => {
      const res = await doFetch(join(options.fontsBaseUrl, file));
      if (!res.ok) throw new Error(`font ${file} failed to load: ${res.status}`);
      return { family, weight, data: new Uint8Array(await res.arrayBuffer()) };
    }),
  );
  const readAvatar = async (file: string): Promise<Uint8Array | undefined> => {
    const res = await doFetch(join(options.avatarsBaseUrl, file));
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined;
  };
  return {
    fonts: new FontSet([...faces, ...(options.extraFonts ?? [])]),
    emoji: createEmojiLoader({ baseUrl: options.emojiBaseUrl, fetch: doFetch }),
    avatars: createAvatarLoader({ pool: avatarDirectory(readAvatar), toPng: canvasToPng }),
  };
}
