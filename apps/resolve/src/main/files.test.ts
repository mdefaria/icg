import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { overlayFileName, readFileInside, writePng } from "./files";

describe("overlayFileName", () => {
  it("keeps the label readable and the name filesystem-safe", () => {
    expect(overlayFileName("ICG comment", new Date("2026-11-03T12:00:00.000Z"))).toBe(
      "ICG-comment-2026-11-03T12-00-00-000Z.png",
    );
    expect(overlayFileName("///", new Date("2026-11-03T12:00:00.000Z"))).toBe(
      "overlay-2026-11-03T12-00-00-000Z.png",
    );
  });
});

describe("writePng", () => {
  it("creates the directory and writes the bytes", async () => {
    const dir = path.join(await mkdtemp(path.join(os.tmpdir(), "icg-")), "nested");
    const filePath = await writePng(dir, "ICG comment", new Uint8Array([1, 2, 3]));
    expect(filePath.startsWith(dir)).toBe(true);
    expect([...(await readFile(filePath))]).toEqual([1, 2, 3]);
  });
});

describe("readFileInside", () => {
  it("reads files under the root and refuses anything else", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "icg-root-"));
    const inside = path.join(root, "asset.bin");
    await writeFile(inside, new Uint8Array([9]));
    expect([...(await readFileInside(root, pathToFileURL(inside).href))]).toEqual([9]);
    const outside = pathToFileURL(path.join(root, "..", "escape.bin")).href;
    await expect(readFileInside(root, outside)).rejects.toThrow(/outside the plugin folder/);
  });
});
