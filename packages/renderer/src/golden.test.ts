import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FRAME_PRESETS, type Template } from "@icg/shared";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { sampleComment } from "./fixtures";
import { loadNodeAssets, PACKAGE_PATHS } from "./node-assets";
import { renderCommentPng, renderOverlay } from "./render";
import { initRenderer } from "./wasm";

const UPDATE = process.env["UPDATE_GOLDEN"] === "1";
const MAX_DIFF_RATIO = 0.0005;

function compare(
  name: string,
  actual: Uint8Array,
): { ratio: number; width: number; height: number } {
  mkdirSync(PACKAGE_PATHS.golden, { recursive: true });
  const file = join(PACKAGE_PATHS.golden, `${name}.png`);
  if (UPDATE || !existsSync(file)) {
    if (!UPDATE && process.env["CI"])
      throw new Error(`missing golden ${file}; run pnpm --filter @icg/renderer golden:update`);
    writeFileSync(file, actual);
  }
  const expected = PNG.sync.read(readFileSync(file));
  const got = PNG.sync.read(Buffer.from(actual));
  expect([got.width, got.height]).toEqual([expected.width, expected.height]);
  const diff = new PNG({ width: got.width, height: got.height });
  const differing = pixelmatch(expected.data, got.data, diff.data, got.width, got.height, {
    threshold: 0.1,
  });
  const ratio = differing / (got.width * got.height);
  if (ratio > MAX_DIFF_RATIO)
    writeFileSync(join(PACKAGE_PATHS.golden, `${name}.diff.png`), PNG.sync.write(diff));
  return { ratio, width: got.width, height: got.height };
}

const CARDS: Array<{
  template: Template;
  language: "en" | "es";
  index: number;
  card?: "sheet" | "transparent";
}> = [
  {
    template: { platform: "tiktok", theme: "dark", variant: "creator-reply" },
    language: "en",
    index: 0,
  },
  {
    template: { platform: "instagram", theme: "light", variant: "single" },
    language: "es",
    index: 1,
  },
  { template: { platform: "youtube", theme: "dark", variant: "single" }, language: "en", index: 4 },
  {
    template: { platform: "x", theme: "light", variant: "creator-reply" },
    language: "es",
    index: 2,
  },
  {
    template: { platform: "tiktok", theme: "light", variant: "single" },
    language: "es",
    index: 1,
    card: "transparent",
  },
];

describe("golden renders", () => {
  beforeAll(async () => {
    await initRenderer();
  });

  for (const { template, language, index, card = "sheet" } of CARDS) {
    const name = `${template.platform}-${template.theme}-${template.variant}-${language}${card === "sheet" ? "" : `-${card}`}`;
    it(`matches ${name}`, async () => {
      const png = await renderCommentPng(
        sampleComment(template.platform, language, index),
        template,
        1,
        loadNodeAssets(),
        { language, card },
      );
      const { ratio } = compare(name, png);
      expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    });
  }

  it("matches a full 9:16 Frame with the Comment at its Placement", async () => {
    const assets = loadNodeAssets();
    const overlay = await renderOverlay(
      {
        comment: sampleComment("tiktok", "en", 0),
        template: { platform: "tiktok", theme: "dark", variant: "single" },
        frame: FRAME_PRESETS["9:16"],
        placement: { x: 0.5, y: 0.62, scale: 0.92 },
      },
      assets,
    );
    const { ratio, width, height } = compare("frame-9x16-tiktok", overlay.png);
    expect([width, height]).toEqual([1080, 1920]);
    expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
  });
});
