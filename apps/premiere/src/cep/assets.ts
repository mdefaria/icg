import type { CepNode } from "./globals";

type FsModule = { readFileSync(path: string): Uint8Array };

export function fileUrlToPath(url: string): string {
  const decoded = decodeURI(url);
  if (/^file:\/\/\/[A-Za-z]:\//.test(decoded)) return decoded.slice("file:///".length);
  if (decoded.startsWith("file://")) return decoded.slice("file://".length);
  return decoded;
}

export function resolveAssetPath(url: string, extensionRoot: string): string {
  if (url.startsWith("file://")) return fileUrlToPath(url);
  const relative = url.replace(/^\.\//, "").replace(/^\//, "");
  const root = extensionRoot.replace(/[\\/]+$/, "");
  return `${root}/${decodeURI(relative)}`;
}

export type BinaryLoader = (url: string) => Promise<Uint8Array>;

export function createNodeBinaryLoader(node: CepNode, extensionRoot: string): BinaryLoader {
  const fs = node.require("fs") as FsModule;
  return (url) =>
    Promise.resolve(new Uint8Array(fs.readFileSync(resolveAssetPath(url, extensionRoot))));
}

export const fetchBinaryLoader: BinaryLoader = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};
