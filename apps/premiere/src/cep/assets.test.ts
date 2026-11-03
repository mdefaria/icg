import { describe, expect, it } from "vitest";
import { createNodeBinaryLoader, fileUrlToPath, resolveAssetPath } from "./assets";

describe("fileUrlToPath", () => {
  it("strips the scheme on mac", () => {
    expect(fileUrlToPath("file:///Users/me/Library/ext/assets/a%20b.ttf")).toBe(
      "/Users/me/Library/ext/assets/a b.ttf",
    );
  });

  it("strips the scheme and leading slash on windows drives", () => {
    expect(fileUrlToPath("file:///C:/Users/me/AppData/ext/assets/a.ttf")).toBe(
      "C:/Users/me/AppData/ext/assets/a.ttf",
    );
  });
});

describe("resolveAssetPath", () => {
  it("joins relative asset urls onto the extension root", () => {
    expect(resolveAssetPath("./assets/Inter.ttf", "/Users/me/ext/")).toBe(
      "/Users/me/ext/assets/Inter.ttf",
    );
    expect(resolveAssetPath("assets/Inter.ttf", "C:\\ext\\")).toBe("C:\\ext/assets/Inter.ttf");
  });

  it("passes absolute file urls through", () => {
    expect(resolveAssetPath("file:///tmp/ext/assets/x.wasm", "/elsewhere")).toBe(
      "/tmp/ext/assets/x.wasm",
    );
  });
});

describe("createNodeBinaryLoader", () => {
  it("reads the resolved path with the fs module from the CEP node bridge", async () => {
    const reads: string[] = [];
    const loader = createNodeBinaryLoader(
      {
        require: (id) => {
          expect(id).toBe("fs");
          return {
            readFileSync: (path: string) => {
              reads.push(path);
              return new Uint8Array([1, 2, 3]);
            },
          };
        },
      },
      "/ext",
    );
    await expect(loader("./assets/x.bin")).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(reads).toEqual(["/ext/assets/x.bin"]);
  });
});
