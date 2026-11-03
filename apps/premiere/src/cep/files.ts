import type { CepNode } from "./globals";

export interface OverlayFileWriter {
  writePng(bytes: Uint8Array, fileName: string): Promise<string>;
}

type FsModule = {
  mkdirSync(path: string, options: { recursive: boolean }): unknown;
  writeFileSync(path: string, data: Uint8Array): void;
};
type OsModule = { tmpdir(): string };
type PathModule = { join(...parts: string[]): string };

export function overlayFileName(now = Date.now(), random = Math.random()): string {
  const suffix = Math.floor(random * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `icg-${now}-${suffix}.png`;
}

export function createCepFileWriter(node: CepNode): OverlayFileWriter {
  const fs = node.require("fs") as FsModule;
  const os = node.require("os") as OsModule;
  const path = node.require("path") as PathModule;
  return {
    writePng(bytes, fileName) {
      const dir = path.join(os.tmpdir(), "icg");
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, fileName);
      fs.writeFileSync(target, bytes);
      return Promise.resolve(target);
    },
  };
}
