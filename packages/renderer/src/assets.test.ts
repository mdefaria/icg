import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolIndex } from "@icg/avatars";
import { describe, expect, it } from "vitest";
import {
  avatarDirectory,
  createAvatarLoader,
  poolResolver,
  sniffImageMime,
  type PoolIndexLike,
} from "./assets";
import { bytesToDataUrl } from "./bytes";
import { createNodeAvatarLoader, PACKAGE_PATHS, sharpToPng } from "./node-assets";

const fixture = (file: string) => new Uint8Array(readFileSync(join(PACKAGE_PATHS.avatars, file)));

const poolIndex: PoolIndex = {
  version: 1,
  size: 256,
  format: "webp",
  entries: [
    {
      id: "0123abcd4567",
      file: "a-06.webp",
      category: "face",
      tags: ["face"],
      bytes: 1860,
    },
    { id: "89ab0123cdef", file: "a-01.png", category: "pet", tags: ["non-face"], bytes: 38391 },
  ],
};

describe("poolResolver", () => {
  it("accepts the @icg/avatars PoolIndex shape and resolves ids to files", async () => {
    const asLike: PoolIndexLike = poolIndex;
    const read = (file: string) => fixture(file);
    const resolve = poolResolver(asLike, read);
    expect(sniffImageMime((await resolve("89ab0123cdef"))!)).toBe("image/png");
    expect(await resolve("ffffffffffff")).toBeUndefined();
    expect(() => poolResolver({ entries: [{ id: "" }] }, read)).toThrow();
  });
});

describe("createAvatarLoader", () => {
  it("converts pool WebP to PNG through the converter", async () => {
    const loader = createAvatarLoader({
      pool: poolResolver(poolIndex, async (file) => fixture(file)),
      toPng: sharpToPng,
    });
    const avatar = { kind: "pool", id: "0123abcd4567" } as const;
    expect(loader.href(avatar)).toBeUndefined();
    await loader.prepare(avatar);
    expect(loader.href(avatar)).toMatch(/^data:image\/png;base64,/);
  });

  it("reports WebP when no converter is supplied", async () => {
    const loader = createAvatarLoader({ files: { w: fixture("a-06.webp") } });
    await loader.prepare({ kind: "pool", id: "w" });
    expect(loader.href({ kind: "pool", id: "w" })).toBeUndefined();
    expect(loader.missingAvatars()).toEqual(["pool:w: WebP needs a converter (toPng)"]);
  });

  it("takes user data URLs as PNG, JPEG and WebP, sniffing the real format", async () => {
    const loader = createAvatarLoader({ toPng: sharpToPng });
    const png = {
      kind: "user",
      dataUrl: bytesToDataUrl("image/png", fixture("a-01.png")),
    } as const;
    const jpeg = {
      kind: "user",
      dataUrl: bytesToDataUrl("image/jpeg", fixture("a-05.jpg")),
    } as const;
    const webpLabelledPng = {
      kind: "user",
      dataUrl: bytesToDataUrl("image/png", fixture("a-06.webp")),
    } as const;
    expect(loader.href(png)).toMatch(/^data:image\/png;base64,/);
    expect(loader.href(jpeg)).toMatch(/^data:image\/jpeg;base64,/);
    await loader.prepare(webpLabelledPng);
    expect(loader.href(webpLabelledPng)).toMatch(/^data:image\/png;base64,iVBOR/);
  });

  it("rejects a malformed data URL and leaves the default avatar to the template", async () => {
    const loader = createAvatarLoader();
    const bad = { kind: "user", dataUrl: "data:image/png;base64,<script>" } as const;
    await loader.prepare(bad);
    expect(loader.href(bad)).toBeUndefined();
    expect(loader.href({ kind: "default", letter: "a" })).toBeUndefined();
    expect(loader.missingAvatars()).toEqual(["user: invalid data URL"]);
  });
});

describe("avatarDirectory", () => {
  it("uses index.json when present", async () => {
    const files: Record<string, Uint8Array> = {
      "index.json": new TextEncoder().encode(JSON.stringify(poolIndex)),
      "a-01.png": fixture("a-01.png"),
    };
    const resolve = avatarDirectory(async (file) => files[file]);
    expect(await resolve("89ab0123cdef")).toBe(files["a-01.png"]);
  });

  it("falls back to <id>.<ext> without an index", async () => {
    const files: Record<string, Uint8Array> = { "x.jpg": fixture("a-05.jpg") };
    const resolve = avatarDirectory(async (file) => files[file]);
    expect(await resolve("x")).toBe(files["x.jpg"]);
    expect(await resolve("y")).toBeUndefined();
  });

  it("serves the fixtures through the Node loader", async () => {
    const loader = createNodeAvatarLoader();
    for (const id of ["a-01", "a-05", "a-06"]) {
      await loader.prepare({ kind: "pool", id });
      expect(loader.href({ kind: "pool", id })).toMatch(/^data:image\/(png|jpeg);base64,/);
    }
  });
});
