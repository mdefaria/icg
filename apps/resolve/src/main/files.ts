import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function overlayFileName(label: string, now = new Date()): string {
  const safeLabel = label.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "overlay";
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${safeLabel}-${stamp}.png`;
}

export async function writePng(dir: string, label: string, png: Uint8Array): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, overlayFileName(label));
  await writeFile(filePath, png);
  return filePath;
}

export async function readFileInside(rootDir: string, fileUrl: string): Promise<Uint8Array> {
  const filePath = path.resolve(fileURLToPath(fileUrl));
  const root = path.resolve(rootDir);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    throw new Error(`Refusing to read outside the plugin folder: ${filePath}`);
  }
  return new Uint8Array(await readFile(filePath));
}
