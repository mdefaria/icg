import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCepFileWriter, overlayFileName } from "./files";

describe("overlayFileName", () => {
  it("is unique per call and safe for every file system", () => {
    expect(overlayFileName(1700000000000, 0.5)).toBe("icg-1700000000000-7fffff.png");
    expect(overlayFileName(1, 0)).toBe("icg-1-000000.png");
    expect(overlayFileName()).not.toBe(overlayFileName());
  });
});

describe("createCepFileWriter", () => {
  it("writes the bytes into <tmpdir>/icg using the node modules the CEP bridge exposes", async () => {
    const writer = createCepFileWriter({ require: createRequire(import.meta.url) });
    const fileName = overlayFileName();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const written = await writer.writePng(bytes, fileName);
    try {
      expect(written).toBe(join(tmpdir(), "icg", fileName));
      expect(existsSync(written)).toBe(true);
      expect(new Uint8Array(readFileSync(written))).toEqual(bytes);
    } finally {
      rmSync(written, { force: true });
    }
  });
});
