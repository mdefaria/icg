import { Avatar } from "@icg/shared";

export type Box = { x: number; y: number; width: number; height: number };

export function bytesToDataUrl(bytes: Uint8Array, mime = "image/png"): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function canvas2d(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function cropToContent(
  src: string,
  width: number,
  height: number,
): Promise<{ url: string; box: Box } | null> {
  const ctx = canvas2d(width, height);
  if (!ctx) return null;
  const img = await loadImage(src);
  if (!img) return null;
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const out = canvas2d(box.width, box.height);
  if (!out) return null;
  out.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return { url: out.canvas.toDataURL("image/png"), box };
}

export const AVATAR_SIZE = 256;

export async function downscaleAvatar(dataUrl: string, size = AVATAR_SIZE): Promise<string> {
  const ctx = canvas2d(size, size);
  if (!ctx) return dataUrl;
  const img = await loadImage(dataUrl);
  if (!img || img.naturalWidth === 0) return dataUrl;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  try {
    return ctx.canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

export async function avatarFromFile(file: Blob): Promise<Avatar> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  const original = await readFileAsDataUrl(file);
  return Avatar.parse({ kind: "user", dataUrl: await downscaleAvatar(original) });
}
